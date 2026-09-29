import { createInvoice, type InvoicePayload } from "@/lib/api/invoiceApi";
import { recordPayment } from "@/lib/api/paymentApi";
import { notifyDataChanged, subscribeDataChanged } from "@/lib/store/changes";
import { installMemoryStorage } from "@/test/memoryStorage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** vitest runs in node: give the notifier a window that is just an event target. */
function installWindow() {
  (globalThis as { window?: unknown }).window = new EventTarget();
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Mirrors the browser's StorageEvent closely enough for the listener, which only reads `key`. */
const storageEvent = (key: string | null) => Object.assign(new Event("storage"), { key });

describe("data change notifications", () => {
  beforeEach(() => {
    installMemoryStorage();
    installWindow();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("tells subscribers when data changes", async () => {
    let calls = 0;
    subscribeDataChanged(() => calls++);
    notifyDataChanged();
    await flush();
    expect(calls).toBe(1);
  });

  it("coalesces writes in the same task into one refresh", async () => {
    let calls = 0;
    subscribeDataChanged(() => calls++);
    notifyDataChanged();
    notifyDataChanged();
    notifyDataChanged();
    await flush();
    expect(calls).toBe(1);
  });

  it("notifies again for a later, separate change", async () => {
    let calls = 0;
    subscribeDataChanged(() => calls++);
    notifyDataChanged();
    await flush();
    notifyDataChanged();
    await flush();
    expect(calls).toBe(2);
  });

  it("stops notifying after unsubscribe", async () => {
    let calls = 0;
    const unsubscribe = subscribeDataChanged(() => calls++);
    unsubscribe();
    notifyDataChanged();
    await flush();
    expect(calls).toBe(0);
  });

  it("refreshes for another tab's writes to app data, and ignores unrelated keys", () => {
    let calls = 0;
    subscribeDataChanged(() => calls++);
    window.dispatchEvent(storageEvent("octagem.invoices.local"));
    window.dispatchEvent(storageEvent("someOtherApp.state"));
    window.dispatchEvent(storageEvent(null)); // another tab cleared storage
    expect(calls).toBe(2);
  });

  it("fires when a payment is recorded — the case a list behind an invoice panel was missing", async () => {
    const payload: InvoicePayload = {
      customerId: "C-2001",
      salesperson: "Jordan Miller",
      currency: "USD",
      lines: [{ description: "Repair", quantity: 1, unitPrice: 500 }],
    };
    const invoice = await createInvoice(payload, { issue: true });
    await flush();

    let calls = 0;
    subscribeDataChanged(() => calls++);
    // Writes both the payment store and the invoice store — one refresh, not two.
    await recordPayment({ invoiceId: invoice.id, method: "Cash", amount: 100, reference: "" });
    await flush();
    expect(calls).toBe(1);
  });

  it("is a no-op without a window, so store code stays usable outside the browser", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => notifyDataChanged()).not.toThrow();
  });
});
