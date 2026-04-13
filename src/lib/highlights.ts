/**
 * Removes a highlight by ID via the REST API.
 * Throws an error if the request fails.
 */
export async function removeHighlight(id: string): Promise<void> {
  const res = await fetch(`/api/highlights/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error || "Failed to remove highlight"
    );
  }
}
