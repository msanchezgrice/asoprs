import { NextRequest, NextResponse } from "next/server";
import cards from "@/data/image-flashcards.generated.json";

type ImageFlashcard = (typeof cards)[number];

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category");
  const docSlug = req.nextUrl.searchParams.get("doc");

  let filtered = cards as ImageFlashcard[];

  if (category && category !== "all") {
    filtered = filtered.filter((card) => card.category === category);
  }

  if (docSlug && docSlug !== "all") {
    filtered = filtered.filter((card) => card.documentSlug === docSlug);
  }

  return NextResponse.json(filtered, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
