# Jewelry Job Work + AI Invoice Scan — Research & Plan

Status: **plan only, nothing built yet.** Open questions are listed in §8. They need answers before Phase 1 starts.

---

## 1. The requirement in one paragraph

A **Job** (like a project, or a "job bag") collects every cost of making a batch of jewelry:
- diamond purchases (one or many POs)
- CAD orders (one or many)
- labour POs: casting, metal/gold, setting, polishing (one or many)

From one job the user creates **any number and mix of finished products**. For example: 5 identical rings, or 2 type-1 rings + 3 type-2 rings, or rings + earrings + pendants + a necklace. Each product:
- gets an automatic product (stock) number
- stays linked to its job
- carries its share of the job's cost

Products then go through the existing **Memo → Invoice** flow unchanged. Jobs sit *before* jewelry inventory: a job is how a piece enters stock.

Separately, an **AI invoice scanner** reads a vendor invoice (PDF or photo) and drafts a purchase order from it:
- adds the vendor if they don't exist yet
- picks up the invoice number, date and currency
- extracts the line items

The user reviews the draft before anything is saved.

---

## 2. What exists today (codebase research)

| Area | Current state | Impact on this feature |
|---|---|---|
| **Backend** | None. Every module is a localStorage store (`src/lib/store/*Store.ts`) behind an async API layer (`src/lib/api/*Api.ts`). The comments refer to a future backend (blueprint §38). | Jobs can follow the same store/API pattern. **AI scanning cannot run in the browser.** The Anthropic API key must stay server-side, so it needs at least one serverless function (§6.1). |
| **Purchase orders** (`types/purchaseOrder.ts`) | `PurchaseOrder { vendorId, lines[], status, currency, fxRateToBase }`. A line is `{ description, category?, expectedQty, expectedCost (per unit), receivedQty, receivedItemIds }`. Receiving creates one inventory item per unit. | Every PO line is assumed to be **stock that gets received**. CAD, casting and labour are **services**: nothing to receive, only cost. Gold is bought **by weight** (g). The PO model needs a line type, a unit, a job link and the vendor's invoice number (§3.2). |
| **Vendor bills** (`types/vendorBill.ts`) | Created only automatically, when a consigned item sells (`sourceType: "MemoInConversion"`). The comment says manual bills and PO-to-bill matching are "later Purchasing work". | A scanned vendor *invoice* is really a vendor bill (money owed). Decide whether a scan creates a PO only, or a PO plus a bill (Q4). |
| **Vendors** (`types/party.ts`, `vendorApi.createVendor`) | `{ name, contact, phone, email, address, paymentTerms, currency, notes }`. IDs are `V-1001…`. There is no tax ID field. | Auto-creating a vendor can call `createVendor` as is. Adding `taxId` would make duplicate matching much more reliable. |
| **Inventory** (`types/inventory.ts`) | `InventoryItem` has `cost`, `vendorId`, `purchaseOrderId`, `ledger[]`. `JewelryAttributes.components[]` is a bill of materials (BOM), and each component can carry `sourceItemId` (the loose stone it was made from). The ledger already has a `PRODUCTION_CONSUMPTION` type. Mock item J-2031 even says *"Assembled from job bag JB-0410"*. | The model was built with manufacturing in mind. A product only needs a `jobId` plus a cost breakdown. Consuming a diamond into a product is already modelled (`sourceItemId` plus the ledger type) but not implemented. |
| **Stock numbers** (`lib/inventory/stockNumber.ts`) | `nextStockNumber(category, existingCodes)` takes the category's prefix (e.g. `J-`) and works out the next free number. | Reuse it unchanged for automatic product numbers. Job numbers can follow the same pattern as `nextPurchaseOrderId` (`JOB-0001`). |
| **Memo / invoice** | Both reference `InventoryItem.id`. | No changes needed. Job products are ordinary jewelry inventory items. |
| **Nav / routes / RBAC** | `constants/nav.ts` has groups (Inventory, Purchasing, Sales…). `routes/AppRoutes.tsx` uses the list + `:id` detail-panel pattern. `PermissionModule` is a union in `types/rbac.ts`. | Add a **"Jewelry"** nav group with **Jobs**, a `/jobs/:id` route and a `jobs` permission module. |
| **Review UX to reuse** | Spreadsheet import has plan → review → commit, with batch undo (`features/inventory/import/*`, `ImportBatch`). | The AI scan should copy this pattern: extract → review/fix → commit, and keep a record of each scan so it can be undone. |
| **Multi-currency** | Documents capture `fxRateToBase` when they are created. | Job cost must be totalled in **base currency**, using each PO's own captured rate. |

