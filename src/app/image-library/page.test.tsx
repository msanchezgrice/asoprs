import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ALL_IMAGE_LIBRARY_IMAGES,
  COMPLETE_IMAGE_LIBRARY_PDF_PATH,
  IMAGE_LIBRARY_DOWNLOAD_SECTIONS,
} from "@/features/image-library/image-library";
import ImageLibraryPage from "./page";

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

describe("ImageLibraryPage", () => {
  it("shows every ASOPRS section with all extracted figures and PDF export options", () => {
    const { container } = render(<ImageLibraryPage />);

    expect(
      screen.getByRole("heading", { name: "Image Library" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Acquired Laxity", level: 2 }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(ALL_IMAGE_LIBRARY_IMAGES.length);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(
      IMAGE_LIBRARY_DOWNLOAD_SECTIONS.length,
    );

    const acquiredLaxity = IMAGE_LIBRARY_DOWNLOAD_SECTIONS.find(
      (section) => section.title === "Acquired Laxity",
    );
    expect(acquiredLaxity).toBeDefined();
    const acquiredLaxityLabel = Array.from(container.querySelectorAll("label")).find(
      (label) => label.textContent?.includes("Acquired Laxity"),
    );
    const acquiredLaxityCheckbox = acquiredLaxityLabel?.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(acquiredLaxityCheckbox).toBeChecked();
    expect(
      screen.getByText(`Download complete PDF (${ALL_IMAGE_LIBRARY_IMAGES.length})`),
    ).toBeEnabled();
    expect(
      screen.getByRole("link", { name: /download complete pdf directly/i }),
    ).toHaveAttribute("href", COMPLETE_IMAGE_LIBRARY_PDF_PATH);
    expect(screen.queryByText(/download powerpoint/i)).not.toBeInTheDocument();

    fireEvent.click(acquiredLaxityCheckbox);
    expect(
      screen.getByText(
        `Download selected PDF (${ALL_IMAGE_LIBRARY_IMAGES.length - acquiredLaxity!.figureCount})`,
      ),
    ).toBeEnabled();
  }, 15_000);
});
