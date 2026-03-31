import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { embedText, generateText } from "@/lib/gemini";

type SearchChunk = {
  content: string;
  similarity?: number;
  doc_title?: string;
  doc_category?: string;
  document_id?: string;
  page_start?: number | null;
  page_end?: number | null;
};

function rankChunksByKeywordMatch(message: string, chunks: SearchChunk[]) {
  const terms = Array.from(
    new Set(
      message
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((term) => term.trim())
        .filter((term) => term.length > 2)
    )
  );

  return [...chunks]
    .map((chunk) => {
      const haystack = chunk.content.toLowerCase();
      let keywordHits = 0;
      for (const term of terms) {
        if (haystack.includes(term)) keywordHits += 1;
      }

      return {
        ...chunk,
        keywordHits,
      };
    })
    .sort((a, b) => {
      if (b.keywordHits !== a.keywordHits) return b.keywordHits - a.keywordHits;
      return (b.similarity || 0) - (a.similarity || 0);
    });
}

export async function POST(req: NextRequest) {
  const { message, documentId, category } = await req.json();

  if (!message || typeof message !== "string") {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400 }
    );
  }

  try {
    const embedding = await embedText(message);
    const supabase = getServiceClient();
    let chunks: SearchChunk[] = [];

    if (documentId && typeof documentId === "string") {
      const [{ data: doc, error: docError }, { data: docChunks, error: chunksError }] =
        await Promise.all([
          supabase
            .from("documents")
            .select("id, title, category")
            .eq("id", documentId)
            .single(),
          supabase
            .from("document_chunks")
            .select("document_id, content, page_start, page_end")
            .eq("document_id", documentId)
            .limit(200),
        ]);

      if (docError || !doc) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }

      if (chunksError) {
        return NextResponse.json({ error: chunksError.message }, { status: 500 });
      }

      chunks = rankChunksByKeywordMatch(
        message,
        (docChunks || []).map((chunk) => ({
          ...chunk,
          doc_title: doc.title,
          doc_category: doc.category,
        }))
      ).slice(0, 5);
    } else {
      const rpcParams: Record<string, unknown> = {
        query_embedding: JSON.stringify(embedding),
        match_count: 5,
      };

      if (category && typeof category === "string") {
        rpcParams.filter_category = category;
      }

      const { data, error } = await supabase.rpc("search_chunks", rpcParams);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      chunks = (data || []) as SearchChunk[];
    }

    const context = chunks
      .map((c) => {
        const pageLabel =
          c.page_start && c.page_end && c.page_start !== c.page_end
            ? ` pp.${c.page_start}-${c.page_end}`
            : c.page_start
              ? ` p.${c.page_start}`
              : "";

        return `[Source: ${c.doc_title || "Unknown"}${pageLabel}]\n${c.content}`;
      })
      .join("\n\n---\n\n");

    const sources = chunks.map((c) => ({
      title: c.doc_title,
      category: c.doc_category,
      similarity: c.similarity,
      page_start: c.page_start,
      page_end: c.page_end,
    }));

    const systemPrompt = `You are an expert ophthalmic plastic and reconstructive surgery study assistant helping a medical professional prepare for the ASOPRS board exam. Answer questions based ONLY on the provided context from the ASOPRS study materials. Be thorough, accurate, and use clinical terminology appropriately. If the context doesn't contain enough information to fully answer, say so. Always cite which document the information comes from.`;

    const prompt = `Context from ASOPRS study materials:\n\n${context}\n\n---\n\nQuestion: ${message}\n\nProvide a thorough, board-exam-focused answer based on the context above.`;

    const answer = await generateText(prompt, systemPrompt);

    return NextResponse.json({ answer, sources });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
