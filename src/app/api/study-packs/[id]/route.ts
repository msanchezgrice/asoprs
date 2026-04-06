import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildStudyPackDocx,
  buildStudyPackPdf,
} from "@/lib/study-pack-server";
import {
  buildStudyPackFilename,
  type StudyPack,
  type StudyPackOutputFormat,
} from "@/lib/study-pack";

function isOutputFormat(value: string | null): value is StudyPackOutputFormat {
  return value === "docx" || value === "pdf" || value === "in-app";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userDb = await createServerSupabaseClient();
  const {
    data: { user },
  } = await userDb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data, error } = await userDb
    .from("user_study_packs")
    .select("id, title, pack_json, pack_text")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Study pack not found" }, { status: 404 });
  }

  const format = request.nextUrl.searchParams.get("format");
  const pack = data.pack_json as StudyPack;

  if (!isOutputFormat(format) || format === "in-app") {
    return NextResponse.json({
      id: data.id,
      pack,
      text: data.pack_text,
    });
  }

  const bytes =
    format === "docx" ? await buildStudyPackDocx(pack) : await buildStudyPackPdf(pack);
  const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const arrayBuffer = payload.buffer.slice(
    payload.byteOffset,
    payload.byteOffset + payload.byteLength
  ) as ArrayBuffer;

  return new NextResponse(arrayBuffer, {
    headers: {
      "Content-Type":
        format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf",
      "Content-Disposition": `attachment; filename="${buildStudyPackFilename(
        pack,
        format
      )}"`,
    },
  });
}
