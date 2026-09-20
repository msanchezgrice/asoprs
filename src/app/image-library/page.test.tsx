import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ImageLibraryPage from "./page";

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

describe("ImageLibraryPage", () => {
  it("shows the first ASOPRS section with every extracted figure and PDF export", () => {
    render(<ImageLibraryPage />);

    expect(
      screen.getByRole("heading", { name: "Image Library" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Acquired Laxity")).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(24);
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
    expect(
      screen.getByRole("checkbox", { name: /periorbital hollows/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: /download selected pdf \(24\)/i }),
    ).toBeEnabled();
    expect(screen.getByRole("link", { name: /download full pdf directly/i })).toHaveAttribute(
      "href",
      "/image-library/asoprs-image-library-acquired-laxity.pdf",
    );
    expect(screen.queryByText(/download powerpoint/i)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("checkbox", { name: /periorbital hollows/i }),
    );
    expect(
      screen.getByRole("button", { name: /download selected pdf \(15\)/i }),
    ).toBeEnabled();
  });
});
