# Jewelry Job Work + AI Invoice Scan — Research & Plan

Status: **Phases 1–2 built** (see §8.1, §8.2). Phases 3–5 not started. Revised: Job Order is the starting point; invoices are added to the job and saved as POs. The scenario walkthrough is in §3 and the open questions are in §9. They need answers before Phase 1 starts.

---

## 1. The requirement in one paragraph

The user does **not** create purchase orders first. The workflow is:

1. **Create a Job Order** (like a project, or a "job bag").
2. **Add every vendor invoice to the job number** as it arrives:
   - diamond invoices (one or many)
   - CAD invoices (one or many)
   - labour invoices: casting, metal/gold, setting, polishing (one or many)
3. Each invoice added to a job is **saved automatically as a PO record**, linked to that job. It **appears in the normal Purchase Orders list** (with its job number), so purchasing still sees every purchase in one place. Nobody types a PO by hand for job work.
4. **Create products from the Job Order.** The user can make **any number and mix of finished products**. For example: 5 identical rings, or 2 type-1 rings + 3 type-2 rings, or rings + earrings + pendants + a necklace. Each product:
   - gets an automatic product (stock) number
   - stays linked to its job
   - carries its share of the job's cost

Products then go through the existing **Memo → Invoice** flow unchanged. Job Orders sit *before* jewelry inventory: a job is how a piece enters stock.

An invoice can be added to a job in two ways:
- **typed in by hand**
- **scanned by AI.** The AI reads the invoice (PDF or photo) and:
  - adds the vendor if they don't exist yet
  - picks up the invoice number, date and currency
  - extracts the line items

  The user reviews everything before it is saved.

---

## 2. What exists today (codebase research)

| Area | Current state | Impact on this feature |
|---|---|---|
| **Backend** | None. Every module is a localStorage store (`src/lib/store/*Store.ts`) behind an async API layer (`src/lib/api/*Api.ts`). The comments refer to a future backend (blueprint §38). | Jobs can follow the same store/API pattern. **AI scanning cannot run in the browser.** The Anthropic API key must stay server-side, so it needs at least one serverless function (§7.1). |
| **Purchase orders** (`types/purchaseOrder.ts`) | `PurchaseOrder { vendorId, lines[], status, currency, fxRateToBase }`. A line is `{ description, category?, expectedQty, expectedCost (per unit), receivedQty, receivedItemIds }`. Receiving creates one inventory item per unit. | Every PO line is assumed to be **stock that gets received**. CAD, casting and labour are **services**: nothing to receive, only cost. Gold is bought **by weight** (g). The PO model needs a line type, a unit, a job link and the vendor's invoice number (§4.3). |
| **Vendor bills** (`types/vendorBill.ts`) | Created only automatically, when a consigned item sells (`sourceType: "MemoInConversion"`). The comment says manual bills and PO-to-bill matching are "later Purchasing work". | A scanned vendor *invoice* is really a vendor bill (money owed). Decide whether a scan creates a PO only, or a PO plus a bill (Q10). |
| **Vendors** (`types/party.ts`, `vendorApi.createVendor`) | `{ name, contact, phone, email, address, paymentTerms, currency, notes }`. IDs are `V-1001…`. There is no tax ID field. | Auto-creating a vendor can call `createVendor` as is. Adding `taxId` would make duplicate matching much more reliable. |
| **Inventory** (`types/inventory.ts`) | `InventoryItem` has `cost`, `vendorId`, `purchaseOrderId`, `ledger[]`. `JewelryAttributes.components[]` is a bill of materials (BOM), and each component can carry `sourceItemId` (the loose stone it was made from). The ledger already has a `PRODUCTION_CONSUMPTION` type. Mock item J-2031 even says *"Assembled from job bag JB-0410"*. | The model was built with manufacturing in mind. A product only needs a `jobId` plus a cost breakdown. Consuming a diamond into a product is already modelled (`sourceItemId` plus the ledger type) but not implemented. |
| **Stock numbers** (`lib/inventory/stockNumber.ts`) | `nextStockNumber(category, existingCodes)` takes the category's prefix (e.g. `J-`) and works out the next free number. | Reuse it unchanged for automatic product numbers. Job Order numbers can follow the same pattern as `nextPurchaseOrderId` (`JO-0001`). |
| **Memo / invoice** | Both reference `InventoryItem.id`. | No changes needed. Job products are ordinary jewelry inventory items. |
| **Nav / routes / RBAC** | `constants/nav.ts` has groups (Inventory, Purchasing, Sales…). `routes/AppRoutes.tsx` uses the list + `:id` detail-panel pattern. `PermissionModule` is a union in `types/rbac.ts`. | Add a **"Jewelry"** nav group with **Jobs**, a `/jobs/:id` route and a `jobs` permission module. |
| **Review UX to reuse** | Spreadsheet import has plan → review → commit, with batch undo (`features/inventory/import/*`, `ImportBatch`). | The AI scan should copy this pattern: extract → review/fix → commit, and keep a record of each scan so it can be undone. |
| **Multi-currency** | Documents capture `fxRateToBase` when they are created. | Job cost must be totalled in **base currency**, using each PO's own captured rate. |

