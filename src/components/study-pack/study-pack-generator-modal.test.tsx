import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { StudyPackGeneratorModal } from "./study-pack-generator-modal";
import { buildStudyPackInstructions } from "@/lib/study-pack";

afterEach(() => {
  cleanup();
});

const documents = [
  {
    id: "sec-17",
    title: "17 Cicatricial Entropion",
    category: "Eyelid-Eyebrow" as const,
    pageCount: 12,
    flashcardCount: 0,
    mcqCount: 0,
    status: "not_started" as const,
    progress: 0,
  },
  {
    id: "sec-18",
    title: "18 Congenital Entropion",
    category: "Eyelid-Eyebrow" as const,
    pageCount: 9,
    flashcardCount: 0,
    mcqCount: 0,
    status: "not_started" as const,
    progress: 0,
  },
  {
    id: "orbit-1",
    title: "Orbital Hemorrhage",
    category: "Orbit" as const,
    pageCount: 14,
    flashcardCount: 0,
    mcqCount: 0,
    status: "not_started" as const,
    progress: 0,
  },
];

describe("StudyPackGeneratorModal", () => {
  test("collects selected sections and generator options before submit", () => {
    const onGenerate = vi.fn();

    render(
      <StudyPackGeneratorModal
        open
        documents={documents}
        onClose={vi.fn()}
        onGenerate={onGenerate}
        generating={false}
      />
    );

    const generateButton = screen.getByRole("button", {
      name: /generate study pack/i,
    });

    expect(generateButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/17 cicatricial entropion/i));
    fireEvent.click(screen.getByLabelText(/18 congenital entropion/i));
    fireEvent.click(screen.getByLabelText(/both mcqs and flashcards/i));
    fireEvent.click(screen.getByLabelText(/pdf export/i));

    expect(generateButton).toBeEnabled();

    fireEvent.click(generateButton);

    expect(onGenerate).toHaveBeenCalledWith({
      selectedDocumentIds: ["sec-17", "sec-18"],
      contentMode: "both",
      outputFormat: "pdf",
      mcqCount: 50,
      flashcardCount: 30,
      instructions: buildStudyPackInstructions({
        contentMode: "both",
        mcqCount: 50,
        flashcardCount: 30,
      }),
    });
  });

  test("can bulk select a category", () => {
    render(
      <StudyPackGeneratorModal
        open
        documents={documents}
        onClose={vi.fn()}
        onGenerate={vi.fn()}
        generating={false}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /select eyelid-eyebrow/i })
    );

    expect(screen.getByLabelText(/17 cicatricial entropion/i)).toBeChecked();
    expect(screen.getByLabelText(/18 congenital entropion/i)).toBeChecked();
    expect(screen.getByLabelText(/orbital hemorrhage/i)).not.toBeChecked();
  });

  test("updates the auto prompt when content mode and counts change", () => {
    render(
      <StudyPackGeneratorModal
        open
        documents={documents}
        onClose={vi.fn()}
        onGenerate={vi.fn()}
        generating={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /instructions/i }));

    const textarea = screen.getByRole("textbox");
    expect((textarea as HTMLTextAreaElement).value).toContain(
      "exactly 50 board-style multiple-choice questions"
    );

    fireEvent.click(screen.getByLabelText(/flashcards only/i));

    const flashcardInput = screen.getByLabelText(/flashcards per section/i);
    fireEvent.change(flashcardInput, { target: { value: "18" } });
    fireEvent.blur(flashcardInput);

    expect((textarea as HTMLTextAreaElement).value).toContain(
      "exactly 18 high-yield flashcards"
    );
    expect((textarea as HTMLTextAreaElement).value).not.toContain(
      "multiple-choice questions"
    );
  });
});
