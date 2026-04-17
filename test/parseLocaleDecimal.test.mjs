import { describe, it, expect } from "vitest";
import { parseLocaleDecimalNumber, parseRatePercent } from "../lib/parseLocaleDecimal.js";

describe("parseLocaleDecimalNumber (iOS Safari / svenska decimaler)", () => {
  it("tolkar komma som decimal", () => {
    expect(parseLocaleDecimalNumber("3,5")).toBe(3.5);
    expect(parseLocaleDecimalNumber("0,25")).toBe(0.25);
  });

  it("tolkar punkt som decimal", () => {
    expect(parseLocaleDecimalNumber("3.5")).toBe(3.5);
  });

  it("hanterar EU-stil tusenpunkt + decimalkomma", () => {
    expect(parseLocaleDecimalNumber("1.234,56")).toBe(1234.56);
  });

  it("hanterar US-stil decimalkomma som tusen (sista separatorn avgör)", () => {
    expect(parseLocaleDecimalNumber("1,234.56")).toBe(1234.56);
  });

  it("strippar smala mellanslag (t.ex. från bankformat)", () => {
    expect(parseLocaleDecimalNumber("1\u202f234")).toBe(1234);
    expect(parseLocaleDecimalNumber("1\u00a0234")).toBe(1234);
  });

  it("lämnar number oförändrat", () => {
    expect(parseLocaleDecimalNumber(12.5)).toBe(12.5);
  });

  it("tomt ogiltigt → 0", () => {
    expect(parseLocaleDecimalNumber("")).toBe(0);
    expect(parseLocaleDecimalNumber(null)).toBe(0);
    expect(parseLocaleDecimalNumber("x")).toBe(0);
  });
});

describe("parseRatePercent", () => {
  it("samma som decimal + %-suffix", () => {
    expect(parseRatePercent("3,25%")).toBe(3.25);
    expect(parseRatePercent("4.1 %")).toBe(4.1);
  });

  it("number passthrough", () => {
    expect(parseRatePercent(2.5)).toBe(2.5);
  });
});
