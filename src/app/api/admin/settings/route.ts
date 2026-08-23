import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { requireAdmin, requireSameOrigin, rejectOversizedBody } from "@/lib/api-security";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const db = getServiceClient();
  const { data, error } = await db.from("admin_settings").select("*");

  if (error) {
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function PUT(req: Request) {
  const requestError = requireSameOrigin(req) ?? rejectOversizedBody(req, 32_000);
  if (requestError) return requestError;

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const db = getServiceClient();

  const { key, value } = await req.json();

  if (key !== "approval_config" || !value || typeof value !== "object" || Array.isArray(value)) {
    return NextResponse.json({ error: "Invalid setting" }, { status: 400 });
  }

  const { error } = await db
    .from("admin_settings")
    .upsert(
      {
        key,
        value,
        updated_by: auth.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );

  if (error) {
    return NextResponse.json({ error: "Failed to update setting" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
