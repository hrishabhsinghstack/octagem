/**
 * A single "business data changed" signal, raised by every transactional store when it writes.
 *
 * List pages stay mounted behind their detail panels, and a panel action rarely touches one store:
 * recording a payment writes payments *and* the invoice, issuing an invoice writes inventory, converting
 * a memo writes memos, invoices and inventory. No list can know which panel actions concern it, so
 * instead of wiring callbacks through every route, each list re-reads whenever anything changed.
 *
 * Deliberately coarse: there is no per-store channel, because the reads are local and cheap and a missed
 * refresh is a stale-screen bug where an extra one costs nothing. When `lib/api/*` moves to HTTP this
 * becomes query invalidation; the list pages only depend on `useDataRefresh`, not on this file.
 */

const EVENT = "octagem:data-changed";

let pending = false;

/**
 * Called from each store's write. Coalesced into one event per task, so a payment that writes two stores
 * refreshes a list once, not twice.
 */
export function notifyDataChanged() {
  if (typeof window === "undefined" || pending) return;
  pending = true;
  queueMicrotask(() => {
    pending = false;
    window.dispatchEvent(new Event(EVENT));
  });
}

/** Subscribes to changes from this tab and — via the `storage` event — from other open tabs. */
export function subscribeDataChanged(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    // A null key means another tab called localStorage.clear().
    if (event.key === null || event.key.startsWith("octagem.")) listener();
  };
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
