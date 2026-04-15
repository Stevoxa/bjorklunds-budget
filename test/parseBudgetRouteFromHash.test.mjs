import { describe, it, expect } from "vitest";
import { parseBudgetRouteFromHash } from "../lib/parseBudgetRouteFromHash.js";

describe("parseBudgetRouteFromHash", () => {
  it("defaultar till analysis", () => {
    expect(parseBudgetRouteFromHash("")).toEqual({
      route: "analysis",
      incomeOverlay: null,
      helpSection: null
    });
    expect(parseBudgetRouteFromHash("#/")).toEqual({
      route: "analysis",
      incomeOverlay: null,
      helpSection: null
    });
  });

  it("mappar settings/help och section", () => {
    expect(parseBudgetRouteFromHash("#/settings/help?section=help-pwa-home-screen")).toEqual({
      route: "settingsHelp",
      incomeOverlay: null,
      helpSection: "help-pwa-home-screen"
    });
  });

  it("ignorerar okänd section", () => {
    expect(parseBudgetRouteFromHash("#/settings/help?section=other")).toEqual({
      route: "settingsHelp",
      incomeOverlay: null,
      helpSection: null
    });
  });

  it("mappar intäktsöverlägg", () => {
    expect(parseBudgetRouteFromHash("#/incomes/benefit")).toEqual({
      route: "incomes",
      incomeOverlay: "benefit",
      helpSection: null
    });
  });
});
