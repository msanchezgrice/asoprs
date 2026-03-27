import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase";

export async function updateSession(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (code && request.nextUrl.pathname !== "/auth/callback") {
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.pathname = "/auth/callback";
    callbackUrl.searchParams.set("code", code);

    const nextUrl = request.nextUrl.clone();
    nextUrl.searchParams.delete("code");
    nextUrl.searchParams.delete("next");
    const nextPath = `${nextUrl.pathname}${nextUrl.search}`;
    callbackUrl.searchParams.set("next", nextPath);

    return NextResponse.redirect(callbackUrl);
  }

  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getUser();

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