---

## 3. Scenario walkthrough

Before fixing the data model, here are the real situations a jewelry manufacturer meets, grouped by stage. For each: what happens, and what the design must do. The model in §4 is built to cover these. ⚠️ marks scenarios that broke the first draft of this plan.

### 3.1 Job types

| # | Scenario | What the design must do |
|---|---|---|
| J1 | **Production for stock.** Make 12 rings to sell later. | Job without a customer. The products go into inventory as Available. |
| J2 | **Customer custom order.** Mrs Smith orders a bridal set and pays a deposit. | Job has `customerId`. When the products are finished, **"Invoice customer"** on the job opens the existing Invoice editor with the products pre-filled. The deposit is recorded as a payment on that invoice (the existing Payments module). The products are reserved for that customer and shouldn't appear as freely available stock. |
| J3 | ⚠️ **Rework / upgrade of a piece already in stock.** Reset a slow-selling ring with a bigger centre stone, or re-polish and re-rhodium it. | Input is an **existing inventory item**, not a new product. "Bring item into job" sets it to *In production*. The job's costs are **added** to that item's existing cost. No new stock number is created. |
| J4 | **Repair of a customer's own piece** (not our stock). | Not a production job: there is no product and no inventory, and the cost is billed to the customer. **Out of scope for v1**, but the job type is reserved so it can be added later without remodelling. |

### 3.2 Invoices coming in (each one becomes a PO)

| # | Scenario | What the design must do |
|---|---|---|
| I1 | One diamond invoice, one CAD invoice, one casting invoice, all for one job. | Basic case. Each invoice → one PO, all lines charged to the job. |
| I2 | ⚠️ **One invoice covers several jobs.** The caster sends a monthly bill: 3 jobs' castings on one invoice. A diamond dealer invoices stones for 2 jobs together. | Very common, so v1 must support it. **The job link sits on each line**, not only on the invoice header. The header job is just the default for new lines. The invoice is entered **once** (one PO, one invoice number, so duplicate detection still works) and appears on every job it touches, showing only that job's lines and amount. |
| I3 | ⚠️ **Invoice mixes job costs and stock.** The diamond dealer bills 1 centre stone for the job + a 50 ct melee parcel for general stock. | Each line chooses a **destination**: *charge to job X* or *receive into stock*. Stock lines go through the existing Receive dialog. |
| I4 | An invoice from a normal PO raised **before** the job existed (diamonds ordered last month), later used for the job. | No re-entry needed. Either change those lines' destination to the job, or (if already received into stock) **consume the stones from inventory** into the job (M2). |
| I5 | ⚠️ **Invoice-level extras: shipping, insurance, customs/import duty, bank charges, discount.** | These are real product cost (landed cost). Header extras are **spread across that invoice's job lines in proportion to value**, so a job carries its share of the freight. |
| I6 | ⚠️ **Tax (GST/VAT).** | If the tax is **recoverable** (input tax credit), it is *not* product cost. If it isn't recoverable, it is. This needs a **tenant setting**: "Purchase tax is recoverable → exclude it from cost" (default on). The PO still stores the tax so it matches the paper invoice. |
| I7 | Different currencies: USD diamonds, INR labour, HKD findings. | Each PO keeps its own captured FX rate. The job totals everything in base currency. |
| I8 | ⚠️ **Credit note / return.** A stone is sent back, or the caster gives a credit for a bad casting. | Add invoice with document type **Credit note**, linked to the original invoice. Its lines are negative and reduce the job cost. If the returned stone was in stock, it goes to *Returned to vendor* (an existing status). |
| I9 | **Invoice arrives late**: after the products are made, or even sold. | Product costs stay **provisional** until the job is closed, and recompute when a late invoice is added. If a piece is **already sold**, its cost is never rewritten. The difference is recorded on the job as a **cost variance** and shows in reports. |
| I10 | **Same invoice entered twice** (typed once and scanned once, or by two users). | Hard block on the same vendor + invoice number (ignoring case and spaces). Show a link to the existing one. |
| I11 | **Quotation / proforma** before work starts. | Not an invoice: entering it would double-count cost. Record it as the job's **estimate** (budget per cost bucket) instead. The final invoice is entered later and compared against the estimate. |
| I12 | **Advance paid to the caster** before the invoice. | A payment, not a cost. Handled by Vendor Bills/payments (Q10). It does not change the job cost. |
| I13 | Wrong invoice entered / attached to the wrong job. | The invoice can be edited or its lines moved to another job while both jobs are open. Deletion is blocked if any line is on a closed job. Every move is written to both jobs' activity log. |

### 3.3 Materials (stones, metal, findings)

