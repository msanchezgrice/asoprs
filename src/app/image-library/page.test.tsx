import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ImageLibraryPage from "./page";

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

describe("ImageLibraryPage", () => {
  it("shows the first ASOPRS section with every extracted figure and PowerPoint", () => {
    render(<ImageLibraryPage />);

    expect(
      screen.getByRole("heading", { name: "Image Library" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Acquired Laxity")).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(24);
    expect(
      screen.getByRole("link", { name: /download powerpoint/i }),
    ).toHaveAttribute(
      "href",
      "/image-library/asoprs-image-library-acquired-laxity.pptx",
    );
  });
});
