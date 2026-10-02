import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const authState: { user: { id: string; email: string; fullName: null } | null; loading: boolean } = {
  user: null,
  loading: false,
};

vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => authState,
}));

import { PrivateQuestionSetsSection } from "./library-section";

describe("PrivateQuestionSetsSection", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    authState.user = null;
  });

  it("renders nothing and makes no request when signed out", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<PrivateQuestionSetsSection />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders nothing for a signed-in user without granted sets", async () => {
    authState.user = { id: "u1", email: "someone@example.com", fullName: null };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<PrivateQuestionSetsSection />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/question-sets", { cache: "no-store" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the Added Questions section with Cards and Quiz links when granted", async () => {
    authState.user = { id: "u2", email: "granted@example.com", fullName: null };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            slug: "added-questions",
            title: "Added Questions",
            description: "200 questions",
            questionCount: 200,
            multipleChoiceCount: 164,
            recallCount: 36,
            reviewedCount: 50,
            missedCount: 5,
          },
        ],
      }),
    );

    render(<PrivateQuestionSetsSection />);

    expect(await screen.findByRole("heading", { name: "Added Questions" })).toBeInTheDocument();
    expect(screen.getByText("200 questions", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText(/25% reviewed · 5 to revisit/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cards" })).toHaveAttribute("href", "/question-sets/added-questions?mode=cards");
    expect(screen.getByRole("link", { name: "Quiz" })).toHaveAttribute("href", "/question-sets/added-questions?mode=quiz");
  });
});