| # | Scenario | What the design must do |
|---|---|---|
| M1 | **Certified centre diamond bought for this job.** | Received into inventory (it has a certificate, so it must stay traceable). When it is set into a product, it is **consumed**: the stone's status becomes *Consumed* and its full cost goes **directly to that one product**. |
| M2 | **Stone from existing stock** (bought months ago, no invoice on this job). | "Add from inventory" on the job consumes it. Its cost comes from the inventory item. This is a *job cost entry without an invoice*. |
| M3 | ⚠️ **Melee parcel partly used.** We hold a 50 ct lot and this job uses 3.2 ct (180 pcs). | Requires **partial consumption of a LOT item**: take *x ct / y pcs* at the lot's **average cost per carat**. The lot's remaining weight, pieces and cost go down. Today a LOT item only tracks pieces, so the lot needs total carats and cost per carat for this to work. |
| M4 | ⚠️ **Melee bought straight onto the job and some left over.** | "Return leftover to stock" creates (or tops up) a LOT inventory item and moves that cost **out of** the job. |
| M5 | ⚠️ **Customer's own diamond or gold** (custom order, J2). | Recorded on the job as **customer-supplied material**: cost 0, but kept on the job as a record of what we hold for the customer (what was received, where it is). It goes into the product's components flagged *customer-owned*, so the product's cost and value aren't overstated. |
| M6 | **Gold supplied and billed by the caster** (by grams × rate + making). | An invoice line in grams. Metal cost = grams × rate. Making is a separate service line. |
| M7 | ⚠️ **Our own gold given to the caster** (we hold bullion; the caster returns castings + scrap; some gold is lost). | Needs a **metal ledger** (gold in grams, issue/return, loss %). Big enough to be its own phase (§8, Phase 5). Until then, the user enters the gold used as an internal cost (grams × our rate). Q8 decides the priority. |
| M8 | Old gold / old jewelry melted and reused. | Same as M7: internal cost at the melt value. Fully covered once the metal ledger exists. |
| M9 | **Stone broken or lost during setting.** | The consumed stone is marked *Lost/Broken*. Its cost stays in the job as a **loss** (it is still part of the cost of making the remaining products). It can be noted as a vendor/setter claim. |
| M10 | Findings/chains/clasps bought in bulk. | Same as melee: stock LOT, consumed by pieces. |

### 3.4 Internal costs (no vendor invoice)

| # | Scenario | What the design must do |
|---|---|---|
| C1 | ⚠️ **In-house karigar/setter wages.** The work is done by our own staff, so there is no invoice. | **Internal cost entry** on the job: type (Labour/Setting/Polishing…), description, amount, or hours × rate. Shown with the invoices but marked "Internal". It does **not** create a PO, because no vendor is owed money. |
| C2 | Overhead loading (e.g. +5% workshop overhead). | Optional per-job (or tenant default) overhead %, added as a calculated internal cost. |
| C3 | Certification/grading fees, hallmarking, engraving. | Usually a vendor invoice (I1); if paid in cash, an internal cost. |

### 3.5 Products (output)

| # | Scenario | What the design must do |
|---|---|---|
| P1 | 5 identical rings. | One plan row, qty 5. The user chooses **5 separate pieces** (5 stock numbers; best when stones are certified or sizes differ) or **one stock line × 5** (the existing QUANTITY identity model; best for plain identical items). Both stay linked to the job. |
| P2 | Mixed output: 2 rings type 1, 3 rings type 2, 4 earrings, 2 pendants, 1 necklace. | One plan row per design, each with its own qty and template. |
| P3 | Earrings come as a pair. | One product = one pair (Q13). Generated once, components hold both stones. |
| P4 | **A set** (necklace + earrings sold together). | Products can share a **set code**. Selling them as one set is a later Sales feature, but the link is recorded now. |
| P5 | ⚠️ **Products finished in batches.** 3 rings this week, 2 next week. | Generate per batch from a plan row ("generate 3 of 5"). Each piece is finished on its own, so the early ones can go on memo while the rest are still in work (using provisional cost). |
| P6 | ⚠️ **Fewer pieces than planned** (a casting failed; 4 good rings instead of 5). | A piece can be marked **Scrapped**. Its allocated cost is **spread over the good pieces** (default) or written off as job loss. Scrap metal can be noted. |
| P7 | **Different weights per piece** (sizes 5–9). | Actual gross/net weight is entered per piece. Allocation by weight uses the actual weights. |
| P8 | Product sold **before the job is closed**. | It sells at its provisional cost. Later changes become job variance (I9). |
| P9 | ⚠️ **CAD/mould reused by later jobs** (a bestseller style re-made every quarter). | v1: CAD is charged to the job that paid for it. Option for later: put the CAD/mould cost on a **Style** and spread it over future production. Noted as a future option, not v1. |
| P10 | Product needs a **centre stone added later** (semi-mount now, customer chooses a stone later). | Finish it as a semi-mount. Adding the stone later is a **rework job** (J3) that adds the stone's cost to the same item. |

### 3.6 Job lifecycle

