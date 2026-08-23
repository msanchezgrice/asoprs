import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";

type AuthSuccess = { ok: true; user: User };
type AuthFailure = { ok: false; response: NextResponse };
export type AuthResult = AuthSuccess | AuthFailure;

export async function requireUser(options: { verifiedEmail?: boolean } = {}): Promise<AuthResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (options.verifiedEmail && !user.email_confirmed_at) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Email verification required" }, { status: 403 }),
    };
  }

  return { ok: true, user };
}

export async function requireAdmin(): Promise<AuthResult> {
  const auth = await requireUser({ verifiedEmail: true });
  if (!auth.ok) return auth;

  const { data, error } = await getServiceClient()
    .from("builder_roles")
    .select("role")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    console.error("Admin authorization lookup failed:", error.code);
    return {
      ok: false,
      response: NextResponse.json({ error: "Authorization unavailable" }, { status: 503 }),
    };
  }

  if (data?.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return auth;
}

function secretsMatch(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export async function requireCronOrAdmin(request: Request): Promise<AuthResult | { ok: true; cron: true }> {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (cronSecret && bearer && secretsMatch(bearer, cronSecret)) {
    return { ok: true, cron: true };
  }

  return requireAdmin();
}

export function requireSameOrigin(request: Request): NextResponse | null {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (!origin) return null;

  try {
    if (new URL(origin).origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  return null;
}

export function rejectOversizedBody(request: Request, maxBytes: number): NextResponse | null {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  }
  return null;
}

export async function enforceRateLimit(
  actor: string,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<NextResponse | null> {
  const { data, error } = await getServiceClient().rpc("consume_api_rate_limit", {
    p_actor: actor,
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error("Rate-limit check failed:", error.code);
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.allowed) {
    const retryAfter = Math.max(1, Number(result?.retry_after_seconds ?? windowSeconds));
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  return null;
}

export async function enforcePaidRateLimit(
  request: Request,
  userId: string,
  action: string,
  limits: {
    user: number;
    ip: number;
    global: number;
    windowSeconds: number;
  },
): Promise<NextResponse | null> {
  const forwardedFor =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for") ??
    "unknown";
  const clientAddress = forwardedFor.split(",", 1)[0].trim().slice(0, 128) || "unknown";
  const networkHash = createHash("sha256").update(clientAddress).digest("hex").slice(0, 32);

  const userLimit = await enforceRateLimit(
    `user:${userId}`,
    action,
    limits.user,
    limits.windowSeconds,
  );
  if (userLimit) return userLimit;

  const networkLimit = await enforceRateLimit(
    `network:${networkHash}`,
    action,
    limits.ip,
    limits.windowSeconds,
  );
  if (networkLimit) return networkLimit;

  return enforceRateLimit(
    "global",
    action,
    limits.global,
    limits.windowSeconds,
  );
}
