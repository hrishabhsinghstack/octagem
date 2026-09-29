import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { TextBlock, TextBlockKind, TextBlockSlot } from "@/types/documentTemplate";
import { TEXT_BLOCK_KINDS, TEXT_BLOCK_SLOTS } from "@/types/documentTemplate";
import { Plus, Trash2 } from "lucide-react";

export function TextBlocksPanel({ blocks, onChange }: { blocks: TextBlock[]; onChange: (blocks: TextBlock[]) => void }) {
  const patch = (id: string, changes: Partial<TextBlock>) => onChange(blocks.map((block) => (block.id === id ? { ...block, ...changes } : block)));

  const add = (kind: TextBlockKind) => {
    const preset = TEXT_BLOCK_KINDS.find((candidate) => candidate.key === kind)!;
    onChange([
      ...blocks,
      {
        id: `b-${crypto.randomUUID().slice(0, 8)}`,
        kind,
        slot: "belowTotals",
        heading: preset.defaultHeading,
        // Only notes defaults to the document's own text; the rest are boilerplate typed once here.
        source: kind === "notes" ? "document" : "template",
        body: "",
        show: true,
        sortOrder: blocks.length + 1,
      },
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Text blocks</p>
          <p className="text-xs text-muted-foreground">Terms, warranty, payment instructions and signature lines.</p>
        </div>
        <Select onValueChange={(value) => add(value as TextBlockKind)}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <span className="flex items-center gap-1">
              <Plus className="h-3 w-3" /> Add block
            </span>
          </SelectTrigger>
          <SelectContent>
            {TEXT_BLOCK_KINDS.map((kind) => (
              <SelectItem key={kind.key} value={kind.key}>
                {kind.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {blocks.map((block) => (
          <div key={block.id} className={cn("rounded-md border p-3 space-y-2", !block.show && "opacity-55")}>
            <div className="flex items-center gap-2">
              <Input value={block.heading} onChange={(e) => patch(block.id, { heading: e.target.value })} placeholder="Heading (optional)" className="h-8 text-sm flex-1" />
              <Select value={block.slot} onValueChange={(value) => patch(block.id, { slot: value as TextBlockSlot })}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEXT_BLOCK_SLOTS.map((slot) => (
                    <SelectItem key={slot.key} value={slot.key}>
                      {slot.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Switch checked={block.show} onCheckedChange={(checked) => patch(block.id, { show: checked })} aria-label="Show block" />
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange(blocks.filter((b) => b.id !== block.id))} aria-label="Remove block">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {block.kind === "signature" ? (
              <p className="text-xs text-muted-foreground">Prints a ruled line with the heading beneath it. No body text.</p>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <Label className="text-xs text-muted-foreground">Text comes from</Label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="radio" checked={block.source === "template"} onChange={() => patch(block.id, { source: "template" })} />
                    this template
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="radio" checked={block.source === "document"} onChange={() => patch(block.id, { source: "document" })} />
                    each document’s own notes
                  </label>
                </div>
                {block.source === "template" ? (
                  <Textarea
                    value={block.body}
                    onChange={(e) => patch(block.id, { body: e.target.value })}
                    rows={3}
                    placeholder="Boilerplate printed on every document using this template"
                    className="text-sm resize-none"
                  />
                ) : (
                  <p className="text-xs text-muted-foreground rounded border border-dashed p-2">
                    Prints whatever is typed in the invoice’s own Notes field, positioned and titled here. A document with no notes prints nothing.
                  </p>
                )}
              </>
            )}
          </div>
        ))}
        {blocks.length === 0 && <p className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">No text blocks.</p>}
      </div>
    </div>
  );
}
