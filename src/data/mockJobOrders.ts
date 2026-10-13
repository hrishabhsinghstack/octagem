import type { JobOrder } from "@/types/jobOrder";

export const mockJobOrders: JobOrder[] = [
  {
    id: "JO-0001",
    type: "Production",
    title: "Halo ring collection — 5 pieces",
    status: "In production",
    openedAt: "2026-09-15",
    targetDate: "2026-10-31",
    notes: "Five 18K white gold halo rings for stock, 1.3mm melee halos.",
    estimate: { Stones: 1600, Metal: 2000, Casting: 200, CAD: 300, Setting: 400 },
    overheadPct: 0,
    costEntries: [
      {
        id: "JC-seed-1",
        occurredAt: "2026-10-06",
        source: "Internal",
        bucket: "Setting",
        description: "In-house setting, halo rings",
        amountBase: 375,
        hours: 15,
        ratePerHour: 25,
        actor: "Workshop — R. Fields",
      },
    ],
    activity: [{ id: "JA-seed-1", occurredAt: "2026-09-15", actor: "Jordan Miller", note: "Job order opened." }],
  },
  {
    id: "JO-0002",
    type: "CustomerOrder",
    title: "Custom pendant — Sterling & Co.",
    customerId: "C-2001",
    status: "Open",
    openedAt: "2026-09-25",
    targetDate: "2026-11-15",
    notes: "Customer-approved CAD, 18K yellow gold.",
    estimate: {},
    overheadPct: 0,
    costEntries: [],
    activity: [{ id: "JA-seed-2", occurredAt: "2026-09-25", actor: "Jordan Miller", note: "Job order opened." }],
  },
];