| # | Scenario | What the design must do |
|---|---|---|
| L1 | Job created, nothing added yet. | Allowed. Cost 0. Products can be planned but costs show "no cost yet". |
| L2 | **Close job.** All invoices are in and all pieces finished or scrapped. | Freezes the costs (provisional → final). Warns if any piece is still in production or if the actual cost is far from the estimate. Needs the `jobs.approve` permission. |
| L3 | Late invoice after close. | Either **reopen** (approve permission, audited) or accept it as a variance on the closed job. Never silently rewrite closed costs. |
| L4 | ⚠️ **Job cancelled** after some money is spent. | Stock materials consumed into the job are **returned to inventory** (un-consumed). Service costs (CAD, labour) can't be returned, so they are **written off** as a loss. The invoices stay in the PO list, because they really happened. |
| L5 | Two jobs merged, or one split. | Not supported in v1. Workaround: move invoice lines and products between open jobs (I13). |
| L6 | Who can see cost? Workshop staff manage jobs but shouldn't see margins. | Cost columns are shown only to roles with a **view-cost** permission (a new action on the `jobs` module). |

### 3.7 Purchase Orders list

| # | Scenario | What the design must do |
|---|---|---|
| O1 | Purchasing wants all purchases in one place. | Every job invoice is a PO in the list, with Job column(s), the vendor invoice # and a "Job invoice" badge. |
| O2 | An invoice split over 3 jobs (I2). | One row in the PO list. The Job column shows "JO-0001, JO-0004, JO-0007". The filter "Job = JO-0004" still finds it. |
| O3 | Vendor statement: what did we buy from this caster this year? | Vendor detail lists all their POs, normal and job invoices. |
| O4 | Normal stock buying (no job). | Unchanged: the existing Create PO dialog. |

---

## 4. Data model (revised for the scenarios)

### 4.0 How the records relate

```
Job Order JO-0001 (type: Production | CustomerOrder | Rework)
 │
 ├─ COST SOURCES ─────────────────────────────────────────────────────────────
 │   ├─ Invoice lines   PO-3007 L1, L2   (diamond dealer)   ─┐
 │   │                  PO-3009 L3       (caster, monthly bill also used by JO-0004, JO-0007)
 │   ├─ Credit notes    PO-3015 (−)                          │  all become
 │   ├─ Stock consumed  D-1042 (1.21 ct GIA), LOT-55 3.2 ct  ├─▶ JOB COST LEDGER
 │   ├─ Internal costs  setter wages 6 h × ₹500, overhead 5% │  (one list, base currency,
 │   └─ Adjustments     broken stone, leftover melee back to stock, scrap
 │                                                          ─┘
 ├─ CUSTOMER MATERIAL  customer's 1.5 ct stone (cost 0; record of what we hold)
 │
 └─ OUTPUT  Plan: Ring style R-101 × 5, Earrings E-20 × 2 …
            Products J-2101 … J-2107   ← cost allocated from the ledger
            (Rework job: existing item J-1999 brought in, cost added on top)

Purchase Orders list → PO-3007, PO-3009, PO-3015 appear with Job column + badge
```

The central idea: **a Job Cost Ledger.** Every rupee or dollar that hits a job is one ledger row, whatever its source. Invoice lines are one source among five. Costing, the job screen, reports, closing and cancelling all read this one list, so the scenarios above don't each need their own special case.

### 4.1 `JobOrder` (`src/types/jobOrder.ts`)

```ts
export type JobType = "Production" | "CustomerOrder" | "Rework";   // "Repair" reserved (J4)
export type JobStatus = "Open" | "In production" | "Completed" | "Closed" | "Cancelled";

export interface JobOrder {
  id: string;                         // JO-0001 (Q12)
  type: JobType;
  title: string;
  customerId?: string;                // required for CustomerOrder
  status: JobStatus;
  openedAt: string;
  targetDate?: string;
  notes: string;
  estimate?: Partial<Record<CostBucket, number>>;   // I11: budget per bucket, base currency
  productPlans: JobProductPlan[];
  reworkItemIds: string[];            // J3: existing items brought into the job
  costEntries: JobCostEntry[];        // the non-invoice ledger rows (C1, M2–M5, M9, P6, adjustments)
  customerMaterials: CustomerMaterial[];             // M5
  allocation: { pooledMethod: "byMetalWeight" | "equal" | "manual"; scrapPolicy: "spreadOverGood" | "writeOff"; overheadPct?: number };
  attachments: JobAttachment[];
  closedAt?: string;
  activity: { id: string; occurredAt: string; actor: string; note: string }[];
}

export type CostBucket = "Stones" | "Metal" | "CAD" | "Casting" | "Setting" | "Labour" | "Findings" | "LandedCost" | "Overhead" | "Other";
```

### 4.2 The Job Cost Ledger

```ts
export interface JobCostEntry {
  id: string;
  occurredAt: string;
  source:
    | "InvoiceLine"        // derived from PO lines, not stored here (see below)
    | "StockConsumption"   // M1, M2, M3, M10: inventory item (or part of a LOT) used
    | "Internal"           // C1, C2, C3: wages, overhead, cash fees
    | "ReturnToStock"      // M4, L4: negative, material goes back to inventory
    | "Loss"               // M9, P6 (write-off), L4 (services written off)
    | "Variance";          // I9, L3: cost that arrived after a piece was sold or the job closed
  bucket: CostBucket;
  description: string;
  amountBase: number;                 // base currency, signed
  /** Who carries it. Absent = pooled across the job's products. */
  target?: { productItemId: string } | { productPlanId: string };
  inventoryItemId?: string;           // for StockConsumption / ReturnToStock
  consumedQty?: { pieces?: number; carats?: number; grams?: number };
  actor: string;
}
```

