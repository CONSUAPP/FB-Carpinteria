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

    // Reforzamos el prompt para FLUX enfocándonos en fotografía de arquitectura real
    const userPrompt = prompt || "modern custom wooden closet";
    const enrichedPrompt = `A professional architectural photograph of a ${userPrompt}, custom luxury woodwork by FB Carpinteria, realistic wood grain textures, clean interior design, warm ambient lighting, 8k resolution, shot on 35mm lens, high-end furniture magazine style`;

    // Petición a Replicate utilizando el modelo FLUX.1 [schnell]
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "black-forest-labs/flux-1-schnell",
        input: {
          prompt: enrichedPrompt,
          num_outputs: 1,
          aspect_ratio: "1:1",
          output_format: "webp",
          output_quality: 90
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
