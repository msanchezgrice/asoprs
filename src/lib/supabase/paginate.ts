import "server-only";

type PageError = { code?: string; message?: string };
type PageResult<T> = { data: T[] | null; error: PageError | null };

const PAGE_SIZE = 1_000;
const MAX_DASHBOARD_ROWS = 20_000;

export async function collectSupabasePages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  maxRows = MAX_DASHBOARD_ROWS,
): Promise<PageResult<T>> {
  const rows: T[] = [];

  while (rows.length < maxRows) {
    const { data, error } = await fetchPage(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) return { data: null, error };

    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { data: rows, error: null };
  }

  return {
    data: null,
    error: {
      code: "ROW_LIMIT_EXCEEDED",
      message: "Dashboard history exceeded its safe retrieval limit",
    },
  };
}
