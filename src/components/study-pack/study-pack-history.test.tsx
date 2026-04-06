import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { StudyPackHistory } from "./study-pack-history";

afterEach(() => {
  vi.clearAllMocks();
});

describe("StudyPackHistory", () => {
  test("renders saved study resources with actions", () => {
    const onPreview = vi.fn();
    const onDownload = vi.fn();

    render(
      <StudyPackHistory
        resources={[
          {
            id: "pack-1",
            title: "ASOPRS Study Pack - 5 Sections",
            contentMode: "both",
            sectionTitles: [
              "17 Cicatricial Entropion",
              "18 Congenital Entropion",
            ],
            createdAt: "2026-04-06T15:00:00.000Z",
            outputFormat: "docx",
          },
        ]}
        loading={false}
        authenticated
        onPreview={onPreview}
        onDownload={onDownload}
      />
    );

    expect(
      screen.getByText(/ASOPRS Study Pack - 5 Sections/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/17 Cicatricial Entropion/i)).toBeInTheDocument();
    expect(screen.getByText(/18 Congenital Entropion/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /preview/i }));
    expect(onPreview).toHaveBeenCalledWith("pack-1");

    fireEvent.click(screen.getByRole("button", { name: /download word/i }));
    expect(onDownload).toHaveBeenCalledWith("pack-1", "docx");
  });

  test("shows auth guidance when storage is unavailable", () => {
    render(
      <StudyPackHistory
        resources={[]}
        loading={false}
        authenticated={false}
        onPreview={vi.fn()}
        onDownload={vi.fn()}
      />
    );

    expect(
      screen.getByText(/sign in to keep a saved library of generated study resources/i)
    ).toBeInTheDocument();
  });
});
