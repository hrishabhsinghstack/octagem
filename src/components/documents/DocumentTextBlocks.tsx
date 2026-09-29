import { blocksInSlot, type RenderedBlock } from "@/lib/document/renderDocument";
import type { TextBlockSlot } from "@/types/documentTemplate";

/**
 * The template's text blocks for one slot. A signature block renders a ruled line and its heading as a
 * caption rather than a paragraph — its whole purpose is the space above the rule, so it prints even with
 * an empty body.
 */
export function DocumentTextBlocks({ blocks, slot }: { blocks: RenderedBlock[]; slot: TextBlockSlot }) {
  const inSlot = blocksInSlot(blocks, slot);
  if (inSlot.length === 0) return null;

  return (
    <div className="mt-6 space-y-4 break-inside-avoid">
      {inSlot.map((block) =>
        block.kind === "signature" ? (
          <div key={block.id} className="pt-8 w-64">
            <div className="border-t border-black/40" />
            <p className="text-[10px] uppercase tracking-wide text-black/60 mt-1">{block.heading}</p>
          </div>
        ) : (
          <div key={block.id} className="text-xs">
            {block.heading && <p className="text-[10px] uppercase tracking-wide text-black/60 mb-1">{block.heading}</p>}
            {/* whitespace-pre-line so a multi-line terms block keeps the breaks the tenant typed. */}
            <p className="whitespace-pre-line">{block.body}</p>
          </div>
        )
      )}
    </div>
  );
}
