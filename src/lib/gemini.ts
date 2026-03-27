import { GoogleGenAI } from "@google/genai";

let _client: GoogleGenAI | null = null;

export function getGemini(): GoogleGenAI {
  if (!_client) {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) throw new Error("GOOGLE_API_KEY not set");
    _client = new GoogleGenAI({ apiKey: key });
  }
  return _client;
}

export async function embedText(text: string): Promise<number[]> {
  const genai = getGemini();
  const result = await genai.models.embedContent({
    model: "gemini-embedding-001",
    contents: [text.substring(0, 8000)],
    config: { outputDimensionality: 768 },
  });
  return result.embeddings![0].values!;
}

export async function generateText(
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const genai = getGemini();
  const response = await genai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: systemInstruction ? { systemInstruction } : undefined,
  });
  return response.text ?? "";
}