---

## 3. Data model

### 3.1 New: `Job` (`src/types/job.ts`)

```ts
export type JobStatus = "Open" | "In production" | "Completed" | "Closed" | "Cancelled";

export interface Job {
  id: string;                 // JOB-0001 (format: see Q6)
  title: string;              // "Bridal set — Smith order"
  customerId?: string;        // set for a custom/customer order, empty for stock production (Q2)
  status: JobStatus;
  openedAt: string;
  targetDate?: string;
  notes: string;
  /** Planned output, one row per product design (see 3.3). */
  productPlans: JobProductPlan[];
  /** How pooled costs (CAD, casting, labour, metal) are spread across products (see §4). */
  allocationMethod: "byMetalWeight" | "equal" | "manual";
  /** CAD files, sketches, reference photos (see §6.5 for storage limits). */
  attachments: JobAttachment[];
  /** Set when status becomes Closed. After this, product costs are final and no more cost can be booked. */
  costClosedAt?: string;
  activity: { id: string; occurredAt: string; actor: string; note: string }[];
}
```

The job does **not** store its own list of purchase orders. The link lives on the PO lines (`jobId`), so it has one source of truth and one PO can split across jobs (Q7).

### 3.2 Changes to `PurchaseOrder`

```ts
export type PurchaseOrderLineType =
  | "Stock"     // diamonds/gemstones/findings received into inventory (today's behaviour)
  | "Metal"     // gold/platinum by weight: cost only, or later metal stock
  | "Service";  // CAD, casting, setting, polishing, labour: cost only, nothing received

export interface PurchaseOrderLine {
  // ...existing fields
  lineType: PurchaseOrderLineType;          // migrate existing lines to "Stock"
  serviceKind?: string;                     // master list "jobCostTypes": CAD, Casting, Setting, Polishing, Labour, Rhodium, Other
  unit: "pcs" | "ct" | "g" | "hrs" | "lot"; // expectedQty is in this unit
  jobId?: string;                           // defaults from header jobId, can be overridden per line
}

export interface PurchaseOrder {
  // ...existing fields
  jobId?: string;                 // default job for new lines
  vendorInvoiceNumber?: string;   // what the scanner extracts; duplicate-checked per vendor
  vendorInvoiceDate?: string;
  source: "Manual" | "InvoiceScan";
  scanId?: string;                // links to the InvoiceScan record (§6.4)
}
```

- Status for **Service/Metal** lines: there is nothing to receive. Mark them "received" when the work is done (one click, or automatically when created from an invoice scan, because an invoice means the work was delivered).
- `deriveStatus()` must treat these lines as fulfilled once `receivedQty === expectedQty`.
- Migrations go in `purchaseOrderStore.migrate()`, following the existing pattern (`lineType: "Stock"`, `unit: "pcs"`, `source: "Manual"`).

### 3.3 Product plans and generated products

```ts
export interface JobProductPlan {
  id: string;
  type: string;           // Ring / Earrings / Pendant / Necklace… (jewelry "group" master list)
  styleNumber: string;    // the design; also the "type 1 vs type 2" distinction
  quantity: number;       // 5 identical rings = one plan row, qty 5
  /** Defaults copied onto each generated item (metal, karat, setting, BOM template…). */
  template: Partial<JewelryAttributes>;
  generatedItemIds: string[];
}
```

