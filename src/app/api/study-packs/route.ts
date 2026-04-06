import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildStudyPackDocx,
  buildStudyPackPdf,
  generateStudyPack,
} from "@/lib/study-pack-server";
import {
  buildStudyPackInstructions,
  buildStudyPackFilename,
  buildStudyPackText,
  DEFAULT_STUDY_PACK_FLASHCARD_COUNT,
  DEFAULT_STUDY_PACK_MCQ_COUNT,
  sanitizeStudyPackCount,
  type StudyPackContentMode,
  type StudyPackOutputFormat,
} from "@/lib/study-pack";

export const maxDuration = 300;

function isContentMode(value: unknown): value is StudyPackContentMode {
  return value === "mcq" || value === "flashcards" || value === "both";
}

function isOutputFormat(value: unknown): value is StudyPackOutputFormat {
  return value === "docx" || value === "pdf" || value === "in-app";
}

async function persistStudyPack(params: {
  outputFormat: StudyPackOutputFormat;
  selectedDocumentIds: string[];
  instructions: string;
  pack: {
    title: string;
    contentMode: StudyPackContentMode;
    sections: { title: string }[];
  };
  packText: string;
}) {
  const userDb = await createServerSupabaseClient();
  const {
    data: { user },
  } = await userDb.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: inserted, error } = await userDb
    .from("user_study_packs")
    .insert({
      user_id: user.id,
      title: params.pack.title,
      content_mode: params.pack.contentMode,
      section_titles: params.pack.sections.map((section) => section.title),
      source_document_ids: params.selectedDocumentIds,
      output_format: params.outputFormat,
      generation_instructions: params.instructions || null,
      pack_json: params.pack,
      pack_text: params.packText,
    })
    .select("id")
    .single();

  if (error) {
    return null;
  }

  return inserted?.id ?? null;
}

export async function GET() {
  const userDb = await createServerSupabaseClient();
  const {
    data: { user },
  } = await userDb.auth.getUser();

  if (!user) {
    return NextResponse.json({
      authenticated: false,
      resources: [],
    });
  }

  const { data, error } = await userDb
    .from("user_study_packs")
    .select("id, title, content_mode, section_titles, output_format, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    authenticated: true,
    resources: (data || []).map((item) => ({
      id: item.id,
      title: item.title,
      contentMode: item.content_mode,
      sectionTitles: item.section_titles || [],
      outputFormat: item.output_format,
      createdAt: item.created_at,
    })),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      selectedDocumentIds?: string[];
      contentMode?: StudyPackContentMode;
      outputFormat?: StudyPackOutputFormat;
      instructions?: string;
      mcqCount?: number;
      flashcardCount?: number;
    };

    if (
      !Array.isArray(body.selectedDocumentIds) ||
      body.selectedDocumentIds.length === 0 ||
      !isContentMode(body.contentMode) ||
      !isOutputFormat(body.outputFormat)
    ) {
      return NextResponse.json(
        { error: "Invalid study pack request." },
        { status: 400 }
      );
    }

    const mcqCount = sanitizeStudyPackCount(
      body.mcqCount,
      DEFAULT_STUDY_PACK_MCQ_COUNT
    );
    const flashcardCount = sanitizeStudyPackCount(
      body.flashcardCount,
      DEFAULT_STUDY_PACK_FLASHCARD_COUNT
    );
    const instructions =
      body.instructions?.trim() ||
      buildStudyPackInstructions({
        contentMode: body.contentMode,
        mcqCount,
        flashcardCount,
      });

    const supabase = getServiceClient();
    const { data: docs, error: docsError } = await supabase
      .from("documents")
      .select("id, title, category")
      .in("id", body.selectedDocumentIds);

    if (docsError) {
      return NextResponse.json({ error: docsError.message }, { status: 500 });
    }

    if (!docs || docs.length !== body.selectedDocumentIds.length) {
      return NextResponse.json(
        { error: "One or more selected documents could not be found." },
        { status: 404 }
      );
    }

    const { data: chunks, error: chunkError } = await supabase
      .from("document_chunks")
      .select("document_id, chunk_index, content")
      .in("document_id", body.selectedDocumentIds)
      .order("chunk_index");

    if (chunkError) {
      return NextResponse.json({ error: chunkError.message }, { status: 500 });
    }

    const chunksByDoc = new Map<string, string[]>();
    for (const chunk of chunks || []) {
      if (!chunksByDoc.has(chunk.document_id)) {
        chunksByDoc.set(chunk.document_id, []);
      }
      chunksByDoc.get(chunk.document_id)?.push(chunk.content);
    }

    const docsById = new Map(docs.map((doc) => [doc.id, doc]));
    const orderedDocs = body.selectedDocumentIds
      .map((id) => docsById.get(id))
      .filter(Boolean)
      .map((doc) => ({
        id: doc!.id,
        title: doc!.title,
        category: doc!.category,
        content: (chunksByDoc.get(doc!.id) || []).join("\n\n").trim(),
      }))
      .filter((doc) => doc.content.length > 0);

    if (orderedDocs.length === 0) {
      return NextResponse.json(
        { error: "The selected documents do not have readable source content yet." },
        { status: 422 }
      );
    }

    const pack = await generateStudyPack({
      documents: orderedDocs,
      contentMode: body.contentMode,
      instructions,
      mcqCount,
      flashcardCount,
    });
    const packText = buildStudyPackText(pack);
    const savedPackId = await persistStudyPack({
      outputFormat: body.outputFormat,
      selectedDocumentIds: body.selectedDocumentIds,
      instructions,
      pack,
      packText,
    });

    if (body.outputFormat === "in-app") {
      return NextResponse.json({
        pack,
        text: packText,
        filename: buildStudyPackFilename(pack, "in-app"),
        savedPackId,
        saved: Boolean(savedPackId),
      });
    }

    const bytes =
      body.outputFormat === "docx"
        ? await buildStudyPackDocx(pack)
        : await buildStudyPackPdf(pack);
    const filename = buildStudyPackFilename(pack, body.outputFormat);
    const contentType =
      body.outputFormat === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf";
    const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const arrayBuffer = payload.buffer.slice(
      payload.byteOffset,
      payload.byteOffset + payload.byteLength
    ) as ArrayBuffer;

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "x-study-pack-id": savedPackId ?? "",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate study pack.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
