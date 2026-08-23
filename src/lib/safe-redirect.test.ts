import { describe, expect, it } from "vitest";
import { sanitizeNextPath } from "./safe-redirect";

describe("sanitizeNextPath", () => {
  it.each([
    [null, "/"],
    ["", "/"],
    ["javascript:alert(1)", "/"],
    ["https://evil.example/steal", "/"],
    ["//evil.example/steal", "/"],
    ["/\\evil.example", "/"],
    ["/ok\nSet-Cookie: bad=1", "/"],
  ])("rejects unsafe path %s", (value, expected) => {
    expect(sanitizeNextPath(value)).toBe(expected);
  });

  it.each([
    ["/", "/"],
    ["/progress", "/progress"],
    ["/documents/123?tab=notes#page-2", "/documents/123?tab=notes#page-2"],
  ])("keeps safe same-origin path %s", (value, expected) => {
    expect(sanitizeNextPath(value)).toBe(expected);
  });
});
