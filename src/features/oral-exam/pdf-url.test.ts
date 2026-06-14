import { describe, expect, it } from "vitest";
import { resolveOralExamPdfUrl } from "./pdf-url";

describe("resolveOralExamPdfUrl", () => {
  it("uses Supabase storage when a public base URL is configured", () => {
    expect(
      resolveOralExamPdfUrl(
        "Orbit/Orbital Rhabdomyosarcoma.pdf",
        "https://example.supabase.co"
      )
    ).toBe(
      "https://example.supabase.co/storage/v1/object/public/pdfs/Orbit/Orbital%20Rhabdomyosarcoma.pdf"
    );
  });

  it("falls back to the local PDF API when Supabase is not configured", () => {
    expect(
      resolveOralExamPdfUrl("Skin Conditions/Sebaceous Adenocarcinoma.pdf", "")
    ).toBe(
      "/api/local-pdfs/Skin%20Conditions/Sebaceous%20Adenocarcinoma.pdf"
    );
  });

  it("falls back to the local PDF API for localhost placeholder Supabase URLs", () => {
    expect(
      resolveOralExamPdfUrl(
        "Orbit/Orbital Rhabdomyosarcoma.pdf",
        "http://localhost"
      )
    ).toBe(
      "/api/local-pdfs/Orbit/Orbital%20Rhabdomyosarcoma.pdf"
    );
  });
});
