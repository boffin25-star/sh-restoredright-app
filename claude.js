export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) {
    return res.status(500).json({
      error: "REPLICATE_API_TOKEN not configured",
      hint: "Add REPLICATE_API_TOKEN in Vercel → Settings → Environment Variables"
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // Upload image to Replicate as a file so we get a URL back
    async function uploadToReplicate(dataUrl) {
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      const mimeType = dataUrl.startsWith("data:image/png") ? "image/png" : "image/jpeg";

      const uploadResp = await fetch("https://api.replicate.com/v1/files", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": mimeType,
          "Content-Length": buffer.length,
        },
        body: buffer,
      });
      const uploadData = await uploadResp.json();
      if (!uploadResp.ok) throw new Error("Upload failed: " + JSON.stringify(uploadData));
      return uploadData.urls?.get || uploadData.url;
    }

    // Upload image and mask
    const imageUrl = await uploadToReplicate(body.image);
    const maskUrl = body.mask ? await uploadToReplicate(body.mask) : null;

    // Run inpainting model
    const input = {
      prompt: body.prompt,
      image: imageUrl,
      mask: maskUrl || imageUrl, // fallback if no mask
      num_inference_steps: body.num_inference_steps || 25,
      guidance_scale: body.guidance_scale || 7.5,
      strength: body.strength || 0.85,
      negative_prompt: "blurry, distorted, changed background, different house, ugly, bad quality",
    };

    const startResp = await fetch(
      "https://api.replicate.com/v1/models/stability-ai/stable-diffusion-inpainting/predictions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Prefer": "wait=60",
        },
        body: JSON.stringify({ input }),
      }
    );

    const prediction = await startResp.json();
    if (!startResp.ok) return res.status(startResp.status).json({ error: prediction.detail || JSON.stringify(prediction) });
    if (prediction.status === "succeeded") return res.status(200).json({ output: prediction.output });

    // Poll
    const id = prediction.id;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const poll = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: { "Authorization": `Bearer ${apiKey}` }
      }).then(r => r.json());
      if (poll.status === "succeeded") return res.status(200).json({ output: poll.output });
      if (poll.status === "failed") return res.status(500).json({ error: poll.error || "Prediction failed" });
    }
    return res.status(504).json({ error: "Timed out — try again" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
