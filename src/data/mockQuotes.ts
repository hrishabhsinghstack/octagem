import type { Quote } from "@/types/quote";
import { daysFromToday } from "@/lib/memo";

const line = (quoteId: string, itemId: string, priceBasis: string, lineTotal: number): Quote["lines"][number] => ({
  id: `${quoteId}-L1`,
  itemId,
  priceBasis,
  quantity: 1,
  lineTotal,
});

export const mockQuotes: Quote[] = [
  {
    id: "Q-4001",
    customerId: "C-2001",
    lines: [line("Q-4001", "D-1103", "Laboratory-grown, no Rap reference", 6800)],
    salesperson: "Devesh Rao",
    notes: "Customer asked for a lab-grown alternative to a 2ct natural.",
    issuedAt: "2026-09-15",
    expiresAt: daysFromToday(10),
    status: "Open",
    currency: "USD",
    fxRateToBase: 1,
  },
  {
    id: "Q-4002",
    customerId: "C-2005",
    lines: [line("Q-4002", "D-1042", "25% off Rap · $9,500/ct", 8100)],
    salesperson: "Priya Nair",
    notes: "",
    issuedAt: "2026-09-05",
    expiresAt: daysFromToday(-2),
    status: "Open",
    currency: "USD",
    fxRateToBase: 1,
  },
];
