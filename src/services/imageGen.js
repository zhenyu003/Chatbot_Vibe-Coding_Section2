import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.REACT_APP_GEMINI_API_KEY || '';

// Imagen models tried in order for text-only generation
const IMAGEN_MODELS = [
  'imagen-3.0-generate-002',
  'imagen-3.0-generate-001',
  'imagen-4.0-generate-001',
];

// Gemini model that supports multimodal input (image+text) with image output
const GEMINI_IMAGE_MODEL = 'gemini-2.0-flash-exp';

export async function generateImage(prompt, anchorImageBase64 = null) {
  if (!apiKey) throw new Error('API key not configured for image generation');
  const ai = new GoogleGenAI({ apiKey });

  // When an anchor image is provided, use Gemini multimodal generation (image in → image out)
  if (anchorImageBase64) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_IMAGE_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/png', data: anchorImageBase64 } },
              { text: `Use this image as a visual style reference and generate a new image: ${prompt}` },
            ],
          },
        ],
        config: { responseModalities: ['IMAGE'] },
      });
      const parts = response.candidates?.[0]?.content?.parts || [];
      const imgPart = parts.find((p) => p.inlineData?.mimeType?.startsWith('image/'));
      if (imgPart) return { base64: imgPart.inlineData.data, mimeType: imgPart.inlineData.mimeType };
    } catch (err) {
      console.warn('[imageGen] Anchor image mode failed, falling back to Imagen:', err.message);
      // Fall through to Imagen below
    }
  }

  // Text-to-image: try Imagen models in sequence
  let lastError = null;
  for (const model of IMAGEN_MODELS) {
    try {
      const response = await ai.models.generateImages({
        model,
        prompt,
        config: { numberOfImages: 1 },
      });
      const images = response.generatedImages || [];
      if (!images.length) continue;
      const base64 = images[0].image?.imageBytes || images[0].imageBytes;
      if (!base64) continue;
      return { base64, mimeType: 'image/png' };
    } catch (err) {
      lastError = err;
      console.log(`[imageGen] ${model} failed:`, err.message);
    }
  }

  throw new Error(
    `Image generation failed with all models. Last error: ${lastError?.message || 'Unknown'}`
  );
}
