export function sanitizeNextPath(value: string | null | undefined): string {
  if (!value) return "/";

  const candidate = value.trim();
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return "/";
  }

  try {
    const parsed = new URL(candidate, "https://asoprs.invalid");
    if (parsed.origin !== "https://asoprs.invalid") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}
