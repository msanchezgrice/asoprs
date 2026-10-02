import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PrivateQuestionSetDetail } from "./question-set";

vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({ user: { id: "u1", email: "granted@example.com", fullName: null }, loading: false }),
}));

import { QuestionSetPage } from "./question-set-page";

const DETAIL: PrivateQuestionSetDetail = {
  slug: "added-questions",
  title: "Added Questions",
  description: "Test set",
  memorizeFirst: ["Hering’s law → contralateral lid changes"],
  questions: [
    {
      id: "q1",
      position: 1,
      section: "Ptosis",
      question: "Which law explains contralateral retraction?",
      options: ["Bell phenomenon", "Hering’s law", "Sherrington’s law"],
      correctIndex: 1,
      answer: "Hering’s law",
      explanation: "Equal innervation.",
      pearl: "Lift the ptotic lid.",
    },
    {
      id: "q2",
      position: 2,
      section: "Classic Associations",
      question: "“Ptosis + miosis” →",
      options: [],
      correctIndex: null,
      answer: "Horner syndrome.",
      explanation: null,
      pearl: null,
    },
  ],
  progress: {},
};

function mockApi(status = 200) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    return { ok: status === 200, status, json: async () => DETAIL };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function postedBodies(fetchMock: ReturnType<typeof mockApi>) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([url, init]) => ({ url, body: JSON.parse(String(init?.body)) }));
}

describe("QuestionSetPage", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows a not-available message when the set isn't shared with the user", async () => {
    mockApi(404);
    render(<QuestionSetPage slug="added-questions" initialMode={null} />);
    expect(await screen.findByText("Not available")).toBeInTheDocument();
  });

  it("renders the overview with filters and memorize-first facts", async () => {
    mockApi();
    render(<QuestionSetPage slug="added-questions" initialMode={null} />);
    expect(await screen.findByRole("heading", { name: "Added Questions" })).toBeInTheDocument();
    expect(screen.getByText("2 questions selected")).toBeInTheDocument();
    expect(screen.getByText("1 facts to memorize first")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rapid recall" }));
    expect(screen.getByText("1 question selected")).toBeInTheDocument();
  });

  it("runs a quiz: grades MCQs, self-grades rapid recall, and saves progress", async () => {
    const fetchMock = mockApi();
    render(<QuestionSetPage slug="added-questions" initialMode="quiz" />);

    expect(await screen.findByText("Which law explains contralateral retraction?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Bell phenomenon/ }));
    expect(screen.getByText("Not quite")).toBeInTheDocument();
    expect(screen.getByText("Lift the ptotic lid.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    fireEvent.click(screen.getByRole("button", { name: /reveal/i }));
    expect(screen.getByText("Horner syndrome.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /I knew it/ }));
    fireEvent.click(screen.getByRole("button", { name: /Finish/ }));

    expect(await screen.findByText("1 of 2 correct")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry the 1 you missed" })).toBeInTheDocument();

    await waitFor(() =>
      expect(postedBodies(fetchMock)).toEqual([
        { url: "/api/question-sets/added-questions/progress", body: { questionId: "q1", quizResult: "incorrect" } },
        { url: "/api/question-sets/added-questions/progress", body: { questionId: "q2", quizResult: "correct" } },
      ]),
    );
  });

  it("runs cards: reveals the answer and records got it / missed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = mockApi();
    render(<QuestionSetPage slug="added-questions" initialMode="cards" />);

    expect(await screen.findByText("Which law explains contralateral retraction?")).toBeInTheDocument();
    expect(screen.getAllByText(/Hering’s law/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    await vi.advanceTimersByTimeAsync(250);
    expect(await screen.findByText("“Ptosis + miosis” →")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Missed it" }));
    await vi.advanceTimersByTimeAsync(250);

    expect(await screen.findByText("Session Complete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review the 1 you missed" })).toBeInTheDocument();
    expect(postedBodies(fetchMock).map((p) => p.body)).toEqual([
      { questionId: "q1", cardResult: "got_it" },
      { questionId: "q2", cardResult: "missed" },
    ]);
    vi.useRealTimers();
  });
});
