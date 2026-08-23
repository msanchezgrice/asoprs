import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { enforceRateLimit, rejectOversizedBody, requireSameOrigin } from "@/lib/api-security";

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
  const requestError = requireSameOrigin(request) ?? rejectOversizedBody(request, 96_000);
  if (requestError) return requestError;

  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit(user.id, "highlight_write", 300, 3_600);
  if (rateLimit) return rateLimit;

  const { document_id, page_number, color, text_content, rects } = body;

  if (
    typeof document_id !== "string" || !UUID_RE.test(document_id) ||
    !Number.isInteger(page_number) || page_number < 1 || page_number > 10_000 ||
    !Array.isArray(rects) || rects.length === 0 || rects.length > 200 || JSON.stringify(rects).length > 64_000 ||
    (color !== undefined && (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color))) ||
    (text_content !== undefined && text_content !== null && (typeof text_content !== "string" || text_content.length > 10_000))
  ) {
    return NextResponse.json(
      { error: "document_id, page_number, and rects are required" },
      { status: 400 }
    );
  }

  const { data, error } = await getServiceClient()
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
    return NextResponse.json({ error: "Unable to save highlight" }, { status: 503 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const supabase = await createServerSupabaseClient();
  const id = request.nextUrl.searchParams.get("id");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await getServiceClient()
    .from("user_pdf_highlights")
    .delete()
    .eq("user_id", user.id)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
