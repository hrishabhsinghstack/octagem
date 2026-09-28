import { CategoriesPanel } from "@/components/settings/catalog/CategoriesPanel";
import { FieldsPanel } from "@/components/settings/catalog/FieldsPanel";
import { MarketsPanel } from "@/components/settings/catalog/MarketsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

/**
 * One place to shape inventory to the business: what it stocks (categories), what it records about
 * each piece (fields), and which markets it trades in. Everything here drives the receive form,
 * the item detail view and the import template together.
 */
export function InventoryCatalogSettings() {
  // Bumped when categories or packs change, so the Fields tab re-reads what it lists.
  const [version, setVersion] = useState(0);
  const changed = () => setVersion((v) => v + 1);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Inventory Catalog</h2>
        <p className="text-muted-foreground mt-1">What you stock and what you record about it — shapes the receive form, item pages and import templates.</p>
      </div>
      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="fields">Fields</TabsTrigger>
          <TabsTrigger value="markets">Markets</TabsTrigger>
        </TabsList>
        <TabsContent value="categories" className="mt-4">
          <CategoriesPanel onChanged={changed} />
        </TabsContent>
        <TabsContent value="fields" className="mt-4">
          <FieldsPanel version={version} />
        </TabsContent>
        <TabsContent value="markets" className="mt-4">
          <MarketsPanel onChanged={changed} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