**Invoice lines are not copied into the job.** The ledger view is built when it's read: *the PO lines charged to this job* + *`job.costEntries`*. That keeps the PO as the single source of truth, so editing an invoice can never leave a stale copy on the job.

### 4.3 PurchaseOrder changes (invoice = PO)

```ts
export interface PurchaseOrderLine {
  // ...existing fields
  lineType: "Stock" | "Metal" | "Service";
  bucket?: CostBucket;                 // CAD / Casting / Setting… (from the "jobCostTypes" master list)
  unit: "pcs" | "ct" | "g" | "hrs" | "lot";
  /** I2/I3: where this line goes. */
  destination: { kind: "Job"; jobId: string; target?: { productPlanId: string } | { productItemId: string } }
             | { kind: "Stock" };
}

export interface PurchaseOrder {
  // ...existing fields
  documentType: "PurchaseOrder" | "VendorInvoice" | "CreditNote";   // I8
  creditForPoId?: string;              // I8: which invoice this credit note reverses
  defaultJobId?: string;               // header default for new lines (I2)
  vendorInvoiceNumber?: string;        // required for VendorInvoice / CreditNote; I10 duplicate key
  vendorInvoiceDate?: string;
  charges: { shipping: number; insurance: number; duty: number; other: number; discount: number };  // I5
  tax: { amount: number; recoverable: boolean };                    // I6 (default from tenant setting)
  total: number;                       // matches the paper document
  entryMethod: "Typed" | "AIScan";
  scanId?: string;
}
```

- **Which jobs an invoice belongs to** = the distinct `destination.jobId` across its lines (O2).
- **Cost of a job line** = line amount + its share of the header charges (by value, I5) + tax only if not recoverable (I6), × `fxRateToBase` (I7). Credit notes are negative (I8).
- **Status:** VendorInvoice/CreditNote documents are created already *Received* for Job lines. Stock lines stay *pending receipt* until received through the existing Receive dialog.
- **Migration:** existing POs → `documentType: "PurchaseOrder"`, `destination: Stock`, zero charges, `entryMethod: "Typed"`.

### 4.4 Inventory changes

```ts
// InventoryItem
jobId?: string;                        // the job that produced it (or last reworked it)
setCode?: string;                      // P4
costBreakdown?: Partial<Record<CostBucket, number>> & { provisional: boolean };
// ItemStatus additions
"In production" | "Consumed" | "Lost" | "Scrapped"
// LOT items (M3) need, for diamonds/gemstones:
totalCarats?: number;                  // remaining weight in the lot
// cost of a LOT = remaining cost; average cost/ct = cost / totalCarats
// JewelryComponent (M5)
customerOwned?: boolean;
```

- **Consumption** (M1–M3) writes the existing `PRODUCTION_CONSUMPTION` ledger entry on the stone/lot and a `StockConsumption` row on the job. For a LOT, it reduces quantity, `totalCarats` and `cost` in proportion.
- **Rework** (J3): bringing an item in sets it to *In production* and records its starting cost. On finish, `cost = starting cost + allocated job cost`.

### 4.5 Product plans

```ts
export interface JobProductPlan {
  id: string;
  type: string;                        // Ring / Earrings / Pendant / Necklace…
  styleNumber: string;
  quantity: number;                    // planned
  outputMode: "SeparatePieces" | "QuantityLine";   // P1
  template: Partial<JewelryAttributes>;
  generatedItemIds: string[];          // P5: grows batch by batch
}
```

---

## 5. Job costing

**Step 1. Build the ledger** (§4.2): the PO lines charged to the job, the stock consumed, internal costs, returns, losses and variances. Everything is in base currency.

**Step 2. Assign the direct rows.** A row with a `target.productItemId` goes to that piece (centre stone M1, or a line charged to one piece). A row with a `target.productPlanId` goes to that design's pieces (CAD for style R-101 only, P2).

**Step 3. Spread the pooled rows** with the job's `pooledMethod`:
- `byMetalWeight` (default): uses each piece's **actual** weight (P7), so heavier pieces carry more metal, casting and labour.
- `equal`: per piece.
- `manual`: % per piece, must total 100%.

**Step 4. Scrapped pieces** (P6): their share is either spread over the good pieces (`spreadOverGood`, default) or posted as a job *Loss*.

**Step 5. Write the results.** Each item gets its `costBreakdown` and `cost`, with `provisional: true` until the job is closed.
- Rework items (J3) get their starting cost plus their share.
- **Sold items are never rewritten** (P8, I9). Any difference becomes a *Variance* row.

**What the job shows:** Estimate vs. Actual per bucket; Total cost; cost per finished piece; loss & variance; and, for a customer order, the revenue from its invoice and the margin.

