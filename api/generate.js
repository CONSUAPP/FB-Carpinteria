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

    // Prompt limpio y directo en inglés para evitar alucinaciones visuales
    const userPrompt = prompt || "modern custom wooden desk and bookshelf";
    const enrichedPrompt = `photo of a ${userPrompt}, modern custom woodwork, placed in a bright clean living room, high quality interior architecture, photorealistic, 8k, natural daylight, FB Carpinteria design`;

    // Prompt negativo estándar
    const negativePrompt = "abstract, pattern repetition, distorted, blurry, low quality, glitch, artifacts, lowres, surreal";

    // Petición con parámetros equilibrados para SDXL
    const inputConfig = {
      prompt: enrichedPrompt,
      negative_prompt: negativePrompt,
      guidance_scale: 7.0,         // Valor estándar estable para evitar sobre-saturación
      num_inference_steps: 25      // Suficientes pasos para nitidez sin crear artefactos
    };

    // Si el usuario sube una imagen válida, usamos prompt_strength adecuado (0.8)
    if (imageUrl) {
      inputConfig.image = imageUrl;
      inputConfig.prompt_strength = 0.8; // 0.8 permite rediseñar el mueble de forma limpia sin romper la imagen
    }

    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        input: inputConfig
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
