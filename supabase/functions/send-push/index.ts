// supabase/functions/send-push/index.ts
//
// Sends a Web Push notification to every device a given user has subscribed
// on. Called from the app right after a task is assigned or a purchase
// request needs approval — see pushToUser() in src/App.jsx.
//
// Deploy with:
//   supabase functions deploy send-push
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
//
// Implements the Web Push protocol (RFC 8291 payload encryption + RFC 8292
// VAPID auth) directly with Deno's built-in Web Crypto — no npm packages,
// so there's nothing to install or go stale.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@shservicesspokane.com";

function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(b64url.length + ((4 - (b64url.length % 4)) % 4), "=");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importVapidPrivateKey(): Promise<CryptoKey> {
  const d = b64urlToBytes(VAPID_PRIVATE_KEY);
  const pub = b64urlToBytes(VAPID_PUBLIC_KEY); // 65 bytes uncompressed point: 0x04 | x(32) | y(32)
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);
  const jwk = {
    kty: "EC", crv: "P-256",
    d: bytesToB64url(d), x: bytesToB64url(x), y: bytesToB64url(y),
    ext: true,
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function buildVapidHeaders(endpoint: string): Promise<Record<string, string>> {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUBJECT };
  const enc = (obj: unknown) => bytesToB64url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${enc(header)}.${enc(payload)}`;

  const key = await importVapidPrivateKey();
  const sigDer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned)
  );
  // WebCrypto ECDSA sign() already returns raw r||s (64 bytes) for P-256, not DER — good, JWT wants raw.
  const jwt = `${unsigned}.${bytesToB64url(new Uint8Array(sigDer))}`;

  return {
    Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
  };
}

// RFC 8291: encrypt the notification payload with aes128gcm so only the
// browser (holding the subscription's private key) can read it.
async function encryptPayload(payload: string, p256dhB64url: string, authB64url: string) {
  const enc = new TextEncoder();
  const plaintext = enc.encode(payload);

  const userPublicKeyBytes = b64urlToBytes(p256dhB64url);
  const authSecret = b64urlToBytes(authB64url);

  const userPublicKey = await crypto.subtle.importKey(
    "raw", userPublicKeyBytes, { name: "ECDH", namedCurve: "P-256" }, false, []
  );

  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );
  const localPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", localKeyPair.publicKey));

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: userPublicKey }, localKeyPair.privateKey, 256)
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
    const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8
    );
    return new Uint8Array(bits);
  }

  const authInfo = enc.encode("WebPush: info\0");
  const keyInfoInput = new Uint8Array([...authInfo, ...userPublicKeyBytes, ...localPublicRaw]);
  const prk = await hkdf(authSecret, sharedSecret, new Uint8Array(0), 32);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfoInput, 32);

  const cekInfo = enc.encode("Content-Encoding: aes128gcm\0");
  const nonceInfo = enc.encode("Content-Encoding: nonce\0");
  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // Padding delimiter byte (0x02 = last record, no padding) then encrypt with AES-128-GCM
  const paddedPlaintext = new Uint8Array([...plaintext, 0x02]);
  const gcmKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, gcmKey, paddedPlaintext)
  );

  // aes128gcm header: salt(16) | recordSize(4, big-endian) | keyIdLen(1) | keyId(localPublicRaw)
  const recordSize = 4096;
  const header = new Uint8Array(16 + 4 + 1 + localPublicRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize, false);
  header[20] = localPublicRaw.length;
  header.set(localPublicRaw, 21);

  const body = new Uint8Array([...header, ...ciphertext]);
  return body;
}

// Deno's String(someCaughtError) silently produces the useless literal
// text "[object Object]" when the thrown value is a plain object rather
// than a real Error (which is exactly what the Supabase JS client throws
// for Postgres/auth errors) — this was swallowing the real reason for
// every failure. Pull out whatever's actually useful instead.
function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const anyE = e as Record<string, unknown>;
    const parts = [anyE.message, anyE.error_description, anyE.error, anyE.hint, anyE.code, anyE.details]
      .filter((v) => typeof v === "string" && v.length > 0);
    if (parts.length) return parts.join(" | ");
    try { return JSON.stringify(e); } catch { /* fall through */ }
  }
  return String(e);
}

// CORS: the app runs on a different origin (your Vercel domain) than this
// function (*.supabase.co), so without these headers the browser blocks the
// response entirely and fetch() throws a generic network-style error in the
// app — exactly the "Couldn't reach the notification server" symptom this
// was added to fix. "*" is fine here since this endpoint doesn't return or
// accept anything sensitive beyond what the caller already provided.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Browsers send a preflight OPTIONS request before the real POST for
  // cross-origin calls with custom headers (like Authorization) — this must
  // return quickly with the CORS headers or the real request never fires.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const { userName, title, body, url, tag } = await req.json();
    if (!userName || !title) {
      return new Response(JSON.stringify({ error: "userName and title are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_name", userName);

    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no subscriptions" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const payload = JSON.stringify({ title, body: body || "", url: url || "/", tag: tag || "sh-notify" });

    const results = await Promise.all(subs.map(async (sub) => {
      try {
        const encryptedBody = await encryptPayload(payload, sub.p256dh, sub.auth);
        const vapidHeaders = await buildVapidHeaders(sub.endpoint);

        const res = await fetch(sub.endpoint, {
          method: "POST",
          headers: {
            ...vapidHeaders,
            "Content-Type": "application/octet-stream",
            "Content-Encoding": "aes128gcm",
            TTL: "86400",
          },
          body: encryptedBody,
        });

        // 404/410 means the subscription is gone (uninstalled, expired) — clean it up
        if (res.status === 404 || res.status === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
        return { id: sub.id, status: res.status };
      } catch (e) {
        return { id: sub.id, status: "error", message: describeError(e) };
      }
    }));

    return new Response(JSON.stringify({ sent: results.length, results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: describeError(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
});
