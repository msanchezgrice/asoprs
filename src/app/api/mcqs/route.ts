import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const docId = req.nextUrl.searchParams.get("docId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100");
  const supabase = getServiceClient();

  let query = supabase
    .from("mcq_questions")
    .select("*")
    .limit(limit);

  if (docId) {
    query = query.eq("document_id", docId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
