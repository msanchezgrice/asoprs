import { NextRequest, NextResponse } from "next/server";
import { buildDailyStudyEmail } from "@/features/daily-study-email/daily-study-email";
import {
  createSupabaseDailyStudyRepository,
  loadDailyStudyContent,
} from "@/features/daily-study-email/load-daily-study-content";
import { enforceRateLimit } from "@/lib/api-security";
import { getServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const DEFAULT_APP_URL = "https://study-portal-hazel.vercel.app";
const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";
const NO_STORE = "private, no-store, max-age=0";
const MAX_DATE_DISTANCE_DAYS = 7;
const VALID_FORMATS = new Set(["html", "text"]);
const VALID_QUERY_PARAMETERS = new Set(["date", "format"]);

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

function dateDistanceInDays(first: string, second: string) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const firstTime = new Date(`${first}T12:00:00Z`).getTime();
  const secondTime = new Date(`${second}T12:00:00Z`).getTime();
  return Math.abs(firstTime - secondTime) / millisecondsPerDay;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const hasUnknownParameter = [...searchParams.keys()].some(
    (parameter) => !VALID_QUERY_PARAMETERS.has(parameter)
  );
  const hasDuplicateParameter = [...VALID_QUERY_PARAMETERS].some(
    (parameter) => searchParams.getAll(parameter).length > 1
  );
  if (hasUnknownParameter || hasDuplicateParameter) {
    return NextResponse.json({ error: "Unsupported query parameters" }, { status: 400 });
  }

  const requestedDate = searchParams.get("date");
  const format = searchParams.get("format");
  if (requestedDate && !isIsoDate(requestedDate)) {
    return NextResponse.json(
      { error: "date must be a real calendar date in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  if (format && !VALID_FORMATS.has(format)) {
    return NextResponse.json(
      { error: "format must be html or text" },
      { status: 400 }
    );
  }

  const today = chicagoDate();
  if (requestedDate && dateDistanceInDays(requestedDate, today) > MAX_DATE_DISTANCE_DAYS) {
    return NextResponse.json(
      { error: "date must be within seven days of today" },
      { status: 400 }
    );
  }

  const rateLimit = await enforceRateLimit("global", "daily_study_email", 120, 3_600);
  if (rateLimit) return rateLimit;

  const date = requestedDate || today;
  const cacheControl = requestedDate ? CACHE_CONTROL : NO_STORE;

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
          "Cache-Control": cacheControl,
        },
      });
    }

    if (format === "text") {
      return new NextResponse(email.text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": cacheControl,
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
          "Cache-Control": cacheControl,
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
