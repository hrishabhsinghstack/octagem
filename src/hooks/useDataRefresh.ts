import { subscribeDataChanged } from "@/lib/store/changes";
import { useEffect, useRef } from "react";

/**
 * Loads once on mount, then again whenever business data changes — including from the detail panel
 * rendered over the page, or from another tab. Replaces `useEffect(refresh, [])` on list pages, which
 * left a list showing an invoice as Open after it had been paid in the panel on top of it.
 *
 * `load` may be a fresh closure on every render; the latest one is always the one called.
 */
export function useDataRefresh(load: () => void) {
  const latest = useRef(load);
  latest.current = load;

  useEffect(() => {
    latest.current();
    return subscribeDataChanged(() => latest.current());
  }, []);
}