**Close (L2):** freeze the costs, set `provisional: false`, and block new rows unless the job is reopened (L3).
**Cancel (L4):**
1. Reverse all `StockConsumption` rows: the material goes back to inventory.
2. Post the remaining service cost as `Loss`.
3. Any products already generated are scrapped.

---

## 6. UI plan

| Screen | Contents |
|---|---|
| **Nav: "Jewelry" group** | **Job Orders** (`/jobs`). |
| **Job Order list** | Number, type, title, customer, status, # invoices, # products (finished / planned), cost so far vs. estimate (cost-permission only), target date. Filters by status, type and customer. Button: **New Job Order** (choose type: Production / Customer order / Rework). |
| **Job detail**: full page with tabs (there is too much for a side panel) | **Overview:** status, estimate vs. actual per bucket, total, loss/variance, Close / Cancel / Reopen. <br>**Invoices & costs:** one combined ledger list (invoice lines, stock used, internal costs, returns, losses), with source badges. Buttons: **Add invoice**, **Scan invoice (AI)**, **Add internal cost**. <br>**Materials:** **Add from inventory** (pick a stone, or "x ct from lot"), **Return leftover to stock**, **Mark broken/lost**, plus the customer-supplied materials list. <br>**Products:** plan rows → **Generate n**; per-piece weight, stones, cost, status; **Finish**, **Scrap**; *Rework* jobs show the brought-in items instead. **Invoice customer** (customer orders). <br>**Files** · **Activity** |
| **Add invoice dialog** (shared by the job, the AI scan and editing from the PO list) | Document type (Invoice / Credit note → pick the original), vendor (pick or create inline), invoice #, date, currency. Lines: type / bucket / description / qty / unit / price / **destination** (this job · another job · stock · a specific product or design). Charges: shipping / insurance / duty / other / discount. Tax + "recoverable" toggle. Total, with a live check that it matches. |
| **Purchase Orders list** | Unchanged for normal POs. Adds **Job(s)** and **Vendor invoice #** columns, a document-type badge (PO / Invoice / Credit note), and filters for job and type. An invoice split over several jobs shows once, listing all of them (O2). |
| **PO detail** | Banner: "Vendor invoice #A-778 · lines on JO-0001, JO-0004". Each line shows its destination. Edit opens the Add invoice dialog. |
| **Item detail** | Job link(s) (the production job plus any rework jobs), cost breakdown by bucket, and a provisional/final badge. |
| **Reports** | Job cost vs. estimate; cost per piece; loss & variance; vendor spend by job; open jobs ageing; customer-order margin. |
| **Settings** | Purchase tax recoverable (default on), default overhead %, default allocation method, job number format. |
| **RBAC** | `jobs` module: view / create / edit / delete / approve (close, reopen) / cancel, plus a new **viewCost** action (L6). Generating products also needs `inventory.create`. |

Memo, invoice and payment flows for finished products are unchanged.

---

## 7. AI invoice scanning

### 7.1 Architecture: a backend is required

The browser cannot hold the Anthropic API key (anyone could read it from the bundle). The smallest working setup:

```
Browser (React)                       Serverless function (e.g. Vercel /api/scan-invoice)
──────────────                        ───────────────────────────────────────────────
upload PDF/JPG/PNG/HEIC  ──POST──▶    checks the user/session, file type and size (≤ 20 MB)
                                      calls the Claude Messages API:
                                        • PDF → document block, image → image block
                                        • structured output (JSON schema, §7.2)
                         ◀──JSON──    returns the extraction (+ token usage)
match vendor / job / duplicates
review screen → user confirms
create vendor + PO (+ bill) via the existing APIs
```

The function is **stateless**: it only turns a file into JSON. All matching and saving stays in the browser and its existing stores, so this works before the real backend exists and moves across unchanged when it does. Hosting depends on where the app is deployed (Q11).

**Model and API details:**
- Model: `claude-opus-5-5`, the current default; strongest at reading messy scanned invoices and handwriting.
- PDFs are sent natively as a `document` content block (up to 600 pages / 32 MB). Photos are sent as `image` blocks.
- Use **structured outputs** (`output_config.format` with a JSON schema) so the response always parses against the schema.
- Turn on the server-side refusal fallback (`fallbacks: "default"`). Check `stop_reason` before reading the result.
- Rough cost: a 1–3 page invoice is about 5–10k input tokens plus about 1–2k output tokens, so **about $0.03–$0.08 per invoice**. A cheaper model (Sonnet/Haiku) is an option once an accuracy test set exists; that is the user's call.

