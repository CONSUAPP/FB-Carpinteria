export default async function handler(req, res) {
  // Habilitar CORS para permitir peticiones desde cualquier origen (GitHub Pages)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Manejar la petición preflight de CORS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { imageUrl, prompt } = req.body;

    if (!process.env.REPLICATE_API_TOKEN) {
      return res.status(500).json({ error: 'Falta la API Key de Replicate' });
    }

    // Reforzamos el prompt para forzar un diseño limpio, moderno y minimalista de carpintería
    const basePrompt = prompt || "custom modern wooden entertainment center, floating minimalist design";
    const enrichedPrompt = `${basePrompt}, clean luxury interior design, professional architectural rendering, high resolution, photorealistic, 8k, natural soft lighting, modern custom woodwork by FB Carpinteria`;

    // Prompt negativo agresivo para evitar objetos extraños, decoraciones amorfas o problemas de perspectiva
    const negativePrompt = "artifacts, strange objects, clocks, radios, clutter, toys, weird decorations in shelves, abstract shapes, deformed structures, bad perspective, floating unwanted elements, messy room, cartoon, illustration, low quality";

    // Petición a la API de Replicate con parámetros calibrados
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        input: {
          image: imageUrl,
          prompt: enrichedPrompt,
          negative_prompt: negativePrompt,
          guidance_scale: 8.0,        // Aumentado a 8.0 para forzar mayor apego al prompt de limpieza
          num_inference_steps: 35,    // 35 pasos para máxima resolución y nitidez de detalles
          prompt_strength: 0.55       // Mantiene la estructura base de la foto evitando distorsionar la habitación
        }
      }),
    });

    const prediction = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: prediction.detail || 'Error al iniciar predicción en Replicate' });
    }

    // Polling hasta que la imagen esté generada
    let predictionResult = prediction;
    while (predictionResult.status !== "succeeded" && predictionResult.status !== "failed") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const checkResponse = await fetch(
        `https://api.replicate.com/v1/predictions/${predictionResult.id}`,
        {
          headers: {
            "Authorization": `Token ${process.env.REPLICATE_API_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      predictionResult = await checkResponse.json();
    }

    if (predictionResult.status === "succeeded") {
      const outputUrl = Array.isArray(predictionResult.output)
        ? predictionResult.output[0]
        : predictionResult.output;
      return res.status(200).json({ outputUrl });
    } else {
      return res.status(500).json({ error: 'La generación de la imagen falló en Replicate.' });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
