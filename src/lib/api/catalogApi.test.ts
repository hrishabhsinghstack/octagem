import { beforeEach, describe, expect, it } from "vitest";
import { CatalogError, createCategory, createTenantField, deleteCategory, getCatalog, listFieldsForCategory, suggestStockNumber, updateCategory, updateMarketSettings } from "@/lib/api/catalogApi";
import { DuplicateValueError, duplicateItem, receiveItem, updateItemDetails, type ReceiveItemPayload } from "@/lib/api/inventoryApi";
import { DuplicateStockNumberError, getAll, getById } from "@/lib/store/inventoryStore";
import { installMemoryStorage } from "@/test/memoryStorage";

beforeEach(() => {
  installMemoryStorage();
});

const diamondPayload = (over: Partial<ReceiveItemPayload> = {}): ReceiveItemPayload => ({
  category: "Diamond",
  identityModel: "UNIQUE",
  code: "D-2000",
  title: "1.01ct Round",
  description: "",
  location: "New York › Receiving",
  cost: 4000,
  askingPrice: 5200,
  diamond: { shape: "Round", caratWeight: 1.01, color: "G", clarity: "VS1", lab: "GIA", certificateNumber: "GIA 1111111111", isLabGrown: false },
  ...over,
});

describe("stock number uniqueness (the duplicate-code bug)", () => {
  it("refuses a second item with an existing stock number, whatever the case or spacing", async () => {
    await expect(receiveItem(diamondPayload({ code: " d-1042 " }))).rejects.toBeInstanceOf(DuplicateStockNumberError);
    expect(getAll().filter((item) => item.code === "D-1042")).toHaveLength(1);
  });

  it("stores new stock numbers trimmed and upper-cased", async () => {
    const item = await receiveItem(diamondPayload({ code: " d-2000 " }));
    expect(item).toMatchObject({ id: "D-2000", code: "D-2000" });
  });

  it("refuses a duplicate onto a taken stock number", async () => {
    await expect(duplicateItem("D-1077", "D-1042")).rejects.toBeInstanceOf(DuplicateStockNumberError);
  });
});

describe("certificate uniqueness", () => {
  it("refuses receiving a stone whose certificate is already in live stock", async () => {
    const existingCert = getById("D-1042")!.diamond!.certificateNumber;
    await expect(receiveItem(diamondPayload({ diamond: { ...diamondPayload().diamond!, certificateNumber: existingCert.toLowerCase() } }))).rejects.toBeInstanceOf(DuplicateValueError);
  });

  it("allows many uncertified stones", async () => {
    const uncertified = { ...diamondPayload().diamond!, lab: "None", certificateNumber: "" };
    await receiveItem(diamondPayload({ code: "D-2001", diamond: uncertified }));
    await expect(receiveItem(diamondPayload({ code: "D-2002", diamond: uncertified }))).resolves.toBeDefined();
  });

  it("lets an edit keep its own certificate but not take another item's", async () => {
    const item = await receiveItem(diamondPayload());
    await expect(updateItemDetails(item.id, { title: "Renamed", description: "", location: item.location, cost: 1, askingPrice: 2, diamond: item.diamond })).resolves.toBeDefined();
    const otherCert = getById("D-1042")!.diamond!.certificateNumber;
    await expect(updateItemDetails(item.id, { title: "x", description: "", location: item.location, cost: 1, askingPrice: 2, diamond: { ...item.diamond!, certificateNumber: otherCert } })).rejects.toBeInstanceOf(DuplicateValueError);
  });

  it("blanks the certificate on a duplicate instead of copying it", async () => {
    const copy = await duplicateItem("D-1042", "D-1042-B");
    expect(copy?.diamond?.certificateNumber).toBe("");
    expect(copy?.diamond?.caratWeight).toBe(getById("D-1042")!.diamond!.caratWeight);
  });
});