**"Generate products"** on a plan row creates `quantity` jewelry `InventoryItem`s:
- Stock numbers come from `nextStockNumber` with the Jewelry category prefix.
- Each item gets `jobId`, the template attributes and `status: "In production"` (a new `ItemStatus`, so a piece can't be memo'd or invoiced before it's finished).
- Each item gets a `PRODUCTION_CONSUMPTION`/creation ledger entry.

Users can then edit each piece individually (actual gross weight, which certificate stone went into it, photos). **"Finish"** moves it to `Available`.

New fields on `InventoryItem`:

```ts
jobId?: string;
costBreakdown?: { stones: number; metal: number; cad: number; casting: number; labour: number; other: number; provisional: boolean };
```

`cost` = sum of the breakdown, so memo, invoice and margin reports keep working with no changes.

### 3.4 Diamonds bought for the job (Q1 — recommended approach)

There are two kinds of stones, and they should be handled differently:
- **Certified/centre stones (UNIQUE):**
  1. Received into inventory as normal Diamond items, against a `Stock` PO line tagged with the job.
  2. When a product is built, the user picks the stone in the BOM (`sourceItemId`). The stone's status becomes **"Consumed"** (new status) with a `PRODUCTION_CONSUMPTION` ledger entry.
  3. Its cost goes **directly** to that one product.

  This keeps the certificate traceable from a loose stone to a finished piece.
- **Melee / parcels:** treated as a pooled job cost (a `Stock` or `Service` line with unit `ct`) and spread across products. Optionally, carats per product come from the BOM.

---

## 4. Job costing (the main point of the feature)

**Job total cost** (base currency) =
- Σ (PO lines with `jobId = job`) × the PO's `fxRateToBase`
- \+ the cost of any existing stock stones consumed into the job's products (stones that weren't bought on a job PO)

**Per-product cost:**
1. **Direct costs** go straight to one product. These are consumed certified stones, or any PO line the user assigns to a specific product.
2. **Pooled costs** are spread using the job's `allocationMethod`:
   - `byMetalWeight` (recommended default): metal, casting and labour split by each product's gross/net weight. A 10 g necklace absorbs more than a 2 g pendant.
   - `equal`: per piece.
   - `manual`: % per product, which must total 100%.
   - CAD is a special case. It is spread **per style** first (CAD for style A only goes to A pieces), then equally within that style. This needs PO lines to optionally name a `productPlanId`.
3. Write `costBreakdown` and `cost` onto each item.

**Timing:** vendor invoices often arrive after the pieces are made.
- While the job is not Closed, every new cost **reallocates automatically**, and product costs show "provisional".
- **Close job** freezes the costs.
- If a cost arrives after close, or after a piece is already sold: book it to the job as a variance, and **never** silently change the cost of a sold piece.

**Job detail screen:**
- A cost summary by category: Stones / Metal / CAD / Casting / Labour / Other.
- Planned vs. actual.
- A per-product table: product #, style, weight, allocated cost, asking price, margin, status (in production / available / on memo / sold).

---

## 5. UI plan

