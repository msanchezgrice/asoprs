import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import QuizPage from "./page";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    user: { id: "user-1" },
  }),
}));

vi.mock("@/components/user-feature-slot", () => ({
  UserFeatureSlot: () => null,
}));

function makeMcq(index: number) {
  return {
    id: `q-${index}`,
    question: `Question ${index}?`,
    option_a: "Option A",
    option_b: "Option B",
    option_c: "Option C",
    correct_index: 0,
    explanation: `Explanation ${index}`,
    difficulty: "medium",
  };
}

function makeFulfilledParams(docId: string) {
  const params = Promise.resolve({ docId }) as Promise<{ docId: string }> & {
    status?: "fulfilled";
    value?: { docId: string };
  };
  params.status = "fulfilled";
  params.value = { docId };
  return params;
}

describe("QuizPage packet size", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url === "/api/documents/doc-1") {
          return {
            json: async () => ({ title: "Epiblepharon" }),
          } as Response;
        }

        if (url === "/api/mcqs?docId=doc-1") {
          return {
            json: async () => Array.from({ length: 100 }, (_, index) => makeMcq(index + 1)),
          } as Response;
        }

        throw new Error(`Unhandled fetch: ${url}`);
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("lets the user choose a 50-question packet before starting practice", async () => {
    render(<QuizPage params={makeFulfilledParams("doc-1")} />);

    await screen.findByRole("heading", { name: /board-style quiz/i });
    expect(screen.getByText(/100 questions .* 3 options each/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/50 questions/i));
    fireEvent.click(screen.getByRole("button", { name: /practice mode/i }));

    await waitFor(() => {
      expect(screen.getByText(/question 1 of 50/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/question 1 of 100/i)).not.toBeInTheDocument();
  });
});
