import { describe, expect, it, vi } from "vitest";
import { NAV_ITEMS } from "./bottom-nav";

vi.mock("@/components/auth/account-panel", () => ({
  AccountPanel: () => null,
}));

describe("main navigation", () => {
  it("links to the image library from the left sidebar", () => {
    expect(NAV_ITEMS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/image-library", label: "Image Library" }),
      ]),
    );
  });
});
