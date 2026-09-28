import { describe, expect, it } from "vitest";
import { formatStockNumber, nextStockNumber } from "@/lib/inventory/stockNumber";

const diamond = { stockPrefix: "D-", stockPadding: 0, stockStartNumber: 1001 };

describe("nextStockNumber", () => {
  it("starts at the category's start number when nothing uses the prefix", () => {
    expect(nextStockNumber(diamond, ["J-2031", "W-3010"])).toBe("D-1001");
  });

  it("continues after the highest existing number, not the count", () => {
    expect(nextStockNumber(diamond, ["D-1042", "D-1150", "D-1077"])).toBe("D-1151");
  });

  it("ignores codes that only look similar", () => {
    expect(nextStockNumber(diamond, ["D-1500-COPY", "DX-9000", "d-1200"])).toBe("D-1201");
  });

  it("pads to the configured width", () => {
    expect(nextStockNumber({ stockPrefix: "SLV-", stockPadding: 5, stockStartNumber: 1 }, [])).toBe("SLV-00001");
    expect(nextStockNumber({ stockPrefix: "SLV-", stockPadding: 5, stockStartNumber: 1 }, ["SLV-00041"])).toBe("SLV-00042");
  });

  it("treats regex characters in a prefix literally", () => {
    expect(nextStockNumber({ stockPrefix: "G.", stockPadding: 0, stockStartNumber: 1 }, ["GX5", "G.7"])).toBe("G.8");
  });
});

describe("formatStockNumber", () => {
  it("upper-cases the prefix", () => {
    expect(formatStockNumber({ stockPrefix: "rg-", stockPadding: 3 }, 7)).toBe("RG-007");
  });
});
