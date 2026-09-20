import type { Metadata } from "next";
import Image from "next/image";
import { FileImage } from "lucide-react";
import { ImageLibraryDownloadPanel } from "@/components/image-library-download-panel";
import {
  ACQUIRED_LAXITY_IMAGES,
  ACQUIRED_LAXITY_RESOURCES,
  FIRST_SECTION_TITLE,
} from "@/features/image-library/image-library";

export const metadata: Metadata = {
  title: "Image Library",
  description: "Figures extracted from the ASOPRS library in curriculum order.",
};

export default function ImageLibraryPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <header className="overflow-hidden rounded-[2rem] border border-ivory-dark bg-[linear-gradient(135deg,rgba(11,20,38,0.98),rgba(19,32,64,0.92))] px-5 py-7 text-white shadow-xl shadow-navy/8 md:px-8 md:py-9">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              <FileImage size={15} /> ASOPRS curriculum order
            </p>
            <h1 className="mt-3 font-[DM_Serif_Display] text-4xl md:text-5xl">
              Image Library
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/72">
              Review slice 1 of the index: every detected figure from the first
              curricular section, paired with its source subheading and description.
            </p>
          </div>
          <ImageLibraryDownloadPanel />
        </div>
      </header>

      <section className="mt-8">
        <div className="flex flex-col gap-2 border-b border-ivory-dark pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-coral">
              Section 1
            </p>
            <h2 className="mt-1 font-[DM_Serif_Display] text-3xl text-navy">
              {FIRST_SECTION_TITLE}
            </h2>
          </div>
          <p className="text-sm text-warm-gray">
            {ACQUIRED_LAXITY_RESOURCES.length} resources · {ACQUIRED_LAXITY_IMAGES.length} figures
          </p>
        </div>

        <div className="mt-8 space-y-12">
          {ACQUIRED_LAXITY_RESOURCES.map((resource, resourceIndex) => {
            const figures = ACQUIRED_LAXITY_IMAGES.filter(
              (entry) => entry.documentTitle === resource,
            );

            return (
              <section key={resource} aria-labelledby={`resource-${resourceIndex + 1}`}>
                <div className="mb-4 flex items-baseline gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-coral/10 text-xs font-bold text-coral">
                    {resourceIndex + 1}
                  </span>
                  <div>
                    <h3
                      id={`resource-${resourceIndex + 1}`}
                      className="font-[DM_Serif_Display] text-2xl text-navy"
                    >
                      {resource}
                    </h3>
                    <p className="mt-1 text-xs text-warm-gray">
                      {figures.length} {figures.length === 1 ? "figure" : "figures"}
                    </p>
                  </div>
                </div>

                {figures.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-ivory-dark bg-white p-6 text-sm text-warm-gray">
                    No labeled figures were detected in this resource.
                  </p>
                ) : (
                  <div className="grid gap-5 lg:grid-cols-2">
                    {figures.map((figure) => (
                      <article
                        key={figure.id}
                        className="overflow-hidden rounded-2xl border border-ivory-dark bg-white shadow-sm"
                      >
                        <div className="flex min-h-72 items-center justify-center bg-[#f7f4ee] p-3">
                          <Image
                            src={figure.imagePath}
                            alt={`${figure.documentTitle}, ${figure.figureLabel}: ${figure.caption}`}
                            width={1800}
                            height={1200}
                            className="max-h-[34rem] w-full object-contain"
                          />
                        </div>
                        <div className="p-5">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-xs font-bold uppercase tracking-[0.15em] text-coral">
                              {figure.figureLabel}
                            </p>
                            <p className="text-xs text-warm-gray">
                              Source page {figure.pageNumber}
                            </p>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-navy/85">
                            {figure.caption}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </section>
    </main>
  );
}