describe("HUID uniqueness under the India pack", () => {
  const jewelry = (code: string): ReceiveItemPayload => ({
    category: "Jewelry",
    identityModel: "UNIQUE",
    code,
    title: "22K bangle",
    description: "",
    location: "Mumbai",
    cost: 1000,
    askingPrice: 1500,
    jewelry: { styleNumber: "BG-1", metalType: "Gold", metalKarat: "22K", grossWeightGrams: 20, components: [] },
  });

  it("ignores HUID while the pack is off", async () => {
    await receiveItem({ ...jewelry("J-9001"), attributes: { huid: "AB12CD" } });
    await expect(receiveItem({ ...jewelry("J-9002"), attributes: { huid: "ab12cd" } })).resolves.toBeDefined();
  });

  it("enforces HUID across receive and edit once the pack is on", async () => {
    await updateMarketSettings({ enabledPacks: ["IN"], dateOrder: "DMY", numberLocale: "en-IN" });
    await receiveItem({ ...jewelry("J-9001"), attributes: { huid: "AB12CD" } });
    await expect(receiveItem({ ...jewelry("J-9002"), attributes: { huid: "ab12cd" } })).rejects.toThrow('HUID "ab12cd" is already used by J-9001');
    const other = await receiveItem({ ...jewelry("J-9003"), attributes: { huid: "ZZ99ZZ" } });
    const edit = { title: "x", description: "", location: "Mumbai", cost: 1, askingPrice: 2, jewelry: other.jewelry };
    await expect(updateItemDetails(other.id, { ...edit, attributes: { huid: "AB12CD" } })).rejects.toBeInstanceOf(DuplicateValueError);
    await expect(updateItemDetails(other.id, { ...edit, attributes: { huid: "ZZ99ZZ" } })).resolves.toBeDefined();
  });
});

describe("suggestStockNumber", () => {
  it("continues each built-in category's series from the seed stock", async () => {
    expect(await suggestStockNumber("Diamond")).toBe("D-1151");
    expect(await suggestStockNumber("Watch")).toBe("W-3042");
  });

  it("starts a new category at its own start number", async () => {
    const silver = await createCategory({ label: "Silver articles", stockPrefix: "slv-", stockPadding: 4, weightUnit: "g", defaultIdentityModel: "QUANTITY" });
    expect(await suggestStockNumber(silver.key)).toBe("SLV-0001");
  });
});

describe("categories", () => {
  it("creates a tenant category with a stable key and normalised prefix", async () => {
    const category = await createCategory({ label: "Gold coins", stockPrefix: "gc-", weightUnit: "g", defaultIdentityModel: "QUANTITY" });
    expect(category).toMatchObject({ key: "GoldCoins", builtIn: false, stockPrefix: "GC-", allowedIdentityModels: ["QUANTITY"] });
    expect((await getCatalog()).categories.map((c) => c.key)).toContain("GoldCoins");
  });

  it("rejects a duplicate name or a prefix another category already numbers with", async () => {
    await expect(createCategory({ label: "diamond", stockPrefix: "X-", weightUnit: "ct", defaultIdentityModel: "UNIQUE" })).rejects.toThrow('A category named "Diamond" already exists.');
    await expect(createCategory({ label: "Pearls", stockPrefix: "d-", weightUnit: "g", defaultIdentityModel: "LOT" })).rejects.toThrow('Stock prefix "D-" is already used by Diamond.');
  });

  it("will not delete a built-in, or a category that still has stock", async () => {
    await expect(deleteCategory("Diamond")).rejects.toBeInstanceOf(CatalogError);
    const coins = await createCategory({ label: "Gold coins", stockPrefix: "GC-", weightUnit: "g", defaultIdentityModel: "QUANTITY" });
    await receiveItem({ ...diamondPayload({ code: "GC-1", diamond: undefined }), category: coins.key, identityModel: "QUANTITY" });
    await expect(deleteCategory(coins.key)).rejects.toThrow("1 item uses Gold coins — deactivate it instead.");
  });

  it("deletes an unused tenant category along with fields that only it used", async () => {
    const pearls = await createCategory({ label: "Pearls", stockPrefix: "P-", weightUnit: "g", defaultIdentityModel: "LOT" });
    await createTenantField({ label: "Lustre", type: "text", categories: [pearls.key] });
    await deleteCategory(pearls.key);
    const catalog = await getCatalog();
    expect(catalog.categories.some((c) => c.key === pearls.key)).toBe(false);
    expect(catalog.tenantFields).toEqual([]);
  });

  it("keeps built-in identity fixed on update", async () => {
    const updated = await updateCategory("Diamond", { label: "Loose diamonds", stockPrefix: "ld-" });
    expect(updated).toMatchObject({ key: "Diamond", builtIn: true, label: "Loose diamonds", stockPrefix: "LD-" });
  });
});

describe("tenant fields", () => {
  it("stores values in the attribute bag and appears only on its categories", async () => {
    const field = await createTenantField({ label: "Pearl lustre", type: "select", categories: ["Jewelry"], source: { kind: "options", values: ["Excellent", "Good"] } });
    expect(field).toMatchObject({ key: "t.pearlLustre", path: "attributes.pearlLustre", origin: "tenant" });
    expect((await listFieldsForCategory("Jewelry")).some((f) => f.key === field.key)).toBe(true);
    expect((await listFieldsForCategory("Diamond")).some((f) => f.key === field.key)).toBe(false);
  });

  it("refuses a field whose name a category already uses", async () => {
    await expect(createTenantField({ label: "carat", type: "number", categories: ["Diamond"] })).rejects.toThrow('Diamond already has a field called "Carat".');
  });

  it("requires a value list for dropdowns", async () => {
    await expect(createTenantField({ label: "Grade", type: "select", categories: "All" })).rejects.toThrow("A dropdown field needs a list of values.");
  });
});

