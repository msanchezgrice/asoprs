import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const docId = request.nextUrl.searchParams.get("docId");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !docId || !UUID_RE.test(docId)) {
    return NextResponse.json([], { status: 200 });
  }

  const { data, error } = await supabase
    .from("user_pdf_highlights")
    .select("*")
    .eq("document_id", docId)
    .order("page_number")
    .order("created_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { document_id, page_number, color, text_content, rects } = body;

  if (!document_id || page_number == null || !rects) {
    return NextResponse.json(
      { error: "document_id, page_number, and rects are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("user_pdf_highlights")
    .insert({
      user_id: user.id,
      document_id,
      page_number,
      color: color || "#FFEB3B",
      text_content: text_content || null,
      rects,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const id = request.nextUrl.searchParams.get("id");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "valid id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_pdf_highlights")
    .delete()
    .eq("user_id", user.id)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
