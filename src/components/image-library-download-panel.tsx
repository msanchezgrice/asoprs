"use client";

import { useState } from "react";
import { Check, Download, FileText } from "lucide-react";
import {
  ACQUIRED_LAXITY_DOWNLOAD_RESOURCES,
  IMAGE_LIBRARY_SECTIONS,
} from "@/features/image-library/image-library";

export function ImageLibraryDownloadPanel() {
  const [selectedIds, setSelectedIds] = useState(() =>
    ACQUIRED_LAXITY_DOWNLOAD_RESOURCES.map((resource) => resource.id),
  );
  const [status, setStatus] = useState<"idle" | "building" | "error">("idle");
  const selectedFigureCount = ACQUIRED_LAXITY_DOWNLOAD_RESOURCES.filter(
    (resource) => selectedIds.includes(resource.id),
  ).reduce((count, resource) => count + resource.figureCount, 0);

  function toggleResource(resourceId: string) {
    setSelectedIds((current) =>
      current.includes(resourceId)
        ? current.filter((id) => id !== resourceId)
        : [...current, resourceId],
    );
  }

  async function downloadSelectedPdf() {
    if (selectedIds.length === 0) return;
    setStatus("building");
    try {
      const response = await fetch(IMAGE_LIBRARY_SECTIONS[0].pdfPath);
      if (!response.ok) throw new Error("Could not load the image PDF.");
      const { buildSelectedImageLibraryPdf, selectedImageLibraryFilename } =
        await import(
          "@/features/image-library/build-selected-image-library-pdf"
        );
      const bytes = await buildSelectedImageLibraryPdf(
        await response.arrayBuffer(),
        selectedIds,
      );
      const blob = new Blob([Uint8Array.from(bytes)], {
        type: "application/pdf",
      });
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
    <aside className="w-full rounded-2xl border border-white/15 bg-white/8 p-4 backdrop-blur-sm md:w-[22rem]">
      <div className="flex items-center gap-2">
        <FileText size={17} className="text-coral" />
        <p className="text-sm font-semibold">Download image PDF</p>
      </div>
      <p className="mt-1 text-xs leading-5 text-white/65">
        PDF keeps every image embedded. Choose the subsections to include.
      </p>

      <div className="mt-3 space-y-2">
        {ACQUIRED_LAXITY_DOWNLOAD_RESOURCES.map((resource, index) => {
          const checked = selectedIds.includes(resource.id);
          return (
            <label
              key={resource.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/12 bg-white/8 px-3 py-2.5 transition hover:bg-white/12"
            >
              <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleResource(resource.id)}
                  className="peer h-5 w-5 appearance-none rounded border border-white/45 bg-transparent checked:border-coral checked:bg-coral"
                />
                <Check
                  aria-hidden="true"
                  size={14}
                  className="pointer-events-none absolute text-white opacity-0 peer-checked:opacity-100"
                />
              </span>
              <span>
                <span className="block text-sm font-semibold">
                  {index + 1}. {resource.title}
                </span>
                <span className="mt-0.5 block text-xs text-white/60">
                  {resource.figureCount} {resource.figureCount === 1 ? "figure" : "figures"}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {selectedIds.length > 0 ? (
        <button
          type="button"
          onClick={downloadSelectedPdf}
          disabled={status === "building"}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-navy transition hover:-translate-y-0.5"
        >
          <Download size={16} />
          {status === "building"
            ? "Building PDF..."
            : `Download selected PDF (${selectedFigureCount})`}
        </button>
      ) : (
        <button
          type="button"
          disabled
          className="mt-3 inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-white/35 px-4 py-3 text-sm font-semibold text-navy/60"
        >
          <Download size={16} />
          Select a section
        </button>
      )}
      {status === "error" ? (
        <p role="alert" className="mt-2 text-xs text-[#ffd3ce]">
          The custom PDF could not be built. Use the full PDF link below.
        </p>
      ) : null}
      <a
        href={IMAGE_LIBRARY_SECTIONS[0].pdfPath}
        download
        className="mt-2 block text-center text-xs font-medium text-white/65 underline decoration-white/30 underline-offset-4 hover:text-white"
      >
        Download full PDF directly
      </a>
    </aside>
  );
}