### 7.2 Extraction schema (first draft)

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
  "totals":   { "subtotal": 0, "tax": 0, "shipping": 0, "insurance": 0, "duty": 0, "otherCharges": 0, "discount": 0, "total": 0 },
  "warnings": [""]   // e.g. "line 3 amount unreadable", "handwritten correction on total"
}
```

### 7.3 Review flow ("smart, but always confirmed")

1. **Upload** from the Job Order's **Invoices** tab (**Scan invoice (AI)**), so the job is already known. Multiple files can be queued, one per invoice.
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
6. **Destination.** Lines default to the job the user is on. The user can send individual lines to another job or to stock (I2/I3), e.g. a melee parcel on the same invoice. If the vendor printed a different job/reference number, show it as a warning.
   - If the AI says the document is a **proforma/quotation**, offer "Save as job estimate" instead (I11). If it is a **credit note**, ask which invoice it reverses (I8).
7. **Commit**, in one go:
   1. Create the vendor if new.
   2. Save through the same path as a typed invoice: the PO is created with `documentType`, line destinations, `entryMethod: "AIScan"` and the invoice number/date. Job lines are marked received. It appears on every job it touches **and** in the PO list.
   3. Optionally create a Vendor Bill (Q10).
   4. `Stock` lines are left ready to receive through the existing *Receive* dialog, pre-filled with the extracted diamond attributes.

### 7.4 Keep a record of each scan

`InvoiceScan { id, fileName, uploadedAt, actor, model, rawExtraction, createdVendorId?, createdPoId?, undoneAt? }` serves three purposes:
- **Audit:** what the AI read vs. what the user saved.
- **Undo:** follows the `ImportBatch` pattern.
- **An accuracy test set:** every correction the user made is a labelled example, which is what makes it safe to tune prompts or switch models later.

### 7.5 Constraints to be aware of

- **File storage.** localStorage is limited to about 5 MB per site, so invoice PDFs and CAD files cannot be stored there. Short term: keep only the file name plus the extraction, or use IndexedDB on this device only. Proper fix: object storage with the backend (blueprint §34.2).
- **Privacy.** Invoices contain vendor pricing and are sent to the Anthropic API. This should be mentioned in the tenant's settings or terms.
- **Not auto-posting.** Even at high confidence, the first versions should always show the review screen. Removing that step later is a product decision, best made with accuracy data from §7.4.

---

## 8. Delivery phases

| Phase | Scope | Scenarios covered |
|---|---|---|
| **1. Job Orders + invoices (typed)** | `JobOrder` store/API/screens (Overview, Invoices & costs, Files, Activity); Jewelry nav; `jobs` RBAC incl. viewCost. **Add invoice** dialog → PO with `documentType`, line `destination` (multi-job), charges, tax-recoverable, credit notes. Duplicate guard. PO list/detail changes. Internal cost entries. Estimate per bucket. Job cost ledger view + total in base currency. Vendor `taxId`; `jobCostTypes` master list; settings. | J1, J2 (no invoicing yet), I1–I8, I10, I11, I13, C1–C3, O1–O4 |
| **2. Materials** | Consume inventory into a job (UNIQUE stones; partial LOT by ct/pcs with `totalCarats`); return leftover to stock; broken/lost; customer-supplied materials; new item statuses (In production, Consumed, Lost, Scrapped). | M1–M5, M9, M10 |
| **3. Products & costing** | Product plans (separate pieces vs. quantity line), batch generation, finish/scrap, set code; rework jobs (bring existing items in); allocation engine `lib/job/allocation.ts` (direct → per design → pooled → scrap) with thorough unit tests; provisional/final; close, reopen, cancel, variance; "Invoice customer" from a job; reports. | J2, J3, P1–P8, P10, I9, L1–L4 |
| **4. AI invoice scan** | Serverless `/api/scan-invoice`; schema + prompt; **Scan invoice (AI)** pre-fills the Phase 1 dialog; vendor matching/auto-create; arithmetic checks; proforma → estimate, credit note detection; `InvoiceScan` history/undo. | Same scenarios as Phase 1, read from a file instead of typed. Can start once Phase 1 is done, in parallel with 2–3. |
| **5. Later** | Metal ledger (own gold issued to caster, returns, loss %, old gold); CAD/mould cost amortised per style; repair jobs for customer pieces; vendor bills & payments from invoices (if Q10 = yes, this moves into Phase 1); job merge/split. | M7, M8, P9, J4, I12, L5 |

### 8.1 Phase 1 — what was built

- **Job Orders** under a new *Jewelry* nav group (`/jobs`, `/jobs/:id`): create/edit (type, title, customer, target date, overhead %), status, delete-when-empty.
  - The job page has these tabs: **Costs** (ledger), **Invoices**, **Estimate vs actual** and **Activity**.
- **Add invoice** (`features/jobs/JobInvoiceDialog.tsx`), used from the job page and when editing from the PO list:
  - invoice or credit note, with an inline "new vendor" form
  - vendor invoice # and date, currency
  - each line: type, cost type, qty, unit, price, and **goes to** (any open job, or stock)
  - shipping / insurance / duty / other / discount, tax with a "can be claimed back" switch
  - an optional paper-total check, a live per-job cost preview, and a duplicate-invoice block
- **Saved as a PO** (`createJobInvoice` / `updateJobInvoice` / `deleteJobInvoice` in `lib/api/purchaseOrderApi.ts`).
  - The **Purchase Orders list** gains Document / Job(s) / Total columns and filters.
  - **PO detail** shows a "Charged to JO-…" banner, where each line goes, charges and tax, and edit/delete. *Receive* appears only on stock lines.
- **Internal costs** (hours × rate or a fixed amount) and **workshop overhead %**.
- **Costing** (`lib/job/costing.ts`):
  - The ledger is built on read; it is never stored.
  - Charges, and tax that can't be claimed back, are spread by value.
  - Credit notes are negative; cancelled documents are ignored.
  - Totals are in base currency at each document's captured rate.
- **Permissions:** new `jobs` module, plus a separate `jobCosts` module ("see cost & margin"). Roles without `jobCosts` see invoices but no amounts.
- **Settings → Job Orders:** default "purchase tax can be claimed back" and default overhead %.
- **Vendor tax ID** field.
- **Tests:** `lib/job/costing.test.ts` and `lib/api/jobOrderApi.test.ts`.

**Differences from the plan above:**
- Cost types are a **fixed list** (`COST_BUCKETS`) rather than a master list, because breakdowns and reports group by them.
- Cost visibility is a separate **`jobCosts` module** rather than a new `viewCost` action, which would have added a meaningless checkbox to every other module in the role editor.
- Line type `Stock` was renamed **`Goods`**, so it isn't confused with the *Stock* destination.
- Not in Phase 1:
  - **Closed** status and freezing product costs (Phase 3)
  - a **Files** tab (needs real file storage, §7.5)

### 8.2 Phase 2 — what was built

- **Materials tab** on the job (`features/jobs/JobMaterialsTab.tsx`, `MaterialDialogs.tsx`), with the logic in `lib/api/jobMaterialsApi.ts` and the pure maths in `lib/job/materials.ts`. It covers:
  - **Use from stock (M1, M2, M3, M10).**
    - A whole stone becomes *Consumed* (new status). It keeps its own cost, and that cost goes to the job.
    - For a parcel, you take carats and/or pieces. The cost is priced by the carat when the parcel has a weight, otherwise by pieces. The parcel's carats, pieces and cost go down, and it becomes *Consumed* when emptied.
    - Only available stock you own can be used. Consigned stones are refused.
  - **Return to stock (M4).** All or part of what was taken goes back at the rate it was taken, never more than is still out.
  - **Mark lost (M9).** A whole stone becomes *Lost* (new status). Its cost stays on the job and the cost list labels it "lost in production".
  - **Leftover to stock (M4).** Material bought straight onto a job that wasn't all used becomes a **new stock parcel**, and its value comes off the job. The value can't exceed what the job has cost.
  - **Customer's material (M5).** Records what the customer handed over, at no cost: kind, quantity, certificate, declared value. Status: held → used in the piece / returned to customer.
- **Item history:** every move writes the inventory item's history (`PRODUCTION_CONSUMPTION` / `TRANSFER`) and the job's cost list. A consumed or lost item links back to its job.
- **Inventory:** the status filter gains *Consumed into a job* and *Lost*. Memo and invoice already only offer *Available* stock.
- **Cancelling a job** is refused while it still holds stock, or while the customer's material is still held. This is part of L4; returning stock automatically on cancel comes with Phase 3.
- **Demo data:** melee parcel D-1125 (3.00 ct / 220 pcs, $1,950); a customer stone on JO-0002.
- **Tests:** `lib/api/jobMaterialsApi.test.ts`.

---

## 9. Open questions (please answer before Phase 1)

The scenarios turn the earlier questions into concrete decisions. Recommended answers are in **bold**.

1. **Certified stones for a job:** received into inventory and then consumed into the product (**recommended**, keeps the certificate traceable), or charged to the job only? (M1)
2. **Melee:** do you keep melee as stock parcels and take carats from them per job (M3), or buy melee per job? (Affects how much of Phase 2 is needed early.)
3. **Customer orders:** do you take customer orders with deposits (J2)? Do customers ever supply their own stone or gold (M5)?
4. **Rework:** do you remake or upgrade pieces already in stock (J3)? Is repairing customers' own pieces (J4) needed soon?
5. **Gold:** does the caster supply and bill the gold (**assumed**), or do you give the caster your own gold and need gram-level tracking with loss % (M7)? This decides whether the metal ledger moves up from Phase 5.
6. **In-house workers:** do you have your own setters/polishers whose wages should go into job cost (C1)? Hours × rate, or a fixed amount per job?
7. **Tax:** is purchase tax (GST/VAT) recoverable for you, so it is **excluded from product cost** (I6)?
8. **Default cost split** for metal/casting/labour: **by actual metal weight**, equal per piece, or manual %? When a piece is scrapped: **spread its cost over the good pieces**, or write it off?
9. **Identical pieces (P1):** separate stock numbers per piece, one stock line with quantity, or let the user choose per design (**recommended**)?
10. **Invoices = also money owed?** Should each job invoice also create a Vendor Bill so unpaid balances per vendor are tracked (I12)? If yes, it moves into Phase 1.
11. **Hosting and API key** for the AI scan (where the app is deployed; who provides the Anthropic API key).
12. **Number format:** `JO-0001`, `JB-0001` (the mock data says "job bag JB-0410"), or configurable?
13. **Earrings:** one pair = one product (**assumed**)?
