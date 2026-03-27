import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getServiceClient();

  const { data: doc, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const { data: chunks } = await supabase
    .from("document_chunks")
    .select("id, chunk_index, content, page_start, page_end")
    .eq("document_id", id)
    .order("chunk_index");

  return NextResponse.json({ ...doc, chunks: chunks || [] });
}
