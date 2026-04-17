/**
 * Decimaltal från formulärfält eller serialiserad sträng (Safari / svenska tangentbord: komma som decimaltecken).
 * @param {unknown} value
 * @returns {number}
 */
export function parseLocaleDecimalNumber(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let s = String(value)
    .trim()
    .replace(/\u00a0|\u202f|\u2007/g, " ")
    .replace(/\s/g, "");
  if (!s) return 0;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    const lastC = s.lastIndexOf(",");
    const lastD = s.lastIndexOf(".");
    if (lastC > lastD) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Räntesats i procent (tillåter %-suffix).
 * @param {unknown} value
 * @returns {number}
 */
export function parseRatePercent(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return parseLocaleDecimalNumber(String(value).replace(/%/g, ""));
}