describe("updateField", () => {
  it("stores built-in edits as overrides and applies them", async () => {
    const { updateField } = await import("@/lib/api/catalogApi");
    const updated = await updateField("diamond.culet", { active: false, tier: "essential", label: "Culet size" });
    expect(updated).toMatchObject({ active: false, tier: "essential", label: "Culet size", origin: "builtIn" });
    expect((await listFieldsForCategory("Diamond")).some((f) => f.key === "diamond.culet")).toBe(false);
  });

  it("refuses to switch off or relax a system field", async () => {
    const { updateField } = await import("@/lib/api/catalogApi");
    await expect(updateField("code", { active: false })).rejects.toThrow("cannot be switched off");
    await expect(updateField("title", { required: false })).rejects.toThrow("cannot be switched off");
  });

  it("refuses a rename that clashes within a category", async () => {
    const { updateField } = await import("@/lib/api/catalogApi");
    await expect(updateField("diamond.culet", { label: "carat" })).rejects.toThrow('Diamond already has a field called "Carat".');
  });

  it("updates legacy custom fields in their own store", async () => {
    const { updateField } = await import("@/lib/api/catalogApi");
    const { createCustomFieldDefinition } = await import("@/lib/api/customFieldApi");
    const custom = await createCustomFieldDefinition({ label: "Origin mine", type: "text", appliesTo: "Diamond", required: false });
    const updated = await updateField(`custom.${custom.id}`, { required: true, label: "Mine of origin" });
    expect(updated).toMatchObject({ required: true, label: "Mine of origin", origin: "customField", path: `customFields.${custom.id}` });
  });

  it("rewrites tenant fields, and deletes only those", async () => {
    const { updateField, deleteTenantField } = await import("@/lib/api/catalogApi");
    const field = await createTenantField({ label: "Lustre", type: "text", categories: ["Jewelry"] });
    expect(await updateField(field.key, { listMode: "open", required: true })).toMatchObject({ required: true, origin: "tenant" });
    await expect(deleteTenantField("diamond.culet")).rejects.toThrow("switch built-in fields off instead");
    await deleteTenantField(field.key);
    expect((await listFieldsForCategory("Jewelry")).some((f) => f.key === field.key)).toBe(false);
  });
});

describe("category weight field", () => {
  it("gives a weighed category a Weight field in its unit", async () => {
    const coins = await createCategory({ label: "Gold coins", stockPrefix: "GC-", weightUnit: "g", defaultIdentityModel: "QUANTITY" });
    const weight = (await listFieldsForCategory(coins.key)).find((f) => f.label === "Weight");
    expect(weight).toMatchObject({ type: "number", unit: "g", decimals: 3, origin: "tenant" });
  });

  it("adds none for piece-counted categories", async () => {
    const straps = await createCategory({ label: "Straps", stockPrefix: "ST-", weightUnit: "none", defaultIdentityModel: "QUANTITY" });
    expect((await listFieldsForCategory(straps.key)).some((f) => f.label === "Weight")).toBe(false);
  });
});

describe("legacy uniqueness clashes", () => {
  it("lets an item with a shared placeholder serial be edited, but not given another item's serial", async () => {
    const watch = getById("W-3010")!;
    expect(getAll().filter((i) => i.watch?.serialNumber === watch.watch!.serialNumber).length).toBeGreaterThan(1);
    const edit = { title: "Price change", description: "", location: watch.location, cost: watch.cost, askingPrice: 1 };
    await expect(updateItemDetails(watch.id, { ...edit, watch: watch.watch })).resolves.toBeDefined();
    const other = await receiveItem({
      category: "Watch",
      identityModel: "UNIQUE",
      code: "W-9001",
      title: "New watch",
      description: "",
      location: "Vault",
      cost: 1,
      askingPrice: 2,
      watch: { ...watch.watch!, serialNumber: "REAL-SN-1" },
    });
    await expect(updateItemDetails(watch.id, { ...edit, watch: { ...watch.watch!, serialNumber: "real-sn-1" } })).rejects.toBeInstanceOf(DuplicateValueError);
    expect(other.code).toBe("W-9001");
  });
});
