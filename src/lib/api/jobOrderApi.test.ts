import { addInternalCost, createJobOrder, deleteJobOrder, getJobOrder, setJobStatus } from "@/lib/api/jobOrderApi";
import { createJobInvoice, deleteJobInvoice, DuplicateInvoiceError, getPurchaseOrder, listPurchaseOrders, recordLineReceipt, updateJobInvoice, type JobInvoicePayload } from "@/lib/api/purchaseOrderApi";
import { buildJobLedger, summarizeJobCost } from "@/lib/job/costing";
import { installMemoryStorage } from "@/test/memoryStorage";
import { NO_CHARGES } from "@/types/purchaseOrder";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  installMemoryStorage();
});

const newJob = (title = "Test job") => createJobOrder({ type: "Production", title, notes: "", overheadPct: 0 });

const payload = (jobId: string, extra: Partial<JobInvoicePayload> = {}): JobInvoicePayload => ({
  documentType: "VendorInvoice",
  vendorId: "V-1002",
  vendorInvoiceNumber: "T-100",
  vendorInvoiceDate: "2026-10-10",
  currency: "USD",
  charges: { ...NO_CHARGES },
  tax: { amount: 0, recoverable: true },
  notes: "",
  lines: [{ description: "Casting", lineType: "Service", bucket: "Casting", unit: "pcs", expectedQty: 4, expectedCost: 50, destination: { kind: "Job", jobId } }],
  ...extra,
});

async function jobTotal(jobId: string) {
  const job = (await getJobOrder(jobId))!;
  return summarizeJobCost(buildJobLedger(job, await listPurchaseOrders()), job.estimate).total;
}

describe("job orders", () => {
  it("numbers jobs JO-0001 onward after the seeded ones", async () => {
    const job = await newJob();
    expect(job.id).toBe("JO-0003");
    expect(job.status).toBe("Open");
  });

  it("requires a customer on a customer order", async () => {
    await expect(createJobOrder({ type: "CustomerOrder", title: "Ring", notes: "", overheadPct: 0 })).rejects.toThrow(/customer/);
  });

  it("records internal costs by hours × rate", async () => {
    const job = await newJob();
    await addInternalCost(job.id, { occurredAt: "2026-10-11", bucket: "Setting", description: "Setter", hours: 6, ratePerHour: 25 });
    expect(await jobTotal(job.id)).toBe(150);
  });

  it("refuses new costs on a cancelled job and refuses to delete a job with costs", async () => {
    const job = await newJob();
    await addInternalCost(job.id, { occurredAt: "2026-10-11", bucket: "Labour", description: "Polish", amountBase: 40 });
    await expect(deleteJobOrder(job.id)).rejects.toThrow(/Cancel it/);
    await setJobStatus(job.id, "Cancelled");
    await expect(addInternalCost(job.id, { occurredAt: "2026-10-11", bucket: "Labour", description: "More", amountBase: 40 })).rejects.toThrow(/cancelled/);
  });
});

describe("job invoices", () => {
  it("stores the invoice as a received purchase order that shows in the PO list and on the job", async () => {
    const job = await newJob();
    const order = await createJobInvoice(payload(job.id));
    expect(order).toMatchObject({ documentType: "VendorInvoice", status: "Received", vendorInvoiceNumber: "T-100" });
    expect((await listPurchaseOrders()).some((o) => o.id === order.id)).toBe(true);
    expect(await jobTotal(job.id)).toBe(200);
    expect((await getJobOrder(job.id))!.activity[0].note).toMatch(/Invoice T-100 .* added/);
  });

  it("splits one invoice across two jobs", async () => {
    const a = await newJob("A");
    const b = await newJob("B");
    await createJobInvoice(
      payload(a.id, {
        lines: [
          { description: "Cast A", lineType: "Service", bucket: "Casting", unit: "pcs", expectedQty: 1, expectedCost: 100, destination: { kind: "Job", jobId: a.id } },
          { description: "Cast B", lineType: "Service", bucket: "Casting", unit: "pcs", expectedQty: 1, expectedCost: 300, destination: { kind: "Job", jobId: b.id } },
        ],
        charges: { ...NO_CHARGES, shipping: 40 },
      }),
    );
    expect(await jobTotal(a.id)).toBe(110);
    expect(await jobTotal(b.id)).toBe(330);
  });

  it("blocks the same vendor invoice number twice", async () => {
    const job = await newJob();
    await createJobInvoice(payload(job.id));
    await expect(createJobInvoice(payload(job.id, { vendorInvoiceNumber: "t 100" }))).rejects.toBeInstanceOf(DuplicateInvoiceError);
  });

  it("reduces the job cost with a credit note", async () => {
    const job = await newJob();
    const original = await createJobInvoice(payload(job.id));
    await createJobInvoice(
      payload(job.id, {
        documentType: "CreditNote",
        vendorInvoiceNumber: "CN-1",
        creditForPoId: original.id,
        lines: [{ description: "Bad casting", lineType: "Service", bucket: "Casting", unit: "pcs", expectedQty: 1, expectedCost: 50, destination: { kind: "Job", jobId: job.id } }],
      }),
    );
    expect(await jobTotal(job.id)).toBe(150);
  });

  it("refuses lines for a cancelled job", async () => {
    const job = await newJob();
    await setJobStatus(job.id, "Cancelled");
    await expect(createJobInvoice(payload(job.id))).rejects.toThrow(/cancelled/);
  });

  it("leaves stock lines to be received, and protects them once received", async () => {
    const job = await newJob();
    const order = await createJobInvoice(
      payload(job.id, {
        lines: [
          { description: "Setting", lineType: "Service", bucket: "Setting", unit: "pcs", expectedQty: 1, expectedCost: 100, destination: { kind: "Job", jobId: job.id } },
          { description: "Melee parcel", lineType: "Goods", category: "Diamond", unit: "pcs", expectedQty: 1, expectedCost: 900, destination: { kind: "Stock" } },
        ],
      }),
    );
    expect(order.status).toBe("Partially received");
    const stockLine = order.lines[1];
    await recordLineReceipt(order.id, stockLine.id, "D-9999");
    expect((await getPurchaseOrder(order.id))!.status).toBe("Received");

    const edited = payload(job.id, {
      lines: [{ id: stockLine.id, description: "Melee parcel", lineType: "Goods", unit: "pcs", expectedQty: 1, expectedCost: 900, destination: { kind: "Job", jobId: job.id } }],
    });
    await expect(updateJobInvoice(order.id, edited)).rejects.toThrow(/received into stock/);
    await expect(deleteJobInvoice(order.id)).rejects.toThrow(/can't be deleted/);
  });

  it("moves a line to another job on edit and logs it on both", async () => {
    const a = await newJob("A");
    const b = await newJob("B");
    const order = await createJobInvoice(payload(a.id));
    const line = order.lines[0];
    await updateJobInvoice(order.id, payload(a.id, { lines: [{ ...line, destination: { kind: "Job", jobId: b.id } }] }));
    expect(await jobTotal(a.id)).toBe(0);
    expect(await jobTotal(b.id)).toBe(200);
    expect((await getJobOrder(a.id))!.activity[0].note).toMatch(/edited/);
    expect((await getJobOrder(b.id))!.activity[0].note).toMatch(/edited/);
  });
});
