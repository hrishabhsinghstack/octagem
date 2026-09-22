import type { MemoInRecord } from "@/types/memoIn";

export const mockMemoIn: MemoInRecord[] = [
  {
    id: "MI-7001",
    vendorId: "V-1001",
    counterparty: "Continental Diamond Supply",
    contact: "Robert Klein",
    phone: "(212) 555-0210",
    vendorRef: "CDS-CON-4471",
    salesperson: "Priya Nair",
    issuedAt: "2026-09-15",
    dueDate: "2026-11-15",
    status: "Partially received",
    notes: "Two round brilliants on consignment, net price if sold.",
    lines: [
      {
        id: "MI-7001-L1",
        description: "Round brilliant, G/VS2, GIA — consignment",
        category: "Diamond",
        expectedQty: 2,
        priceBasis: "$5,800 net if sold",
        receivedQty: 1,
        receivedItemIds: ["D-1150"],
      },
    ],
  },
];
