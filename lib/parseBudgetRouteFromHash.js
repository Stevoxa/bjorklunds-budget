/**
 * Ren hash-parsing för SPA-routing (ingen `location`-sidoeffekt).
 * @param {string} hashInput - t.ex. `location.hash` inkl. `#`
 * @returns {{ route: string, incomeOverlay: string | null, helpSection: string | null }}
 */
export function parseBudgetRouteFromHash(hashInput) {
  const h = String(hashInput || "#/analysis").trim();
  if (!h.startsWith("#/")) {
    return { route: "analysis", incomeOverlay: null, helpSection: null };
  }
  const raw = h.slice(2).trim();
  const qMark = raw.indexOf("?");
  const pathPart = (qMark >= 0 ? raw.slice(0, qMark) : raw).trim();
  const queryRaw = qMark >= 0 ? raw.slice(qMark + 1) : "";
  let helpSection = null;
  try {
    const cand = (new URLSearchParams(queryRaw).get("section") || "").trim();
    if (cand === "help-pwa-home-screen") helpSection = cand;
  } catch {
    /* ignore */
  }
  const segments = pathPart.split("/").filter(Boolean);
  let route = segments[0] || "analysis";
  if (route === "overview" || route === "old-analysis") route = "analysis";
  if (route === "help") {
    route = "settingsHelp";
  } else if (route === "settings" && segments[1]) {
    const s1 = String(segments[1]).toLowerCase();
    if (s1 === "advanced") route = "settingsAdvanced";
    else if (s1 === "help") route = "settingsHelp";
    else route = "settings";
  }
  let incomeOverlay = null;
  if (route === "incomes" && segments[1]) {
    const s1 = String(segments[1]).toLowerCase();
    if (s1 === "salary") incomeOverlay = "salary";
    else if (s1 === "benefit") incomeOverlay = "benefit";
    else if (s1 === "capital") incomeOverlay = "capital";
    else if (s1 === "gift") incomeOverlay = "gift";
  }
  return { route, incomeOverlay, helpSection };
}
