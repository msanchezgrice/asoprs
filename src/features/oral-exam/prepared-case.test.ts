import { describe, expect, it } from "vitest";
import { ORAL_EXAM_CASES, getInitialOralExamState } from "./oral-exam";
import { buildPreparedOralExamCase } from "./prepared-case";

describe("prepared oral exam cases", () => {
  it("prepares every case with image analysis, scripts, acceptable answers, and gates", () => {
    for (const oralCase of ORAL_EXAM_CASES) {
      const prepared = buildPreparedOralExamCase(
        oralCase.id,
        getInitialOralExamState(oralCase.id)
      );

      expect(prepared.caseId).toBe(oralCase.id);
      expect(prepared.visibleImageFindings.length).toBeGreaterThan(0);
      expect(prepared.examinerScripts.opening).toContain("Describe");
      expect(prepared.examinerScripts.visualFollowUp).toBeTruthy();
      expect(prepared.examinerScripts.historyReveal).toContain("History");
      expect(prepared.examinerScripts.workupReveal).toContain("Workup");
      expect(prepared.examinerScripts.finalDebrief).toContain("Final diagnosis");
      expect(prepared.acceptableAnswers.leadingDiagnoses.length).toBeGreaterThan(0);
      expect(prepared.acceptableAnswers.differential.length).toBeGreaterThan(0);
      expect(prepared.stageGates.visual.required.length).toBeGreaterThan(0);
      expect(prepared.responseActions.length).toBeGreaterThan(0);
      expect(JSON.stringify(prepared.responseActions)).toContain(
        "coach_without_disclosing"
      );
      expect(JSON.stringify(prepared)).not.toContain("No examiner script");
    }
  });

  it("keeps learner-facing prep neutral before completion", () => {
    const oralCase = ORAL_EXAM_CASES.find(
      (candidate) => candidate.id === "sebaceous-carcinoma"
    )!;
    const prepared = buildPreparedOralExamCase(
      oralCase.id,
      getInitialOralExamState(oralCase.id)
    );
    const learnerFacing = JSON.stringify({
      visibleImageFindings: prepared.visibleImageFindings,
      opening: prepared.examinerScripts.opening,
      visualFollowUp: prepared.examinerScripts.visualFollowUp,
    }).toLowerCase();

    expect(learnerFacing).not.toContain("sebaceous");
    expect(learnerFacing).not.toContain("adenocarcinoma");
    expect(learnerFacing).not.toContain(oralCase.sourceKind);
  });

  it("allows final prep to disclose the source and final diagnosis", () => {
    const initial = getInitialOralExamState("sebaceous-carcinoma");
    const prepared = buildPreparedOralExamCase("sebaceous-carcinoma", {
      ...initial,
      stage: "complete",
    });

    expect(prepared.examinerScripts.finalDebrief).toContain("Final diagnosis");
    expect(prepared.examinerScripts.finalDebrief).toContain("Case source");
    expect(prepared.sourceUse.sourceDisclosure).toContain(
      "source_image_simulated_case"
    );
  });
});
