"use client";

import { useEffect, useState } from "react";
import { FileOutput, Layers, Loader2, Sparkles } from "lucide-react";
import { StudyPackGeneratorModal } from "@/components/study-pack/study-pack-generator-modal";
import { StudyPackHistory } from "@/components/study-pack/study-pack-history";
import { useAuthSession } from "@/hooks/use-auth-session";
import type { Document, Category } from "@/data/sample-documents";
import type {
  SavedStudyPackSummary,
  StudyPack,
  StudyPackOutputFormat,
  StudyPackRequest,
} from "@/lib/study-pack";

type LibraryDocResponse = {
  id: string;
  title: string;
  category: Category;
  page_count: number;
  flashcard_count: number;
  mcq_count: number;
  status: Document["status"];
  progress: number;
  storage_path: string | null;
};

function getFilenameFromDisposition(
  disposition: string | null,
  fallback: string
) {
  if (!disposition) return fallback;
  const match = disposition.match(/filename="([^"]+)"/i);
  return match?.[1] || fallback;
}

export default function StudyResourcesPage() {
  const { user } = useAuthSession();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [resources, setResources] = useState<SavedStudyPackSummary[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [studyPackOpen, setStudyPackOpen] = useState(false);
  const [studyPackSession, setStudyPackSession] = useState(0);
  const [studyPackGenerating, setStudyPackGenerating] = useState(false);
  const [studyPackError, setStudyPackError] = useState<string | null>(null);
  const [studyPackPreview, setStudyPackPreview] = useState<{
    pack: StudyPack;
    text: string;
    saved?: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingSaveRequest, setPendingSaveRequest] =
    useState<StudyPackRequest | null>(null);
  const [selectedSavedPreview, setSelectedSavedPreview] = useState<{
    id: string;
    pack: StudyPack;
    text: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    fetch("/api/documents")
      .then((r) => r.json())
      .then((data) => {
        const docs: Document[] = (Array.isArray(data) ? data : []).map(
          (d: LibraryDocResponse) => ({
            id: d.id,
            title: d.title,
            category: d.category,
            pageCount: d.page_count || 0,
            flashcardCount: d.flashcard_count || 0,
            mcqCount: d.mcq_count || 0,
            status: d.status || "not_started",
            progress: d.progress || 0,
            storagePath: d.storage_path,
          })
        );
        setDocuments(docs);
        setDocumentsLoading(false);
      })
      .catch(() => setDocumentsLoading(false));
  }, []);

  async function refreshResources() {
    setResourcesLoading(true);
    setResourcesError(null);
    try {
      const response = await fetch("/api/study-packs");
      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => ({ error: "Failed to load saved study resources." }));
        throw new Error(
          payload.error || "Failed to load saved study resources."
        );
      }
      const payload = (await response.json()) as {
        authenticated: boolean;
        resources: SavedStudyPackSummary[];
      };
      setResources(Array.isArray(payload.resources) ? payload.resources : []);
    } catch (error) {
      setResources([]);
      setResourcesError(
        error instanceof Error
          ? error.message
          : "Failed to load saved study resources."
      );
    } finally {
      setResourcesLoading(false);
    }
  }

  useEffect(() => {
    refreshResources().catch(() => setResourcesLoading(false));
  }, [user]);

  async function handleStudyPackGenerate(request: StudyPackRequest) {
    setStudyPackGenerating(true);
    setStudyPackError(null);

    try {
      const response = await fetch("/api/study-packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => ({ error: "Failed to generate study pack." }));
        throw new Error(payload.error || "Failed to generate study pack.");
      }

      if (request.outputFormat === "in-app") {
        const payload = (await response.json()) as {
          pack: StudyPack;
          text: string;
          saved?: boolean;
          saveError?: string | null;
        };
        setStudyPackPreview({
          pack: payload.pack,
          text: payload.text,
          saved: payload.saved,
        });
        setSelectedSavedPreview(null);
        if (!payload.saved) {
          setPendingSaveRequest(request);
        } else {
          setPendingSaveRequest(null);
        }
        if (user && payload.saved === false && payload.saveError) {
          setStudyPackError(
            `${payload.saveError} The study pack generated, but it was not saved.`
          );
        }
      } else {
        const blob = await response.blob();
        const fallback =
          request.outputFormat === "docx"
            ? "asoprs-study-pack.docx"
            : "asoprs-study-pack.pdf";
        const filename = getFilenameFromDisposition(
          response.headers.get("content-disposition"),
          fallback
        );
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        window.URL.revokeObjectURL(url);
        const saveError = response.headers.get("x-study-pack-save-error");
        if (user && saveError) {
          setStudyPackError(
            `${saveError} The file downloaded, but the study pack was not saved.`
          );
        } else {
          setStudyPackOpen(false);
        }
      }

      if (user) {
        await refreshResources();
      }
    } catch (error) {
      setStudyPackError(
        error instanceof Error ? error.message : "Failed to generate study pack."
      );
    } finally {
      setStudyPackGenerating(false);
    }
  }

  async function handleSavePack() {
    if (!pendingSaveRequest || !studyPackPreview) return;
    setSaving(true);
    setStudyPackError(null);
    try {
      const response = await fetch("/api/study-packs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pack: studyPackPreview.pack,
          text: studyPackPreview.text,
          outputFormat: pendingSaveRequest.outputFormat,
          selectedDocumentIds: pendingSaveRequest.selectedDocumentIds,
          instructions: pendingSaveRequest.instructions,
        }),
      });
      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => ({ error: "Failed to save study pack." }));
        throw new Error(payload.error || "Failed to save study pack.");
      }
      setStudyPackPreview((prev) => (prev ? { ...prev, saved: true } : prev));
      setPendingSaveRequest(null);
      await refreshResources();
    } catch (error) {
      setStudyPackError(
        error instanceof Error ? error.message : "Failed to save study pack."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handlePreviewSaved(id: string) {
    setPreviewLoading(true);
    try {
      const response = await fetch(`/api/study-packs/${id}`);
      const payload = (await response.json()) as {
        id: string;
        pack: StudyPack;
        text: string;
      };
      setSelectedSavedPreview(payload);
      setStudyPackPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleDownloadSaved(
    id: string,
    format: Exclude<StudyPackOutputFormat, "in-app">
  ) {
    const response = await fetch(`/api/study-packs/${id}?format=${format}`);
    if (!response.ok) return;

    const blob = await response.blob();
    const filename = getFilenameFromDisposition(
      response.headers.get("content-disposition"),
      format === "docx" ? "asoprs-study-pack.docx" : "asoprs-study-pack.pdf"
    );
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <section className="mb-8 overflow-hidden rounded-[2rem] border border-ivory-dark bg-[linear-gradient(135deg,rgba(11,20,38,0.98),rgba(19,32,64,0.92))] px-6 py-8 text-white shadow-xl shadow-navy/8 md:px-8">
        <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75">
              <Sparkles size={13} />
              Stored study resources
            </div>
            <h1 className="mt-4 max-w-3xl font-[DM_Serif_Display] text-3xl leading-tight md:text-5xl">
              Generate section-based study packs and come back to them later.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/72">
              Build bundled MCQs, flashcards, or both across any set of ASOPRS
              sections. Saved generations stay here for preview and re-download.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
              <p className="text-sm font-semibold text-white">Saved resources</p>
              <p className="mt-2 text-2xl font-bold text-white">
                {user ? resources.length : "Sign in"}
              </p>
              <p className="mt-1 text-xs text-white/65">
                {user
                  ? "persistent across sessions"
                  : "required for storage and history"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setStudyPackSession((value) => value + 1);
                setStudyPackError(null);
                setStudyPackPreview(null);
                setStudyPackOpen(true);
              }}
              className="inline-flex items-center justify-between rounded-2xl bg-white px-4 py-4 text-sm font-semibold text-navy transition-transform hover:translate-x-0.5"
            >
              <span>New study resource</span>
              <FileOutput size={16} />
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          {resourcesError ? (
            <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-5 shadow-sm">
              <p className="text-sm font-semibold text-rose-900">
                Saved study resources are unavailable right now.
              </p>
              <p className="mt-2 text-sm leading-6 text-rose-800">
                {resourcesError}
              </p>
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-warm-gray">
                Library
              </p>
              <h2 className="mt-1 font-[DM_Serif_Display] text-2xl text-navy">
                Saved study resources
              </h2>
            </div>
            <div className="rounded-full bg-ivory px-3 py-1.5 text-xs font-semibold text-navy">
              {documentsLoading ? "Loading sections..." : `${documents.length} sections ready`}
            </div>
          </div>

          <StudyPackHistory
            resources={resources}
            loading={resourcesLoading}
            authenticated={Boolean(user)}
            onPreview={handlePreviewSaved}
            onDownload={handleDownloadSaved}
          />
        </div>

        <section className="rounded-[28px] border border-ivory-dark bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-coral/10 text-coral">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-coral">
                Preview
              </p>
              <h2 className="font-[DM_Serif_Display] text-2xl text-navy">
                {selectedSavedPreview?.pack.title ||
                  studyPackPreview?.pack.title ||
                  "Open a saved resource or generate a new one"}
              </h2>
            </div>
          </div>

          {previewLoading ? (
            <div className="mt-6 flex items-center text-sm text-warm-gray">
              <Loader2 className="mr-3 h-4 w-4 animate-spin text-coral" />
              Loading preview...
            </div>
          ) : selectedSavedPreview || studyPackPreview ? (
            <pre className="mt-6 max-h-[70vh] overflow-auto rounded-3xl bg-ivory px-4 py-4 text-xs leading-6 text-navy whitespace-pre-wrap">
              {(selectedSavedPreview || studyPackPreview)?.text}
            </pre>
          ) : (
            <div className="mt-6 rounded-3xl border border-dashed border-ivory-dark bg-ivory/40 px-5 py-10 text-center">
              <p className="font-[DM_Serif_Display] text-2xl text-navy">
                Nothing selected yet
              </p>
              <p className="mt-2 text-sm leading-6 text-warm-gray">
                Generate a new study resource or preview an existing saved pack
                from the list.
              </p>
            </div>
          )}
        </section>
      </div>

      <StudyPackGeneratorModal
        key={studyPackSession}
        open={studyPackOpen}
        documents={documents}
        generating={studyPackGenerating}
        errorMessage={studyPackError}
        preview={studyPackPreview}
        onClose={() => {
          setStudyPackOpen(false);
          setStudyPackError(null);
        }}
        onGenerate={handleStudyPackGenerate}
        onClearPreview={() => {
          setStudyPackPreview(null);
          setPendingSaveRequest(null);
        }}
        onSave={user && pendingSaveRequest ? handleSavePack : undefined}
        saving={saving}
      />
    </div>
  );
}
