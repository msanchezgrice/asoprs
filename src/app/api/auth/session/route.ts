import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return NextResponse.json(
    {
      user: user
        ? {
            id: user.id,
            email: user.email ?? "",
            fullName: (user.user_metadata.full_name as string | undefined) ?? null,
          }
        : null,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    }
  );
}
