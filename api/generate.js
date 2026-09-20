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

    // Reforzamos el prompt para forzar realismo en la arquitectura de carpintería
    const basePrompt = prompt || "custom modern wooden furniture, interior architecture";
    const enrichedPrompt = `${basePrompt}, realistic interior design, professional architectural rendering, high resolution, photorealistic, 8k, natural lighting, modern furniture design by FB Carpinteria`;

    // Prompt negativo estricto para evitar abstracciones y deformaciones de perspectiva
    const negativePrompt = "abstract, deformed structure, bad perspective, floating furniture, messy room, unrealistic geometry, cartoon, illustration, low quality, artifacts";

    // Petición a la API de Replicate con parámetros de ajuste e Image-to-Image
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
          guidance_scale: 7.5,        // Control de fidelidad al prompt
          num_inference_steps: 30,    // Calidad del detalle visual
          prompt_strength: 0.6        // Fuerza del cambio: Mantiene la estructura de la foto base
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
