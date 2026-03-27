import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

export default function SignInPage() {
  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top_left,rgba(232,101,74,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(122,158,126,0.14),transparent_26%),linear-gradient(180deg,#faf7f2_0%,#f5f0e8_100%)] px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto max-w-6xl">
        <Suspense>
          <AuthForm />
        </Suspense>
      </div>
    </main>
  );
}