| Screen | Contents |
|---|---|
| **Nav: "Jewelry" group** | `Jobs` (`/jobs`). This is also where "Scan invoice" lives (it is also reachable from Purchase Orders). |
| **Job list** | Number, title, customer, status, # POs, # products, total cost, target date. Filters by status. |
| **Job detail** (side panel like the other modules, or a full page because there's a lot in it) | Tabs: **Overview** (cost summary + allocation method) · **Purchase orders** (linked lines grouped by PO; buttons for *New PO for this job* and *Scan invoice into this job*; *Link existing PO*) · **Materials** (stones received/consumed) · **Products** (plan rows → *Generate*; generated items with cost; *Finish*) · **Files** (CAD/photos) · **Activity** |
| **Create PO dialog** | Adds a Job selector (header), plus per-line type / service kind / unit. |
| **Item detail** | Adds a "Job JOB-0001" link and the cost-breakdown card. |
| **Reports** | Job cost summary; cost per product; open jobs ageing. |
| **RBAC** | New `jobs` permission module. Generate/finish products uses `jobs.create`/`jobs.edit` plus `inventory.create`. Close job uses `jobs.approve`. |

Inventory receiving, memo, invoice and payments are untouched.

---

## 6. AI invoice scanning

### 6.1 Architecture: a backend is required

The browser cannot hold the Anthropic API key (anyone could read it from the bundle). The smallest working setup:

```
Browser (React)                       Serverless function (e.g. Vercel /api/scan-invoice)
──────────────                        ───────────────────────────────────────────────
upload PDF/JPG/PNG/HEIC  ──POST──▶    checks the user/session, file type and size (≤ 20 MB)
                                      calls the Claude Messages API:
                                        • PDF → document block, image → image block
                                        • structured output (JSON schema, §6.2)
                         ◀──JSON──    returns the extraction (+ token usage)
match vendor / job / duplicates
review screen → user confirms
create vendor + PO (+ bill) via the existing APIs
```

The function is **stateless**: it only turns a file into JSON. All matching and saving stays in the browser and its existing stores, so this works before the real backend exists and moves across unchanged when it does. Hosting depends on where the app is deployed (Q5).

**Model and API details:**
- Model: `claude-opus-5-5`, the current default; strongest at reading messy scanned invoices and handwriting.
- PDFs are sent natively as a `document` content block (up to 600 pages / 32 MB). Photos are sent as `image` blocks.
- Use **structured outputs** (`output_config.format` with a JSON schema) so the response always parses against the schema.
- Turn on the server-side refusal fallback (`fallbacks: "default"`). Check `stop_reason` before reading the result.
- Rough cost: a 1–3 page invoice is about 5–10k input tokens plus about 1–2k output tokens, so **about $0.03–$0.08 per invoice**. A cheaper model (Sonnet/Haiku) is an option once an accuracy test set exists; that is the user's call.

### 6.2 Extraction schema (first draft)

```jsonc
{
  "vendor":   { "name": "", "address": "", "phone": "", "email": "", "taxId": "", "website": "" },
  "document": { "type": "invoice|proforma|delivery_note|credit_note|other",
                "invoiceNumber": "", "invoiceDate": "YYYY-MM-DD", "dueDate": "", "currency": "USD",
                "customerReference": "",   // our PO / job number if the vendor printed it
                "paymentTerms": "" },
  "lines": [{
    "description": "", "lineType": "Stock|Metal|Service",
    "category": "Diamond|Gemstone|Findings|Metal|CAD|Casting|Setting|Polishing|Labour|Other",
    "quantity": 0, "unit": "pcs|ct|g|hrs|lot", "unitPrice": 0, "amount": 0,
    "diamond": { "shape": "", "carat": 0, "color": "", "clarity": "", "lab": "", "certificateNumber": "" },
    "metal":   { "metal": "", "karat": "", "weightGrams": 0, "ratePerGram": 0 }
  }],
  "totals":   { "subtotal": 0, "tax": 0, "shipping": 0, "discount": 0, "total": 0 },
  "warnings": [""]   // e.g. "line 3 amount unreadable", "handwritten correction on total"
}
```

### 6.3 Review flow ("smart, but always confirmed")

1. **Upload** from the Job's PO tab (the job is pre-selected) or from Purchase Orders. Multiple files can be queued.
2. **Extract.** Show a spinner, with the document preview beside the form.
3. **Vendor match.** Check in this order: exact tax ID, then email/domain, then a normalised fuzzy name match ("Shree Diam. Pvt Ltd" ≈ "Shree Diamonds Private Limited").
   - Show "Matched: V-1004" or "**New vendor**: create" with the details pre-filled and editable.
   - The vendor is never created until the user confirms.
4. **Duplicate guard.** If the same vendor plus `vendorInvoiceNumber` already exists, stop and link to the existing PO.
5. **Lines.** An editable grid with line type, unit and category.
   - Show a confidence or warning flag next to doubtful fields.
   - Cross-check in code (not by the AI): qty × price ≈ amount, Σ lines ≈ subtotal, subtotal + tax + shipping ≈ total. Show any mismatch in amber.
   - Certificate numbers are checked against inventory using the existing uniqueness rule (`findUniqueConflicts`).
   - Unknown master-list values (e.g. clarity "SI-1") use the import "means → pick value" fixer.
6. **Job.** Pick the job (or "new job"). Lines can be reassigned to other jobs.
7. **Commit**, in one go:
   1. Create the vendor if new.
   2. Create the PO with `source: "InvoiceScan"` and the invoice number/date. Service/Metal lines are marked received.
   3. Optionally create a Vendor Bill (Q4).
   4. `Stock` lines are left ready to receive through the existing *Receive* dialog, pre-filled with the extracted diamond attributes.

### 6.4 Keep a record of each scan

`InvoiceScan { id, fileName, uploadedAt, actor, model, rawExtraction, createdVendorId?, createdPoId?, undoneAt? }` serves three purposes:
- **Audit:** what the AI read vs. what the user saved.
- **Undo:** follows the `ImportBatch` pattern.
- **An accuracy test set:** every correction the user made is a labelled example, which is what makes it safe to tune prompts or switch models later.

### 6.5 Constraints to be aware of

- **File storage.** localStorage is limited to about 5 MB per site, so invoice PDFs and CAD files cannot be stored there. Short term: keep only the file name plus the extraction, or use IndexedDB on this device only. Proper fix: object storage with the backend (blueprint §34.2).
- **Privacy.** Invoices contain vendor pricing and are sent to the Anthropic API. This should be mentioned in the tenant's settings or terms.
- **Not auto-posting.** Even at high confidence, the first versions should always show the review screen. Removing that step later is a product decision, best made with accuracy data from §6.4.

---

## 7. Delivery phases

| Phase | Scope | Notes |
|---|---|---|
| **1. Purchasing foundations** | PO line type/unit/serviceKind/jobId, `vendorInvoiceNumber`, migrations, updated Create PO dialog and PO detail (service lines "mark done"), `taxId` on Vendor, `jobCostTypes` master list. | Useful on its own; no job UI yet. |
| **2. Jobs module** | `Job` type/store/API, Jewelry nav group, `jobs` RBAC module, job list + detail (Overview, POs, Files, Activity), link POs to jobs, job cost summary in base currency. | |
| **3. Products & costing** | Product plans → generate items (automatic numbers, `jobId`, "In production" status), consume certified stones via BOM `sourceItemId`, allocation engine (`lib/job/allocation.ts` with unit tests), `costBreakdown` on items, close job / provisional flag, job-cost reports. | The heaviest phase. The allocation maths must be test-covered. |
| **4. AI invoice scan** | Serverless `/api/scan-invoice`, extraction schema + prompt, upload/review UI, vendor matching, duplicate guard, arithmetic checks, PO (+bill) creation, `InvoiceScan` history/undo. | Needs hosting and an API key (Q5). Can be built in parallel with Phase 3 once Phase 1 is done. |
| **5. Hardening** | Vendor bills from POs (PO ↔ bill matching), accuracy test set from saved scans, multi-page/batch scanning, metal stock by grams (optional). | |

---

## 8. Open questions (please answer before Phase 1)

1. **Diamonds for a job.** Should certified stones be received into inventory first and then consumed into the product (recommended, traceable)? Or only costed to the job, never stocked?
2. **Job ↔ customer.** Are jobs sometimes for a specific customer order and sometimes for stock? Should a job carry a customer?
3. **Default cost split.** For pooled costs (metal, casting, labour, CAD): by metal weight (recommended), equal per piece, or a manual %?
4. **Scanned invoice = PO only, or PO + Vendor Bill?** An invoice is money owed. Creating a bill as well puts it in Vendor Bills/payments.
5. **Hosting and API key.** Where is the app deployed (Vercel?), and will you provide an Anthropic API key for the serverless function?
6. **Job number format.** `JOB-0001`, `JB-0001` (the mock data already says "job bag JB-0410"), or configurable per tenant?
7. **One PO across several jobs?** For example, one diamond invoice covering stones for 3 jobs. The plan supports a job per line; confirm it's needed.
8. **Gold.** Do you buy gold yourselves and give it to the caster (which means tracking metal stock in grams), or does the caster supply the metal and bill for it? The plan assumes the caster supplies it, for now.
9. **Earrings.** Is one pair one product (one stock number)? The plan assumes yes.
