// Vercel serverless proxy for getimg.ai inpainting API
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GETIMG_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "GETIMG_API_KEY not configured",
      hint: "Sign up free at getimg.ai → API → copy key → add to Vercel env vars as GETIMG_API_KEY"
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const response = await fetch("https://api.getimg.ai/v1/stable-diffusion-xl/inpaint", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "stable-diffusion-xl-v1-0",
        prompt: body.prompt,
        negative_prompt: "different house, different building, changed background, altered surroundings, distorted, ugly, blurry",
        image: body.image.replace(/^data:image\/\w+;base64,/, ""),
        mask_image: body.mask ? body.mask.replace(/^data:image\/\w+;base64,/, "") : null,
        strength: body.strength || 0.7,
        steps: 30,
        guidance: 7.5,
        width: 1024,
        height: 768,
        output_format: "jpeg",
        response_format: "b64",
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.message || data?.error || "getimg.ai error" });
    }

    // Return as data URL
    const imageUrl = `data:image/jpeg;base64,${data.image}`;
    return res.status(200).json({ output: imageUrl });
  } catch (err) {
    return res.status(500).json({ error: "Proxy error: " + err.message });
  }
}
