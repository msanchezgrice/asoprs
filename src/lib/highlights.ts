const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidHighlightId(id: string): boolean {
  return UUID_RE.test(id);
}

export async function deleteHighlightById(id: string): Promise<void> {
  if (!isValidHighlightId(id)) {
    throw new Error("Invalid highlight ID format");
  }

  const response = await fetch(
    `/api/highlights?id=${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete highlight: ${response.status}`);
  }
}
