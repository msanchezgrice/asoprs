import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
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
  type StudyPack,
  type StudyPackContentMode,
  type StudyPackOutputFormat,
} from "@/lib/study-pack";
import {
  enforcePaidRateLimit,
  enforceRateLimit,
  rejectOversizedBody,
  requireSameOrigin,
  requireUser,
} from "@/lib/api-security";

export const maxDuration = 180;

const MAX_GENERATION_DOCUMENTS = 5;
const MAX_GENERATION_ITEMS_PER_DOCUMENT = 50;
const MAX_SAVED_PACK_BYTES = 750_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isContentMode(value: unknown): value is StudyPackContentMode {
  return value === "mcq" || value === "flashcards" || value === "both";
}

function isOutputFormat(value: unknown): value is StudyPackOutputFormat {
  return value === "docx" || value === "pdf" || value === "in-app";
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isValidStudyPack(value: unknown): value is StudyPack {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const pack = value as Partial<StudyPack>;
  if (
    !isBoundedText(pack.title, 200) ||
    !isContentMode(pack.contentMode) ||
    !Array.isArray(pack.sections) ||
    pack.sections.length === 0 ||
    pack.sections.length > MAX_GENERATION_DOCUMENTS ||
    JSON.stringify(value).length > MAX_SAVED_PACK_BYTES
  ) {
    return false;
  }

  return pack.sections.every((section) => {
    if (
      !section || typeof section !== "object" ||
      !isBoundedText(section.title, 200) ||
      !Array.isArray(section.mcqs) || section.mcqs.length > MAX_GENERATION_ITEMS_PER_DOCUMENT ||
      !Array.isArray(section.flashcards) || section.flashcards.length > MAX_GENERATION_ITEMS_PER_DOCUMENT
    ) {
      return false;
    }

    return section.mcqs.every((mcq) =>
      mcq && typeof mcq === "object" &&
      isBoundedText(mcq.question, 2_000) &&
      Array.isArray(mcq.options) && mcq.options.length === 3 &&
      mcq.options.every((option) => isBoundedText(option, 1_000)) &&
      Number.isInteger(mcq.correctIndex) && mcq.correctIndex >= 0 && mcq.correctIndex <= 2 &&
      (mcq.explanation === undefined || isBoundedText(mcq.explanation, 4_000))
    ) && section.flashcards.every((card) =>
      card && typeof card === "object" &&
      isBoundedText(card.front, 2_000) &&
      isBoundedText(card.back, 4_000)
    );
  });
}

async function persistStudyPack(params: {
  userId: string;
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
  const { data: inserted, error } = await getServiceClient()
    .from("user_study_packs")
    .insert({
      user_id: params.userId,
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
    console.error("Failed to persist study pack", error.code);
    return { id: null, error: "Unable to save study pack" };
  }

  return { id: inserted?.id ?? null, error: null };
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
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Failed to load saved study packs", error);
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
    const requestError = requireSameOrigin(request) ?? rejectOversizedBody(request, 32_000);
    if (requestError) return requestError;

    const auth = await requireUser({ verifiedEmail: true });
    if (!auth.ok) return auth.response;

    const rateLimit = await enforcePaidRateLimit(request, auth.user.id, "study_pack_generation", {
      user: 5,
      ip: 10,
      global: 100,
      windowSeconds: 3_600,
    });
    if (rateLimit) return rateLimit;

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
      body.selectedDocumentIds.length > MAX_GENERATION_DOCUMENTS ||
      new Set(body.selectedDocumentIds).size !== body.selectedDocumentIds.length ||
      body.selectedDocumentIds.some((id) => typeof id !== "string" || id.length > 100) ||
      !isContentMode(body.contentMode) ||
      !isOutputFormat(body.outputFormat) ||
      (body.instructions !== undefined && (typeof body.instructions !== "string" || body.instructions.length > 2_000))
    ) {
      return NextResponse.json(
        { error: "Invalid study pack request." },
        { status: 400 }
      );
    }

    const mcqCount = Math.min(
      MAX_GENERATION_ITEMS_PER_DOCUMENT,
      sanitizeStudyPackCount(body.mcqCount, DEFAULT_STUDY_PACK_MCQ_COUNT),
    );
    const flashcardCount = Math.min(
      MAX_GENERATION_ITEMS_PER_DOCUMENT,
      sanitizeStudyPackCount(body.flashcardCount, DEFAULT_STUDY_PACK_FLASHCARD_COUNT),
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
      return NextResponse.json({ error: "Unable to load documents" }, { status: 503 });
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
      return NextResponse.json({ error: "Unable to load document content" }, { status: 503 });
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
    if (!isValidStudyPack(pack) || packText.length > MAX_SAVED_PACK_BYTES) {
      return NextResponse.json(
        { error: "Generated study pack exceeded safe limits." },
        { status: 422 },
      );
    }
    const persisted = await persistStudyPack({
      userId: auth.user.id,
      outputFormat: body.outputFormat,
      selectedDocumentIds: body.selectedDocumentIds,
      instructions,
      pack,
      packText,
    });
    const savedPackId = persisted.id;

    if (body.outputFormat === "in-app") {
      return NextResponse.json({
        pack,
        text: packText,
        filename: buildStudyPackFilename(pack, "in-app"),
        savedPackId,
        saved: Boolean(savedPackId),
        saveError: persisted.error,
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
        "x-study-pack-save-error": persisted.error ?? "",
      },
    });
  } catch (error) {
    console.error("Study pack generation failed", error);
    return NextResponse.json({ error: "Failed to generate study pack." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const requestError = requireSameOrigin(request) ?? rejectOversizedBody(request, 800_000);
    if (requestError) return requestError;

    const auth = await requireUser({ verifiedEmail: true });
    if (!auth.ok) return auth.response;

    const rateLimit = await enforceRateLimit(auth.user.id, "study_pack_save", 20, 3_600);
    if (rateLimit) return rateLimit;

    const body = (await request.json()) as {
      pack?: StudyPack;
      text?: string;
      outputFormat?: StudyPackOutputFormat;
      selectedDocumentIds?: string[];
      instructions?: string;
    };

    if (
      !isValidStudyPack(body.pack) ||
      !isOutputFormat(body.outputFormat) ||
      (body.text !== undefined && (typeof body.text !== "string" || body.text.length > MAX_SAVED_PACK_BYTES)) ||
      (body.instructions !== undefined && (typeof body.instructions !== "string" || body.instructions.length > 2_000)) ||
      (body.selectedDocumentIds !== undefined && (
        !Array.isArray(body.selectedDocumentIds) ||
        body.selectedDocumentIds.length > MAX_GENERATION_DOCUMENTS ||
        new Set(body.selectedDocumentIds).size !== body.selectedDocumentIds.length ||
        body.selectedDocumentIds.some((id) => typeof id !== "string" || !UUID_RE.test(id))
      ))
    ) {
      return NextResponse.json(
        { error: "Invalid save request." },
        { status: 400 }
      );
    }

    const packText = body.text || buildStudyPackText(body.pack);
    if (packText.length > MAX_SAVED_PACK_BYTES) {
      return NextResponse.json({ error: "Study pack is too large." }, { status: 413 });
    }

    const { data: inserted, error } = await getServiceClient()
      .from("user_study_packs")
      .insert({
        user_id: auth.user.id,
        title: body.pack.title,
        content_mode: body.pack.contentMode,
        section_titles: body.pack.sections.map((s) => s.title),
        source_document_ids: body.selectedDocumentIds || [],
        output_format: body.outputFormat,
        generation_instructions: body.instructions || null,
        pack_json: body.pack,
        pack_text: packText,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to save study pack", error.code);
      return NextResponse.json({ error: "Unable to save study pack" }, { status: 503 });
    }

    return NextResponse.json({ id: inserted.id });
  } catch (error) {
    console.error("Failed to save study pack:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Failed to save study pack." }, { status: 503 });
  }
}
