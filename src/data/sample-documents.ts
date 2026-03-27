export interface Document {
  id: string;
  title: string;
  category: Category;
  pageCount: number;
  flashcardCount: number;
  mcqCount: number;
  status: "not_started" | "in_progress" | "reviewed";
  progress: number;
  storagePath?: string | null;
}

export type Category =
  | "Orbit"
  | "Eyelid-Eyebrow"
  | "Skin Conditions"
  | "Face"
  | "Lacrimal"
  | "Other";

export const CATEGORY_META: Record<
  Category,
  { color: string; bg: string; icon: string }
> = {
  Orbit: { color: "text-blue-700", bg: "bg-blue-50", icon: "🔵" },
  "Eyelid-Eyebrow": {
    color: "text-violet-700",
    bg: "bg-violet-50",
    icon: "👁",
  },
  "Skin Conditions": {
    color: "text-amber-700",
    bg: "bg-amber-50",
    icon: "🔶",
  },
  Face: { color: "text-rose-700", bg: "bg-rose-50", icon: "🫥" },
  Lacrimal: {
    color: "text-cyan-700",
    bg: "bg-cyan-50",
    icon: "💧",
  },
  Other: {
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    icon: "📄",
  },
};
