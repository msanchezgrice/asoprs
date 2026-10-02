// Minimal chainable stand-in for the Supabase query builder used in route tests.
// Each table returns rows that are filtered by the .eq()/.in() calls made on it,
// mimicking what RLS + PostgREST would hand back to the caller.

type Row = Record<string, unknown>;

export interface FakeSupabaseOptions {
  user: { id: string; email?: string } | null;
  tables: Record<string, Row[]>;
  errors?: Record<string, { message: string }>;
}

export function createFakeSupabase(options: FakeSupabaseOptions) {
  const upserts: { table: string; values: Row; onConflict?: string }[] = [];

  function from(table: string) {
    let rows = [...(options.tables[table] ?? [])];
    const error = options.errors?.[table] ?? null;

    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        rows = rows.filter((row) => row[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        rows = rows.filter((row) => values.includes(row[column]));
        return builder;
      },
      order(column: string) {
        rows = [...rows].sort((a, b) => Number(a[column] ?? 0) - Number(b[column] ?? 0));
        return builder;
      },
      range(from: number, to: number) {
        rows = rows.slice(from, to + 1);
        return builder;
      },
      maybeSingle() {
        return Promise.resolve({ data: error ? null : (rows[0] ?? null), error });
      },
      upsert(values: Row, opts?: { onConflict?: string }) {
        upserts.push({ table, values, onConflict: opts?.onConflict });
        return Promise.resolve({ data: null, error });
      },
      then<T>(resolve: (value: { data: Row[] | null; error: unknown }) => T) {
        return Promise.resolve({ data: error ? null : rows, error }).then(resolve);
      },
    };

    return builder;
  }

  return {
    client: {
      auth: {
        getUser: () => Promise.resolve({ data: { user: options.user }, error: null }),
      },
      from,
    },
    upserts,
  };
}
