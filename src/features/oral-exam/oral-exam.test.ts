import { describe, expect, it } from "vitest";
import {
  ORAL_EXAM_CASES,
  buildOpeningExaminerMessage,
  getOralExamFigureLabel,
  getOralExamCaseLabel,
  getInitialOralExamState,
  handleOralExamTurn,
} from "./oral-exam";

describe("oral exam cases", () => {
  it("requires every case to start from an ASOPRS figure and declare source kind", () => {
    expect(ORAL_EXAM_CASES.length).toBeGreaterThanOrEqual(8);

    for (const oralCase of ORAL_EXAM_CASES) {
      expect(oralCase.startingFigureId).toMatch(/figure-/);
      expect(oralCase.sourceKind).toMatch(
        /^(real_source|source_image_simulated_case)$/
      );
      expect(oralCase.sourceDisclosure).toContain(oralCase.sourceKind);
    }
  });

  it("does not reveal the diagnosis or case source in the opening examiner prompt", () => {
    const oralCase = ORAL_EXAM_CASES.find(
      (candidate) => candidate.id === "orbital-rhabdomyosarcoma"
    );

    expect(oralCase).toBeDefined();
    const message = buildOpeningExaminerMessage();

    expect(message.toLowerCase()).not.toContain("rhabdomyosarcoma");
    expect(message.toLowerCase()).not.toContain("real_source");
    expect(message).toContain("Describe the image");
  });

  it("uses neutral learner-facing case labels before the final reveal", () => {
    ORAL_EXAM_CASES.forEach((oralCase, index) => {
      const label = getOralExamCaseLabel(index);
      const labelText = label.toLowerCase();

      expect(label).toMatch(/^Case \d{2}$/);
      expect(labelText).not.toContain(oralCase.sourceTopic.toLowerCase());
      expect(labelText).not.toContain(oralCase.diagnosis.toLowerCase());
      expect(labelText).not.toContain(oralCase.category.toLowerCase());
      expect(labelText).not.toContain(oralCase.sourceKind.toLowerCase());
    });
  });

  it("uses neutral learner-facing image labels before the final reveal", () => {
    const labels = [getOralExamFigureLabel(0), getOralExamFigureLabel(1)];

    expect(labels).toEqual(["Starting image", "Revealed image 01"]);
    for (const label of labels) {
      const labelText = label.toLowerCase();
      for (const oralCase of ORAL_EXAM_CASES) {
        expect(labelText).not.toContain(oralCase.sourceTopic.toLowerCase());
        expect(labelText).not.toContain(oralCase.diagnosis.toLowerCase());
      }
    }
  });
});

describe("oral exam engine", () => {
  it("serially reveals history, workup, management, and source disclosure", () => {
    let state = getInitialOralExamState("orbital-rhabdomyosarcoma");

    const historyTurn = handleOralExamTurn({
      oralCaseId: "orbital-rhabdomyosarcoma",
      state,
      userText: "I see proptosis. What is the history and exam?",
    });
    expect(historyTurn.state.stage).toBe("history");
    expect(historyTurn.examinerMessage).toContain("History");
    expect(historyTurn.examinerMessage.toLowerCase()).not.toContain(
      "rhabdomyosarcoma"
    );

    state = historyTurn.state;
    const workupTurn = handleOralExamTurn({
      oralCaseId: "orbital-rhabdomyosarcoma",
      state,
      userText: "I would get orbital imaging and biopsy. What does the workup show?",
    });
    expect(workupTurn.state.stage).toBe("workup");
    expect(workupTurn.revealedFigureIds).toContain(
      "orbit-orbital-rhabdomyosarcoma-figure-3"
    );
    expect(workupTurn.examinerMessage).toContain("Workup");

    state = workupTurn.state;
    const managementTurn = handleOralExamTurn({
      oralCaseId: "orbital-rhabdomyosarcoma",
      state,
      userText:
        "My diagnosis is orbital rhabdomyosarcoma. I would involve pediatric oncology, biopsy, chemotherapy, radiation, counseling and surveillance.",
    });
    expect(managementTurn.state.stage).toBe("complete");
    expect(managementTurn.examinerMessage).toContain("Final diagnosis");
    expect(managementTurn.examinerMessage).toContain("Case source");
    expect(managementTurn.score.total).toBeGreaterThan(0);
  });

  it("keeps simulated cases marked as source-image simulated in the final debrief", () => {
    const initialState = getInitialOralExamState("sebaceous-carcinoma");
    const result = handleOralExamTurn({
      oralCaseId: "sebaceous-carcinoma",
      state: { ...initialState, stage: "management" },
      userText:
        "This is sebaceous carcinoma. I would biopsy, map the conjunctiva, treat with excision and cryotherapy, and monitor nodes.",
    });

    expect(result.state.stage).toBe("complete");
    expect(result.examinerMessage).toContain("source_image_simulated_case");
  });
});
