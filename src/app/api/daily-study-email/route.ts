import { NextRequest, NextResponse } from "next/server";
import { buildDailyStudyEmail } from "@/features/daily-study-email/daily-study-email";
import {
  createSupabaseDailyStudyRepository,
  loadDailyStudyContent,
} from "@/features/daily-study-email/load-daily-study-content";
import { getServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const DEFAULT_APP_URL = "https://study-portal-hazel.vercel.app";

function chicagoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export async function GET(request: NextRequest) {
  const requestedDate = request.nextUrl.searchParams.get("date");
  const format = request.nextUrl.searchParams.get("format");
  if (requestedDate && !isIsoDate(requestedDate)) {
    return NextResponse.json(
      { error: "date must be a real calendar date in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  const date = requestedDate || chicagoDate();

  try {
    const repository = createSupabaseDailyStudyRepository(getServiceClient());
    const content = await loadDailyStudyContent(repository, date);
    const email = buildDailyStudyEmail({
      date,
      ...content,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL,
    });

    if (format === "html") {
      return new NextResponse(email.html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store, max-age=0",
        },
      });
    }

    if (format === "text") {
      return new NextResponse(email.text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "private, no-store, max-age=0",
        },
      });
    }

    return NextResponse.json(
      {
        date,
        ...content,
        ...email,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Unable to build daily study email", error);
    return NextResponse.json(
      { error: "Unable to build today’s study email" },
      { status: 500 }
    );
  }
}
