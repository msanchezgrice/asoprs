import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AnnoyanceInbox } from "./annoyance-inbox";

vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    user: { id: "test-user", email: "test@test.com", fullName: "Test" },
    loading: false,
  }),
}));

describe("AnnoyanceInbox", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  });

  it("renders the collapsed trigger", () => {
    const { container } = render(<AnnoyanceInbox screen="flashcards" />);
    expect(container.textContent).toContain("Something off?");
  });

  it("expands and shows tags when clicked", () => {
    const { container } = render(<AnnoyanceInbox screen="flashcards" />);
    fireEvent.click(container.querySelector("button")!);
    expect(container.textContent).toContain("Too easy");
    expect(container.textContent).toContain("Wrong answer");
  });

  it("submits feedback and shows confirmation", async () => {
    const { container } = render(<AnnoyanceInbox screen="quiz" context={{ questionId: "q1" }} />);
    // Expand
    fireEvent.click(container.querySelector("button")!);
    // Select tag
    const allButtons = container.querySelectorAll("button");
    const wrongAnswerBtn = Array.from(allButtons).find((b) => b.textContent === "Wrong answer");
    expect(wrongAnswerBtn).toBeDefined();
    fireEvent.click(wrongAnswerBtn!);
    // Submit (last button in the expanded view)
    const submitBtn = container.querySelectorAll("button");
    fireEvent.click(submitBtn[submitBtn.length - 1]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/feedback",
        expect.objectContaining({ method: "POST" }),
      );
    });

    await waitFor(() => {
      expect(container.textContent).toContain("Thanks");
    });
  });
});
