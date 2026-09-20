"use client";

import { useMemo, useState } from "react";
import { Check, Download, FileText } from "lucide-react";
import {
  COMPLETE_IMAGE_LIBRARY_PDF_PATH,
  IMAGE_LIBRARY_DOWNLOAD_SECTIONS,
} from "@/features/image-library/image-library";

export function ImageLibraryDownloadPanel() {
  const [selectedIds, setSelectedIds] = useState(() =>
    IMAGE_LIBRARY_DOWNLOAD_SECTIONS.map((section) => section.id),
  );
  const [status, setStatus] = useState<"idle" | "building" | "error">("idle");
  const domains = useMemo(
    () => Array.from(new Set(IMAGE_LIBRARY_DOWNLOAD_SECTIONS.map((section) => section.domainTitle))),
    [],
  );
  const selectedFigureCount = IMAGE_LIBRARY_DOWNLOAD_SECTIONS.filter(
    (section) => selectedIds.includes(section.id),
  ).reduce((count, section) => count + section.figureCount, 0);
  const allSelected = selectedIds.length === IMAGE_LIBRARY_DOWNLOAD_SECTIONS.length;

  function toggleSection(sectionId: string) {
    setSelectedIds((current) =>
      current.includes(sectionId)
        ? current.filter((id) => id !== sectionId)
        : [...current, sectionId],
    );
  }

  async function downloadSelectedPdf() {
    if (selectedIds.length === 0) return;
    if (allSelected) {
      const anchor = document.createElement("a");
      anchor.href = COMPLETE_IMAGE_LIBRARY_PDF_PATH;
      anchor.download = "asoprs-image-library-complete.pdf";
      anchor.click();
      return;
    }

    setStatus("building");
    try {
      const response = await fetch(COMPLETE_IMAGE_LIBRARY_PDF_PATH);
      if (!response.ok) throw new Error("Could not load the image PDF.");
      const { buildSelectedImageLibraryPdf, selectedImageLibraryFilename } =
        await import("@/features/image-library/build-selected-image-library-pdf");
      const bytes = await buildSelectedImageLibraryPdf(
        await response.arrayBuffer(),
        selectedIds,
      );
      const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = selectedImageLibraryFilename(selectedIds);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <aside className="w-full rounded-2xl border border-white/15 bg-white/8 p-4 backdrop-blur-sm md:w-[28rem]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText size={17} className="text-coral" />
          <p className="text-sm font-semibold">Download image PDF</p>
        </div>
        <div className="flex gap-2 text-[11px] font-semibold">
          <button type="button" onClick={() => setSelectedIds(IMAGE_LIBRARY_DOWNLOAD_SECTIONS.map((section) => section.id))} className="text-white/75 underline underline-offset-2 hover:text-white">
            Select all
          </button>
          <button type="button" onClick={() => setSelectedIds([])} className="text-white/75 underline underline-offset-2 hover:text-white">
            Clear
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs leading-5 text-white/65">
        Choose any curriculum sections. Images stay embedded in canonical resource order.
      </p>

      <div className="mt-3 max-h-80 space-y-4 overflow-y-auto pr-1">
        {domains.map((domain) => (
          <div key={domain}>
            <p className="sticky top-0 z-10 bg-navy/95 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">
              {domain}
            </p>
            <div className="mt-1 space-y-1.5">
              {IMAGE_LIBRARY_DOWNLOAD_SECTIONS.filter((section) => section.domainTitle === domain).map((section) => {
                const checked = selectedIds.includes(section.id);
                return (
                  <label key={section.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/12 bg-white/8 px-3 py-2 transition hover:bg-white/12">
                    <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                      <input type="checkbox" checked={checked} onChange={() => toggleSection(section.id)} className="peer h-5 w-5 appearance-none rounded border border-white/45 bg-transparent checked:border-coral checked:bg-coral" />
                      <Check aria-hidden="true" size={14} className="pointer-events-none absolute text-white opacity-0 peer-checked:opacity-100" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{section.title}</span>
                      <span className="mt-0.5 block text-xs text-white/60">
                        {section.resourceCount} resources · {section.figureCount} figures
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={downloadSelectedPdf} disabled={selectedIds.length === 0 || status === "building"} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-navy transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45">
        <Download size={16} />
        {status === "building" ? "Building PDF..." : `Download ${allSelected ? "complete" : "selected"} PDF (${selectedFigureCount})`}
      </button>
      {status === "error" ? (
        <p role="alert" className="mt-2 text-xs text-[#ffd3ce]">
          The custom PDF could not be built. Use the complete PDF link below.
        </p>
      ) : null}
      <a href={COMPLETE_IMAGE_LIBRARY_PDF_PATH} download className="mt-2 block text-center text-xs font-medium text-white/65 underline decoration-white/30 underline-offset-4 hover:text-white">
        Download complete PDF directly
      </a>
    </aside>
  );
}
