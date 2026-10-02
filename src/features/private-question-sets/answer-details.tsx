import { Lightbulb } from "lucide-react";

/** Renders plain text, turning "* item" lines into a bullet list. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  const blocks: ({ type: "p"; text: string } | { type: "ul"; items: string[] })[] = [];

  for (const line of lines) {
    const bullet = line.match(/^\s*[*•-]\s+(.*)$/);
    if (bullet) {
      const last = blocks[blocks.length - 1];
      if (last?.type === "ul") last.items.push(bullet[1]);
      else blocks.push({ type: "ul", items: [bullet[1]] });
    } else if (line.trim()) {
      blocks.push({ type: "p", text: line });
    }
  }

  return (
    <div className={className}>
      {blocks.map((block, index) =>
        block.type === "p" ? (
          <p key={index} className={index > 0 ? "mt-1.5" : undefined}>
            {block.text}
          </p>
        ) : (
          <ul key={index} className="mt-1.5 list-disc space-y-0.5 pl-5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

export function ExplanationAndPearl({
  explanation,
  pearl,
}: {
  explanation: string | null;
  pearl: string | null;
}) {
  if (!explanation && !pearl) return null;

  return (
    <div className="space-y-3">
      {explanation && (
        <RichText text={explanation} className="text-sm leading-relaxed text-navy" />
      )}
      {pearl && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
            <Lightbulb size={12} /> Board pearl
          </p>
          <RichText text={pearl} className="mt-1 text-sm leading-relaxed text-amber-900" />
        </div>
      )}
    </div>
  );
}
