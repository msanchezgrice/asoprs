import { describe, expect, it, vi } from "vitest";
import {
  buildExaminerReadAloudEvent,
  buildOralExamRealtimeSessionPayload,
  createOralExamRealtimeClientSecret,
} from "./realtime-session";

describe("oral exam realtime session", () => {
  it("creates a short-lived OpenAI Realtime client secret without hidden case data", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        value: "ek_test",
        expires_at: 123,
      }),
    });

    const result = await createOralExamRealtimeClientSecret({
      apiKey: "sk-test",
      fetchImpl,
    });

    expect(result).toEqual({ value: "ek_test", expires_at: 123 });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/client_secrets",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
          "Content-Type": "application/json",
        }),
      })
    );

    const [, requestInit] = fetchImpl.mock.calls[0];
    const payload = JSON.parse(String(requestInit.body));
    const serializedPayload = JSON.stringify(payload).toLowerCase();

    expect(payload.expires_after.seconds).toBeLessThanOrEqual(600);
    expect(payload.session.type).toBe("realtime");
    expect(payload.session.audio.input.transcription.model).toBeTruthy();
    expect(payload.session.audio.input.turn_detection.create_response).toBe(false);
    expect(serializedPayload).not.toContain("rhabdomyosarcoma");
    expect(serializedPayload).not.toContain("sebaceous");
    expect(serializedPayload).not.toContain("case source");
  });

  it("throws a useful error when OpenAI rejects the client secret request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "bad key",
    });

    await expect(
      createOralExamRealtimeClientSecret({
        apiKey: "sk-bad",
        fetchImpl,
      })
    ).rejects.toThrow("OpenAI Realtime client secret request failed: 401 bad key");
  });

  it("builds a read-aloud response event without adding hidden case instructions", () => {
    const event = buildExaminerReadAloudEvent(
      "History: The patient has painless proptosis."
    );

    expect(event.type).toBe("response.create");
    expect(event.response.conversation).toBe("none");
    expect(event.response.output_modalities).toEqual(["audio"]);
    expect(JSON.stringify(event)).toContain(
      "History: The patient has painless proptosis."
    );
    expect(JSON.stringify(event).toLowerCase()).not.toContain("final diagnosis");
  });

  it("allows model and voice overrides while preserving safe defaults", () => {
    const payload = buildOralExamRealtimeSessionPayload({
      model: "gpt-realtime-mini",
      voice: "cedar",
    });

    expect(payload.session.model).toBe("gpt-realtime-mini");
    expect(payload.session.audio.output.voice).toBe("cedar");
    expect(payload.session.tool_choice).toBe("none");
  });
});
