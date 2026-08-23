import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-security";
import { getServiceClient } from "@/lib/supabase/service";

type InternalChange = {
  id: string;
  title: string;
  description: string | null;
  origin_type: string;
  origin_trace: Record<string, unknown> | null;
  feature_context: Record<string, unknown> | null;
  shipped_at: string;
};

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const lastSeenParam = request.nextUrl.searchParams.get("after");
  const lastSeen = lastSeenParam && !Number.isNaN(Date.parse(lastSeenParam))
    ? new Date(lastSeenParam).toISOString()
    : null;

  let query = getServiceClient()
    .from("shipped_changes")
    .select("id, title, description, origin_type, origin_trace, feature_context, shipped_at")
    .eq("status", "active")
    .order("shipped_at", { ascending: false })
    .limit(50);

  if (lastSeen) query = query.gt("shipped_at", lastSeen);

  const { data, error } = await query;
  if (error) {
    console.error("Unable to load shipped changes:", error.code);
    return NextResponse.json({ error: "Unable to load changes" }, { status: 503 });
  }

  const changes = ((data ?? []) as InternalChange[])
    .filter((change) => {
      const buildStatus = change.feature_context?.build_status;
      if (buildStatus !== "completed" && buildStatus !== "config_applied") return false;

      const targetUserId = change.origin_trace?.target_user_id ?? change.feature_context?.target_user_id;
      return !targetUserId || targetUserId === auth.user.id;
    })
    .slice(0, 5)
    .map((change) => {
      const targetUserId = change.origin_trace?.target_user_id ?? change.feature_context?.target_user_id;
      const deliveryStrategy = change.feature_context?.delivery_strategy ?? change.origin_trace?.delivery_strategy;

      return {
        id: change.id,
        title: change.title,
        description: change.description ?? "",
        origin_type: change.origin_type,
        shipped_at: change.shipped_at,
        personal: targetUserId === auth.user.id,
        delivery_strategy: typeof deliveryStrategy === "string" ? deliveryStrategy : null,
      };
    });

  return NextResponse.json(changes, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
