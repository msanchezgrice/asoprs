import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  const segments = params.path ?? [];

  if (segments.length < 2) {
    return badRequest("PDF category and filename are required.");
  }

  if (
    segments.some(
      (segment) =>
        !segment ||
        segment.includes("..") ||
        segment.includes("/") ||
        segment.includes("\\")
    )
  ) {
    return badRequest("Invalid PDF path.");
  }

  const filename = segments[segments.length - 1];
  if (!filename.toLowerCase().endsWith(".pdf")) {
    return badRequest("Only PDF files can be served.");
  }

  const pdfRoot = path.resolve(process.cwd(), "../ASOPRS_All_PDFs");
  const filePath = path.resolve(pdfRoot, ...segments);

  if (!filePath.startsWith(`${pdfRoot}${path.sep}`)) {
    return badRequest("Invalid PDF path.");
  }

  try {
    const file = await readFile(filePath);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "PDF not found." }, { status: 404 });
  }
}
