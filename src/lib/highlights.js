/**
 * Client-side utilities for highlight API calls.
 */

/**
 * Fetch all highlights for a document.
 * @param {string} docId
 * @returns {Promise<object[]>}
 */
export async function fetchHighlights(docId) {
  const res = await fetch(`/api/highlights?docId=${encodeURIComponent(docId)}`);
  if (!res.ok) {
    throw new Error("Failed to fetch highlights");
  }
  return res.json();
}

/**
 * Delete a highlight by ID via the /api/highlights/:id route.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteHighlightById(id) {
  const res = await fetch(`/api/highlights/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to delete highlight");
  }
}
