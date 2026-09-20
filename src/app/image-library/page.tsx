import type { Metadata } from "next";
import Image from "next/image";
import { FileImage } from "lucide-react";
import { ImageLibraryDownloadPanel } from "@/components/image-library-download-panel";
import {
  ALL_IMAGE_LIBRARY_IMAGES,
  IMAGE_LIBRARY_SECTIONS,
} from "@/features/image-library/image-library";

export const metadata: Metadata = {
  title: "Image Library",
  description: "Every reviewed figure extracted from the ASOPRS curriculum, in index order.",
};

export default function ImageLibraryPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <header className="overflow-hidden rounded-[2rem] border border-ivory-dark bg-[linear-gradient(135deg,rgba(11,20,38,0.98),rgba(19,32,64,0.92))] px-5 py-7 text-white shadow-xl shadow-navy/8 md:px-8 md:py-9">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              <FileImage size={15} /> Complete ASOPRS curriculum
            </p>
            <h1 className="mt-3 font-[DM_Serif_Display] text-4xl md:text-5xl">Image Library</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/72">
              All {ALL_IMAGE_LIBRARY_IMAGES.length} reviewed figures, grouped by the section breadcrumb in each source and ordered by the curriculum index. Every image includes its source resource, figure label, and description.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-white/70">
              <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5">6 domains</span>
              <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5">27 source sections</span>
              <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5">154 resources scanned</span>
            </div>
          </div>
          <ImageLibraryDownloadPanel />
        </div>
      </header>

      <nav aria-label="Image library sections" className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {IMAGE_LIBRARY_SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`} className="shrink-0 rounded-full border border-ivory-dark bg-white px-3 py-1.5 text-xs font-semibold text-navy transition hover:border-coral hover:text-coral">
            {section.domainTitle} · {section.title} ({section.figureCount})
          </a>
        ))}
      </nav>

      <div className="mt-8 space-y-16">
        {IMAGE_LIBRARY_SECTIONS.map((section, sectionIndex) => (
          <section key={section.id} id={section.id} className="scroll-mt-6">
            <div className="flex flex-col gap-2 border-b border-ivory-dark pb-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-coral">
                  {section.domainTitle} · Section {sectionIndex + 1}
                </p>
                <h2 className="mt-1 font-[DM_Serif_Display] text-3xl text-navy">{section.title}</h2>
                {!section.isAuthoritativeSection ? (
                  <p className="mt-1 text-xs text-warm-gray">General resources filed at the domain root</p>
                ) : null}
              </div>
              <p className="text-sm text-warm-gray">{section.resourceCount} resources · {section.figureCount} figures</p>
            </div>

            <div className="mt-8 space-y-12">
              {section.resources.map((resource, resourceIndex) => {
                const figures = ALL_IMAGE_LIBRARY_IMAGES.filter(
                  (entry) => entry.sectionId === section.id && entry.documentTitle === resource.title,
                );
                return (
                  <section key={resource.id} aria-labelledby={`${section.id}-${resource.id}`}>
                    <div className="mb-4 flex items-baseline gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-coral/10 text-xs font-bold text-coral">{resourceIndex + 1}</span>
                      <div>
                        <h3 id={`${section.id}-${resource.id}`} className="font-[DM_Serif_Display] text-2xl text-navy">{resource.title}</h3>
                        <p className="mt-1 text-xs text-warm-gray">{figures.length} {figures.length === 1 ? "figure" : "figures"}</p>
                      </div>
                    </div>

                    {figures.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-ivory-dark bg-white p-6 text-sm text-warm-gray">No labeled image with a usable source description was found in this resource.</p>
                    ) : (
                      <div className="grid gap-5 lg:grid-cols-2">
                        {figures.map((figure) => (
                          <article key={figure.id} className="overflow-hidden rounded-2xl border border-ivory-dark bg-white shadow-sm">
                            <div className="flex min-h-72 items-center justify-center bg-[#f7f4ee] p-3">
                              <Image src={figure.imagePath} alt={`${figure.documentTitle}, ${figure.figureLabel}: ${figure.caption}`} width={1800} height={1200} className="max-h-[34rem] w-full object-contain" />
                            </div>
                            <div className="p-5">
                              <div className="flex items-center justify-between gap-4">
                                <p className="text-xs font-bold uppercase tracking-[0.15em] text-coral">{figure.figureLabel}</p>
                                <p className="text-xs text-warm-gray">Source page {figure.pageNumber}</p>
                              </div>
                              <p className="mt-3 text-sm leading-6 text-navy/85">{figure.caption}</p>
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
        ))}
      </div>
    </main>
  );
}
