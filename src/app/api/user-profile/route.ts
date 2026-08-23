import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { rejectOversizedBody, requireSameOrigin } from "@/lib/api-security";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_memory_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? { user_id: user.id });
}

export async function PUT(req: NextRequest) {
  const requestError = requireSameOrigin(req) ?? rejectOversizedBody(req, 16_000);
  if (requestError) return requestError;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { exam_date, weak_topics, preferred_session_length_min, preferred_packet_size } = body;

  if (
    (exam_date !== undefined && exam_date !== null && (
      typeof exam_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(exam_date) || Number.isNaN(Date.parse(`${exam_date}T00:00:00Z`))
    )) ||
    (weak_topics !== undefined && (
      !Array.isArray(weak_topics) || weak_topics.length > 50 ||
      weak_topics.some((topic) => typeof topic !== "string" || topic.length > 100)
    )) ||
    (preferred_session_length_min !== undefined && (
      !Number.isInteger(preferred_session_length_min) || preferred_session_length_min < 5 || preferred_session_length_min > 240
    )) ||
    (preferred_packet_size !== undefined && (
      !Number.isInteger(preferred_packet_size) || preferred_packet_size < 1 || preferred_packet_size > 100
    ))
  ) {
    return NextResponse.json({ error: "Invalid profile settings" }, { status: 400 });
  }

  const { data, error } = await getServiceClient()
    .from("user_memory_profiles")
    .upsert(
      {
        user_id: user.id,
        exam_date: exam_date ?? null,
        weak_topics: weak_topics ?? [],
        preferred_session_length_min: preferred_session_length_min ?? 30,
        preferred_packet_size: preferred_packet_size ?? 20,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Unable to save profile" }, { status: 503 });
  }

  return NextResponse.json(data);
}
