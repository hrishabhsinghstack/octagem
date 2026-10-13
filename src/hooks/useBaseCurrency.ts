import { getBusinessProfile } from "@/lib/api/settingsApi";
import { useEffect, useState } from "react";

/** The tenant's base currency (Settings → Business) — what cross-currency totals such as job cost are shown in. */
export function useBaseCurrency(): string {
  const [currency, setCurrency] = useState("USD");
  useEffect(() => {
    getBusinessProfile().then((profile) => setCurrency(profile.currency || "USD"));
  }, []);
  return currency;
}
