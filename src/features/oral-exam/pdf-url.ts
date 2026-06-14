export function resolveOralExamPdfUrl(
  storagePath: string,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
) {
  const encodedPath = storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const shouldUseSupabase =
    supabaseUrl && !/^https?:\/\/localhost(?::\d+)?\/?$/.test(supabaseUrl);

  if (shouldUseSupabase) {
    return `${supabaseUrl}/storage/v1/object/public/pdfs/${encodedPath}`;
  }

  return `/api/local-pdfs/${encodedPath}`;
}
