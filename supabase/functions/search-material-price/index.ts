// supabase/functions/search-material-price/index.ts
//
// Runs a live web search for a material's current price at named retailers
// (Home Depot, Lowe's, ABC Supply, etc). Called from the Material Price
// Finder tab's "🌐 Search the Web" button.
//
// HONEST LIMITATION: there is no free, structured, real-time pricing API
// for any of these retailers — Home Depot/Lowe's affiliate APIs require a
// formal partner agreement, and ABC Supply is trade-only with no public API
// at all. This function returns web search results (titles, snippets,
// links), not guaranteed live prices. To land on the actual product page
// rather than a category page or unrelated result, each search is
// restricted to that retailer's own domain (site:homedepot.com, etc.) and
// results whose URL matches that retailer's known product-page pattern are
// surfaced first and labeled "View Product" — results that don't match are
// labeled "Search Result" so nobody's misled into thinking every link is
// guaranteed to be the exact item page.
//
// Uses DuckDuckGo's HTML endpoint, which needs no API key/signup/billing.
// It's not an official, rate-limit-guaranteed API, so this is deliberately
// low-volume (one search per button tap) and has a short timeout with a
// clear fallback message if it's ever unavailable.
//
// Deploy with:
//   supabase functions deploy search-material-price

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Each retailer's actual domain (for the site: search restriction) and a
// regex that matches what a real product-page URL looks like on that site —
// used to tell "this is very likely the item's actual page" apart from a
// category page, blog post, or unrelated page that just happens to rank.
const RETAILERS = [
  { name: "Home Depot", domain: "homedepot.com", productPattern: /\/p\/[^/]+\/\d+/ },
  { name: "Lowe's", domain: "lowes.com", productPattern: /\/pd\/[^/]+\/\d+/ },
  { name: "ABC Supply", domain: "abcsupply.com", productPattern: /\/products?\// },
  { name: "Menards", domain: "menards.com", productPattern: /\/p-\d+/ },
  { name: "84 Lumber", domain: "84lumber.com", productPattern: /\/product\// },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Very small, deliberately simple HTML scraper for DuckDuckGo's no-JS HTML
// results page — pulls out result titles, snippets, and links with regex
// rather than a full HTML parser, since the structure is simple and stable
// enough for this and a real parser is unnecessary weight for one function.
function parseDuckDuckGoHtml(html: string, limit: number) {
  const results: { title: string; snippet: string; url: string }[] = [];
  const resultBlocks = html.split('<div class="result results_links');
  for (let i = 1; i < resultBlocks.length && results.length < limit; i++) {
    const block = resultBlocks[i];
    const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/s);
    const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/s);
    if (!titleMatch) continue;
    const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();
    let url = titleMatch[1];
    // DuckDuckGo HTML results wrap real URLs in a redirect param — unwrap it
    const uddgMatch = url.match(/[?&]uddg=([^&]+)/);
    if (uddgMatch) { try { url = decodeURIComponent(uddgMatch[1]); } catch { /* keep as-is */ } }
    results.push({
      title: stripTags(titleMatch[2]),
      snippet: snippetMatch ? stripTags(snippetMatch[1]) : "",
      url,
    });
  }
  return results;
}

async function searchDuckDuckGo(query: string, limit: number) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // A plain server-side fetch with no User-Agent is often blocked —
        // identify as an ordinary browser so results come back normally.
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!res.ok) throw new Error(`Search request failed (${res.status})`);
    const html = await res.text();
    return parseDuckDuckGoHtml(html, limit);
  } finally {
    clearTimeout(timeout);
  }
}

// Try to spot a dollar amount in a search result snippet — this is a best
// effort, not a guarantee. Retailer snippets sometimes include the price
// directly; often they don't, and the person needs to tap through.
function extractPriceGuess(text: string): string | null {
  const match = text.match(/\$\s?(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)/);
  return match ? match[1] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const { itemName, city } = await req.json();
    if (!itemName || !String(itemName).trim()) {
      return jsonResponse({ error: "itemName is required" }, 400);
    }

    const locationTerm = city ? String(city).trim() : "Spokane WA";
    const cleanItem = String(itemName).trim();

    // One search per retailer, restricted to that retailer's own domain via
    // site: — this is the main lever for actually landing on the retailer's
    // real page instead of a news article, forum post, or unrelated site
    // that happens to mention the item. Runs in parallel to keep latency
    // reasonable.
    const searches = await Promise.allSettled(
      RETAILERS.map(async (retailer) => {
        const query = `site:${retailer.domain} ${cleanItem} price ${locationTerm}`;
        const results = await searchDuckDuckGo(query, 4);
        const withMeta = results.map(r => ({
          ...r,
          priceGuess: extractPriceGuess(`${r.title} ${r.snippet}`),
          isProductPage: retailer.productPattern.test(r.url),
        }));
        // Product-page-looking URLs first, since those are most likely the
        // actual item page rather than a category listing or unrelated page.
        withMeta.sort((a, b) => Number(b.isProductPage) - Number(a.isProductPage));
        return { retailer: retailer.name, results: withMeta.slice(0, 3) };
      })
    );

    const byRetailer = searches.map((s, i) =>
      s.status === "fulfilled" ? s.value : { retailer: RETAILERS[i].name, results: [], error: "Search unavailable right now" }
    );

    const anyResults = byRetailer.some(r => r.results.length > 0);
    if (!anyResults) {
      return jsonResponse({
        query: cleanItem,
        byRetailer,
        warning: "No results came back — the search source may be temporarily unavailable. Try again in a moment, or check the retailer's site/app directly.",
      });
    }

    return jsonResponse({ query: cleanItem, byRetailer });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
