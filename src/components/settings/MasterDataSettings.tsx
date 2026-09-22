import { LocationTreeEditor } from "@/components/settings/masterdata/LocationTreeEditor";
import { MasterListEditor } from "@/components/settings/masterdata/MasterListEditor";
import { cn } from "@/lib/utils";
import { getList } from "@/lib/store/masterDataStore";
import { MASTER_LIST_SECTIONS, MASTER_LISTS } from "@/types/masterData";
import { MapPin } from "lucide-react";
import { useState } from "react";

type Selection = "locations" | (typeof MASTER_LISTS)[number]["key"];

export function MasterDataSettings() {
  const [selected, setSelected] = useState<Selection>("locations");

  const definition = MASTER_LISTS.find((d) => d.key === selected);
  const scopeOptions = definition?.scopedBy ? getList(definition.scopedBy) : undefined;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Master Data</h2>
        <p className="text-muted-foreground mt-1">Admin-managed reference lists used across intake and memo forms — keeps entries consistent instead of free text.</p>
      </div>

      <div className="flex gap-6">
        <nav className="w-56 shrink-0 space-y-3">
          <div>
            <button
              onClick={() => setSelected("locations")}
              className={cn("w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-left", selected === "locations" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50")}
            >
              <MapPin className="h-3.5 w-3.5" /> Locations
            </button>
          </div>
          {MASTER_LIST_SECTIONS.map((section) => (
            <div key={section.key}>
              <p className="px-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-0.5">{section.title}</p>
              {MASTER_LISTS.filter((list) => list.section === section.key).map((list) => (
                <button
                  key={list.key}
                  onClick={() => setSelected(list.key)}
                  className={cn("w-full rounded-md px-2.5 py-1.5 text-sm text-left", selected === list.key ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50")}
                >
                  {list.title}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="flex-1 min-w-0">{selected === "locations" ? <LocationTreeEditor /> : definition && <MasterListEditor definition={definition} scopeOptions={scopeOptions} />}</div>
      </div>
    </div>
  );
}
