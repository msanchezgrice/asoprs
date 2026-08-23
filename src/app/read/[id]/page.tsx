"use client";

import { use } from "react";
import { ReaderPageContent } from "./reader-page-content";

export default function ReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ReaderPageContent id={id} />;
}
