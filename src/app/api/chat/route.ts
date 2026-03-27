import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { embedText, generateText } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const { message } = await req.json();

  if (!message || typeof message !== "string") {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400 }
    );
  }

  try {
    const embedding = await embedText(message);
    const supabase = getServiceClient();

    const rpcParams: Record<string, unknown> = {
      query_embedding: JSON.stringify(embedding),
      match_count: 5,
    };

    const { data: chunks, error } = await supabase.rpc(
      "search_chunks",
      rpcParams
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const context = (chunks || [])
      .map(
        (c: { doc_title: string; content: string; similarity: number }) =>
          `[Source: ${c.doc_title}]\n${c.content}`
      )
      .join("\n\n---\n\n");

    const sources = (chunks || []).map(
      (c: { doc_title: string; doc_category: string; similarity: number }) => ({
        title: c.doc_title,
        category: c.doc_category,
        similarity: c.similarity,
      })
    );

    const systemPrompt = `You are an expert ophthalmic plastic and reconstructive surgery study assistant helping a medical professional prepare for the ASOPRS board exam. Answer questions based ONLY on the provided context from the ASOPRS study materials. Be thorough, accurate, and use clinical terminology appropriately. If the context doesn't contain enough information to fully answer, say so. Always cite which document the information comes from.`;

    const prompt = `Context from ASOPRS study materials:\n\n${context}\n\n---\n\nQuestion: ${message}\n\nProvide a thorough, board-exam-focused answer based on the context above.`;

    const answer = await generateText(prompt, systemPrompt);

    return NextResponse.json({ answer, sources });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
