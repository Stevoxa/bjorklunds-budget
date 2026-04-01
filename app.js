/* Björklunds - Budget (SPA/PWA)
   All data sparas lokalt i webstorage (localStorage). */

const STORAGE_KEY = "bjorklunds_budget_v1";

const WEEKS_PER_MONTH = 4.33;
const nowMs = () => Date.now();
const pad2 = (n) => String(n).padStart(2, "0");
const DEBUG = true;

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Mars",
  "April",
  "Maj",
  "Juni",
  "Juli",
  "Augusti",
  "September",
  "Oktober",
  "November",
  "December"
];

function monthName(monthIndex1to12) {
  return MONTH_NAMES[monthIndex1to12 - 1] ?? "";
}

function monthKey(monthIndex1to12) {
  return pad2(monthIndex1to12);
}

function formatKr(value) {
  // Whole kr only, with space as thousands separator.
  // Example: 99000 -> "99 000kr" (no space before "kr").
  const n = Math.round(Number(value) || 0);
  return `${n.toLocaleString("sv-SE")}kr`;
}

/** Listrads-chevron (tunn stroke, rundade ändar), vanlig i appar med tydliga listrader. */
const LIST_ROW_CHEVRON_SVG =
  '<svg class="list-row-chevron-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true"><path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function daysInMonth(year, month1to12) {
  const y = Number(year);
  const m = Number(month1to12);
  return new Date(y, m, 0).getDate();
}

function clampDay(year, month1to12, day) {
  const d = Math.max(1, Math.floor(asNumber(day)));
  return Math.min(d, daysInMonth(year, month1to12));
}

function isoDateFromParts(year, month1to12, day) {
  const y = Number(year);
  const m = Number(month1to12);
  const dd = clampDay(y, m, day);
  return `${y}-${pad2(m)}-${pad2(dd)}`;
}

function datePartsFromIso(iso) {
  if (!iso || typeof iso !== "string") return null;
  // Expect YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12) return null;
  return { y, m: mo, d: clampDay(y, mo, d) };
}

function setYear3Options(selectEl, selectedYear) {
  const cur = currentYearMonth().year;
  const years = [cur - 1, cur, cur + 1];
  selectEl.innerHTML = "";
  for (const y of years) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = String(y);
    if (Number(selectedYear) === y) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

/** Kalenderår som appen använder i årväljare (mat m.m.): föregående, nuvarande, nästa. */
function getSelectableAppYears() {
  const cur = currentYearMonth().year;
  return [cur - 1, cur, cur + 1];
}

/** Sista dag för öppet slut på växelvis inom appens datumfönster (samma som högsta valbara år). */
function getFoodTillsVidareCapYear() {
  const ys = getSelectableAppYears();
  return ys[ys.length - 1];
}

function getFoodDateInputMinIso() {
  const ys = getSelectableAppYears();
  return `${ys[0]}-01-01`;
}

function getFoodDateInputMaxIso() {
  const y = getFoodTillsVidareCapYear();
  return `${y}-12-31`;
}

function applyFoodOverlayDateBounds() {
  const min = getFoodDateInputMinIso();
  const max = getFoodDateInputMaxIso();
  document.querySelectorAll('[data-expview="food"] input[type="date"]').forEach((inp) => {
    inp.min = min;
    inp.max = max;
  });
  refreshAllDateFieldRows();
}

function isGeneratedMatExpenseInSelectableWindow(exp) {
  if (!isMatLikeExpense(exp)) return false;
  const years = getSelectableAppYears();
  const fy = Number(exp.metadata?.food?.year);
  if (Number.isFinite(fy)) return years.includes(fy);
  const iso = exp.metadata?.food?.planningDate || exp?.payments?.[0]?.date;
  if (!iso || typeof iso !== "string" || iso.length < 4) return false;
  const py = Number(iso.slice(0, 4));
  return Number.isFinite(py) && years.includes(py);
}

function setDayOptions(selectEl, selectedDay) {
  selectEl.innerHTML = "";
  for (let d = 1; d <= 31; d++) {
    const opt = document.createElement("option");
    opt.value = String(d);
    opt.textContent = String(d);
    if (Number(selectedDay) === d) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function setDayOptionsForMonth(selectEl, year, month1to12, selectedDay) {
  const max = daysInMonth(year, month1to12);
  selectEl.innerHTML = "";
  for (let d = 1; d <= max; d++) {
    const opt = document.createElement("option");
    opt.value = String(d);
    opt.textContent = String(d);
    if (Number(selectedDay) === d) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function setMonthNumberOptions(selectEl, selectedMonth) {
  selectEl.innerHTML = "";
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement("option");
    opt.value = String(m);
    opt.textContent = String(m);
    if (Number(selectedMonth) === m) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function showDebugToast(message) {
  if (!DEBUG) return;
  const el = document.getElementById("debugToast");
  if (!el) return;
  el.hidden = false;
  el.textContent = String(message || "Okänt fel");
  el.classList.remove("debug-toast--success", "debug-toast--info");
  el.classList.add("debug-toast--error");
}

function requireEl(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Saknar element #${id} i DOM`);
  return el;
}

function hideErrorSummaryByEl(summaryEl) {
  if (!summaryEl) return;
  summaryEl.hidden = true;
  summaryEl.textContent = "";
}

function renderErrorSummary(summaryEl, errors) {
  if (!summaryEl) return;
  const list = Array.isArray(errors) ? errors.filter(Boolean) : [];
  if (list.length === 0) {
    hideErrorSummaryByEl(summaryEl);
    return;
  }

  const count = list.length;
  const unit = count === 1 ? "sak" : "saker";

  summaryEl.hidden = false;
  summaryEl.textContent = "";
  summaryEl.setAttribute("tabindex", "-1");

  const title = document.createElement("div");
  title.className = "bb-error-summary-title";
  title.textContent = `Du behöver åtgärda ${count} ${unit}`;
  summaryEl.appendChild(title);

  const ul = document.createElement("div");
  ul.className = "bb-error-summary-list";

  list.slice(0, 6).forEach((err) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bb-error-summary-item";

    const left = document.createElement("div");
    left.textContent = err.label || err.message || "Fel";

    const chev = document.createElement("span");
    chev.className = "bb-error-summary-item-chevron";
    chev.innerHTML = LIST_ROW_CHEVRON_SVG;

    btn.appendChild(left);
    btn.appendChild(chev);

    btn.onclick = () => {
      const jumpId = err.jumpId;
      const jumpSelector = err.jumpSelector;
      let preopenFoodKind = (() => {
        if (!jumpId) return null;
        if (jumpId.startsWith("foodCustody") || jumpId === "foodCustodyPeriodsList") return "custody";
        if (jumpId.startsWith("foodHh") || jumpId === "foodHouseholdChangesSection") return "household";
        if (jumpId.startsWith("foodDev") || jumpId === "foodDeviationsSection") return "deviation";
        return null;
      })();

      // Fallback: om jump är inne i en dold mat-panel, öppna den.
      if (!preopenFoodKind) {
        const targetProbe = jumpId ? document.getElementById(jumpId) : jumpSelector ? document.querySelector(jumpSelector) : null;
        const panel = targetProbe?.closest?.(".food-mat-panel");
        if (panel?.id === "foodMatPanelCustody") preopenFoodKind = "custody";
        if (panel?.id === "foodMatPanelHousehold") preopenFoodKind = "household";
        if (panel?.id === "foodMatPanelDeviation") preopenFoodKind = "deviation";
      }

      const doJump = () => {
        const t = jumpId ? document.getElementById(jumpId) : jumpSelector ? document.querySelector(jumpSelector) : null;
        if (!t) return;
        try {
          if (typeof t.focus === "function") t.focus({ preventScroll: true });
        } catch {
          // ignore focus options
        }
        t.scrollIntoView({ behavior: "smooth", block: "center" });
      };

      if (preopenFoodKind) {
        openFoodMatSubPanel(preopenFoodKind);
        queueMicrotask(doJump);
      } else {
        doJump();
      }
    };

    ul.appendChild(btn);
  });

  summaryEl.appendChild(ul);

  // Fokus ska ligga på felkortet och vara "i skärm" (inte första felraden).
  queueMicrotask(() => {
    try {
      summaryEl.scrollIntoView({ behavior: "smooth", block: "start" });
      summaryEl.focus({ preventScroll: true });
    } catch {
      // ignore focus/scroll options
    }
  });
}

function hideErrorSummaryById(summaryId) {
  const el = summaryId ? document.getElementById(summaryId) : null;
  if (!el) return;
  hideErrorSummaryByEl(el);
}

function dismissVisibleErrorSummariesForTarget(targetEl) {
  if (!(targetEl instanceof Element)) return;

  // Rensa inline-fel kopplade till fältet (vanligast: i samma label.field).
  const label = targetEl.closest("label.field");
  if (label) {
    label.querySelectorAll(".field-error").forEach((errEl) => {
      errEl.hidden = true;
      errEl.textContent = "";
    });
  }

  if (targetEl.classList?.contains("input-invalid")) {
    targetEl.classList.remove("input-invalid");
    targetEl.setAttribute("aria-invalid", "false");
  }

  // Håll det lokalt till samma overlay/panel som användaren interagerar med.
  const container = targetEl.closest(
    ".exp-overlay, .modal-body, .table-card, .content-card, .food-mat-panel"
  );
  const root = container || document;

  root
    .querySelectorAll(".bb-error-summary[role='alert']:not([hidden])")
    .forEach((summaryEl) => hideErrorSummaryByEl(summaryEl));
}

// När användaren börjar skriva/ändra så ska error-kortet försvinna direkt.
document.addEventListener(
  "input",
  (e) => dismissVisibleErrorSummariesForTarget(e.target),
  { capture: true }
);
document.addEventListener(
  "change",
  (e) => dismissVisibleErrorSummariesForTarget(e.target),
  { capture: true }
);

function paymentErrorJump({ idx, msg, kindPrefix }) {
  const includes = (s) => String(msg || "").toLowerCase().includes(String(s).toLowerCase());
  const i = idx == null ? 0 : idx;
  if (includes("år")) return { label: "Fyll i år", jumpSelector: `[data-${kindPrefix}-pay-year="${i}"]` };
  if (includes("månad")) return { label: "Fyll i månad", jumpSelector: `[data-${kindPrefix}-pay-month="${i}"]` };
  if (includes("dag")) return { label: "Fyll i dag", jumpSelector: `[data-${kindPrefix}-pay-day="${i}"]` };
  if (includes("belopp")) return { label: "Fyll i belopp", jumpSelector: `[data-${kindPrefix}-pay-amt="${i}"]` };
  return { label: "Kontrollera datum", jumpSelector: `[data-${kindPrefix}-pay-amt="${i}"]` };
}

function getSystemTheme() {
  try {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Effektivt tema för UI som redan satt `html[data-theme]` (fallback: system). */
function resolvedDocumentTheme() {
  const t = document.documentElement?.dataset?.theme;
  if (t === "dark" || t === "light") return t;
  return getSystemTheme();
}

/**
 * Diagramfärger: ljusa mättade segment, mörkläge med högre luminans och kontrast.
 * (Komplement till varumärkesgrön #255f33.)
 */
const CHART_SEGMENT_PALETTE = {
  recurringExpenses: { light: "#255f33", dark: "#8edb9a" },
  foodGenerated: { light: "#e65100", dark: "#ffb74d" },
  car: { light: "#005fa3", dark: "#90caf9" },
  housing: { light: "#00695c", dark: "#80cbc4" },
  loans: { light: "#6a1b9a", dark: "#ce93d8" },
  children: { light: "#2e7d32", dark: "#a5d6a7" },
  savings: { light: "#f59e0b", dark: "#ffe082" },
  oneOffExpenses: { light: "#c62828", dark: "#ffab91" }
};

function chartSegmentHex(key) {
  const pair = CHART_SEGMENT_PALETTE[key];
  if (!pair) return resolvedDocumentTheme() === "dark" ? "#b0bec5" : "#607d8b";
  return resolvedDocumentTheme() === "dark" ? pair.dark : pair.light;
}

const DATE_SHEET_MQ = "(max-width: 720px)";

function isDateSheetViewport() {
  try {
    return window.matchMedia(DATE_SHEET_MQ).matches;
  } catch {
    return false;
  }
}

function todayIsoLocal() {
  const d = new Date();
  return isoDateFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function clampIsoToMinMax(iso, minIso, maxIso) {
  let v = iso;
  if (minIso && v < minIso) v = minIso;
  if (maxIso && v > maxIso) v = maxIso;
  return v;
}

function monthFullyBeforeMin(viewY, viewM, minIso) {
  if (!minIso) return false;
  const lastD = daysInMonth(viewY, viewM);
  const end = isoDateFromParts(viewY, viewM, lastD);
  return end < minIso;
}

function monthFullyAfterMax(viewY, viewM, maxIso) {
  if (!maxIso) return false;
  const start = isoDateFromParts(viewY, viewM, 1);
  return start > maxIso;
}

function monthFullyOutOfRange(y, m, minIso, maxIso) {
  const lastD = daysInMonth(y, m);
  const start = isoDateFromParts(y, m, 1);
  const end = isoDateFromParts(y, m, lastD);
  if (minIso && end < minIso) return true;
  if (maxIso && start > maxIso) return true;
  return false;
}

function yearEntirelyOutOfRange(y, minIso, maxIso) {
  if (!minIso && !maxIso) return false;
  const yStart = `${y}-01-01`;
  const yEnd = `${y}-12-31`;
  if (minIso && yEnd < minIso) return true;
  if (maxIso && yStart > maxIso) return true;
  return false;
}

let dateSheetTargetInput = null;
let dateSheetSnapshot = "";
let dateSheetDraft = "";
let dateSheetViewY = 0;
let dateSheetViewM = 0;
/** "days" | "months" — månadsvy öppnas via månad/år-raden */
let dateSheetMode = "days";
let dateSheetOpen = false;
let dateSheetClosing = false;
let dateSheetKeydownHandler = null;
/** I datumblad för `data-date-clear`: true = inget slutdatum (tillsvidare), false = välj specifikt datum. */
let dateSheetTillsvidareOn = false;
/** Minsta höjd för dag-/månadspanel så kortet inte hoppar vid växling (max av uppmätta vyer). */
let dateSheetPanesMinHeightPx = 0;

let periodSheetOpen = false;
let periodSheetClosing = false;
/** @type {"overview"|"expenseFilter"|"incomeFilter"|"foodPreview"} */
let periodSheetKind = "overview";
let periodSheetDraftYearStr = "";
let periodSheetDraftMonthStr = "";
/** När periodSheetKind === "taggedList": vilken Hem/Bil/Barn/Spar-vy som öppnade periodarket. */
let periodSheetTaggedCat = null;
let periodSheetKeydownHandler = null;

let listPickerOpen = false;
let listPickerClosing = false;
let listPickerKeydownHandler = null;
/** Fokushållare för att undvika aria-hidden-varning vid stängning. */
let listPickerPrevFocusEl = null;

/** Mat-overlay: fullskärms-underläge (pushState så systemets bakåt stänger panelen) */
let foodMatSubHistoryDepth = 0;
/** När mat-popstate just stängt underpanel: låt inte utgift-overlayns popstate stänga hela Mat. */
let skipExpenseOverlayPopstateOnce = false;
let expenseOverlayHistoryDepth = 0;

function anyExpenseOverlayOpen() {
  return Array.from(document.querySelectorAll(".exp-overlay")).some((el) => !el.hidden);
}

function closeExpenseCategoryOverlayFromHistory() {
  closeExpenseCategoryOverlay({ fromHistory: true });
}

function closeExpenseCategoryOverlayFromUi() {
  if (expenseOverlayHistoryDepth > 0) {
    history.back();
    return;
  }
  closeExpenseCategoryOverlay({ fromHistory: false });
  if (ui.activeRoute === "savings") {
    location.hash = "#/expenses";
  }
}

function initExpenseOverlayHistory() {
  window.addEventListener("popstate", () => {
    if (skipExpenseOverlayPopstateOnce) {
      skipExpenseOverlayPopstateOnce = false;
      return;
    }
    // If a food subpanel is open, let the food handler consume the back.
    const foodOverlay = document.querySelector('.exp-overlay[data-expview="food"]');
    const foodPanelOpen =
      foodOverlay && !foodOverlay.hidden && Array.from(foodOverlay.querySelectorAll(".food-mat-panel")).some((p) => !p.hidden);
    if (foodPanelOpen) return;

    if (!anyExpenseOverlayOpen()) {
      expenseOverlayHistoryDepth = 0;
      return;
    }
    if (expenseOverlayHistoryDepth > 0) expenseOverlayHistoryDepth -= 1;
    closeExpenseCategoryOverlayFromHistory();
  });
}

let appBottomSheetLockDepth = 0;

function prefersReducedMotionUI() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function pushAppBottomSheetScrollLock() {
  appBottomSheetLockDepth += 1;
  if (appBottomSheetLockDepth === 1) document.body.classList.add("app-bottom-sheet-open");
}

function popAppBottomSheetScrollLock() {
  appBottomSheetLockDepth = Math.max(0, appBottomSheetLockDepth - 1);
  if (appBottomSheetLockDepth === 0) document.body.classList.remove("app-bottom-sheet-open");
}

function getDateSheetEls() {
  return {
    backdrop: document.getElementById("dateSheetBackdrop"),
    sheet: document.getElementById("dateSheet"),
    title: document.getElementById("dateSheetTitle"),
    grid: document.getElementById("dateSheetGrid"),
    monthYearBtn: document.getElementById("dateSheetMonthYearBtn"),
    monthLabel: document.getElementById("dateSheetMonthLabel"),
    monthChevron: document.getElementById("dateSheetMonthYearChevron"),
    dayPane: document.getElementById("dateSheetDayPane"),
    monthPane: document.getElementById("dateSheetMonthPane"),
    monthPickerGrid: document.getElementById("dateSheetMonthPickerGrid"),
    prevBtn: document.getElementById("dateSheetPrevMonth"),
    nextBtn: document.getElementById("dateSheetNextMonth"),
    handle: document.getElementById("dateSheetHandle"),
    tillsvidareRow: document.getElementById("dateSheetTillsvidareRow"),
    tillsvidareSwitch: document.getElementById("dateSheetTillsvidareSwitch"),
    tillsvidareHint: document.getElementById("dateSheetTillsvidareHint")
  };
}

function dateSheetTargetAllowsTillsvidare() {
  return Boolean(dateSheetTargetInput?.hasAttribute("data-date-clear"));
}

function syncDateSheetTillsvidareRow() {
  const { tillsvidareRow, tillsvidareSwitch, tillsvidareHint } = getDateSheetEls();
  if (!tillsvidareRow || !tillsvidareSwitch || !tillsvidareHint) return;
  const show = dateSheetOpen && dateSheetTargetAllowsTillsvidare();
  tillsvidareRow.hidden = !show;
  tillsvidareHint.hidden = !show;
  if (!show) return;
  tillsvidareSwitch.setAttribute("aria-checked", dateSheetTillsvidareOn ? "true" : "false");
  tillsvidareSwitch.classList.toggle("date-sheet-switch--on", dateSheetTillsvidareOn);
  tillsvidareSwitch.setAttribute("aria-disabled", dateSheetTillsvidareOn ? "true" : "false");
}

function measureAndApplyDateSheetPanesMinHeight(resetAccumulated) {
  if (!dateSheetOpen) return;
  const wrap = document.getElementById("dateSheetPanes");
  const dayPane = document.getElementById("dateSheetDayPane");
  const monthPane = document.getElementById("dateSheetMonthPane");
  if (!wrap || !dayPane || !monthPane) return;
  if (resetAccumulated) dateSheetPanesMinHeightPx = 0;

  const mode = dateSheetMode;

  dayPane.hidden = false;
  monthPane.hidden = true;
  void wrap.offsetHeight;
  const hDay = dayPane.getBoundingClientRect().height;

  dayPane.hidden = true;
  monthPane.hidden = false;
  void wrap.offsetHeight;
  const hMonth = monthPane.getBoundingClientRect().height;

  if (mode === "days") {
    dayPane.hidden = false;
    monthPane.hidden = true;
  } else {
    dayPane.hidden = true;
    monthPane.hidden = false;
  }
  dayPane.setAttribute("aria-hidden", mode !== "days" ? "true" : "false");
  monthPane.setAttribute("aria-hidden", mode !== "months" ? "true" : "false");

  const next = Math.max(dateSheetPanesMinHeightPx, hDay, hMonth);
  dateSheetPanesMinHeightPx = next;
  wrap.style.minHeight = `${next}px`;
}

function scheduleDateSheetPanesMinHeight(resetAccumulated) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      measureAndApplyDateSheetPanesMinHeight(Boolean(resetAccumulated));
    });
  });
}

function getPeriodSheetEls() {
  return {
    backdrop: document.getElementById("periodSheetBackdrop"),
    sheet: document.getElementById("periodSheet"),
    handle: document.getElementById("periodSheetHandle")
  };
}

function getListPickerEls() {
  return {
    backdrop: document.getElementById("listPickerBackdrop"),
    sheet: document.getElementById("listPickerSheet"),
    title: document.getElementById("listPickerTitle"),
    options: document.getElementById("listPickerOptions"),
    handle: document.getElementById("listPickerHandle")
  };
}

function hideFoodMatSubPanelsUi() {
  const active = document.activeElement;
  // Om fokus ligger kvar inne i en underpanel får vi aria-hidden-varning när vi gömmer den.
  const activePanel = active instanceof Node ? active.closest(".food-mat-panel") : null;
  if (activePanel && typeof active?.blur === "function") {
    active.blur();
  }

  document.querySelectorAll(".food-mat-panel").forEach((el) => {
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
  });
  const hub = document.getElementById("foodMatPeriodHub");
  if (hub) {
    hub.hidden = false;
    hub.removeAttribute("aria-hidden");
  }

  // Återställ fokus till hubben (eller första hub-card) efter att paneler blivit gömda.
  queueMicrotask(() => {
    if (!hub) return;
    const focusTarget = hub.querySelector(".food-mat-hub-card, #foodHubOpenCustody, #foodHubOpenHousehold, #foodHubOpenDeviation");
    if (focusTarget && typeof focusTarget.focus === "function") {
      try {
        focusTarget.focus({ preventScroll: true });
      } catch {
        focusTarget.focus();
      }
    }
  });
}

function openFoodMatSubPanel(kind) {
  const map = { custody: "foodMatPanelCustody", household: "foodMatPanelHousehold", deviation: "foodMatPanelDeviation" };
  const id = map[kind];
  if (!id) return;
  const panel = document.getElementById(id);
  const hub = document.getElementById("foodMatPeriodHub");
  if (!panel || !hub) return;
  const foodOverlay = document.querySelector('.exp-overlay[data-expview="food"]');
  if (!foodOverlay || foodOverlay.hidden) return;
  const anyOpen = Array.from(foodOverlay.querySelectorAll(".food-mat-panel")).some((p) => !p.hidden);
  foodOverlay.querySelectorAll(".food-mat-panel").forEach((el) => {
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
  });
  hideErrorSummaryById("foodErrorSummary");
  hideErrorSummaryById("foodCustodyErrorSummary");
  hideErrorSummaryById("foodHouseholdErrorSummary");
  hideErrorSummaryById("foodDeviationErrorSummary");
  panel.hidden = false;
  panel.removeAttribute("aria-hidden");
  hub.hidden = true;
  hub.setAttribute("aria-hidden", "true");
  if (!anyOpen) {
    history.pushState({ foodMatSub: true }, "");
    foodMatSubHistoryDepth += 1;
  }
  queueMicrotask(() => panel.querySelector(".food-mat-panel-back")?.focus?.());
}

function closeFoodMatSubPanelFromBackButton() {
  if (foodMatSubHistoryDepth <= 0) {
    hideFoodMatSubPanelsUi();
    return;
  }
  history.back();
}

function resetFoodMatSubPanelsWhenFoodOverlayCloses() {
  hideFoodMatSubPanelsUi();
  if (foodMatSubHistoryDepth > 0) {
    foodMatSubHistoryDepth = 0;
    history.back();
  }
}

function initFoodMatSubPanelHistory() {
  window.addEventListener("popstate", () => {
    const foodOverlay = document.querySelector('.exp-overlay[data-expview="food"]');
    if (!foodOverlay || foodOverlay.hidden) {
      foodMatSubHistoryDepth = 0;
      hideFoodMatSubPanelsUi();
      return;
    }
    const panelOpen = Array.from(foodOverlay.querySelectorAll(".food-mat-panel")).some((p) => !p.hidden);
    if (!panelOpen) return;
    if (foodMatSubHistoryDepth > 0) foodMatSubHistoryDepth -= 1;
    hideFoodMatSubPanelsUi();
    skipExpenseOverlayPopstateOnce = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const foodOverlay = document.querySelector('.exp-overlay[data-expview="food"]');
    if (!foodOverlay || foodOverlay.hidden) return;
    const panelOpen = Array.from(foodOverlay.querySelectorAll(".food-mat-panel")).some((p) => !p.hidden);
    if (!panelOpen) return;
    e.preventDefault();
    closeFoodMatSubPanelFromBackButton();
  });
}

function initFoodMatSwipeBack() {
  const overlays = document.querySelectorAll('.exp-overlay[data-expview="food"] .food-mat-panel');
  overlays.forEach((panel) => {
    let startX = 0;
    let startY = 0;
    let startT = 0;
    let active = false;
    let edgeOk = false;

    const begin = (x, y) => {
      if (!panel || panel.hidden) return;
      startX = x;
      startY = y;
      startT = performance.now();
      // Require swipe to start near left edge to avoid fighting scroll/taps.
      edgeOk = startX <= 28;
      active = true;
    };

    const move = (x, y) => {
      if (!active) return;
      const dx = x - startX;
      const dy = y - startY;
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 16) active = false;
    };

    const end = (x, y) => {
      if (!active) return;
      active = false;
      if (!edgeOk) return;
      const dx = x - startX;
      const dy = y - startY;
      const dt = performance.now() - startT;
      if (dx > 80 && Math.abs(dy) < 40 && dt < 900) closeFoodMatSubPanelFromBackButton();
    };

    panel.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType === "mouse") return;
        begin(e.clientX, e.clientY);
      },
      { passive: true }
    );

    panel.addEventListener(
      "pointermove",
      (e) => {
        move(e.clientX, e.clientY);
      },
      { passive: true }
    );

    panel.addEventListener("pointerup", (e) => end(e.clientX, e.clientY), { passive: true });
    panel.addEventListener("pointercancel", () => {
      active = false;
    }, { passive: true });

    // Android WebView/Chrome can be inconsistent with PointerEvents in some modes;
    // add TouchEvents as a fallback.
    const getTouch = (ev) => (ev.changedTouches && ev.changedTouches[0]) || (ev.touches && ev.touches[0]) || null;
    panel.addEventListener(
      "touchstart",
      (ev) => {
        const t = getTouch(ev);
        if (!t) return;
        begin(t.clientX, t.clientY);
      },
      { passive: true }
    );
    panel.addEventListener(
      "touchmove",
      (ev) => {
        const t = getTouch(ev);
        if (!t) return;
        move(t.clientX, t.clientY);
      },
      { passive: true }
    );
    panel.addEventListener(
      "touchend",
      (ev) => {
        const t = getTouch(ev);
        if (!t) return;
        end(t.clientX, t.clientY);
      },
      { passive: true }
    );
    panel.addEventListener(
      "touchcancel",
      () => {
        active = false;
      },
      { passive: true }
    );
  });
}

// Notched outline is implemented with markup/CSS (no JS sync needed).

function updateFoodMatHubTitles(draft) {
  const custodyN = (draft?.custodyPeriods || []).filter((p) => p?.startDate && String(p.startDate).trim()).length;
  const hhN = (draft?.householdChanges || []).length;
  const devN = (draft?.deviations || []).length;
  const tc = document.getElementById("foodHubTitleCustody");
  const th = document.getElementById("foodHubTitleHousehold");
  const td = document.getElementById("foodHubTitleDeviation");
  if (tc) {
    tc.classList.toggle("food-mat-hub-title--muted", custodyN === 0);
    tc.classList.toggle("food-mat-hub-title--has-periods", custodyN > 0);
  }
  if (th) {
    th.classList.toggle("food-mat-hub-title--muted", hhN === 0);
    th.classList.toggle("food-mat-hub-title--has-periods", hhN > 0);
  }
  if (td) {
    td.classList.toggle("food-mat-hub-title--muted", devN === 0);
    td.classList.toggle("food-mat-hub-title--has-periods", devN > 0);
  }
}

let dateFieldRowResizeTimer = null;

function formatDateRowDisplay(iso, inp) {
  const empty = !iso || typeof iso !== "string" || String(iso).trim() === "";
  if (empty) {
    if (inp instanceof HTMLInputElement && inp.hasAttribute("data-date-clear")) return "Tillsvidare";
    return "Välj datum";
  }
  const parts = datePartsFromIso(iso);
  if (!parts) return inp instanceof HTMLInputElement && inp.hasAttribute("data-date-clear") ? "Tillsvidare" : "Välj datum";
  const d = new Date(parts.y, parts.m - 1, parts.d);
  if (Number.isNaN(d.getTime()))
    return inp instanceof HTMLInputElement && inp.hasAttribute("data-date-clear") ? "Tillsvidare" : "Välj datum";
  const currentY = new Date().getFullYear();
  const wd = d.toLocaleDateString("sv-SE", { weekday: "long" });
  const capWd = wd ? wd.charAt(0).toUpperCase() + wd.slice(1) : "";
  const monthLower = d.toLocaleDateString("sv-SE", { month: "long" }).toLowerCase();
  if (parts.y === currentY) {
    return `${capWd} ${parts.d} ${monthLower}`;
  }
  return `${capWd} ${parts.d} ${monthLower} ${parts.y}`;
}

/** Kalenderikon (egen geometri: ringar, huvudlinje, tre prickar). Ska matcha icons/calendar-outline.svg */
function createCalendarIconSvg() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "date-field-row-icon");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");

  const rings = document.createElementNS(ns, "path");
  rings.setAttribute("d", "M8.5 2.75V6M15.5 2.75V6");
  rings.setAttribute("stroke", "currentColor");
  rings.setAttribute("stroke-width", "1.5");
  rings.setAttribute("stroke-linecap", "round");
  svg.appendChild(rings);

  const body = document.createElementNS(ns, "rect");
  body.setAttribute("x", "3.75");
  body.setAttribute("y", "6");
  body.setAttribute("width", "16.5");
  body.setAttribute("height", "15");
  body.setAttribute("rx", "2");
  body.setAttribute("stroke", "currentColor");
  body.setAttribute("stroke-width", "1.5");
  svg.appendChild(body);

  const header = document.createElementNS(ns, "path");
  header.setAttribute("d", "M4.5 10.25h15");
  header.setAttribute("stroke", "currentColor");
  header.setAttribute("stroke-width", "1.5");
  header.setAttribute("stroke-linecap", "round");
  svg.appendChild(header);

  for (const cx of [9, 12, 15]) {
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", String(cx));
    dot.setAttribute("cy", "17.25");
    dot.setAttribute("r", "1.15");
    dot.setAttribute("fill", "currentColor");
    svg.appendChild(dot);
  }

  return svg;
}

function syncDateFieldRow(inp) {
  const wrap = inp.closest(".date-field-row");
  if (!wrap) return;
  const tr = wrap.querySelector(".date-field-row-trigger");
  const val = wrap.querySelector(".date-field-row-value");
  const shown = formatDateRowDisplay(inp.value, inp);
  const empty = !inp.value || String(inp.value).trim() === "";
  const placeholderEmpty =
    empty && !(inp instanceof HTMLInputElement && inp.hasAttribute("data-date-clear"));
  if (val) val.textContent = shown;
  wrap.classList.toggle("date-field-row--empty", placeholderEmpty);
  if (tr) {
    tr.disabled = inp.disabled;
    const base = humanLabelForDateInput(inp);
    tr.setAttribute("aria-label", `${base}: ${shown}`);
  }
}

function applyDateFieldRowTabState(inp) {
  const wrap = inp.closest(".date-field-row");
  if (!wrap) return;
  const btn = wrap.querySelector(".date-field-row-trigger");
  if (!btn) return;
  if (isDateSheetViewport()) {
    inp.tabIndex = -1;
    btn.removeAttribute("tabindex");
  } else {
    inp.removeAttribute("tabindex");
    btn.tabIndex = -1;
  }
}

function refreshAllDateFieldRows() {
  document.querySelectorAll(".date-field-row-native").forEach((el) => {
    if (el instanceof HTMLInputElement) syncDateFieldRow(el);
  });
}

function enhanceAllDateFieldRows() {
  document.querySelectorAll('input[type="date"]').forEach((inp) => {
    if (!(inp instanceof HTMLInputElement)) return;
    if (inp.hasAttribute("data-native-date")) return;
    if (inp.closest(".date-field-row")) {
      syncDateFieldRow(inp);
      applyDateFieldRowTabState(inp);
      return;
    }
    const wrap = document.createElement("div");
    wrap.className = "date-field-row";
    inp.parentNode?.insertBefore(wrap, inp);
    wrap.appendChild(inp);
    inp.classList.add("date-field-row-native");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "date-field-row-trigger";
    const valSpan = document.createElement("span");
    valSpan.className = "date-field-row-value";
    btn.appendChild(valSpan);
    btn.appendChild(createCalendarIconSvg());
    wrap.appendChild(btn);

    const useNotched = true;
    if (useNotched && !wrap.closest(".bb-notched-field")) {
      const label = inp.getAttribute("data-notch-label") || humanLabelForDateInput(inp);
      const host = document.createElement("div");
      host.className = "bb-notched-field";
      host.setAttribute("role", "group");
      host.setAttribute("aria-label", label);
      const legend = document.createElement("div");
      legend.className = "bb-notched-field-legend";
      legend.textContent = label;
      host.appendChild(legend);
      wrap.parentNode?.insertBefore(host, wrap);
      host.appendChild(wrap);
    }

    const onSync = () => syncDateFieldRow(inp);
    inp.addEventListener("input", onSync);
    inp.addEventListener("change", onSync);
    onSync();
    applyDateFieldRowTabState(inp);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (inp.disabled) return;
      if (isDateSheetViewport() || inp.hasAttribute("data-date-clear")) openDateSheet(inp);
      else if (typeof inp.showPicker === "function") inp.showPicker();
      else inp.focus();
    });
  });
}

function initDateFieldRows() {
  enhanceAllDateFieldRows();
  window.addEventListener("resize", () => {
    clearTimeout(dateFieldRowResizeTimer);
    dateFieldRowResizeTimer = setTimeout(() => {
      document.querySelectorAll(".date-field-row-native").forEach((el) => {
        if (!(el instanceof HTMLInputElement)) return;
        applyDateFieldRowTabState(el);
        syncDateFieldRow(el);
      });
    }, 120);
  });
}

function humanLabelForDateInput(inp) {
  const notch = inp.getAttribute("data-notch-label");
  if (notch && String(notch).trim()) return String(notch).trim();
  const lab = inp.closest("label");
  if (!lab) return inp.getAttribute("aria-label") || "Välj datum";
  const clone = lab.cloneNode(true);
  clone.querySelectorAll("input, button, select, textarea, .note").forEach((n) => n.remove());
  const t = clone.textContent.replace(/\s+/g, " ").trim();
  return t || inp.getAttribute("aria-label") || "Välj datum";
}

function finalizeDateSheetClose(revert) {
  const inp = dateSheetTargetInput;
  if (inp && revert) {
    inp.value = dateSheetSnapshot;
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const { backdrop, sheet, tillsvidareRow, tillsvidareHint, tillsvidareSwitch } = getDateSheetEls();
  if (tillsvidareRow) tillsvidareRow.hidden = true;
  if (tillsvidareHint) tillsvidareHint.hidden = true;
  dateSheetTillsvidareOn = false;
  if (tillsvidareSwitch) {
    tillsvidareSwitch.setAttribute("aria-checked", "false");
    tillsvidareSwitch.classList.remove("date-sheet-switch--on");
    tillsvidareSwitch.removeAttribute("aria-disabled");
  }
  const active = document.activeElement;
  if (sheet && active instanceof Node && sheet.contains(active)) {
    try {
      active.blur();
    } catch {
      /* ignore */
    }
  }
  if (backdrop) {
    backdrop.hidden = true;
    backdrop.classList.remove("date-sheet-backdrop--visible");
    backdrop.setAttribute("aria-hidden", "true");
  }
  if (sheet) {
    sheet.hidden = true;
    sheet.classList.remove("date-sheet--visible");
    sheet.style.removeProperty("transform");
    sheet.style.removeProperty("transition");
    sheet.setAttribute("aria-hidden", "true");
  }
  if (dateSheetKeydownHandler) {
    document.removeEventListener("keydown", dateSheetKeydownHandler, true);
    dateSheetKeydownHandler = null;
  }
  popAppBottomSheetScrollLock();
  dateSheetOpen = false;
  dateSheetClosing = false;
  dateSheetTargetInput = null;
  dateSheetMode = "days";
  dateSheetPanesMinHeightPx = 0;
  const dateSheetPanesEl = document.getElementById("dateSheetPanes");
  if (dateSheetPanesEl) dateSheetPanesEl.style.removeProperty("min-height");
  const inpForFocus = inp instanceof HTMLInputElement ? inp : null;
  if (inpForFocus) {
    queueMicrotask(() => {
      const wrap = inpForFocus.closest(".date-field-row");
      const tr = wrap?.querySelector(".date-field-row-trigger");
      if (tr instanceof HTMLElement) {
        try {
          tr.focus();
        } catch {
          /* ignore */
        }
      }
    });
  }
}

function closeDateSheetAnimated(revert) {
  if (!dateSheetOpen) return;
  if (dateSheetClosing) return;
  dateSheetClosing = true;
  let didFinish = false;
  const { backdrop, sheet } = getDateSheetEls();
  const finish = () => {
    if (didFinish) return;
    didFinish = true;
    dateSheetClosing = false;
    finalizeDateSheetClose(revert);
  };
  if (prefersReducedMotionUI()) {
    sheet?.classList.remove("date-sheet--visible");
    backdrop?.classList.remove("date-sheet-backdrop--visible");
    finish();
    return;
  }
  const sheetEl = sheet;
  const onEnd = (e) => {
    if (e.target !== sheetEl || e.propertyName !== "transform") return;
    sheetEl.removeEventListener("transitionend", onEnd);
    clearTimeout(tid);
    finish();
  };
  const tid = setTimeout(() => {
    sheetEl?.removeEventListener("transitionend", onEnd);
    finish();
  }, 420);
  sheetEl?.addEventListener("transitionend", onEnd);
  sheet?.classList.remove("date-sheet--visible");
  backdrop?.classList.remove("date-sheet-backdrop--visible");
}

function closeDateSheet(revert) {
  closeDateSheetAnimated(revert);
}

function commitDateSheetDayAndClose(iso) {
  const inp = dateSheetTargetInput;
  if (!inp) return;
  const minIso = inp.min || "";
  const maxIso = inp.max || "";
  if (minIso && iso < minIso) return;
  if (maxIso && iso > maxIso) return;
  const clamped = clampIsoToMinMax(iso, minIso, maxIso);
  if (dateSheetTargetAllowsTillsvidare()) dateSheetTillsvidareOn = false;
  dateSheetDraft = clamped;
  inp.value = clamped;
  inp.dispatchEvent(new Event("input", { bubbles: true }));
  inp.dispatchEvent(new Event("change", { bubbles: true }));
  closeDateSheetAnimated(false);
}

function monthShortLabelSv(y, m) {
  const s = new Date(y, m - 1, 1).toLocaleDateString("sv-SE", { month: "short" });
  const t = s.replace(/\.\s*$/, "").trim();
  if (!t) return t;
  return t.charAt(0).toLocaleUpperCase("sv-SE") + t.slice(1);
}

function syncDateSheetPaneVisibility() {
  const { dayPane, monthPane, sheet } = getDateSheetEls();
  if (dayPane) {
    dayPane.hidden = dateSheetMode !== "days";
    dayPane.setAttribute("aria-hidden", dateSheetMode !== "days" ? "true" : "false");
  }
  if (monthPane) {
    monthPane.hidden = dateSheetMode !== "months";
    monthPane.setAttribute("aria-hidden", dateSheetMode !== "months" ? "true" : "false");
  }
  if (sheet) {
    sheet.classList.toggle("date-sheet--month-mode", dateSheetMode === "months");
    sheet.setAttribute(
      "aria-labelledby",
      dateSheetMode === "months" ? "dateSheetMonthLabel" : "dateSheetTitle"
    );
  }
}

function updateDateSheetMonthYearRow() {
  const { monthYearBtn, monthLabel, monthChevron } = getDateSheetEls();
  if (monthLabel) {
    const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
    const longM = new Date(dateSheetViewY, dateSheetViewM - 1, 1).toLocaleDateString("sv-SE", { month: "long" });
    monthLabel.textContent = `${cap(longM)} ${dateSheetViewY}`;
  }
  if (monthChevron) {
    monthChevron.textContent = dateSheetMode === "months" ? "⌃" : "⌄";
  }
  if (monthYearBtn) {
    monthYearBtn.setAttribute("aria-expanded", dateSheetMode === "months" ? "true" : "false");
    monthYearBtn.title = dateSheetMode === "months" ? "Visa kalender" : "Välj månad";
    monthYearBtn.classList.toggle("date-sheet-month-year-btn--open", dateSheetMode === "months");
  }
  const { prevBtn, nextBtn } = getDateSheetEls();
  if (prevBtn) {
    prevBtn.setAttribute("aria-label", dateSheetMode === "months" ? "Föregående år" : "Föregående månad");
  }
  if (nextBtn) {
    nextBtn.setAttribute("aria-label", dateSheetMode === "months" ? "Nästa år" : "Nästa månad");
  }
}

function syncDateSheetArrowDisabled() {
  const { prevBtn, nextBtn } = getDateSheetEls();
  const inp = dateSheetTargetInput;
  const minIso = inp?.min || "";
  const maxIso = inp?.max || "";
  if (dateSheetMode === "months") {
    if (prevBtn) prevBtn.disabled = yearEntirelyOutOfRange(dateSheetViewY - 1, minIso, maxIso);
    if (nextBtn) nextBtn.disabled = yearEntirelyOutOfRange(dateSheetViewY + 1, minIso, maxIso);
    return;
  }
  let py = dateSheetViewY;
  let pm = dateSheetViewM - 1;
  if (pm < 1) {
    pm = 12;
    py -= 1;
  }
  let ny = dateSheetViewY;
  let nm = dateSheetViewM + 1;
  if (nm > 12) {
    nm = 1;
    ny += 1;
  }
  if (prevBtn) prevBtn.disabled = monthFullyBeforeMin(py, pm, minIso);
  if (nextBtn) nextBtn.disabled = monthFullyAfterMax(ny, nm, maxIso);
}

function renderDateSheetMonthPicker() {
  const { monthPickerGrid } = getDateSheetEls();
  if (!monthPickerGrid) return;
  const inp = dateSheetTargetInput;
  const minIso = inp?.min || "";
  const maxIso = inp?.max || "";
  const y = dateSheetViewY;
  const dp = datePartsFromIso(dateSheetDraft);
  const selectedM = dp && dp.y === y ? dp.m : null;

  monthPickerGrid.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (let m = 1; m <= 12; m++) {
    const disabled = monthFullyOutOfRange(y, m, minIso, maxIso);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "date-sheet-month-pick";
    btn.textContent = monthShortLabelSv(y, m);
    if (selectedM === m) {
      btn.classList.add("date-sheet-month-pick--selected");
      btn.setAttribute("aria-current", "true");
    } else {
      btn.removeAttribute("aria-current");
    }
    if (disabled) {
      btn.disabled = true;
      btn.classList.add("date-sheet-month-pick--disabled");
    } else {
      btn.addEventListener("click", () => {
        dateSheetViewY = y;
        dateSheetViewM = m;
        let dayN = 1;
        if (dp) dayN = Math.min(dp.d, daysInMonth(y, m));
        let nextIso = isoDateFromParts(y, m, dayN);
        nextIso = clampIsoToMinMax(nextIso, minIso, maxIso);
        const np = datePartsFromIso(nextIso);
        if (np) {
          dateSheetViewY = np.y;
          dateSheetViewM = np.m;
          dateSheetDraft = nextIso;
        }
        dateSheetMode = "days";
        renderDateSheetMonth();
        const { grid, monthYearBtn } = getDateSheetEls();
        const sel = grid?.querySelector(".date-sheet-day--selected:not(:disabled)");
        (sel || monthYearBtn)?.focus();
      });
    }
    frag.appendChild(btn);
  }
  monthPickerGrid.appendChild(frag);
}

function calendarStepLeft(m, r, c) {
  for (let nc = c - 1; nc >= 0; nc--) {
    const b = m[r][nc];
    if (b && !b.disabled) return b;
  }
  for (let nr = r - 1; nr >= 0; nr--) {
    for (let nc = 6; nc >= 0; nc--) {
      const b = m[nr][nc];
      if (b && !b.disabled) return b;
    }
  }
  return null;
}

function calendarStepRight(m, r, c) {
  for (let nc = c + 1; nc <= 6; nc++) {
    const b = m[r][nc];
    if (b && !b.disabled) return b;
  }
  for (let nr = r + 1; nr < m.length; nr++) {
    for (let nc = 0; nc <= 6; nc++) {
      const b = m[nr][nc];
      if (b && !b.disabled) return b;
    }
  }
  return null;
}

function calendarStepUp(m, r, c) {
  for (let nr = r - 1; nr >= 0; nr--) {
    const b = m[nr][c];
    if (b && !b.disabled) return b;
  }
  return null;
}

function calendarStepDown(m, r, c) {
  for (let nr = r + 1; nr < m.length; nr++) {
    const b = m[nr][c];
    if (b && !b.disabled) return b;
  }
  return null;
}

function calendarFirstEnabledButton(m) {
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < 7; c++) {
      const b = m[r][c];
      if (b && !b.disabled) return b;
    }
  }
  return null;
}

function calendarLastEnabledButton(m) {
  for (let r = m.length - 1; r >= 0; r--) {
    for (let c = 6; c >= 0; c--) {
      const b = m[r][c];
      if (b && !b.disabled) return b;
    }
  }
  return null;
}

function applyCalendarRovingTabindex(matrix) {
  let selectedBtn = null;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < 7; c++) {
      const b = matrix[r][c];
      if (!b) continue;
      if (b.disabled) {
        b.tabIndex = -1;
        continue;
      }
      if (b.classList.contains("date-sheet-day--selected")) selectedBtn = b;
      b.tabIndex = -1;
    }
  }
  const t = selectedBtn || calendarFirstEnabledButton(matrix);
  if (t) t.tabIndex = 0;
}

function moveDateSheetDayFocus(fromBtn, toBtn) {
  if (fromBtn && fromBtn !== toBtn) fromBtn.tabIndex = -1;
  if (toBtn) {
    toBtn.tabIndex = 0;
    toBtn.focus();
  }
}

function getDateSheetDayMatrix() {
  const { grid } = getDateSheetEls();
  const m = grid && grid.__dayMatrix;
  return Array.isArray(m) ? m : null;
}

function handleDateSheetCalendarKeydown(ev) {
  if (dateSheetMode !== "days") return;
  const matrix = getDateSheetDayMatrix();
  if (!matrix) return;
  const t = ev.target;
  if (!(t instanceof HTMLButtonElement) || !t.classList.contains("date-sheet-day")) return;
  if (t.disabled) return;

  const iso = t.dataset.isoDate;
  const r = Number(t.dataset.gridR);
  const c = Number(t.dataset.gridC);
  if (!iso || !Number.isFinite(r) || !Number.isFinite(c)) return;

  const k = ev.key;
  if (k === "Enter" || k === " ") {
    ev.preventDefault();
    commitDateSheetDayAndClose(iso);
    return;
  }

  if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown" || k === "Home" || k === "End") {
    ev.preventDefault();
    let next = null;
    if (k === "ArrowLeft") next = calendarStepLeft(matrix, r, c);
    else if (k === "ArrowRight") next = calendarStepRight(matrix, r, c);
    else if (k === "ArrowUp") next = calendarStepUp(matrix, r, c);
    else if (k === "ArrowDown") next = calendarStepDown(matrix, r, c);
    else if (k === "Home") next = calendarFirstEnabledButton(matrix);
    else if (k === "End") next = calendarLastEnabledButton(matrix);
    if (next && next !== t) moveDateSheetDayFocus(t, next);
  }
}

function renderDateSheetMonth() {
  const { grid } = getDateSheetEls();
  syncDateSheetPaneVisibility();
  updateDateSheetMonthYearRow();

  const inp = dateSheetTargetInput;
  const minIso = inp?.min || "";
  const maxIso = inp?.max || "";

  if (dateSheetMode === "months") {
    renderDateSheetMonthPicker();
    syncDateSheetArrowDisabled();
    syncDateSheetTillsvidareRow();
    scheduleDateSheetPanesMinHeight();
    return;
  }

  if (!grid) {
    syncDateSheetTillsvidareRow();
    scheduleDateSheetPanesMinHeight();
    return;
  }
  syncDateSheetArrowDisabled();

  grid.innerHTML = "";
  const first = new Date(dateSheetViewY, dateSheetViewM - 1, 1);
  const startPad = (first.getDay() + 6) % 7;
  const dim = daysInMonth(dateSheetViewY, dateSheetViewM);
  const today = todayIsoLocal();

  const totalCells = Math.ceil((startPad + dim) / 7) * 7;
  const matrix = [];
  let rowIdx = 0;

  for (let rowStart = 0; rowStart < totalCells; rowStart += 7) {
    const rowEl = document.createElement("div");
    rowEl.className = "date-sheet-week-row";
    rowEl.setAttribute("role", "row");
    const mrow = [null, null, null, null, null, null, null];

    for (let col = 0; col < 7; col++) {
      const i = rowStart + col;
      const dayNum = i - startPad + 1;
      const gcell = document.createElement("div");
      gcell.className = "date-sheet-gcell";
      gcell.setAttribute("role", "gridcell");

      if (dayNum < 1 || dayNum > dim) {
        gcell.classList.add("date-sheet-gcell--empty");
        gcell.setAttribute("aria-hidden", "true");
        rowEl.appendChild(gcell);
        continue;
      }

      const iso = isoDateFromParts(dateSheetViewY, dateSheetViewM, dayNum);
      let disabled = false;
      if (minIso && iso < minIso) disabled = true;
      if (maxIso && iso > maxIso) disabled = true;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "date-sheet-day";
      btn.textContent = String(dayNum);
      btn.dataset.isoDate = iso;
      btn.dataset.gridR = String(rowIdx);
      btn.dataset.gridC = String(col);
      btn.setAttribute("aria-selected", iso === dateSheetDraft ? "true" : "false");
      if (iso === dateSheetDraft) btn.classList.add("date-sheet-day--selected");
      if (iso === today) btn.classList.add("date-sheet-day--today");
      if (disabled) {
        btn.disabled = true;
        btn.classList.add("date-sheet-day--disabled");
        btn.setAttribute("aria-disabled", "true");
      } else {
        btn.addEventListener("click", () => commitDateSheetDayAndClose(iso));
      }
      gcell.appendChild(btn);
      mrow[col] = btn;
      rowEl.appendChild(gcell);
    }

    matrix.push(mrow);
    rowIdx += 1;
    grid.appendChild(rowEl);
  }

  grid.__dayMatrix = matrix;
  applyCalendarRovingTabindex(matrix);
  renderDateSheetMonthPicker();
  syncDateSheetTillsvidareRow();
  scheduleDateSheetPanesMinHeight();
}

function openDateSheet(inputEl) {
  if (dateSheetOpen || periodSheetOpen || !inputEl || inputEl.type !== "date") return;
  const { backdrop, sheet, title, grid, monthYearBtn } = getDateSheetEls();
  if (!backdrop || !sheet) return;

  inputEl.blur();
  dateSheetTargetInput = inputEl;
  dateSheetSnapshot = inputEl.value || "";
  const minIso = inputEl.min || "";
  const maxIso = inputEl.max || "";
  let draft = dateSheetSnapshot || todayIsoLocal();
  draft = clampIsoToMinMax(draft, minIso, maxIso);
  dateSheetDraft = draft;
  const parts = datePartsFromIso(draft);
  if (parts) {
    dateSheetViewY = parts.y;
    dateSheetViewM = parts.m;
  } else {
    const d = new Date();
    dateSheetViewY = d.getFullYear();
    dateSheetViewM = d.getMonth() + 1;
  }

  dateSheetMode = "days";

  if (title) title.textContent = humanLabelForDateInput(inputEl);
  dateSheetTillsvidareOn = inputEl.hasAttribute("data-date-clear") ? !dateSheetSnapshot.trim() : false;

  pushAppBottomSheetScrollLock();
  /* Måste vara true innan renderDateSheetMonth → syncDateSheetTillsvidareRow (annars döljs Tillsvidare-raden). */
  dateSheetOpen = true;

  renderDateSheetMonth();
  backdrop.hidden = false;
  backdrop.setAttribute("aria-hidden", "false");
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  backdrop.classList.remove("date-sheet-backdrop--visible");
  sheet.classList.remove("date-sheet--visible");

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      backdrop.classList.add("date-sheet-backdrop--visible");
      sheet.classList.add("date-sheet--visible");
      const sel = grid?.querySelector(".date-sheet-day--selected:not(:disabled)");
      (sel || monthYearBtn)?.focus();
    });
  });

  dateSheetKeydownHandler = (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      closeDateSheetAnimated(true);
      return;
    }
    handleDateSheetCalendarKeydown(ev);
  };
  document.addEventListener("keydown", dateSheetKeydownHandler, true);
}

function attachBottomSheetDragDismiss(handleEl, sheetEl, onDismiss) {
  if (!handleEl || !sheetEl) return;
  let startY = 0;
  let dragging = false;
  let activeId = null;
  handleEl.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging = true;
    startY = e.clientY;
    activeId = e.pointerId;
    sheetEl.style.transition = "none";
    try {
      handleEl.setPointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
  });
  handleEl.addEventListener("pointermove", (e) => {
    if (!dragging || e.pointerId !== activeId) return;
    const dy = Math.max(0, e.clientY - startY);
    sheetEl.style.transform = `translateY(${dy}px)`;
  });
  handleEl.addEventListener("pointerup", (e) => {
    if (!dragging || e.pointerId !== activeId) return;
    dragging = false;
    const dy = e.clientY - startY;
    sheetEl.style.removeProperty("transition");
    sheetEl.style.removeProperty("transform");
    activeId = null;
    try {
      handleEl.releasePointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
    if (dy > 72) onDismiss();
  });
  handleEl.addEventListener("pointercancel", (e) => {
    if (!dragging || e.pointerId !== activeId) return;
    dragging = false;
    sheetEl.style.removeProperty("transition");
    sheetEl.style.removeProperty("transform");
    activeId = null;
  });
}

function finalizePeriodSheetClose() {
  const { backdrop, sheet } = getPeriodSheetEls();
  if (backdrop) {
    backdrop.hidden = true;
    backdrop.classList.remove("period-sheet-backdrop--visible");
    backdrop.setAttribute("aria-hidden", "true");
  }
  if (sheet) {
    sheet.hidden = true;
    sheet.classList.remove("period-sheet--visible");
    sheet.style.removeProperty("transform");
    sheet.style.removeProperty("transition");
    sheet.setAttribute("aria-hidden", "true");
  }
  if (periodSheetKeydownHandler) {
    document.removeEventListener("keydown", periodSheetKeydownHandler, true);
    periodSheetKeydownHandler = null;
  }
  popAppBottomSheetScrollLock();
  periodSheetOpen = false;
  periodSheetClosing = false;
  periodSheetTaggedCat = null;
}

function closePeriodSheetAnimated() {
  if (!periodSheetOpen) return;
  if (periodSheetClosing) return;
  periodSheetClosing = true;
  let didFinish = false;
  const { backdrop, sheet } = getPeriodSheetEls();
  const finish = () => {
    if (didFinish) return;
    didFinish = true;
    periodSheetClosing = false;
    finalizePeriodSheetClose();
  };
  if (prefersReducedMotionUI()) {
    sheet?.classList.remove("period-sheet--visible");
    backdrop?.classList.remove("period-sheet-backdrop--visible");
    finish();
    return;
  }
  const sheetEl = sheet;
  const onEnd = (e) => {
    if (e.target !== sheetEl || e.propertyName !== "transform") return;
    sheetEl.removeEventListener("transitionend", onEnd);
    clearTimeout(tid);
    finish();
  };
  const tid = setTimeout(() => {
    sheetEl?.removeEventListener("transitionend", onEnd);
    finish();
  }, 420);
  sheetEl?.addEventListener("transitionend", onEnd);
  sheet?.classList.remove("period-sheet--visible");
  backdrop?.classList.remove("period-sheet-backdrop--visible");
}

function yearOptionsForPeriodSheet() {
  if (periodSheetKind === "overview") return getAvailableYears().map((y) => ({ v: String(y), lab: String(y) }));
  if (periodSheetKind === "foodPreview" || periodSheetKind === "taggedList")
    return getAvailableYears().map((y) => ({ v: String(y), lab: String(y) }));
  const src = periodSheetKind === "incomeFilter" ? incomeYearsForFilter() : expenseYearsForFilter();
  return src.map((y) => ({ v: String(y), lab: y === "all" ? "Alla" : String(y) }));
}

function renderPeriodSheetContent() {
  const yearsHost = document.getElementById("periodSheetYears");
  const monthsHost = document.getElementById("periodSheetMonths");
  if (!yearsHost || !monthsHost) return;
  yearsHost.innerHTML = "";
  for (const { v, lab } of yearOptionsForPeriodSheet()) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "period-sheet-chip";
    if (v === periodSheetDraftYearStr) b.classList.add("period-sheet-chip--selected");
    b.textContent = lab;
    b.addEventListener("click", () => {
      periodSheetDraftYearStr = v;
      renderPeriodSheetContent();
    });
    yearsHost.appendChild(b);
  }
  monthsHost.innerHTML = "";
  const monthEntries = [];
  if (
    periodSheetKind !== "overview" &&
    periodSheetKind !== "foodPreview" &&
    periodSheetKind !== "taggedList"
  ) {
    monthEntries.push({ v: "all", lab: "Alla" });
  }
  for (let m = 1; m <= 12; m++) {
    const full = monthName(m);
    monthEntries.push({ v: String(m), lab: full.length > 6 ? `${full.slice(0, 3)}.` : full });
  }
  for (const { v, lab } of monthEntries) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "period-sheet-month-btn";
    if (v === periodSheetDraftMonthStr) b.classList.add("period-sheet-month-btn--selected");
    b.textContent = lab;
    b.addEventListener("click", () => {
      periodSheetDraftMonthStr = v;
      commitPeriodSheetAndClose();
    });
    monthsHost.appendChild(b);
  }
}

function commitPeriodSheetAndClose() {
  if (periodSheetKind === "overview") {
    const yearSel = document.getElementById("overviewYear");
    const monthSel = document.getElementById("overviewMonth");
    if (yearSel && monthSel) {
      yearSel.value = periodSheetDraftYearStr;
      monthSel.value = periodSheetDraftMonthStr;
      yearSel.dispatchEvent(new Event("change", { bubbles: true }));
      monthSel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  } else if (periodSheetKind === "foodPreview") {
    const ys = document.getElementById("foodPreviewYear");
    const ms = document.getElementById("foodPreviewMonth");
    if (ys && ms) {
      ys.value = periodSheetDraftYearStr;
      ms.value = periodSheetDraftMonthStr;
      ys.dispatchEvent(new Event("change", { bubbles: true }));
      ms.dispatchEvent(new Event("change", { bubbles: true }));
    }
  } else if (periodSheetKind === "taggedList") {
    const cat = periodSheetTaggedCat;
    periodSheetTaggedCat = null;
    if (cat && TAGGED_CATEGORY_CONFIG[cat]) {
      const C = TAGGED_CATEGORY_CONFIG[cat];
      const ys = document.getElementById(C.ids.listYear);
      const ms = document.getElementById(C.ids.listMonth);
      if (ys && ms) {
        ys.value = periodSheetDraftYearStr;
        ms.value = periodSheetDraftMonthStr;
      }
      ui.tagged[cat].listYear = Number(periodSheetDraftYearStr);
      ui.tagged[cat].listMonth = Number(periodSheetDraftMonthStr);
      syncTaggedListPeriodSummary(cat);
      renderTaggedExpenseListMount(cat);
    }
  } else if (periodSheetKind === "expenseFilter") {
    const ys = document.getElementById("expenseYearFilter");
    const ms = document.getElementById("expenseMonthFilter");
    if (ys && ms) {
      ys.value = periodSheetDraftYearStr;
      ms.value = periodSheetDraftMonthStr;
    }
    ui.expenseYearFilter = periodSheetDraftYearStr;
    ui.expenseMonthFilter = periodSheetDraftMonthStr;
    syncExpenseFilterSummaryLabel();
    renderExpensesList();
  } else if (periodSheetKind === "incomeFilter") {
    const ys = document.getElementById("incomeYearFilter");
    const ms = document.getElementById("incomeMonthFilter");
    if (ys && ms) {
      ys.value = periodSheetDraftYearStr;
      ms.value = periodSheetDraftMonthStr;
    }
    ui.incomeYearFilter = periodSheetDraftYearStr;
    ui.incomeMonthFilter = periodSheetDraftMonthStr;
    syncIncomeFilterSummaryLabel();
    renderIncomesList();
  }
  closePeriodSheetAnimated();
}

function openOverviewPeriodSheet() {
  if (dateSheetOpen || periodSheetOpen || listPickerOpen) return;
  const yearSel = document.getElementById("overviewYear");
  const monthSel = document.getElementById("overviewMonth");
  const { backdrop, sheet } = getPeriodSheetEls();
  if (!yearSel || !monthSel || !backdrop || !sheet) return;

  periodSheetKind = "overview";
  const cur = currentYearMonth();
  let y = Number(yearSel.value);
  let m = Number(monthSel.value);
  if (!Number.isFinite(y)) y = cur.year;
  if (!Number.isFinite(m) || m < 1 || m > 12) m = cur.month;
  periodSheetDraftYearStr = String(y);
  periodSheetDraftMonthStr = String(m);

  renderPeriodSheetContent();
  backdrop.hidden = false;
  backdrop.setAttribute("aria-hidden", "false");
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  backdrop.classList.remove("period-sheet-backdrop--visible");
  sheet.classList.remove("period-sheet--visible");
  pushAppBottomSheetScrollLock();
  periodSheetOpen = true;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      backdrop.classList.add("period-sheet-backdrop--visible");
      sheet.classList.add("period-sheet--visible");
      document.getElementById("periodSheetTitle")?.focus();
    });
  });

  periodSheetKeydownHandler = (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      closePeriodSheetAnimated();
    }
  };
  document.addEventListener("keydown", periodSheetKeydownHandler, true);
}

function openFoodPreviewPeriodSheet() {
  if (dateSheetOpen || periodSheetOpen || listPickerOpen) return;
  const ys = document.getElementById("foodPreviewYear");
  const ms = document.getElementById("foodPreviewMonth");
  const { backdrop, sheet } = getPeriodSheetEls();
  if (!ys || !ms || !backdrop || !sheet) return;
  periodSheetKind = "foodPreview";
  const cur = currentYearMonth();
  let y = Number(ys.value || ui.foodPreviewYear);
  let m = Number(ms.value || ui.foodPreviewMonth);
  if (!Number.isFinite(y)) y = cur.year;
  if (!Number.isFinite(m) || m < 1 || m > 12) m = cur.month;
  periodSheetDraftYearStr = String(y);
  periodSheetDraftMonthStr = String(m);
  renderPeriodSheetContent();
  backdrop.hidden = false;
  backdrop.setAttribute("aria-hidden", "false");
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  backdrop.classList.remove("period-sheet-backdrop--visible");
  sheet.classList.remove("period-sheet--visible");
  pushAppBottomSheetScrollLock();
  periodSheetOpen = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      backdrop.classList.add("period-sheet-backdrop--visible");
      sheet.classList.add("period-sheet--visible");
      document.getElementById("periodSheetTitle")?.focus();
    });
  });
  periodSheetKeydownHandler = (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      closePeriodSheetAnimated();
    }
  };
  document.addEventListener("keydown", periodSheetKeydownHandler, true);
}

function openTaggedListPeriodSheet(cat) {
  if (dateSheetOpen || periodSheetOpen || listPickerOpen) return;
  const C = TAGGED_CATEGORY_CONFIG[cat];
  if (!C) return;
  const ys = document.getElementById(C.ids.listYear);
  const ms = document.getElementById(C.ids.listMonth);
  const { backdrop, sheet } = getPeriodSheetEls();
  if (!ys || !ms || !backdrop || !sheet) return;
  periodSheetKind = "taggedList";
  periodSheetTaggedCat = cat;
  const u = ui.tagged[cat];
  const cur = currentYearMonth();
  let y = Number(ys.value ?? u.listYear);
  let m = Number(ms.value ?? u.listMonth);
  if (!Number.isFinite(y)) y = cur.year;
  if (!Number.isFinite(m) || m < 1 || m > 12) m = cur.month;
  periodSheetDraftYearStr = String(y);
  periodSheetDraftMonthStr = String(m);
  renderPeriodSheetContent();
  backdrop.hidden = false;
  backdrop.setAttribute("aria-hidden", "false");
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  backdrop.classList.remove("period-sheet-backdrop--visible");
  sheet.classList.remove("period-sheet--visible");
  pushAppBottomSheetScrollLock();
  periodSheetOpen = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      backdrop.classList.add("period-sheet-backdrop--visible");
      sheet.classList.add("period-sheet--visible");
      document.getElementById("periodSheetTitle")?.focus();
    });
  });
  periodSheetKeydownHandler = (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      closePeriodSheetAnimated();
    }
  };
  document.addEventListener("keydown", periodSheetKeydownHandler, true);
}

function openExpenseFilterPeriodSheet() {
  if (dateSheetOpen || periodSheetOpen || listPickerOpen) return;
  const ys = document.getElementById("expenseYearFilter");
  const ms = document.getElementById("expenseMonthFilter");
  const { backdrop, sheet } = getPeriodSheetEls();
  if (!ys || !ms || !backdrop || !sheet) return;
  periodSheetKind = "expenseFilter";
  periodSheetDraftYearStr = String(ui.expenseYearFilter || ys.value || "all");
  periodSheetDraftMonthStr = String(ui.expenseMonthFilter || ms.value || "all");
  renderPeriodSheetContent();
  backdrop.hidden = false;
  backdrop.setAttribute("aria-hidden", "false");
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  backdrop.classList.remove("period-sheet-backdrop--visible");
  sheet.classList.remove("period-sheet--visible");
  pushAppBottomSheetScrollLock();
  periodSheetOpen = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      backdrop.classList.add("period-sheet-backdrop--visible");
      sheet.classList.add("period-sheet--visible");
      document.getElementById("periodSheetTitle")?.focus();
    });
  });
  periodSheetKeydownHandler = (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      closePeriodSheetAnimated();
    }
  };
  document.addEventListener("keydown", periodSheetKeydownHandler, true);
}

function openIncomeFilterPeriodSheet() {
  if (dateSheetOpen || periodSheetOpen || listPickerOpen) return;
  const ys = document.getElementById("incomeYearFilter");
  const ms = document.getElementById("incomeMonthFilter");
  const { backdrop, sheet } = getPeriodSheetEls();
  if (!ys || !ms || !backdrop || !sheet) return;
  periodSheetKind = "incomeFilter";
  periodSheetDraftYearStr = String(ui.incomeYearFilter || ys.value || "all");
  periodSheetDraftMonthStr = String(ui.incomeMonthFilter || ms.value || "all");
  renderPeriodSheetContent();
  backdrop.hidden = false;
  backdrop.setAttribute("aria-hidden", "false");
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  backdrop.classList.remove("period-sheet-backdrop--visible");
  sheet.classList.remove("period-sheet--visible");
  pushAppBottomSheetScrollLock();
  periodSheetOpen = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      backdrop.classList.add("period-sheet-backdrop--visible");
      sheet.classList.add("period-sheet--visible");
      document.getElementById("periodSheetTitle")?.focus();
    });
  });
  periodSheetKeydownHandler = (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      closePeriodSheetAnimated();
    }
  };
  document.addEventListener("keydown", periodSheetKeydownHandler, true);
}

function syncOverviewPeriodSummaryLabel() {
  const el = document.getElementById("overviewPeriodSummary");
  const ys = document.getElementById("overviewYear");
  const ms = document.getElementById("overviewMonth");
  if (!el || !ys || !ms) return;
  const y = ys.value;
  const m = Number(ms.value);
  el.textContent = y && Number.isFinite(m) ? `${monthName(m)} ${y}` : "—";
}

function syncExpenseFilterSummaryLabel() {
  const el = document.getElementById("expenseFilterSummary");
  if (!el) return;
  const y = ui.expenseYearFilter || document.getElementById("expenseYearFilter")?.value || "all";
  const mo = ui.expenseMonthFilter || document.getElementById("expenseMonthFilter")?.value || "all";
  if (y === "all" && mo === "all") {
    el.textContent = "Alla år, alla månader";
  } else if (y === "all") {
    el.textContent = `${monthName(Number(mo))} alla år`;
  } else if (mo === "all") {
    el.textContent = `Alla månader ${y}`;
  } else {
    el.textContent = `${monthName(Number(mo))} ${y}`;
  }
}

function syncIncomeFilterSummaryLabel() {
  const el = document.getElementById("incomeFilterSummary");
  if (!el) return;
  const y = ui.incomeYearFilter || document.getElementById("incomeYearFilter")?.value || "all";
  const mo = ui.incomeMonthFilter || document.getElementById("incomeMonthFilter")?.value || "all";
  if (y === "all" && mo === "all") {
    el.textContent = "Alla år, alla månader";
  } else if (y === "all") {
    el.textContent = `${monthName(Number(mo))} alla år`;
  } else if (mo === "all") {
    el.textContent = `Alla månader ${y}`;
  } else {
    el.textContent = `${monthName(Number(mo))} ${y}`;
  }
}

function syncFoodPreviewSummaryLabel() {
  const el = document.getElementById("foodPreviewSummary");
  const ys = document.getElementById("foodPreviewYear");
  const ms = document.getElementById("foodPreviewMonth");
  if (!el || !ys || !ms) return;
  const y = String(ui.foodPreviewYear || ys.value || "");
  const m = Number(ui.foodPreviewMonth || ms.value || 0);
  el.textContent = y && Number.isFinite(m) && m >= 1 && m <= 12 ? `${monthName(m)} ${y}` : "—";
}

function syncTaggedListPeriodSummary(cat) {
  const C = TAGGED_CATEGORY_CONFIG[cat];
  if (!C) return;
  const el = document.getElementById(`${cat}ListPeriodSummary`);
  const ys = document.getElementById(C.ids.listYear);
  const ms = document.getElementById(C.ids.listMonth);
  if (!el || !ys || !ms) return;
  const y = Number(ui.tagged[cat].listYear ?? ys.value);
  const m = Number(ui.tagged[cat].listMonth ?? ms.value);
  el.textContent =
    Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12 ? `${monthName(m)} ${y}` : "—";
}

let taggedListPeriodPickersWired = false;
function wireTaggedListPeriodPickers() {
  if (taggedListPeriodPickersWired) return;
  taggedListPeriodPickersWired = true;
  for (const cat of TAGGED_CATEGORY_KEYS) {
    const btn = document.getElementById(`${cat}ListPeriodOpenBtn`);
    if (btn) btn.addEventListener("click", () => openTaggedListPeriodSheet(cat));
  }
}

function finalizeListPickerClose() {
  const { backdrop, sheet } = getListPickerEls();
  const active = document.activeElement;
  if (backdrop) {
    if (active instanceof Node && backdrop.contains(active) && typeof active.blur === "function") {
      active.blur();
    }
    backdrop.hidden = true;
    backdrop.classList.remove("period-sheet-backdrop--visible");
    backdrop.setAttribute("aria-hidden", "true");
  }
  if (sheet) {
    if (active instanceof Node && sheet.contains(active) && typeof active.blur === "function") {
      active.blur();
    }
    sheet.hidden = true;
    sheet.classList.remove("period-sheet--visible");
    sheet.style.removeProperty("transform");
    sheet.style.removeProperty("transition");
    sheet.setAttribute("aria-hidden", "true");
  }
  if (listPickerKeydownHandler) {
    document.removeEventListener("keydown", listPickerKeydownHandler, true);
    listPickerKeydownHandler = null;
  }
  popAppBottomSheetScrollLock();
  listPickerOpen = false;
  listPickerClosing = false;
  queueMicrotask(() => {
    if (listPickerPrevFocusEl && typeof listPickerPrevFocusEl.focus === "function") {
      try {
        listPickerPrevFocusEl.focus({ preventScroll: true });
      } catch {
        try {
          listPickerPrevFocusEl.focus();
        } catch {
          // ignore
        }
      }
    }
    listPickerPrevFocusEl = null;
  });
}

function closeListPickerAnimated() {
  if (!listPickerOpen) return;
  if (listPickerClosing) return;
  listPickerClosing = true;
  let didFinish = false;
  const { backdrop, sheet } = getListPickerEls();
  const finish = () => {
    if (didFinish) return;
    didFinish = true;
    listPickerClosing = false;
    finalizeListPickerClose();
  };
  if (prefersReducedMotionUI()) {
    sheet?.classList.remove("period-sheet--visible");
    backdrop?.classList.remove("period-sheet-backdrop--visible");
    finish();
    return;
  }
  const sheetEl = sheet;
  const onEnd = (e) => {
    if (e.target !== sheetEl || e.propertyName !== "transform") return;
    sheetEl.removeEventListener("transitionend", onEnd);
    clearTimeout(tid);
    finish();
  };
  const tid = setTimeout(() => {
    sheetEl?.removeEventListener("transitionend", onEnd);
    finish();
  }, 420);
  sheetEl?.addEventListener("transitionend", onEnd);
  sheet?.classList.remove("period-sheet--visible");
  backdrop?.classList.remove("period-sheet-backdrop--visible");
}

function openListPickerSheet({ title, options, currentValue, onSelect }) {
  if (dateSheetOpen || periodSheetOpen || listPickerOpen) return;
  const { backdrop, sheet, title: titleEl, options: host, handle } = getListPickerEls();
  if (!backdrop || !sheet || !titleEl || !host) return;
  listPickerPrevFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  titleEl.textContent = title || "Välj";
  host.innerHTML = "";
  for (const opt of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "list-picker-row";
    b.setAttribute("role", "option");
    b.dataset.value = String(opt.value);
    const selected = String(opt.value) === String(currentValue);
    if (selected) b.classList.add("list-picker-row--selected");
    b.setAttribute("aria-selected", selected ? "true" : "false");

    const label = document.createElement("span");
    label.className = "list-picker-row-label";
    label.textContent = opt.label;

    const check = document.createElement("span");
    check.className = "list-picker-row-check";
    check.textContent = "✓";
    check.setAttribute("aria-hidden", "true");

    b.appendChild(label);
    b.appendChild(check);
    b.addEventListener("click", () => {
      onSelect(String(opt.value));
      closeListPickerAnimated();
    });
    host.appendChild(b);
  }
  backdrop.hidden = false;
  backdrop.setAttribute("aria-hidden", "false");
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  backdrop.classList.remove("period-sheet-backdrop--visible");
  sheet.classList.remove("period-sheet--visible");
  pushAppBottomSheetScrollLock();
  listPickerOpen = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      backdrop.classList.add("period-sheet-backdrop--visible");
      sheet.classList.add("period-sheet--visible");
      titleEl.focus();
    });
  });
  listPickerKeydownHandler = (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      closeListPickerAnimated();
    }
  };
  document.addEventListener("keydown", listPickerKeydownHandler, true);
}

function syncThemeModeSummaryLabel() {
  const sel = document.getElementById("themeMode");
  const el = document.getElementById("themeModeSummary");
  if (!sel || !el) return;
  const opt = sel.options[sel.selectedIndex];
  el.textContent = opt ? opt.textContent : "";
}

function syncFoodWeekdaySummaryLabel() {
  const sel = document.getElementById("foodPlanningWeekday");
  const el = document.getElementById("foodWeekdaySummary");
  if (!sel || !el) return;
  const opt = sel.options[sel.selectedIndex];
  el.textContent = opt ? opt.textContent : "";
}

function syncFoodScopeSummaryLabel() {
  const sel = document.getElementById("foodScopeSelect");
  const el = document.getElementById("foodScopeSummary");
  if (!sel || !el) return;
  const opt = sel.options[sel.selectedIndex];
  el.textContent = opt ? opt.textContent : "—";
}

function syncFoodDeviationPresetSummaryLabel() {
  const sel = document.getElementById("foodDevEditPreset");
  const el = document.getElementById("foodDevEditPresetSummary");
  if (!sel || !el) return;
  const opt = sel.options[sel.selectedIndex];
  el.textContent = opt ? opt.textContent : "—";
}

function initOverviewPeriodSheet() {
  const { backdrop, handle, sheet } = getPeriodSheetEls();
  if (!backdrop || !sheet) return;

  document.getElementById("overviewPeriodOpenBtn")?.addEventListener("click", () => openOverviewPeriodSheet());
  document.getElementById("expenseFilterPeriodOpenBtn")?.addEventListener("click", () => openExpenseFilterPeriodSheet());
  document.getElementById("incomeFilterPeriodOpenBtn")?.addEventListener("click", () => openIncomeFilterPeriodSheet());
  document.getElementById("foodPreviewPeriodOpenBtn")?.addEventListener("click", () => openFoodPreviewPeriodSheet());

  backdrop.addEventListener("click", () => closePeriodSheetAnimated());
  attachBottomSheetDragDismiss(handle, sheet, () => closePeriodSheetAnimated());

  const lb = document.getElementById("listPickerBackdrop");
  const ls = document.getElementById("listPickerSheet");
  const lh = document.getElementById("listPickerHandle");
  if (lb && ls && lh) {
    lb.addEventListener("click", () => closeListPickerAnimated());
    attachBottomSheetDragDismiss(lh, ls, () => closeListPickerAnimated());
  }

  document.getElementById("themeModeOpenBtn")?.addEventListener("click", () => {
    const sel = document.getElementById("themeMode");
    if (!sel) return;
    const options = Array.from(sel.options).map((o) => ({ value: o.value, label: o.textContent || o.value }));
    openListPickerSheet({
      title: "Tema",
      options,
      currentValue: sel.value,
      onSelect: (v) => {
        sel.value = v;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        syncThemeModeSummaryLabel();
      }
    });
  });

  document.getElementById("foodWeekdayOpenBtn")?.addEventListener("click", () => {
    const sel = document.getElementById("foodPlanningWeekday");
    if (!sel) return;
    const options = Array.from(sel.options).map((o) => ({ value: o.value, label: o.textContent || o.value }));
    openListPickerSheet({
      title: "Planeringsdag",
      options,
      currentValue: sel.value,
      onSelect: (v) => {
        sel.value = v;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        syncFoodWeekdaySummaryLabel();
        saveState();
      }
    });
  });
}

function initMobileDateSheetPicker() {
  const { backdrop, prevBtn, nextBtn, handle, sheet, monthYearBtn } = getDateSheetEls();
  if (!backdrop || !sheet) return;

  document.addEventListener(
    "pointerdown",
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.type !== "date") return;
      if (!isDateSheetViewport() && !t.hasAttribute("data-date-clear")) return;
      if (t.disabled || t.hasAttribute("data-native-date")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true
  );

  document.addEventListener(
    "click",
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.type !== "date") return;
      if (!isDateSheetViewport() && !t.hasAttribute("data-date-clear")) return;
      if (t.disabled || t.hasAttribute("data-native-date")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openDateSheet(t);
    },
    true
  );

  document.addEventListener(
    "focus",
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.type !== "date") return;
      if (!isDateSheetViewport() && !t.hasAttribute("data-date-clear")) return;
      if (t.disabled || t.hasAttribute("data-native-date")) return;
      t.blur();
      openDateSheet(t);
    },
    true
  );

  backdrop.addEventListener("click", () => closeDateSheetAnimated(true));
  attachBottomSheetDragDismiss(handle, sheet, () => closeDateSheetAnimated(true));

  const tvSw = document.getElementById("dateSheetTillsvidareSwitch");
  if (tvSw) {
    tvSw.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!dateSheetOpen || !dateSheetTargetAllowsTillsvidare()) return;
      /* Endast manuellt läge "på" (tillsvidare). Av: bara genom att välja datum i kalendern. */
      if (dateSheetTillsvidareOn) return;
      const inp = dateSheetTargetInput;
      if (!inp || inp.disabled) return;
      inp.value = "";
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      syncDateFieldRow(inp);
      closeDateSheetAnimated(false);
    });
  }

  monthYearBtn?.addEventListener("click", () => {
    dateSheetMode = dateSheetMode === "days" ? "months" : "days";
    renderDateSheetMonth();
    if (dateSheetMode === "months") {
      requestAnimationFrame(() => {
        const first = document.querySelector(
          "#dateSheetMonthPickerGrid .date-sheet-month-pick:not(:disabled)"
        );
        (first instanceof HTMLElement ? first : null)?.focus();
      });
    }
  });

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (dateSheetMode === "months") {
        dateSheetViewY -= 1;
        renderDateSheetMonth();
        return;
      }
      if (dateSheetViewM <= 1) {
        dateSheetViewM = 12;
        dateSheetViewY -= 1;
      } else {
        dateSheetViewM -= 1;
      }
      renderDateSheetMonth();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (dateSheetMode === "months") {
        dateSheetViewY += 1;
        renderDateSheetMonth();
        return;
      }
      if (dateSheetViewM >= 12) {
        dateSheetViewM = 1;
        dateSheetViewY += 1;
      } else {
        dateSheetViewM += 1;
      }
      renderDateSheetMonth();
    });
  }

  let dateSheetPanesResizeTimer = null;
  window.addEventListener("resize", () => {
    if (!dateSheetOpen) return;
    clearTimeout(dateSheetPanesResizeTimer);
    dateSheetPanesResizeTimer = setTimeout(() => {
      scheduleDateSheetPanesMinHeight(true);
    }, 120);
  });
}

function getDefaultState() {
  return {
    version: 2,
    themeMode: "system", // system | light | dark
    settings: {
      backupIntervalDays: 30,
      backupFilenamePattern: "bjorklunds_budget_{YYYY}-{MM}.json",
      lastBackupPromptAt: 0,
      foodPlanningWeekday: 1
    },
    incomes: [],
    expenses: [],
    oneOff: {
      incomes: {},
      expenses: {}
    },
    special: {
      car: {},
      home: {},
      loans: { items: [] },
      food: {},
      foodShared: { config: {}, weeks: [] },
      children: {}
    }
  };
}

function ensureOneOffList(root, year, monthIndex1to12) {
  const y = String(year);
  const m = monthKey(monthIndex1to12);
  if (!root[y]) root[y] = {};
  if (!root[y][m]) root[y][m] = [];
  return root[y][m];
}

function deepCloneJson(x) {
  try {
    return x == null ? x : JSON.parse(JSON.stringify(x));
  } catch {
    return {};
  }
}

/** En post i expenses med category, valfri subcategory och metadata (schedule, food, …). */
function canonicalizeExpenseRecord(raw) {
  const payments = Array.isArray(raw?.payments) ? raw.payments : [];
  const normalizedPayments = payments.map((p) => ({
    id: p?.id || uid(),
    date: p?.date || "",
    amount: asNumber(p?.amount)
  }));

  let category = String(raw?.category || "other").trim() || "other";

  let subcategory = raw?.subcategory;
  if (category === "savings" && (subcategory == null || subcategory === "")) subcategory = "own";

  const meta =
    typeof raw?.metadata === "object" && raw.metadata && !Array.isArray(raw.metadata) ? deepCloneJson(raw.metadata) : {};

  if (meta.food && typeof meta.food === "object" && Object.keys(meta.food).length > 0) meta.food = { ...meta.food };
  else delete meta.food;

  let origin = raw?.origin;
  if (origin !== "system" && origin !== "user") {
    if (category === "loans" && meta.loanId) origin = "system";
    else if (meta.food?.generated) origin = "system";
    else origin = "user";
  }

  const out = {
    id: raw?.id || uid(),
    name: String(raw?.name || "").trim(),
    category,
    interval: raw?.interval || "once",
    origin,
    payments: normalizedPayments
  };
  if (subcategory != null && subcategory !== "") out.subcategory = String(subcategory);
  if (Object.keys(meta).length > 0) out.metadata = meta;
  return out;
}

function normalizeStateShape(state) {
  const base = getDefaultState();
  if (!state || typeof state !== "object") return base;

  const normalized = { ...base, ...state };
  normalized.version = 2;

  normalized.themeMode = ["system", "light", "dark"].includes(normalized.themeMode) ? normalized.themeMode : "system";

  normalized.settings = { ...base.settings, ...(normalized.settings || {}) };
  normalized.settings.backupIntervalDays = Math.max(1, Math.floor(asNumber(normalized.settings.backupIntervalDays || 30)));
  normalized.settings.backupFilenamePattern =
    typeof normalized.settings.backupFilenamePattern === "string" && normalized.settings.backupFilenamePattern.trim()
      ? normalized.settings.backupFilenamePattern
      : base.settings.backupFilenamePattern;
  normalized.settings.foodPlanningWeekday = Math.max(1, Math.min(7, Math.floor(asNumber(normalized.settings.foodPlanningWeekday || 1))));

  delete normalized.recurring;

  normalized.incomes = Array.isArray(normalized.incomes) ? normalized.incomes : [];
  normalized.expenses = Array.isArray(normalized.expenses) ? normalized.expenses : [];

  normalized.oneOff = normalized.oneOff || base.oneOff;
  normalized.oneOff.incomes = normalized.oneOff.incomes || {};
  normalized.oneOff.expenses = normalized.oneOff.expenses || {};

  normalized.special = normalized.special || base.special;
  normalized.special.car = normalized.special.car || {};
  normalized.special.home = normalized.special.home || {};
  delete normalized.special.housing;
  {
    const lr = normalized.special.loans;
    normalized.special.loans =
      lr && typeof lr === "object" && Array.isArray(lr.items)
        ? { items: lr.items.filter((x) => x && typeof x === "object") }
        : { items: [] };
  }
  normalized.special.food = {};
  normalized.special.children = normalized.special.children || {};
  {
    const fs = normalized.special.foodShared;
    const weeks = fs && typeof fs === "object" && Array.isArray(fs.weeks) ? fs.weeks : [];
    const cfgIn = fs && typeof fs === "object" && fs.config && typeof fs.config === "object" ? fs.config : {};
    normalized.special.foodShared = {
      config: normalizeStoredFoodConfigObject(cfgIn),
      weeks
    };
  }

  ensureIncomeIds(normalized);
  cleanupIncomeGarbage(normalized);
  ensureExpenseIds(normalized);
  normalized.expenses = dedupeGeneratedFoodExpenses(normalized.expenses);
  cleanupExpenseGarbage(normalized);
  regenerateMirroredLoanExpenses(normalized);

  return normalized;
}

function cleanupIncomeGarbage(root) {
  if (!Array.isArray(root.incomes)) return;

  const hasMeaningfulPayments = (inc) => {
    const payments = Array.isArray(inc?.payments) ? inc.payments : [];
    return payments.some((p) => {
      const amt = asNumber(p?.amount);
      const hasDate = Boolean(p?.date);
      // "Meningsfull" om belopp > 0 och datum finns
      return amt > 0 && hasDate;
    });
  };

  root.incomes = root.incomes.filter((inc) => {
    const name = String(inc?.name || "").trim();
    // Rensa bara om det är helt tomt + inga meningsfulla inbetalningar
    if (!name && !hasMeaningfulPayments(inc)) return false;
    return true;
  });
}

function cleanupExpenseGarbage(root) {
  if (!Array.isArray(root.expenses)) return;
  const hasMeaningfulPayments = (exp) => {
    const payments = Array.isArray(exp?.payments) ? exp.payments : [];
    return payments.some((p) => asNumber(p?.amount) > 0 && Boolean(p?.date));
  };
  root.expenses = root.expenses.filter((exp) => {
    const name = String(exp?.name || "").trim();
    if (!name && !hasMeaningfulPayments(exp)) return false;
    return true;
  });
}

const INCOME_CATEGORY_SALARY = "salary";
const INCOME_CATEGORY_OTHER = "other";

function normalizeIncomeRecord(raw) {
  const incomeId = raw?.id || uid();
  const payments = Array.isArray(raw?.payments) ? raw.payments : [];
  const normalizedPayments = payments.map((p) => ({
    id: p?.id || uid(),
    date: p?.date || "",
    amount: asNumber(p?.amount)
  }));
  const nameTrim = String(raw?.name || "").trim();
  let category = String(raw?.category || INCOME_CATEGORY_OTHER).trim() || INCOME_CATEGORY_OTHER;
  if (![INCOME_CATEGORY_SALARY, INCOME_CATEGORY_OTHER, "one_off"].includes(category)) category = INCOME_CATEGORY_OTHER;
  if (category === INCOME_CATEGORY_OTHER && /^lön$/i.test(nameTrim)) category = INCOME_CATEGORY_SALARY;

  let interval = raw?.interval || "once";
  if (category === INCOME_CATEGORY_SALARY) interval = "monthly";

  const meta =
    typeof raw?.metadata === "object" && raw.metadata && !Array.isArray(raw.metadata) ? deepCloneJson(raw.metadata) : {};

  if (category !== INCOME_CATEGORY_SALARY) {
    delete meta.salary;
  } else {
    const salIn = meta.salary && typeof meta.salary === "object" ? meta.salary : {};
    const byYear = salIn.byYear && typeof salIn.byYear === "object" ? { ...salIn.byYear } : {};
    const pd = Math.floor(asNumber(salIn.payDay));
    const payDay = Number.isFinite(pd) && pd >= 1 && pd <= 31 ? pd : 25;
    meta.salary = { byYear, payDay };
  }

  const out = {
    id: incomeId,
    name: nameTrim,
    interval,
    category,
    payments: normalizedPayments
  };
  if (Object.keys(meta).length > 0) out.metadata = meta;
  return out;
}

function ensureIncomeIds(root) {
  if (!Array.isArray(root.incomes)) root.incomes = [];
  root.incomes = root.incomes.map((inc) => normalizeIncomeRecord(inc));
}

function isSalaryIncome(inc) {
  return Boolean(inc && inc.category === INCOME_CATEGORY_SALARY);
}

function incomeDisplayName(inc) {
  if (isSalaryIncome(inc)) return "Lön";
  return String(inc?.name || "Intäkt").trim() || "Intäkt";
}

function resolveSalaryTemplateForCalendarYear(byYear, calendarYear) {
  const y = Number(calendarYear);
  if (!Number.isFinite(y)) return 0;
  const obj = byYear && typeof byYear === "object" ? byYear : {};
  const keys = Object.keys(obj)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n) && asNumber(obj[String(n)]) > 0)
    .sort((a, b) => a - b);
  if (keys.length === 0) return 0;
  let bestAmt = 0;
  let found = false;
  for (const k of keys) {
    if (k <= y) {
      bestAmt = asNumber(obj[String(k)]);
      found = true;
    }
  }
  if (found) return bestAmt;
  return asNumber(obj[String(keys[0])]);
}

function salaryEditorAnchorYears() {
  const y = currentYearMonth().year;
  return [y - 1, y, y + 1];
}

function updateIncomeSalaryBandLabels() {
  const ys = salaryEditorAnchorYears();
  const labels = [`${ys[0]} · föregående`, `${ys[1]} · nu`, `${ys[2]} · nästa`];
  ["incomeSalaryBandPrevLabel", "incomeSalaryBandCurLabel", "incomeSalaryBandNextLabel"].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.textContent = labels[i];
  });
}

function readSalaryByYearFromBandInputs() {
  const ys = salaryEditorAnchorYears();
  const ids = ["incomeSalaryBandPrev", "incomeSalaryBandCur", "incomeSalaryBandNext"];
  const byYear = {};
  ids.forEach((id, i) => {
    const v = asNumber(document.getElementById(id)?.value);
    if (v > 0) byYear[String(ys[i])] = v;
  });
  return byYear;
}

function writeSalaryByYearToBandInputs(byYear) {
  const ys = salaryEditorAnchorYears();
  const ids = ["incomeSalaryBandPrev", "incomeSalaryBandCur", "incomeSalaryBandNext"];
  ys.forEach((y, i) => {
    const el = document.getElementById(ids[i]);
    if (!el) return;
    const v = byYear && byYear[String(y)] != null ? asNumber(byYear[String(y)]) : 0;
    el.value = v > 0 ? String(v) : "";
  });
}

function regenerateSalaryEditorPayments() {
  const years = salaryEditorAnchorYears();
  const payDay = Math.max(1, Math.min(31, Math.floor(asNumber(document.getElementById("incomeSalaryPayDay")?.value || 25)))) || 25;
  const byYear = readSalaryByYearFromBandInputs();
  const prev = Array.isArray(ui.incomeEditorPayments) ? ui.incomeEditorPayments : [];
  const prevByKey = new Map();
  for (const p of prev) {
    const y = parseIntOrNull(p.year);
    const m = parseIntOrNull(p.month);
    if (y === null || m === null) continue;
    prevByKey.set(`${y}-${pad2(m)}`, p);
  }
  const rows = [];
  for (const y of years) {
    const template = resolveSalaryTemplateForCalendarYear(byYear, y);
    for (let m = 1; m <= 12; m++) {
      const key = `${y}-${pad2(m)}`;
      const existing = prevByKey.get(key);
      const d = clampDay(y, m, payDay);
      const prevAmt = existing ? asNumber(existing.amount) : 0;
      rows.push({
        id: existing?.id || uid(),
        year: String(y),
        month: pad2(m),
        day: String(d),
        amount: prevAmt > 0 ? prevAmt : template
      });
    }
  }
  ui.incomeEditorPayments = rows;
  renderIncomePaymentsEditorRows();
}

function ensureExpenseIds(root) {
  if (!Array.isArray(root.expenses)) root.expenses = [];
  root.expenses = root.expenses.map((exp) => canonicalizeExpenseRecord(exp));
}

function dedupeGeneratedFoodExpenses(expenses) {
  if (!Array.isArray(expenses)) return expenses;
  const seenWeek = new Set();
  return expenses.filter((exp) => {
    const wk = exp?.metadata?.food?.weekKey;
    const yFood = exp?.metadata?.food?.year;
    if (isMatLikeExpense(exp) && wk) {
      const y = Number(yFood);
      if (!Number.isFinite(y)) return true;
      const k = `${y}|${wk}`;
      if (seenWeek.has(k)) return false;
      seenWeek.add(k);
      return true;
    }
    return true;
  });
}

/** True om utgiften räknas som systemgenererad mat för ett visst kalenderår. */
function isGeneratedMatExpenseForYear(exp, year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return false;
  if (!isMatLikeExpense(exp)) return false;
  const fy = Number(exp.metadata?.food?.year);
  return Number.isFinite(fy) && fy === y;
}

function isMatLikeExpense(exp) {
  return Boolean(exp?.metadata?.food?.generated);
}

/** Bilutgifter: category car + subcategory (typnyckel). */
const CAR_EXPENSE_TYPES = [
  { key: "insurance", label: "Försäkring" },
  { key: "leasing", label: "Leasing avgift" },
  { key: "road_tax", label: "Trafikskatt" },
  { key: "inspection", label: "Besiktning" },
  { key: "parking_fee", label: "Parkeringsavgift" },
  { key: "fuel", label: "Drivmedel" },
  { key: "electricity", label: "El" },
  { key: "car_wash", label: "Biltvätt" },
  { key: "tolls", label: "Vägavgifter" },
  { key: "ferry", label: "Färjeavgifter" }
];

function isCarExpense(exp) {
  return Boolean(exp && exp.category === "car");
}

function isHomeExpense(exp) {
  return Boolean(exp && exp.category === "home");
}

function isChildrenExpense(exp) {
  return Boolean(exp && exp.category === "children");
}

function isSavingsExpense(exp) {
  return Boolean(exp && exp.category === "savings");
}

function isMirroredLoanExpense(exp) {
  return Boolean(exp && exp.category === "loans" && exp.metadata?.loanId);
}

function isTaggedOverviewExpense(exp) {
  return isCarExpense(exp) || isHomeExpense(exp) || isChildrenExpense(exp) || isSavingsExpense(exp);
}

const HOME_EXPENSE_TYPES = [
  { key: "rent", label: "Hyra" },
  { key: "electricity", label: "El" },
  { key: "water", label: "Vatten" },
  { key: "garbage", label: "Sophämtning" },
  { key: "internet", label: "Internet" },
  { key: "parking_slot", label: "Parkeringsplats" },
  { key: "streaming", label: "Streaming tjänst" },
  { key: "digital_service", label: "Digitala tjänst" },
  { key: "mobile_plan", label: "Mobil abonnemang" },
  { key: "association_fee", label: "Föreningsavgift" },
  { key: "bus_card", label: "Busskort" },
  { key: "other", label: "Annan" }
];

const CHILDREN_EXPENSE_TYPES = [
  { key: "clothes", label: "Kläder" },
  { key: "bus_card", label: "Busskort" },
  { key: "mobile_plan", label: "Mobil abonnemang" },
  { key: "activity", label: "Aktivitet" },
  { key: "pocket_money", label: "Månadspeng" },
  { key: "birthday_gifts", label: "Födelsedagspresenter" },
  { key: "christmas_gifts", label: "Julklappar" },
  { key: "other", label: "Annan" }
];

/** Värden för härledd fast/rörlig-klassning (analys) — sätts inte av användaren i normalfallet. */
const EXPENSE_COST_FIXED = "fixed";
const EXPENSE_COST_VARIABLE = "variable";
const EXPENSE_COST_UNKNOWN = "unknown";

/**
 * Hem: fast = återkommande boendekostnader; other = okänd tills egen typ (t.ex. hemförsäkring).
 * Nycklar = subcategory (HOME_EXPENSE_TYPES).
 */
const HOME_SUBCATEGORY_COST_BEHAVIOR = {
  rent: EXPENSE_COST_FIXED,
  electricity: EXPENSE_COST_FIXED,
  water: EXPENSE_COST_FIXED,
  garbage: EXPENSE_COST_FIXED,
  internet: EXPENSE_COST_FIXED,
  parking_slot: EXPENSE_COST_FIXED,
  streaming: EXPENSE_COST_FIXED,
  digital_service: EXPENSE_COST_FIXED,
  mobile_plan: EXPENSE_COST_FIXED,
  association_fee: EXPENSE_COST_FIXED,
  bus_card: EXPENSE_COST_FIXED,
  other: EXPENSE_COST_UNKNOWN
};

/**
 * Bil: fast = försäkring, skatt, leasing, besiktning; rörlig = drift, parkering, avgifter.
 * Nycklar = subcategory (CAR_EXPENSE_TYPES).
 */
const CAR_SUBCATEGORY_COST_BEHAVIOR = {
  insurance: EXPENSE_COST_FIXED,
  leasing: EXPENSE_COST_FIXED,
  road_tax: EXPENSE_COST_FIXED,
  inspection: EXPENSE_COST_FIXED,
  parking_fee: EXPENSE_COST_VARIABLE,
  fuel: EXPENSE_COST_VARIABLE,
  electricity: EXPENSE_COST_VARIABLE,
  car_wash: EXPENSE_COST_VARIABLE,
  tolls: EXPENSE_COST_VARIABLE,
  ferry: EXPENSE_COST_VARIABLE
};

/** Barn: enligt analysmodell behandlas alla typer som rörliga. */
const CHILDREN_SUBCATEGORY_COST_BEHAVIOR = Object.fromEntries(
  CHILDREN_EXPENSE_TYPES.map(({ key }) => [key, EXPENSE_COST_VARIABLE])
);

/**
 * Härleder fast vs rörlig utgift för analys (ingen användarklassning krävs).
 * Valfri override: metadata.analysis.costBehavior === "fixed" | "variable" (för import/felsök).
 * @returns {typeof EXPENSE_COST_FIXED | typeof EXPENSE_COST_VARIABLE | typeof EXPENSE_COST_UNKNOWN}
 */
function getExpenseCostBehavior(exp) {
  if (!exp || typeof exp !== "object") return EXPENSE_COST_UNKNOWN;
  const ovr = exp.metadata?.analysis?.costBehavior;
  if (ovr === EXPENSE_COST_FIXED || ovr === EXPENSE_COST_VARIABLE) return ovr;

  if (isMatLikeExpense(exp)) return EXPENSE_COST_VARIABLE;

  const cat = String(exp.category || "other").trim() || "other";

  if (cat === "savings") return EXPENSE_COST_FIXED;
  if (cat === "loans") return EXPENSE_COST_FIXED;
  if (cat === "one_off") return EXPENSE_COST_VARIABLE;

  if (cat === "home") {
    const key = String(exp.subcategory || "other").trim() || "other";
    const b = HOME_SUBCATEGORY_COST_BEHAVIOR[key];
    return b != null ? b : EXPENSE_COST_UNKNOWN;
  }

  if (cat === "car") {
    const key = String(exp.subcategory || "").trim();
    if (!key) return EXPENSE_COST_UNKNOWN;
    const b = CAR_SUBCATEGORY_COST_BEHAVIOR[key];
    return b != null ? b : EXPENSE_COST_UNKNOWN;
  }

  if (cat === "children") {
    const key = String(exp.subcategory || "other").trim() || "other";
    const b = CHILDREN_SUBCATEGORY_COST_BEHAVIOR[key];
    return b != null ? b : EXPENSE_COST_VARIABLE;
  }

  if (cat === "other") return EXPENSE_COST_UNKNOWN;

  return EXPENSE_COST_UNKNOWN;
}

/** Gemensam konfiguration för Bil / Hem / Barn (samma UI-flöde som Bil). */
const TAGGED_CATEGORY_CONFIG = {
  car: {
    overlayKey: "car",
    category: "car",
    subcategoryField: "subcategory",
    types: CAR_EXPENSE_TYPES,
    ids: {
      editorCard: "carEditorCard",
      editorTitle: "carEditorPanelLegend",
      editType: "carEditType",
      editName: "carEditName",
      editInterval: "carEditInterval",
      editFirstDate: "carEditFirstDate",
      endDateRow: "carEndDateRow",
      editEndDate: "carEditEndDate",
      editAmount: "carEditAmount",
      deleteBtn: "carDeleteBtn",
      saveBtn: "carSaveBtn",
      cancelBtn: "carCancelEditorBtn",
      note: "carNote",
      listYear: "carListYear",
      listMonth: "carListMonth",
      listMount: "carListMount",
      listMonthTitle: "carListMonthTitle",
      monthTotal: "carMonthTotal",
      addBtn: "carAddBtn"
    },
    labels: {
      newItem: "Ny bilutgift",
      editItem: "Redigera bilutgift",
      emptyMonth: "Inga bilutgifter denna månad."
    }
  },
  home: {
    overlayKey: "home",
    category: "home",
    subcategoryField: "subcategory",
    types: HOME_EXPENSE_TYPES,
    ids: {
      editorCard: "homeEditorCard",
      editorTitle: "homeEditorPanelLegend",
      editType: "homeEditType",
      editName: "homeEditName",
      editInterval: "homeEditInterval",
      editFirstDate: "homeEditFirstDate",
      endDateRow: "homeEndDateRow",
      editEndDate: "homeEditEndDate",
      editAmount: "homeEditAmount",
      deleteBtn: "homeDeleteBtn",
      saveBtn: "homeSaveBtn",
      cancelBtn: "homeCancelEditorBtn",
      note: "homeNote",
      listYear: "homeListYear",
      listMonth: "homeListMonth",
      listMount: "homeListMount",
      listMonthTitle: "homeListMonthTitle",
      monthTotal: "homeMonthTotal",
      addBtn: "homeAddBtn"
    },
    labels: {
      newItem: "Ny hemutgift",
      editItem: "Redigera hemutgift",
      emptyMonth: "Inga hemomkostnader denna månad."
    }
  },
  children: {
    overlayKey: "children",
    category: "children",
    subcategoryField: "subcategory",
    types: CHILDREN_EXPENSE_TYPES,
    ids: {
      editorCard: "childrenEditorCard",
      editorTitle: "childrenEditorPanelLegend",
      editType: "childrenEditType",
      editName: "childrenEditName",
      editInterval: "childrenEditInterval",
      editFirstDate: "childrenEditFirstDate",
      endDateRow: "childrenEndDateRow",
      editEndDate: "childrenEditEndDate",
      editAmount: "childrenEditAmount",
      deleteBtn: "childrenDeleteBtn",
      saveBtn: "childrenSaveBtn",
      cancelBtn: "childrenCancelEditorBtn",
      note: "childrenNote",
      listYear: "childrenListYear",
      listMonth: "childrenListMonth",
      listMount: "childrenListMount",
      listMonthTitle: "childrenListMonthTitle",
      monthTotal: "childrenMonthTotal",
      addBtn: "childrenAddBtn"
    },
    labels: {
      newItem: "Ny barnutgift",
      editItem: "Redigera barnutgift",
      emptyMonth: "Inga barnutgifter denna månad."
    }
  },
  savings: {
    overlayKey: "savings",
    category: "savings",
    subcategoryField: "subcategory",
    types: [
      { key: "own", label: "Eget sparande" },
      { key: "system", label: "System Sparande" }
    ],
    hideTypeInEditor: true,
    defaultTypeKey: "own",
    hideTypeInList: true,
    omitTypeInOverviewLabel: true,
    ids: {
      editorCard: "savingsEditorCard",
      editorTitle: "savingsEditorPanelLegend",
      editName: "savingsEditName",
      editInterval: "savingsEditInterval",
      editFirstDate: "savingsEditFirstDate",
      endDateRow: "savingsEndDateRow",
      editEndDate: "savingsEditEndDate",
      editAmount: "savingsEditAmount",
      deleteBtn: "savingsDeleteBtn",
      saveBtn: "savingsSaveBtn",
      cancelBtn: "savingsCancelEditorBtn",
      note: "savingsNote",
      listYear: "savingsListYear",
      listMonth: "savingsListMonth",
      listMount: "savingsListMount",
      listMonthTitle: "savingsListMonthTitle",
      monthTotal: "savingsMonthTotal",
      addBtn: "savingsAddBtn"
    },
    labels: {
      newItem: "Nytt sparande",
      editItem: "Redigera sparande",
      emptyMonth: "Inget spar denna månad.",
      monthListTitlePrefix: "Sparbelopp",
      monthTotalPrefix: "Totalt sparat denna månad",
      nameRequiredHint: "Ange namn på spar.",
      dateOnceHint: "Ange datum för spar.",
      dateRecurringHint: "Ange första spar tillfälle.",
      endDateHint: "Ogiltigt slutdatum för spar.",
      firstDateOnce: "Spar datum",
      firstDateRecurring: "Spar datum",
      endDate: "Gäller till"
    }
  }
};

const TAGGED_CATEGORY_KEYS = Object.keys(TAGGED_CATEGORY_CONFIG);

function getTaggedExpenseCategory(exp) {
  const c = exp?.category;
  if (c && TAGGED_CATEGORY_CONFIG[c]) return c;
  return null;
}

function getTaggedTypeLabel(cat, typeKey) {
  const C = TAGGED_CATEGORY_CONFIG[cat];
  if (!C) return String(typeKey || "");
  const k = String(typeKey || "");
  const row = C.types.find((t) => t.key === k);
  return row ? row.label : k || C.category;
}

function getCarTypeLabel(carTypeKey) {
  return getTaggedTypeLabel("car", carTypeKey);
}

/** Bygger betalningslista inom appens tillåtna år (föregående/nu/nästa). */
function buildCarExpensePayments({ interval, firstDateISO, endDateISO, paymentDay, amount }) {
  const amt = Math.max(0, asNumber(amount));
  if (amt <= 0) return [];

  const firstParts = datePartsFromIso(firstDateISO);
  if (!firstParts) return [];

  const firstTime = new Date(firstParts.y, firstParts.m - 1, firstParts.d).getTime();
  let endTime = null;
  if (endDateISO && String(endDateISO).trim()) {
    const ep = datePartsFromIso(endDateISO);
    if (ep) endTime = new Date(ep.y, ep.m - 1, ep.d).getTime();
  }
  if (endTime !== null && endTime < firstTime) return [];

  const payDay = Math.max(1, Math.min(31, Math.floor(asNumber(paymentDay) || firstParts.d)));
  const ys = getSelectableAppYears();
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const out = [];

  if (interval === "once") {
    if (!isAllowedYear(firstParts.y)) return [];
    const dd = clampDay(firstParts.y, firstParts.m, firstParts.d);
    out.push({ id: uid(), date: `${firstParts.y}-${pad2(firstParts.m)}-${pad2(dd)}`, amount: amt });
    return out;
  }

  if (interval === "weekly") {
    const cur = new Date(firstParts.y, firstParts.m - 1, firstParts.d);
    cur.setHours(12, 0, 0, 0);
    for (let guard = 0; guard < 800; guard++) {
      const y = cur.getFullYear();
      const m = cur.getMonth() + 1;
      const d = cur.getDate();
      const t = cur.getTime();
      if (endTime !== null && t > endTime) break;
      if (t >= firstTime && y >= minY && y <= maxY && isAllowedYear(y)) {
        out.push({ id: uid(), date: `${y}-${pad2(m)}-${pad2(d)}`, amount: amt });
      }
      cur.setDate(cur.getDate() + 7);
      if (y > maxY + 2) break;
    }
    return out;
  }

  let y = firstParts.y;
  let m = firstParts.m;
  let first = true;
  for (let i = 0; i < 400; i++) {
    const d = first ? firstParts.d : payDay;
    const dd = clampDay(y, m, d);
    const t = new Date(y, m - 1, dd).getTime();
    if (endTime !== null && t > endTime) break;
    if (t >= firstTime && y >= minY && y <= maxY && isAllowedYear(y)) {
      out.push({ id: uid(), date: `${y}-${pad2(m)}-${pad2(dd)}`, amount: amt });
    }
    first = false;
    if (interval === "monthly") {
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    } else if (interval === "quarterly") {
      m += 3;
      while (m > 12) {
        m -= 12;
        y += 1;
      }
    } else if (interval === "yearly") {
      y += 1;
    } else break;

    if (y > maxY + 2) break;
  }
  return out;
}

let state = null;
const ui = {
  activeRoute: "overview",
  // Analys (route "overview")
  overviewYear: null,
  overviewMonth: null,
  // Utgifter
  expensesYear: null,
  expensesTab: "summary",
  // Intäkter
  incomeYearFilter: null,
  incomeMonthFilter: "all",
  incomeEditorKind: "other",
  lastIncomeListRows: [],
  // Utgifter
  expenseYearFilter: null,
  expenseMonthFilter: "all",
  loanEditorOpen: false,
  editLoanId: null,
  foodScrollWeekKey: null,
  tagged: {
    car: { editorOpen: false, editingId: null, listYear: null, listMonth: null },
    home: { editorOpen: false, editingId: null, listYear: null, listMonth: null },
    children: { editorOpen: false, editingId: null, listYear: null, listMonth: null },
    savings: { editorOpen: false, editingId: null, listYear: null, listMonth: null }
  }
};

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return getDefaultState();
  const parsed = safeParseJson(raw);
  return normalizeStateShape(parsed);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function applyTheme() {
  const mode = state.themeMode || "system";
  const resolved = mode === "system" ? getSystemTheme() : mode;
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#0c120f" : "#255f33");
}

function initSystemThemeListener() {
  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((state.themeMode || "system") !== "system") return;
      applyTheme();
      renderOverviewIfOnOverview();
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  } catch {
    /* ignore */
  }
}

function initRouting() {
  const routeFromHash = () => {
    const h = (location.hash || "#/overview").trim();
    if (!h.startsWith("#/")) return "overview";
    const part = h.slice(2).split("?")[0].trim();
    return part || "overview";
  };

  const view = (name) => {
    ui.activeRoute = name;
    const routeView = name === "savings" ? "expenses" : name;
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.querySelectorAll("[data-view]").forEach((v) => {
      if (v.getAttribute("data-view") === routeView) v.classList.add("active");
    });
    if (routeView !== "expenses" && anyExpenseOverlayOpen()) {
      closeExpenseCategoryOverlay({ fromHistory: false });
      expenseOverlayHistoryDepth = 0;
    }
    document.querySelectorAll("[data-navlink]").forEach((el) => {
      const link = el.getAttribute("data-navlink");
      if (link === name) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
  };

  const onChange = () => {
    const allowed = new Set(["overview", "incomes", "expenses", "savings", "settings"]);
    let route = routeFromHash();
    if (!allowed.has(route)) route = "overview";
    view(route);
    try {
      renderRoute(route);
    } catch (e) {
      showDebugToast(`Routing-fel (${route}): ${e?.message || e}`);
      throw e;
    }
  };

  window.addEventListener("hashchange", onChange);
  onChange();
}

function currentYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function getAvailableYears() {
  const years = new Set();
  const cur = currentYearMonth().year;
  for (let y = cur - 1; y <= cur + 1; y++) years.add(String(y));

  const addFrom = (obj) => {
    if (!obj) return;
    Object.keys(obj).forEach((k) => years.add(k));
  };
  addFrom(state.special?.car);
  addFrom(state.special?.home);
  for (const loan of state.special?.loans?.items || []) {
    const fp = datePartsFromIso(String(loan?.firstPaymentDate || ""));
    if (fp) years.add(String(fp.y));
    if (loan?.endDate) {
      const ep = datePartsFromIso(String(loan.endDate));
      if (ep) years.add(String(ep.y));
    }
  }
  addFrom(state.special?.children);
  addFrom(state.special?.food);

  for (const inc of state.incomes || []) {
    for (const p of inc.payments || []) {
      const dt = p?.date ? new Date(p.date) : null;
      if (dt && !Number.isNaN(dt.getTime())) years.add(String(dt.getFullYear()));
    }
  }
  for (const exp of state.expenses || []) {
    for (const p of exp.payments || []) {
      const dt = p?.date ? new Date(p.date) : null;
      if (dt && !Number.isNaN(dt.getTime())) years.add(String(dt.getFullYear()));
    }
  }
  return Array.from(years)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

function setSelectOptions(selectEl, years, selectedYear) {
  selectEl.innerHTML = "";
  for (const y of years) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = String(y);
    if (Number(selectedYear) === Number(y)) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function setMonthOptions(selectEl, selectedMonth) {
  selectEl.innerHTML = "";
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement("option");
    opt.value = String(m);
    opt.textContent = monthName(m);
    if (Number(selectedMonth) === m) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function weeksToMonthlyCount(perWeek) {
  const x = asNumber(perWeek);
  // Avrunda till heltal måltider
  return Math.max(0, Math.round(x * WEEKS_PER_MONTH));
}

function computeTaggedCategoryMonthly(year, month, cat) {
  const C = TAGGED_CATEGORY_CONFIG[cat];
  const items = [];
  let total = 0;
  const keyField = C.subcategoryField || "subcategory";
  const omitType = Boolean(C.omitTypeInOverviewLabel);
  for (const exp of state.expenses || []) {
    if (exp.category !== C.category) continue;
    const typeKey = exp[keyField];
    const typeLabel = getTaggedTypeLabel(cat, typeKey);
    const name = String(exp.name || "").trim() || typeLabel;
    for (const p of exp.payments || []) {
      const pAmt = asNumber(p.amount);
      if (pAmt <= 0) continue;
      const dt = p.date ? new Date(p.date) : null;
      if (!dt || Number.isNaN(dt.getTime())) continue;
      if (dt.getFullYear() !== Number(year) || dt.getMonth() + 1 !== Number(month)) continue;
      total += pAmt;
      const dateStr = dt.toLocaleDateString("sv-SE");
      const label = omitType ? `${name} (${dateStr})` : `${typeLabel} · ${name} (${dateStr})`;
      items.push({
        label,
        amount: pAmt,
        expenseId: exp.id
      });
    }
  }
  return { total, items };
}

function computeSpecialCarMonthly(year, month) {
  return computeTaggedCategoryMonthly(year, month, "car");
}

function computeSpecialHousingMonthly(year, month) {
  return computeTaggedCategoryMonthly(year, month, "home");
}

function computeSpecialFoodMonthly() {
  return { total: 0, items: [] };
}

function normalizeStoredFoodConfigObject(cfg) {
  cfg = cfg && typeof cfg === "object" ? cfg : {};
  const refY = currentYearMonth().year;
  return {
    mode: cfg.mode === "manual" ? "manual" : "auto",
    household: {
      adults: Math.max(0, Math.floor(asNumber(cfg.household?.adults ?? 1))),
      teens: Math.max(0, Math.floor(asNumber(cfg.household?.teens ?? 0))),
      children: Math.max(0, Math.floor(asNumber(cfg.household?.children ?? 0)))
    },
    costLevel: ["budget", "normal", "high"].includes(cfg.costLevel) ? cfg.costLevel : "normal",
    foodScope: ["groceries", "mixed", "all"].includes(cfg.foodScope) ? cfg.foodScope : "groceries",
    manualWeeklyCost: Math.max(0, asNumber(cfg.manualWeeklyCost ?? 2800)),
    custodySchedule: normalizeCustodySchedule(cfg.custodySchedule),
    custodyPeriods: normalizeCustodyPeriodsArray(cfg),
    foodBudgetYear: refY,
    householdChanges: Array.isArray(cfg.householdChanges) ? cfg.householdChanges : [],
    deviations: Array.isArray(cfg.deviations) ? cfg.deviations : []
  };
}

/** Gemensam matinställning för appens tre år (special.foodShared). */
function getSharedFoodConfig() {
  const cfg = state.special?.foodShared?.config;
  return normalizeStoredFoodConfigObject(cfg && typeof cfg === "object" ? cfg : {});
}

function getFoodConfigForYear(_year) {
  return getSharedFoodConfig();
}

function normalizeCustodySchedule(input) {
  const cs = input && typeof input === "object" ? input : {};
  let type = ["off", "alternating"].includes(cs.type) ? cs.type : "off";
  if (cs.type === "same" || cs.type === "custom") type = "off";
  const alt = cs.alternating && typeof cs.alternating === "object" ? cs.alternating : {};
  let ratioKey = CUSTODY_RATIO_KEYS.includes(alt.ratioKey) ? alt.ratioKey : null;
  if (!ratioKey) {
    const pd = Number(alt.periodDays);
    if (pd === 14) ratioKey = "14-14";
    else ratioKey = "7-7";
  }
  const { awayDays, withDays } = parseCustodyRatioKey(ratioKey);
  return {
    type,
    alternating: {
      startDate: String(alt.startDate || ""),
      ratioKey,
      awayDays,
      withDays,
      absent: {
        children: Math.max(0, Math.floor(asNumber(alt.absent?.children ?? 0))),
        teens: Math.max(0, Math.floor(asNumber(alt.absent?.teens ?? 0)))
      }
    },
    custom: []
  };
}

function normalizeCustodyPeriodEntry(p) {
  if (!p || typeof p !== "object") {
    return { startDate: "", endDate: "", ratioKey: "7-7", absent: { children: 0, teens: 0 } };
  }
  const rk = CUSTODY_RATIO_KEYS.includes(p.ratioKey) ? p.ratioKey : "7-7";
  return {
    startDate: String(p.startDate || ""),
    endDate: String(p.endDate || ""),
    ratioKey: rk,
    absent: {
      children: Math.max(0, Math.floor(asNumber(p?.absent?.children ?? 0))),
      teens: Math.max(0, Math.floor(asNumber(p?.absent?.teens ?? 0)))
    }
  };
}

function normalizeCustodyPeriodsArray(cfg) {
  if (!cfg || typeof cfg !== "object" || !Array.isArray(cfg.custodyPeriods)) return [];
  return cfg.custodyPeriods.map(normalizeCustodyPeriodEntry);
}

function getCustodyPeriodEffectiveEnd(period, foodBudgetYear) {
  const endStr = period.endDate && String(period.endDate).trim();
  if (endStr) {
    const e = parseDateISO(endStr);
    return e;
  }
  const y = getFoodTillsVidareCapYear();
  const d = new Date(y, 11, 31);
  d.setHours(0, 0, 0, 0);
  return d;
}

function calendarRangesOverlapCustody(s1, e1, s2, e2) {
  return diffCalendarDays(s1, e2) >= 0 && diffCalendarDays(s2, e1) >= 0;
}

function buildCustodyPeriodAcceptance(periods, foodBudgetYear) {
  const arr = Array.isArray(periods) ? periods : [];
  const sorted = arr
    .map((p, origIdx) => ({ p: normalizeCustodyPeriodEntry(p), origIdx }))
    .filter((x) => x.p.startDate)
    .sort((a, b) => String(a.p.startDate).localeCompare(String(b.p.startDate)) || a.origIdx - b.origIdx);
  const accepted = [];
  const shadowedOrigIndices = new Set();
  for (const { p, origIdx } of sorted) {
    const s = parseDateISO(p.startDate);
    if (!s) continue;
    const e = getCustodyPeriodEffectiveEnd(p, foodBudgetYear);
    if (!e) continue;
    let overlaps = false;
    for (const acc of accepted) {
      if (calendarRangesOverlapCustody(s, e, acc.s, acc.e)) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) shadowedOrigIndices.add(origIdx);
    else accepted.push({ s, e, p, origIdx });
  }
  return { accepted, shadowedOrigIndices };
}

function resolveCustodyPeriodForDate(config, date) {
  const year = Number(config.foodBudgetYear) || new Date().getFullYear();
  const { accepted } = buildCustodyPeriodAcceptance(config.custodyPeriods || [], year);
  for (const acc of accepted) {
    if (diffCalendarDays(acc.s, date) >= 0 && diffCalendarDays(date, acc.e) >= 0) return acc.p;
  }
  return null;
}

function getCustodyAbsenceForAlternatingPeriod(period, date, foodBudgetYear) {
  const start = parseDateISO(period.startDate);
  if (!start) return { valid: false, absent: false, absentChildren: 0, absentTeens: 0 };
  const effEnd = getCustodyPeriodEffectiveEnd(period, foodBudgetYear);
  if (diffCalendarDays(start, date) < 0 || diffCalendarDays(date, effEnd) < 0) {
    return { valid: true, absent: false, absentChildren: 0, absentTeens: 0 };
  }
  const { awayDays, withDays } = parseCustodyRatioKey(period.ratioKey);
  const cycle = awayDays + withDays;
  const span = diffCalendarDays(start, effEnd) + 1;
  if (span < cycle) return { valid: true, absent: false, absentChildren: 0, absentTeens: 0 };
  const aC = Math.max(0, Math.floor(asNumber(period.absent?.children ?? 0)));
  const aT = Math.max(0, Math.floor(asNumber(period.absent?.teens ?? 0)));
  const diffDays = diffCalendarDays(start, date);
  const mod = ((diffDays % cycle) + cycle) % cycle;
  const absent = mod < awayDays;
  return { valid: true, absent, absentChildren: aC, absentTeens: aT };
}

function syncCustodyPeriodsAbsentWithHousehold(draft, extraAbsentRef) {
  const arr = draft.custodyPeriods;
  const absents = [];
  if (Array.isArray(arr)) arr.forEach((p) => absents.push(p.absent));
  if (extraAbsentRef) absents.push(extraAbsentRef);
  if (absents.length === 0) {
    delete draft._custodyHhSnapGlobal;
    return;
  }
  const baseC = Math.max(0, Math.floor(asNumber(draft.household?.children)));
  const baseT = Math.max(0, Math.floor(asNumber(draft.household?.teens)));
  if (!draft._custodyHhSnapGlobal) {
    draft._custodyHhSnapGlobal = { c: baseC, t: baseT };
    return;
  }
  const snap = draft._custodyHhSnapGlobal;
  if (baseC !== snap.c) {
    if (baseC > snap.c) {
      absents.forEach((abs) => { abs.children = baseC; });
    } else {
      absents.forEach((abs) => { abs.children = Math.min(abs.children, baseC); });
    }
    snap.c = baseC;
  }
  if (baseT !== snap.t) {
    if (baseT > snap.t) {
      absents.forEach((abs) => { abs.teens = baseT; });
    } else {
      absents.forEach((abs) => { abs.teens = Math.min(abs.teens, baseT); });
    }
    snap.t = baseT;
  }
}

function custodyPeriodEndDateValid(p) {
  const s = parseDateISO(p.startDate);
  if (!s) return false;
  const endStr = p.endDate && String(p.endDate).trim();
  if (!endStr) return true;
  const e = parseDateISO(endStr);
  if (!e) return false;
  return diffCalendarDays(s, e) >= 1;
}

function setSharedFoodModel(config, weeks) {
  if (!state.special.foodShared) state.special.foodShared = {};
  state.special.foodShared.config = { ...config };
  state.special.foodShared.weeks = Array.isArray(weeks) ? weeks : [];
  if (state.special.food && typeof state.special.food === "object") {
    for (const k of Object.keys(state.special.food)) {
      if (/^\d{4}$/.test(k)) delete state.special.food[k];
    }
  }
}

const FOOD_LEVEL_FACTORS = { budget: 0.85, normal: 1.0, high: 1.2 };
const FOOD_SCOPE_FACTORS = { groceries: 1.0, mixed: 1.2, all: 1.45 };
const FOOD_BASE_COSTS = { adults: 850, teens: 950, children: 650 };

const CUSTODY_RATIO_KEYS = ["3-3", "5-2", "2-5", "7-7", "14-14"];
function parseCustodyRatioKey(key) {
  const k = CUSTODY_RATIO_KEYS.includes(key) ? key : "7-7";
  const [a, b] = k.split("-").map((x) => Math.max(1, Math.floor(asNumber(x))));
  return { ratioKey: k, awayDays: a, withDays: b };
}

function getISOWeekInfo(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { isoYear: d.getUTCFullYear(), week };
}

function getIsoWeekMondayForIsoWeek(isoYear, week) {
  // ISO week 1 is the week with Jan 4th.
  const jan4 = new Date(isoYear, 0, 4);
  const monday = getIsoWeekMondayFromDate(jan4);
  const d = new Date(monday);
  d.setDate(d.getDate() + (Number(week) - 1) * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getIsoWeeksForYear(year) {
  // Determine last ISO week: week of Dec 28 is always in last ISO week.
  const dec28 = new Date(year, 11, 28);
  const { isoYear, week: lastWeek } = getISOWeekInfo(dec28);
  const y = Number(year);
  if (isoYear !== y) {
    // rare edge, fallback to 52
    return Array.from({ length: 52 }).map((_, i) => {
      const w = i + 1;
      const ws = getIsoWeekMondayForIsoWeek(y, w);
      const we = addDays(ws, 6);
      return { isoYear: y, week: w, weekStart: ws, weekEnd: we };
    });
  }
  return Array.from({ length: lastWeek }).map((_, i) => {
    const w = i + 1;
    const ws = getIsoWeekMondayForIsoWeek(y, w);
    const we = addDays(ws, 6);
    return { isoYear: y, week: w, weekStart: ws, weekEnd: we };
  });
}

function isoFromDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Planeringsdag för visning, t.ex. "31 januari 2026" */
function formatPlanningDateLongSv(d) {
  if (!d || Number.isNaN(d.getTime())) return "";
  const day = d.getDate();
  const mon = (MONTH_NAMES[d.getMonth()] || "").toLowerCase();
  return `${day} ${mon} ${d.getFullYear()}`;
}

/** ISO-veckas måndag–söndag, t.ex. "16 februari - 22 februari 2026" */
function formatIsoWeekRangeLongSv(weekStart, weekEnd) {
  if (!weekStart || !weekEnd || Number.isNaN(weekStart.getTime()) || Number.isNaN(weekEnd.getTime())) return "";
  const y1 = weekStart.getFullYear();
  const y2 = weekEnd.getFullYear();
  const d1 = weekStart.getDate();
  const m1 = (MONTH_NAMES[weekStart.getMonth()] || "").toLowerCase();
  if (y1 === y2) {
    const d2 = weekEnd.getDate();
    const m2 = (MONTH_NAMES[weekEnd.getMonth()] || "").toLowerCase();
    return `${d1} ${m1} - ${d2} ${m2} ${y2}`;
  }
  return `${formatPlanningDateLongSv(weekStart)} - ${formatPlanningDateLongSv(weekEnd)}`;
}

function foodConfigHasManualWeekAdjustments(config) {
  const hasCustody = Array.isArray(config.custodyPeriods) && config.custodyPeriods.some((p) => p.startDate && String(p.startDate).trim());
  const hasHH = Array.isArray(config.householdChanges) && config.householdChanges.length > 0;
  const hasFac = Array.isArray(config.deviations) && config.deviations.some((d) => d.adjustmentType === "factor");
  return hasCustody || hasHH || hasFac;
}

function computeFoodWeekAmountAndLabels(config, weekStart, weekEnd) {
  // weekly override deviation
  let weekOverride = null;
  const devs = Array.isArray(config.deviations) ? config.deviations : [];
  for (let i = devs.length - 1; i >= 0; i--) {
    const dv = devs[i];
    if (dv.adjustmentType !== "weekly") continue;
    const s = parseDateISO(dv?.startDate);
    const e = parseDateISO(dv?.endDate);
    if (!s || !e) continue;
    if (weekEnd.getTime() < s.getTime() || weekStart.getTime() > e.getTime()) continue;
    const v = asNumber(dv.value);
    if (Number.isFinite(v) && v >= 0) weekOverride = v;
    break;
  }

  const labels = new Set();
  if (config.mode === "manual") labels.add("manuell");

  if (Array.isArray(config.custodyPeriods) && config.custodyPeriods.length > 0) {
    const custodyLabel = getCustodyLabelForWeek(config, weekStart);
    if (custodyLabel) labels.add(custodyLabel);
  }

  let sumDaily = 0;
  if (config.mode === "manual") {
    const manualW = Math.max(0, asNumber(config.manualWeeklyCost));
    if (!foodConfigHasManualWeekAdjustments(config)) {
      sumDaily = manualW;
    } else {
      const cfgA = { ...config, mode: "auto" };
      const cfgPlain = { ...config, mode: "auto", custodyPeriods: [], householdChanges: [], deviations: [] };
      let autoWeek = 0;
      let plainWeek = 0;
      for (let i = 0; i < 7; i++) {
        const day = addDays(weekStart, i);
        autoWeek += computeFoodDailyCost(cfgA, day);
        plainWeek += computeFoodDailyCost(cfgPlain, day);
      }
      sumDaily = plainWeek > 0 ? Math.round(manualW * (autoWeek / plainWeek)) : manualW;
      for (let i = 0; i < 7; i++) {
        const day = addDays(weekStart, i);
        if (isHouseholdOverrideActive(config, day)) labels.add("ändrat hushåll");
        if (isDeviationFactorActive(config, day)) labels.add("avvikelse");
      }
    }
  } else {
    let anyHhOverride = false;
    let anyDeviation = false;
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      if (isHouseholdOverrideActive(config, day)) anyHhOverride = true;
      if (isDeviationFactorActive(config, day)) anyDeviation = true;
      sumDaily += computeFoodDailyCost(config, day);
    }
    if (anyHhOverride) labels.add("ändrat hushåll");
    if (anyDeviation) labels.add("avvikelse");
    sumDaily = Math.round(sumDaily);
  }

  const amount = Math.round(weekOverride !== null ? weekOverride : sumDaily);
  if (weekOverride !== null) labels.add("avvikelse");
  return { amount, labels: Array.from(labels) };
}

function getCustodyLabelForWeek(config, weekStart) {
  let anyChildAbsent = false;
  let anyTeenAbsent = false;
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    const abs = getCustodyAbsenceForDate(config, day);
    if (!abs.valid || !abs.absent) continue;
    if (asNumber(abs.absentChildren) > 0) anyChildAbsent = true;
    if (asNumber(abs.absentTeens) > 0) anyTeenAbsent = true;
  }
  if (anyChildAbsent && anyTeenAbsent) return "utan barn och tonåringar";
  if (anyChildAbsent) return "utan barn";
  if (anyTeenAbsent) return "utan tonåringar";
  return "";
}

function isHouseholdOverrideActive(config, date) {
  const changes = Array.isArray(config.householdChanges) ? config.householdChanges : [];
  for (let i = changes.length - 1; i >= 0; i--) {
    const ch = changes[i];
    const s = parseDateISO(ch?.startDate);
    const e = getHouseholdChangeInclusiveEndDate(ch);
    if (!s || !e) continue;
    if (date.getTime() < s.getTime() || date.getTime() > e.getTime()) continue;
    return true;
  }
  return false;
}

function isDeviationFactorActive(config, date) {
  const devs = Array.isArray(config.deviations) ? config.deviations : [];
  for (let i = devs.length - 1; i >= 0; i--) {
    const dv = devs[i];
    const s = parseDateISO(dv?.startDate);
    const e = getDeviationInclusiveEndDate(dv);
    if (!s || !e) continue;
    if (date.getTime() < s.getTime() || date.getTime() > e.getTime()) continue;
    if (dv.adjustmentType === "factor") return true;
    return false;
  }
  return false;
}
function getIsoWeekMondayFromDate(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDateISO(s) {
  if (!s || typeof s !== "string") return null;
  const t = s.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const day = Number(m[3]);
    const d = new Date(y, mo, day);
    if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== day) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Inklusivt slutdatum för hushållsändring; tomt slut = tillsvidare (sista dagen i sista valbara matår). */
function getHouseholdChangeInclusiveEndDate(ch) {
  const s = parseDateISO(ch?.startDate);
  if (!s) return null;
  const endStr = ch?.endDate != null ? String(ch.endDate).trim() : "";
  if (!endStr) {
    const y = getFoodTillsVidareCapYear();
    return parseDateISO(`${y}-12-31`);
  }
  return parseDateISO(endStr);
}

function isBadHouseholdChangeDateRange(p) {
  const s = parseDateISO(p?.startDate);
  if (!s) return true;
  const endStr = p?.endDate != null ? String(p.endDate).trim() : "";
  if (!endStr) return false;
  const e = parseDateISO(endStr);
  if (!e) return true;
  return e.getTime() < s.getTime();
}

/** Inklusivt slutdatum för avvikelseperiod; tomt slut = tillsvidare (sista dagen i sista valbara matår). */
function getDeviationInclusiveEndDate(dv) {
  const s = parseDateISO(dv?.startDate);
  if (!s) return null;
  const endStr = dv?.endDate != null ? String(dv.endDate).trim() : "";
  if (!endStr) {
    const y = getFoodTillsVidareCapYear();
    return parseDateISO(`${y}-12-31`);
  }
  return parseDateISO(endStr);
}

function isBadDeviationDateRange(p) {
  const s = parseDateISO(p?.startDate);
  if (!s) return true;
  const endStr = p?.endDate != null ? String(p.endDate).trim() : "";
  if (!endStr) return false;
  const e = parseDateISO(endStr);
  if (!e) return true;
  return e.getTime() < s.getTime();
}

/** Kalenderdagar mellan två datum (lokala datum), DST-säkert. */
function diffCalendarDays(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isDateInRange(date, start, end) {
  if (!start || !end) return false;
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function getCustodyAbsenceForDate(config, date) {
  const year = Number(config.foodBudgetYear) || new Date().getFullYear();
  const period = resolveCustodyPeriodForDate(config, date);
  if (!period) return { valid: true, absent: false, absentChildren: 0, absentTeens: 0 };
  return getCustodyAbsenceForAlternatingPeriod(period, date, year);
}

function computeFoodDailyCost(config, date) {
  const levelF = FOOD_LEVEL_FACTORS[config.costLevel] || 1.0;
  const scopeF = FOOD_SCOPE_FACTORS[config.foodScope] || 1.0;
  const hh = config.household || {};
  let adults = asNumber(hh.adults);
  let teens = asNumber(hh.teens);
  let children = asNumber(hh.children);

  // Temporary household overrides: last matching override wins
  const changes = Array.isArray(config.householdChanges) ? config.householdChanges : [];
  for (let i = changes.length - 1; i >= 0; i--) {
    const ch = changes[i];
    const s = parseDateISO(ch?.startDate);
    const e = getHouseholdChangeInclusiveEndDate(ch);
    if (!s || !e) continue;
    if (date.getTime() < s.getTime() || date.getTime() > e.getTime()) continue;
    const o = ch?.household || {};
    adults = Math.max(0, asNumber(o.adults));
    teens = Math.max(0, asNumber(o.teens));
    children = Math.max(0, asNumber(o.children));
    break;
  }

  const base = adults * FOOD_BASE_COSTS.adults +
    teens * FOOD_BASE_COSTS.teens +
    children * FOOD_BASE_COSTS.children;

  let daily;
  const period =
    Array.isArray(config.custodyPeriods) && config.custodyPeriods.length > 0
      ? resolveCustodyPeriodForDate(config, date)
      : null;
  if (period) {
    const abs = getCustodyAbsenceForAlternatingPeriod(period, date, Number(config.foodBudgetYear) || new Date().getFullYear());
    const aC = Math.min(
      Math.max(0, Math.floor(asNumber(period.absent?.children ?? 0))),
      Math.max(0, Math.floor(children))
    );
    const aT = Math.min(
      Math.max(0, Math.floor(asNumber(period.absent?.teens ?? 0))),
      Math.max(0, Math.floor(teens))
    );
    const useReduced = abs.valid && abs.absent && (aC > 0 || aT > 0);
    if (useReduced) {
      const reducedBase = adults * FOOD_BASE_COSTS.adults +
        Math.max(0, teens - aT) * FOOD_BASE_COSTS.teens +
        Math.max(0, children - aC) * FOOD_BASE_COSTS.children;
      daily = (reducedBase * levelF * scopeF) / 7;
    } else {
      daily = (base * levelF * scopeF) / 7;
    }
  } else {
    daily = (base * levelF * scopeF) / 7;
  }

  // Deviations: apply factor or weekly override (handled per-week in build)
  const devs = Array.isArray(config.deviations) ? config.deviations : [];
  for (let i = devs.length - 1; i >= 0; i--) {
    const dv = devs[i];
    const s = parseDateISO(dv?.startDate);
    const e = getDeviationInclusiveEndDate(dv);
    if (!s || !e) continue;
    if (date.getTime() < s.getTime() || date.getTime() > e.getTime()) continue;
    if (dv.adjustmentType === "factor") {
      const f = asNumber(dv.value);
      if (Number.isFinite(f) && f > 0) daily = daily * f;
    }
    break;
  }

  return daily; // daily
}

function computeFoodWeekTotalForWeekStart(config, weekStart) {
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum += computeFoodDailyCost(config, addDays(weekStart, i));
  }
  return Math.round(sum);
}

/**
 * Veckosumma med endast den redigerade växelvis-perioden: grund utan växelvis/hushållsändringar/avvikelser,
 * sedan enbart denna periods avväxling (autoläge direkt; manuellt = samma skalning som i huvudlogiken).
 */
function computeFoodWeekTotalCustodyEditorOnly(baseDraft, periodLive, weekStart) {
  const p = normalizeCustodyPeriodEntry(periodLive);
  if (!p.startDate || !String(p.startDate).trim()) return 0;
  const budgetYear = Number(baseDraft.foodBudgetYear) || currentYearMonth().year;
  const cfgPlain = {
    ...baseDraft,
    custodyPeriods: [],
    householdChanges: [],
    deviations: [],
    foodBudgetYear: budgetYear
  };
  const cfgWithPeriod = {
    ...cfgPlain,
    custodyPeriods: [p],
    foodBudgetYear: budgetYear
  };
  if (baseDraft.mode !== "manual") {
    return computeFoodWeekTotalForWeekStart(cfgWithPeriod, weekStart);
  }
  const manualW = Math.max(0, asNumber(baseDraft.manualWeeklyCost));
  const cfgAutoPlain = { ...cfgPlain, mode: "auto" };
  const cfgAutoWith = { ...cfgWithPeriod, mode: "auto" };
  let autoPlain = 0;
  let autoWith = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    autoPlain += computeFoodDailyCost(cfgAutoPlain, day);
    autoWith += computeFoodDailyCost(cfgAutoWith, day);
  }
  autoPlain = Math.round(autoPlain);
  autoWith = Math.round(autoWith);
  if (autoPlain <= 0) return Math.round(manualW);
  return Math.max(0, Math.round((manualW * autoWith) / autoPlain));
}

function computeFoodWeeklyCost(config) {
  if (config.mode === "manual") return Math.max(0, asNumber(config.manualWeeklyCost));
  const hh = config.household || {};
  const base = asNumber(hh.adults) * FOOD_BASE_COSTS.adults +
    asNumber(hh.teens) * FOOD_BASE_COSTS.teens +
    asNumber(hh.children) * FOOD_BASE_COSTS.children;
  const levelF = FOOD_LEVEL_FACTORS[config.costLevel] || 1.0;
  const scopeF = FOOD_SCOPE_FACTORS[config.foodScope] || 1.0;
  return Math.round(base * levelF * scopeF);
}

function computeSpecialChildrenMonthly(year, month) {
  return computeTaggedCategoryMonthly(year, month, "children");
}

function normalizeLoanItem(rawLoan) {
  const firstRaw = String(rawLoan?.firstPaymentDate ?? "").trim();
  const fp = datePartsFromIso(firstRaw);
  const firstPaymentDate = fp ? `${fp.y}-${pad2(fp.m)}-${pad2(fp.d)}` : "";
  let endDate = null;
  const endRaw = rawLoan?.endDate;
  if (endRaw != null && String(endRaw).trim() !== "") {
    const ep = datePartsFromIso(String(endRaw).trim());
    endDate = ep ? `${ep.y}-${pad2(ep.m)}-${pad2(ep.d)}` : null;
  }
  return {
    id: String(rawLoan?.id || "").trim() || uid(),
    name: String(rawLoan?.name || "").trim() || "Lån",
    bank: String(rawLoan?.bank || "").trim(),
    principal: asNumber(rawLoan?.principal),
    rate: asNumber(rawLoan?.rate),
    amortization: asNumber(rawLoan?.amortization),
    firstPaymentDate,
    endDate
  };
}

function getAllLoansFromRoot(root) {
  const items = root?.special?.loans?.items;
  const arr = Array.isArray(items) ? items : [];
  const seen = new Set();
  return arr.map(normalizeLoanItem).filter((loan) => {
    const key = String(loan.id || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getAllLoans() {
  return getAllLoansFromRoot(state);
}

/** Tar bort speglade låneposter och bygger om från special.loans (masterdata). */
function regenerateMirroredLoanExpenses(root) {
  if (!root || !Array.isArray(root.expenses)) return;
  root.expenses = root.expenses.filter((e) => !(e.category === "loans" && e.metadata?.loanId));
  const loans = getAllLoansFromRoot(root);
  for (const loan of loans) {
    const fp = datePartsFromIso(loan.firstPaymentDate);
    if (!fp) continue;
    const months = enumerateLoanMonths(loan);
    if (months.length === 0) continue;
    const interest = getLoanInterestAmount(loan);
    const amort = asNumber(loan.amortization);
    const due = fp.d;
    const nm = String(loan.name || "").trim() || "Lån";
    const loanMeta = { loanId: String(loan.id) };
    const interestPayments = [];
    const amortPayments = [];
    for (const { year, month } of months) {
      const d = clampDay(year, month, due);
      const iso = `${year}-${pad2(month)}-${pad2(d)}`;
      interestPayments.push({ id: uid(), date: iso, amount: interest });
      amortPayments.push({ id: uid(), date: iso, amount: amort });
    }
    root.expenses.push(
      canonicalizeExpenseRecord({
        id: uid(),
        name: `${nm} – Ränta`,
        category: "loans",
        subcategory: "interest",
        interval: "monthly",
        origin: "system",
        metadata: { ...loanMeta },
        payments: interestPayments
      })
    );
    root.expenses.push(
      canonicalizeExpenseRecord({
        id: uid(),
        name: `${nm} – Amortering`,
        category: "loans",
        subcategory: "amortization",
        interval: "monthly",
        origin: "system",
        metadata: { ...loanMeta },
        payments: amortPayments
      })
    );
  }
}

function persistAllLoans(loans) {
  state.special.loans = {
    items: loans.map((l) => {
      const n = normalizeLoanItem(l);
      return {
        id: n.id,
        name: n.name,
        bank: n.bank,
        principal: n.principal,
        rate: n.rate,
        amortization: n.amortization,
        firstPaymentDate: n.firstPaymentDate,
        endDate: n.endDate
      };
    })
  };
  regenerateMirroredLoanExpenses(state);
}

function ymValue(y, m) {
  return Number(y) * 100 + Number(m);
}

function validateLoanDateRange(loan) {
  const fp = datePartsFromIso(loan.firstPaymentDate);
  if (!fp) return "Ange betaldatum.";
  const hasEnd = loan.endDate != null && String(loan.endDate).trim() !== "";
  if (!hasEnd) return "";
  const ep = datePartsFromIso(String(loan.endDate).trim());
  if (!ep) return "Kontrollera \"Gäller till\" eller välj tills vidare.";
  const s = ymValue(fp.y, fp.m);
  const e = ymValue(ep.y, ep.m);
  if (s === e) return "Första och sista månad får inte vara samma.";
  if (e < s) return "\"Gäller till\" måste vara efter betaldatum.";
  return "";
}

function enumerateLoanMonths(loan) {
  const err = validateLoanDateRange(loan);
  if (err) return [];
  const fp = datePartsFromIso(loan.firstPaymentDate);
  if (!fp) return [];
  const startY = fp.y;
  const startM = fp.m;
  const hasEnd = loan.endDate != null && String(loan.endDate).trim() !== "";
  const from = ymValue(startY, startM);
  const ep = hasEnd ? datePartsFromIso(String(loan.endDate).trim()) : null;
  const to = ep ? ymValue(ep.y, ep.m) : ymValue(currentYearMonth().year + 1, 12);
  const months = [];
  for (let y = Math.floor(from / 100), m = from % 100; ymValue(y, m) <= to;) {
    months.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      y += 1;
      m = 1;
    }
  }
  return months;
}

function getLoanInterestAmount(loan) {
  return (asNumber(loan.principal) * (asNumber(loan.rate) / 100)) / 12;
}

function getLoanTotalPayment(loan) {
  return getLoanInterestAmount(loan) + asNumber(loan.amortization);
}

function overviewTableGroupForExpense(exp) {
  const c = exp.category || "other";
  if (c === "food" && !isMatLikeExpense(exp)) return "Utgifter";
  const map = {
    car: "Bil",
    home: "Hem",
    children: "Barn",
    savings: "Spar",
    loans: "Lån",
    one_off: "Enstaka utgifter",
    food: "Mat"
  };
  return map[c] || "Utgifter";
}

function overviewTableLabelForPayment(exp, dt) {
  const dateStr = dt.toLocaleDateString("sv-SE");
  const cfgS = TAGGED_CATEGORY_CONFIG.savings;
  if (exp.category === "savings" && cfgS?.omitTypeInOverviewLabel) {
    const name = String(exp.name || "").trim() || getTaggedTypeLabel("savings", exp.subcategory || "own");
    return `${name} (${dateStr})`;
  }
  const cat = exp.category;
  if (cat === "car" || cat === "home" || cat === "children") {
    const key = exp.subcategory || "other";
    const tl = getTaggedTypeLabel(cat, key);
    const name = String(exp.name || "").trim() || tl;
    return `${tl} · ${name} (${dateStr})`;
  }
  return `${exp.name || "Utgift"} (${dateStr})`;
}

function computeMonthOverview(year, month) {
  const sumPaymentsInMonth = (payments) =>
    (Array.isArray(payments) ? payments : []).reduce((s, p) => {
      const amt = asNumber(p.amount);
      if (amt <= 0) return s;
      const dt = p.date ? new Date(p.date) : null;
      if (!dt || Number.isNaN(dt.getTime())) return s;
      if (dt.getFullYear() === year && dt.getMonth() + 1 === month) return s + amt;
      return s;
    }, 0);

  const oneOffIncomesAmount = (state.incomes || []).reduce((sum, inc) => {
    if (inc.category !== "one_off") return sum;
    return sum + sumPaymentsInMonth(inc.payments);
  }, 0);

  const seg = {
    other: 0,
    mat: 0,
    car: 0,
    home: 0,
    children: 0,
    savings: 0,
    loans: 0,
    one_off: 0
  };

  const expensesRows = [];
  const costBehaviorTotals = { fixed: 0, variable: 0, unknown: 0 };
  for (const exp of state.expenses || []) {
    const payments = Array.isArray(exp.payments) ? exp.payments : [];
    for (const p of payments) {
      const amt = asNumber(p.amount);
      if (amt <= 0) continue;
      const dt = p.date ? new Date(p.date) : null;
      if (!dt || Number.isNaN(dt.getTime())) continue;
      if (dt.getFullYear() !== year || dt.getMonth() + 1 !== month) continue;

      const cat = exp.category || "other";
      if (isMatLikeExpense(exp)) seg.mat += amt;
      else if (cat === "car") seg.car += amt;
      else if (cat === "home") seg.home += amt;
      else if (cat === "children") seg.children += amt;
      else if (cat === "savings") seg.savings += amt;
      else if (cat === "loans") seg.loans += amt;
      else if (cat === "one_off") seg.one_off += amt;
      else seg.other += amt;

      const beh = getExpenseCostBehavior(exp);
      if (beh === EXPENSE_COST_FIXED) costBehaviorTotals.fixed += amt;
      else if (beh === EXPENSE_COST_VARIABLE) costBehaviorTotals.variable += amt;
      else costBehaviorTotals.unknown += amt;

      expensesRows.push({
        group: overviewTableGroupForExpense(exp),
        label: overviewTableLabelForPayment(exp, dt),
        amount: amt,
        _sortT: dt.getTime()
      });
    }
  }

  expensesRows.sort((a, b) => a._sortT - b._sortT || String(a.label).localeCompare(String(b.label), "sv"));
  const expensesRowsClean = expensesRows.map(({ group, label, amount }) => ({ group, label, amount }));

  const oneOffExpensesAmount = seg.one_off;
  const plannedExpensesAmount =
    seg.other + seg.mat + seg.car + seg.home + seg.children + seg.savings + seg.loans + seg.one_off;

  const incomePaymentsAmount = (state.incomes || []).reduce((sum, inc) => {
    if (inc.category === "one_off") return sum;
    return sum + sumPaymentsInMonth(inc.payments);
  }, 0);

  const incomeAmount = incomePaymentsAmount + oneOffIncomesAmount;
  const remaining = incomeAmount - plannedExpensesAmount;

  const segments = [
    { key: "recurringExpenses", label: "Utgifter", amount: Math.max(0, seg.other), color: chartSegmentHex("recurringExpenses") },
    { key: "foodGenerated", label: "Mat", amount: seg.mat, color: chartSegmentHex("foodGenerated") },
    { key: "car", label: "Bil", amount: seg.car, color: chartSegmentHex("car") },
    { key: "housing", label: "Hem", amount: seg.home, color: chartSegmentHex("housing") },
    { key: "loans", label: "Lån", amount: seg.loans, color: chartSegmentHex("loans") },
    { key: "children", label: "Barn", amount: seg.children, color: chartSegmentHex("children") },
    { key: "savings", label: "Spar", amount: seg.savings, color: chartSegmentHex("savings") },
    { key: "oneOffExpenses", label: "Enstaka utgifter", amount: oneOffExpensesAmount, color: chartSegmentHex("oneOffExpenses") }
  ].filter((s) => s.amount > 0);

  const incomesRows = [];
  for (const inc of state.incomes || []) {
    if (inc.category === "one_off") continue;
    const payments = Array.isArray(inc.payments) ? inc.payments : [];
    for (const p of payments) {
      const amt = asNumber(p.amount);
      if (amt <= 0) continue;
      const dt = p.date ? new Date(p.date) : null;
      if (!dt || Number.isNaN(dt.getTime())) continue;
      const py = dt.getFullYear();
      const pm = dt.getMonth() + 1;
      if (py !== year || pm !== month) continue;
      incomesRows.push({
        group: "Utbetalningar",
        label: `${incomeDisplayName(inc)} (${dt.toLocaleDateString("sv-SE")})`,
        amount: amt
      });
    }
  }
  for (const inc of state.incomes || []) {
    if (inc.category !== "one_off") continue;
    const payments = Array.isArray(inc.payments) ? inc.payments : [];
    for (const p of payments) {
      const amt = asNumber(p.amount);
      if (amt <= 0) continue;
      const dt = p.date ? new Date(p.date) : null;
      if (!dt || Number.isNaN(dt.getTime())) continue;
      if (dt.getFullYear() !== year || dt.getMonth() + 1 !== month) continue;
      incomesRows.push({
        group: "Enstaka intäkter",
        label: `${inc.name || "Intäkt"} (${dt.toLocaleDateString("sv-SE")})`,
        amount: amt
      });
    }
  }

  return {
    year,
    month,
    incomeAmount,
    plannedExpensesAmount,
    remaining,
    segments,
    expensesRows: expensesRowsClean,
    incomesRows,
    costBehaviorTotals
  };
}

function drawExpenseChart(svgEl, overview) {
  // Rensar
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

  const W = 600;
  const H = 220;
  svgEl.setAttribute("width", String(W));
  svgEl.setAttribute("height", String(H));

  const dark = resolvedDocumentTheme() === "dark";
  const chartUi = dark
    ? {
        trackMain: "rgba(111, 207, 130, 0.14)",
        trackRem: "rgba(238, 242, 237, 0.08)",
        remPos: "#81c784",
        remNeg: "#ff8a80"
      }
    : {
        trackMain: "rgba(37, 95, 51, 0.15)",
        trackRem: "rgba(37, 95, 51, 0.12)",
        remPos: "#43a047",
        remNeg: "#d32f2f"
      };

  const expenses = Math.max(0, overview.plannedExpensesAmount);
  const income = Math.max(0, overview.incomeAmount);
  const remaining = overview.remaining;

  const maxRef = Math.max(income, expenses, 1);
  const totalBarW = 500;
  const startX = 50;
  const barY = 90;
  const barH = 26;

  // Bakgrund
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", String(startX));
  bg.setAttribute("y", String(barY));
  bg.setAttribute("width", String(totalBarW));
  bg.setAttribute("height", String(barH));
  bg.setAttribute("rx", "12");
  bg.setAttribute("fill", chartUi.trackMain);
  svgEl.appendChild(bg);

  // Staplad segmentbar (summa = plannedExpenses)
  const usable = totalBarW * (expenses / maxRef);
  let xCursor = startX;
  const segmentScale = expenses > 0 ? usable / expenses : 0;

  const toPx = (amount) => Math.max(0, amount * segmentScale);

  for (const seg of overview.segments) {
    const segW = toPx(seg.amount);
    if (segW <= 0) continue;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", String(xCursor));
    rect.setAttribute("y", String(barY));
    rect.setAttribute("width", String(segW));
    rect.setAttribute("height", String(barH));
    rect.setAttribute("rx", "12");
    rect.setAttribute("fill", seg.color);
    svgEl.appendChild(rect);
    xCursor += segW;
  }

  // Remainder bar under
  const barY2 = barY + 52;
  const remBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  remBg.setAttribute("x", String(startX));
  remBg.setAttribute("y", String(barY2));
  remBg.setAttribute("width", String(totalBarW));
  remBg.setAttribute("height", String(barH));
  remBg.setAttribute("rx", "12");
  remBg.setAttribute("fill", chartUi.trackRem);
  svgEl.appendChild(remBg);

  const remAmount = Math.max(0, remaining);
  const remW = totalBarW * (remAmount / maxRef);
  const remRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  remRect.setAttribute("x", String(startX));
  remRect.setAttribute("y", String(barY2));
  remRect.setAttribute("width", String(remW));
  remRect.setAttribute("height", String(barH));
  remRect.setAttribute("rx", "12");
  remRect.setAttribute("fill", remaining >= 0 ? chartUi.remPos : chartUi.remNeg);
  svgEl.appendChild(remRect);

  // Labels
  const label1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label1.setAttribute("x", "50");
  label1.setAttribute("y", String(barY - 12));
  label1.setAttribute("fill", "currentColor");
  label1.setAttribute("font-size", "12");
  label1.textContent = "Utgifter";
  svgEl.appendChild(label1);

  const label2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label2.setAttribute("x", "50");
  label2.setAttribute("y", String(barY2 - 12));
  label2.setAttribute("fill", "currentColor");
  label2.setAttribute("font-size", "12");
  label2.textContent = "Kvar";
  svgEl.appendChild(label2);

  // Total texts
  const totalText = document.createElementNS("http://www.w3.org/2000/svg", "text");
  totalText.setAttribute("x", String(startX + totalBarW));
  totalText.setAttribute("y", String(barY + 19));
  totalText.setAttribute("fill", "currentColor");
  totalText.setAttribute("font-size", "12");
  totalText.setAttribute("text-anchor", "end");
  totalText.textContent = formatKr(overview.plannedExpensesAmount);
  svgEl.appendChild(totalText);

  const remText = document.createElementNS("http://www.w3.org/2000/svg", "text");
  remText.setAttribute("x", String(startX + totalBarW));
  remText.setAttribute("y", String(barY2 + 19));
  remText.setAttribute("fill", "currentColor");
  remText.setAttribute("font-size", "12");
  remText.setAttribute("text-anchor", "end");
  remText.textContent = `${formatKr(overview.remaining)}`;
  svgEl.appendChild(remText);
}

function renderChartLegend(containerEl, overview) {
  containerEl.innerHTML = "";
  for (const seg of overview.segments) {
    const el = document.createElement("div");
    el.className = "legend-item";

    const dot = document.createElement("div");
    dot.className = "legend-dot";
    dot.style.background = seg.color;

    const text = document.createElement("div");
    text.textContent = `${seg.label}: ${formatKr(seg.amount)}`;

    el.appendChild(dot);
    el.appendChild(text);
    containerEl.appendChild(el);
  }
}

function renderOverview() {
  const year = ui.overviewYear;
  const month = ui.overviewMonth;
  if (!year || !month) return;

  const overview = computeMonthOverview(year, month);

  document.getElementById("headerSubtitle").textContent = `${overview.year} - ${monthName(overview.month)}`;

  document.getElementById("overviewIncome").textContent = formatKr(overview.incomeAmount);
  document.getElementById("overviewPlannedExpenses").textContent = formatKr(overview.plannedExpensesAmount);
  const remainingEl = document.getElementById("overviewRemaining");
  remainingEl.textContent = formatKr(overview.remaining);
  remainingEl.classList.remove("summary-value--positive", "summary-value--negative");
  remainingEl.classList.add(overview.remaining >= 0 ? "summary-value--positive" : "summary-value--negative");

  const callout = document.getElementById("remainingCallout");
  callout.classList.remove("callout--positive", "callout--negative");
  if (overview.remaining >= 0) {
    callout.textContent = `Bra! Du har ${formatKr(overview.remaining)} kvar för övriga utgifter.`;
    callout.classList.add("callout--positive");
  } else {
    callout.textContent = `Varning! Du är beräknad att gå över med ${formatKr(Math.abs(overview.remaining))}.`;
    callout.classList.add("callout--negative");
  }

  drawExpenseChart(document.getElementById("expenseChart"), overview);
  document.getElementById("overviewChartSubtitle").textContent =
    overview.segments.length > 0 ? "Fördela planerade kostnader per område." : "Inga planerade utgifter hittades ännu.";

  renderChartLegend(document.getElementById("chartLegend"), overview);

  // Expense table
  const expBody = document.getElementById("overviewExpensesTableBody");
  expBody.innerHTML = "";
  const expTotal = overview.expensesRows.reduce((s, r) => s + r.amount, 0);
  if (overview.expensesRows.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3" style="color: var(--muted);">${monthName(month)}: inga utgifter ännu.</td>`;
    expBody.appendChild(tr);
  } else {
    for (const row of overview.expensesRows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(row.group)}</td><td>${escapeHtml(row.label)}</td><td class="right">${formatKr(
        row.amount
      )}</td>`;
      expBody.appendChild(tr);
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `<td><strong>Summa</strong></td><td></td><td class="right"><strong>${formatKr(expTotal)}</strong></td>`;
    expBody.appendChild(tr);
  }

  // Income table
  const incBody = document.getElementById("overviewIncomesTableBody");
  incBody.innerHTML = "";
  const incTotal = overview.incomesRows.reduce((s, r) => s + r.amount, 0);
  if (overview.incomesRows.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3" style="color: var(--muted);">${monthName(month)}: inga intäkter ännu.</td>`;
    incBody.appendChild(tr);
  } else {
    for (const row of overview.incomesRows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(row.group)}</td><td>${escapeHtml(row.label)}</td><td class="right">${formatKr(
        row.amount
      )}</td>`;
      incBody.appendChild(tr);
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `<td><strong>Summa</strong></td><td></td><td class="right"><strong>${formatKr(incTotal)}</strong></td>`;
    incBody.appendChild(tr);
  }

  syncOverviewPeriodSummaryLabel();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function applyTaggedOverlayDateBounds(cat) {
  const C = TAGGED_CATEGORY_CONFIG[cat];
  if (!C) return;
  const min = getFoodDateInputMinIso();
  const max = getFoodDateInputMaxIso();
  document.querySelectorAll(`[data-expview="${C.overlayKey}"] input[type="date"]`).forEach((inp) => {
    inp.min = min;
    inp.max = max;
  });
  refreshAllDateFieldRows();
}

function applyLoanOverlayDateBounds() {
  const min = getFoodDateInputMinIso();
  const max = getFoodDateInputMaxIso();
  document.querySelectorAll('[data-expview="loans"] input[type="date"]').forEach((inp) => {
    inp.min = min;
    inp.max = max;
  });
  refreshAllDateFieldRows();
}

function updateTaggedEditorIntervalVisibility(cat) {
  const C = TAGGED_CATEGORY_CONFIG[cat];
  if (!C) return;
  const ids = C.ids;
  const interval = document.getElementById(ids.editInterval)?.value || "once";
  const recurring = interval !== "once";
  const endRow = document.getElementById(ids.endDateRow);
  if (endRow) endRow.hidden = !recurring;
  const L = C.labels || {};
  const firstInp = document.getElementById(ids.editFirstDate);
  if (firstInp) {
    const text = recurring
      ? L.firstDateRecurring || "Betaldatum"
      : L.firstDateOnce || "Betaldatum";
    firstInp.setAttribute("data-notch-label", text);
    const notch = firstInp.closest(".bb-notched-field");
    const leg = notch?.querySelector(".bb-notched-field-legend");
    if (leg) leg.textContent = text;
    syncDateFieldRow(firstInp);
    applyDateFieldRowTabState(firstInp);
  }
  const endInp = document.getElementById(ids.editEndDate);
  if (endInp) {
    const endText = L.endDate || "Gäller till";
    endInp.setAttribute("data-notch-label", endText);
    const endNotch = endInp.closest(".bb-notched-field");
    const endLeg = endNotch?.querySelector(".bb-notched-field-legend");
    if (endLeg) endLeg.textContent = endText;
    syncDateFieldRow(endInp);
    applyDateFieldRowTabState(endInp);
  }
}

/** Läser schema från metadata.schedule och betalningar. */
function inferScheduleMetaFromExpense(exp) {
  const pts = (exp.payments || [])
    .filter((p) => asNumber(p.amount) > 0 && p.date)
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const first = pts[0];
  const second = pts[1];
  const sched = exp.metadata?.schedule || {};
  let payDay = sched.paymentDay;
  if (payDay == null || payDay === "") {
    const p2 = second?.date ? datePartsFromIso(second.date) : null;
    if (p2) payDay = p2.d;
  }
  if (payDay == null || payDay === "") {
    const p1 = first?.date ? datePartsFromIso(first.date) : null;
    payDay = p1?.d ?? 25;
  }
  payDay = Math.max(1, Math.min(31, Math.floor(asNumber(payDay)) || 25));
  const firstDate = sched.firstDate || first?.date || "";
  const amount = first ? asNumber(first.amount) : 0;
  const endDate =
    sched.endDate !== undefined && sched.endDate !== null ? String(sched.endDate) : "";
  return { firstDate, payDay, amount, endDate };
}

function formatTaggedExpenseDateDisplaySv(isoDate) {
  const dt = isoDate ? new Date(isoDate) : null;
  if (!dt || Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });
}

/** ISO-veckonummer 1–53 för lokalt Y-M-D (ISO 8601, samma som i Sverige). */
function isoWeekNumberForYmdParts(y, m, d) {
  const date = new Date(y, m - 1, d, 12, 0, 0);
  const tmp = new Date(date);
  tmp.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    )
  );
}

function formatTaggedIntervalPaymentLabel(interval) {
  const iv = String(interval || "").trim();
  if (!iv || iv === "once") return "Engångsbelopp";
  if (iv === "weekly") return "Veckovis betalning";
  if (iv === "monthly") return "Månadsvis betalning";
  if (iv === "quarterly") return "Kvartalsvis betalning";
  if (iv === "yearly") return "Årsvis betalning";
  return "Engångsbelopp";
}

function formatTaggedSavingsIntervalLabel(interval) {
  const iv = String(interval || "").trim();
  if (!iv || iv === "once") return "Engångsspar";
  if (iv === "weekly") return "Veckovis sparande";
  if (iv === "monthly") return "Månadsvis sparande";
  if (iv === "quarterly") return "Kvartalsvis sparande";
  if (iv === "yearly") return "Årligt sparande";
  return "Engångsspar";
}

function getTaggedExpenseRowsForMonth(year, month, cat) {
  const C = TAGGED_CATEGORY_CONFIG[cat];
  const keyField = C.subcategoryField || "subcategory";
  const rows = [];
  for (const exp of state.expenses || []) {
    if (exp.category !== C.category) continue;
    const key = exp[keyField] || "other";
    const typeLabel = getTaggedTypeLabel(cat, key);
    const nameRaw = String(exp.name || "").trim();
    const baseNameLine = C.hideTypeInList ? nameRaw || "Sparande" : nameRaw || typeLabel || "";
    const intervalLine =
      cat === "savings" ? formatTaggedSavingsIntervalLabel(exp.interval) : formatTaggedIntervalPaymentLabel(exp.interval);

    const paymentsInMonth = [];
    for (const p of exp.payments || []) {
      const dt = p.date ? new Date(p.date) : null;
      if (!dt || Number.isNaN(dt.getTime())) continue;
      if (dt.getFullYear() === year && dt.getMonth() + 1 === month) {
        const amt = asNumber(p.amount);
        if (amt > 0 && p.date) paymentsInMonth.push({ dateIso: String(p.date), amount: amt });
      }
    }
    if (paymentsInMonth.length === 0) continue;

    if (exp.interval === "weekly") {
      paymentsInMonth.sort((a, b) => String(a.dateIso).localeCompare(String(b.dateIso)));
      for (const pm of paymentsInMonth) {
        const dp = datePartsFromIso(pm.dateIso);
        let nameLine = baseNameLine;
        if (dp) nameLine = `v${isoWeekNumberForYmdParts(dp.y, dp.m, dp.d)} ${nameLine}`;
        rows.push({
          expenseId: exp.id,
          nameLine,
          amount: pm.amount,
          intervalLine,
          sortKey: pm.dateIso
        });
      }
    } else {
      const sum = paymentsInMonth.reduce((s, x) => s + x.amount, 0);
      if (sum <= 0) continue;
      paymentsInMonth.sort((a, b) => String(a.dateIso).localeCompare(String(b.dateIso)));
      const dateIso = paymentsInMonth[0].dateIso;
      rows.push({
        expenseId: exp.id,
        nameLine: baseNameLine,
        amount: sum,
        intervalLine,
        sortKey: dateIso || "9999-12-31"
      });
    }
  }
  rows.sort(
    (a, b) =>
      String(a.sortKey).localeCompare(String(b.sortKey)) || a.nameLine.localeCompare(b.nameLine, "sv")
  );
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return { rows, total };
}

function renderTaggedExpenseListMount(cat) {
  const C = TAGGED_CATEGORY_CONFIG[cat];
  const ids = C.ids;
  const mount = document.getElementById(ids.listMount);
  const totalEl = document.getElementById(ids.monthTotal);
  const titleEl = document.getElementById(ids.listMonthTitle);
  if (!mount) return;

  const u = ui.tagged[cat];
  const editorOpen = Boolean(u && u.editorOpen);
  const year = Number(u.listYear);
  const month = Number(u.listMonth);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return;

  if (titleEl) {
    const prefix = (C.labels && C.labels.monthListTitlePrefix) || "Utgifter";
    titleEl.textContent = `${prefix} ${monthName(month).toLowerCase()}`;
  }
  const { rows, total } = getTaggedExpenseRowsForMonth(year, month, cat);
  mount.innerHTML = "";

  if (rows.length === 0) {
    mount.innerHTML = `<div class="tagged-expense-list-empty">${escapeHtml(C.labels.emptyMonth)}</div>`;
  } else {
    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "tagged-expense-preview-row";
      const dis = editorOpen ? "disabled" : "";
      const ariaDis = editorOpen ? "true" : "false";
      const editAria = cat === "savings" ? "Redigera sparande" : "Redigera utgift";
      row.innerHTML = `
        <button type="button" class="tagged-expense-row-btn" data-tagged-cat="${escapeHtml(cat)}" data-tagged-edit-id="${escapeHtml(r.expenseId)}" aria-label="${escapeHtml(editAria)}" ${dis} aria-disabled="${ariaDis}">
          <span class="tagged-expense-row-btn-main">
            <span class="tagged-expense-row-line1">
              <span class="tagged-expense-name">${escapeHtml(r.nameLine)}</span>
              <span class="tagged-expense-amt">${escapeHtml(formatKr(r.amount))}</span>
            </span>
            <span class="tagged-expense-row-line2">${escapeHtml(r.intervalLine)}</span>
          </span>
          <span class="tagged-expense-row-chev" aria-hidden="true">${LIST_ROW_CHEVRON_SVG}</span>
        </button>
      `;
      mount.appendChild(row);
    }
  }

  if (totalEl) {
    const totalPrefix = (C.labels && C.labels.monthTotalPrefix) || "Totalt denna månad";
    totalEl.textContent = total > 0 ? `${totalPrefix}: ${formatKr(total)}` : "";
  }

  mount.onclick = (e) => {
    if (editorOpen) return;
    const btn = e.target.closest(".tagged-expense-row-btn[data-tagged-edit-id]");
    if (!btn) return;
    const id = btn.getAttribute("data-tagged-edit-id");
    const c = btn.getAttribute("data-tagged-cat");
    if (!id || !c || !TAGGED_CATEGORY_CONFIG[c]) return;
    ui.tagged[c].editingId = id;
    ui.tagged[c].editorOpen = true;
    if (c === "car") renderCarPage();
    else if (c === "home") renderHomePage();
    else if (c === "children") renderChildrenPage();
    else if (c === "savings") renderSavingsPage();
  };
}

function renderTaggedCategoryPage(cat) {
  const C = TAGGED_CATEGORY_CONFIG[cat];
  if (!C) return;
  const ids = C.ids;
  const u = ui.tagged[cat];

  const summaryId = cat === "car" ? "carErrorSummary" : cat === "home" ? "homeErrorSummary" : cat === "children" ? "childrenErrorSummary" : cat === "savings" ? "savingsErrorSummary" : null;
  if (summaryId && !u.editorOpen) hideErrorSummaryById(summaryId);
  if (!u.editorOpen) clearTaggedEditorInlineErrors(cat);

  const listYearSel = document.getElementById(ids.listYear);
  const listMonthSel = document.getElementById(ids.listMonth);
  const cur = currentYearMonth();
  const baseYear = ui.expensesYear || ui.overviewYear || cur.year;
  const appYears = getSelectableAppYears();
  if (u.listYear == null || !Number.isFinite(Number(u.listYear)) || !appYears.includes(Number(u.listYear))) {
    u.listYear = appYears.includes(baseYear) ? baseYear : appYears[1];
  }
  if (u.listMonth == null || !Number.isFinite(Number(u.listMonth)) || u.listMonth < 1 || u.listMonth > 12) {
    u.listMonth = cur.month;
  }

  if (listYearSel) {
    setYear3Options(listYearSel, u.listYear);
    listYearSel.onchange = () => {
      u.listYear = Number(listYearSel.value);
      syncTaggedListPeriodSummary(cat);
      renderTaggedExpenseListMount(cat);
    };
  }
  if (listMonthSel) {
    setMonthOptions(listMonthSel, u.listMonth);
    listMonthSel.onchange = () => {
      u.listMonth = Number(listMonthSel.value);
      syncTaggedListPeriodSummary(cat);
      renderTaggedExpenseListMount(cat);
    };
  }
  syncTaggedListPeriodSummary(cat);

  const editorCard = document.getElementById(ids.editorCard);
  const editorTitle = document.getElementById(ids.editorTitle);
  const typeSel = ids.editType ? document.getElementById(ids.editType) : null;
  const nameInp = document.getElementById(ids.editName);
  const intervalSel = document.getElementById(ids.editInterval);
  const firstInp = document.getElementById(ids.editFirstDate);
  const endInp = document.getElementById(ids.editEndDate);
  const amtInp = document.getElementById(ids.editAmount);
  const delBtn = document.getElementById(ids.deleteBtn);
  const saveBtn = document.getElementById(ids.saveBtn);
  const note = document.getElementById(ids.note);
  const addBtn = document.getElementById(ids.addBtn);
  wireTaggedEditorPickers(cat);
  wireKrAmountInput(ids.editAmount);

  if (typeSel && typeSel.options.length === 0) {
    for (const t of C.types) {
      const opt = document.createElement("option");
      opt.value = t.key;
      opt.textContent = t.label;
      typeSel.appendChild(opt);
    }
  }

  const editingId = u.editingId;
  const editing = editingId ? (state.expenses || []).find((x) => x.id === editingId && x.category === C.category) : null;

  if (editorCard) editorCard.hidden = !u.editorOpen;
  if (addBtn) {
    addBtn.disabled = Boolean(u.editorOpen);
    addBtn.setAttribute("aria-disabled", u.editorOpen ? "true" : "false");
  }

  if (u.editorOpen && nameInp && intervalSel && firstInp && endInp && amtInp) {
    if (editorTitle) {
      if (cat === "savings") {
        editorTitle.textContent = editing ? "Redigera sparande" : "Lägg till sparande";
      } else {
        editorTitle.textContent = editing ? "Redigera utgift" : "Lägg till utgift";
      }
    }
    if (editorCard) {
      if (cat === "savings") {
        editorCard.setAttribute("aria-label", editing ? "Redigera sparande" : "Lägg till sparande");
      } else {
        editorCard.setAttribute("aria-label", editing ? "Redigera utgift" : "Lägg till utgift");
      }
    }
    if (saveBtn) saveBtn.textContent = "Spara";
    if (delBtn) delBtn.hidden = !editing;

    const kf = C.subcategoryField || "subcategory";
    const defaultTypeKey = C.defaultTypeKey || C.types[0]?.key || "own";
    if (editing) {
      const curKey = editing[kf];
      if (typeSel) {
        typeSel.value = C.types.some((t) => t.key === curKey) ? curKey : C.types[0].key;
      }
      nameInp.value = editing.name || (C.hideTypeInEditor ? "" : getTaggedTypeLabel(cat, curKey));
      intervalSel.value = ["once", "weekly", "monthly", "quarterly", "yearly"].includes(editing.interval)
        ? editing.interval
        : "monthly";
      const inf = inferScheduleMetaFromExpense(editing);
      firstInp.value = inf.firstDate ? String(inf.firstDate).slice(0, 10) : "";
      endInp.value = inf.endDate ? String(inf.endDate).slice(0, 10) : "";
      amtInp.value = inf.amount > 0 ? formatKrLikeList(inf.amount) : "";
    } else {
      const defType = C.types.find((t) => t.key === defaultTypeKey) || C.types[0];
      if (typeSel && defType) {
        typeSel.value = defType.key;
      }
      nameInp.value = C.hideTypeInEditor ? "" : defType ? defType.label : "";
      intervalSel.value = "once";
      firstInp.value = "";
      endInp.value = "";
      amtInp.value = "";
    }
    updateTaggedEditorIntervalVisibility(cat);
    if (note) note.textContent = "";
    applyTaggedOverlayDateBounds(cat);
    syncTaggedEditorPickerSummaries(cat);
  }

  renderTaggedExpenseListMount(cat);

  if (intervalSel && intervalSel.getAttribute("data-tag-interval-bound") !== cat) {
    intervalSel.setAttribute("data-tag-interval-bound", cat);
    intervalSel.addEventListener("change", () => updateTaggedEditorIntervalVisibility(cat));
  }
  if (typeSel && typeSel.getAttribute("data-tag-type-bound") !== cat) {
    typeSel.setAttribute("data-tag-type-bound", cat);
    typeSel.addEventListener("change", () => {
      if (u.editingId) return;
      if (C.hideTypeInEditor) return;
      const t = C.types.find((x) => x.key === typeSel.value);
      if (t && nameInp) nameInp.value = t.label;
    });
  }
}

function taggedCategoryHasInlineFieldErrors(cat) {
  return cat === "car" || cat === "home" || cat === "children" || cat === "savings";
}

function clearTaggedEditorInlineErrors(cat) {
  if (!taggedCategoryHasInlineFieldErrors(cat)) return;
  const C = TAGGED_CATEGORY_CONFIG[cat];
  if (!C) return;
  for (const suf of ["Name", "FirstDate", "EndDate", "Amount"]) {
    const el = document.getElementById(`${cat}Err${suf}`);
    if (el) {
      el.hidden = true;
      el.textContent = "";
    }
  }
  for (const id of [C.ids.editName, C.ids.editFirstDate, C.ids.editEndDate, C.ids.editAmount]) {
    const inp = document.getElementById(id);
    if (inp) {
      inp.classList.remove("input-invalid");
      inp.setAttribute("aria-invalid", "false");
    }
  }
}

function setTaggedEditorInlineError(cat, field, msg) {
  if (!taggedCategoryHasInlineFieldErrors(cat) || !msg) return;
  const C = TAGGED_CATEGORY_CONFIG[cat];
  if (!C) return;
  const suf = field === "name" ? "Name" : field === "firstDate" ? "FirstDate" : field === "endDate" ? "EndDate" : "Amount";
  const errEl = document.getElementById(`${cat}Err${suf}`);
  const inpId =
    field === "name"
      ? C.ids.editName
      : field === "firstDate"
        ? C.ids.editFirstDate
        : field === "endDate"
          ? C.ids.editEndDate
          : C.ids.editAmount;
  const inp = document.getElementById(inpId);
  if (errEl) {
    errEl.textContent = msg;
    errEl.hidden = false;
  }
  if (inp) {
    inp.classList.add("input-invalid");
    inp.setAttribute("aria-invalid", "true");
  }
}

function selectOptionLabelByValue(sel, value) {
  if (!sel) return "—";
  const v = String(value ?? sel.value ?? "");
  const opt = Array.from(sel.options || []).find((o) => String(o.value) === v);
  return opt ? (opt.textContent || opt.value || "—") : "—";
}

function syncTaggedEditorPickerSummaries(cat) {
  const typeSel = document.getElementById(`${cat}EditType`);
  const typeSum = document.getElementById(`${cat}EditTypeSummary`);
  if (typeSel && typeSum) typeSum.textContent = selectOptionLabelByValue(typeSel);

  const intSel = document.getElementById(`${cat}EditInterval`);
  const intSum = document.getElementById(`${cat}EditIntervalSummary`);
  if (intSel && intSum) intSum.textContent = selectOptionLabelByValue(intSel);
}

function wireTaggedEditorPickers(cat) {
  const key = `__pickersBound_${cat}`;
  if (ui.tagged[cat] && ui.tagged[cat][key]) return;
  if (ui.tagged[cat]) ui.tagged[cat][key] = true;

  const typeBtn = document.getElementById(`${cat}EditTypeOpenBtn`);
  const typeSel = document.getElementById(`${cat}EditType`);
  if (typeBtn && typeSel) {
    typeBtn.addEventListener("click", () => {
      const options = Array.from(typeSel.options).map((o) => ({ value: o.value, label: o.textContent || o.value }));
      openListPickerSheet({
        title: "Välj kategori",
        options,
        currentValue: typeSel.value,
        onSelect: (v) => {
          typeSel.value = v;
          typeSel.dispatchEvent(new Event("change", { bubbles: true }));
          syncTaggedEditorPickerSummaries(cat);
        }
      });
    });
    typeSel.addEventListener("change", () => syncTaggedEditorPickerSummaries(cat));
  }

  const intBtn = document.getElementById(`${cat}EditIntervalOpenBtn`);
  const intSel = document.getElementById(`${cat}EditInterval`);
  if (intBtn && intSel) {
    intBtn.addEventListener("click", () => {
      const options = Array.from(intSel.options).map((o) => ({ value: o.value, label: o.textContent || o.value }));
      openListPickerSheet({
        title: cat === "savings" ? "Välj sparintervall" : "Välj intervall",
        options,
        currentValue: intSel.value,
        onSelect: (v) => {
          intSel.value = v;
          intSel.dispatchEvent(new Event("change", { bubbles: true }));
          syncTaggedEditorPickerSummaries(cat);
        }
      });
    });
    intSel.addEventListener("change", () => syncTaggedEditorPickerSummaries(cat));
  }
}

function formatKrLikeList(n) {
  const v = Math.max(0, Math.round(asNumber(n)));
  if (!Number.isFinite(v) || v <= 0) return "";
  return `${v.toLocaleString("sv-SE")} kr`;
}

function parseKrLikeList(s) {
  const raw = String(s || "").replace(/\s+/g, " ").trim();
  if (!raw) return 0;
  const digits = raw.replace(/[^\d]/g, "");
  const n = asNumber(digits);
  return Math.max(0, Math.round(n));
}

function wireKrAmountInput(inputId) {
  const inp = document.getElementById(inputId);
  if (!(inp instanceof HTMLInputElement)) return;
  if (inp.getAttribute("data-kr-bound") === "1") return;
  inp.setAttribute("data-kr-bound", "1");

  inp.addEventListener("focus", () => {
    const n = parseKrLikeList(inp.value);
    inp.value = n > 0 ? String(n) : "";
  });
  inp.addEventListener("blur", () => {
    const n = parseKrLikeList(inp.value);
    inp.value = formatKrLikeList(n);
  });
}

function saveTaggedCategoryFromEditor(cat) {
  const C = TAGGED_CATEGORY_CONFIG[cat];
  if (!C) return;
  const ids = C.ids;
  const u = ui.tagged[cat];
  const note = document.getElementById(ids.note);
  const summaryId = cat === "car" ? "carErrorSummary" : cat === "home" ? "homeErrorSummary" : cat === "children" ? "childrenErrorSummary" : cat === "savings" ? "savingsErrorSummary" : null;
  const summaryEl = summaryId ? document.getElementById(summaryId) : null;
  hideErrorSummaryByEl(summaryEl);
  clearTaggedEditorInlineErrors(cat);
  const typeSel = ids.editType ? document.getElementById(ids.editType) : null;
  const nameInp = document.getElementById(ids.editName);
  const intervalSel = document.getElementById(ids.editInterval);
  const firstInp = document.getElementById(ids.editFirstDate);
  const endInp = document.getElementById(ids.editEndDate);
  const amtInp = document.getElementById(ids.editAmount);
  if (!nameInp || !intervalSel || !firstInp || !amtInp) return;

  const kf = C.subcategoryField || "subcategory";
  const name = (nameInp.value || "").trim();
  const L = C.labels || {};
  if (!name) {
    const msg = L.nameRequiredHint || "Ange namn.";
    if (note) note.textContent = msg;
    setTaggedEditorInlineError(cat, "name", msg);
    renderErrorSummary(summaryEl, [{ label: msg, jumpId: ids.editName }]);
    return;
  }
  const defaultTypeKey = C.defaultTypeKey || C.types[0]?.key;
  let typeKey = typeSel?.value || defaultTypeKey;
  if (u.editingId && C.hideTypeInEditor) {
    const prev = (state.expenses || []).find((x) => x.id === u.editingId);
    const pk = prev && prev[kf];
    if (pk && C.types.some((t) => t.key === pk)) typeKey = pk;
    else typeKey = defaultTypeKey;
  }
  const interval = intervalSel.value || "once";
  const firstDateISO = (firstInp.value || "").trim();
  const firstParts = datePartsFromIso(firstDateISO);
  if (!firstParts) {
    const msg =
      interval === "once"
        ? L.dateOnceHint || "Ange datum för betalning."
        : L.dateRecurringHint || "Ange första betalningsdatum.";
    if (note) note.textContent = msg;
    setTaggedEditorInlineError(cat, "firstDate", msg);
    renderErrorSummary(summaryEl, [{ label: msg, jumpId: ids.editFirstDate }]);
    return;
  }
  if (!isAllowedYear(firstParts.y)) {
    const msg = "Datum måste ligga inom appens årsspann (föregående, nuvarande, nästa år).";
    if (note) note.textContent = msg;
    setTaggedEditorInlineError(cat, "firstDate", msg);
    renderErrorSummary(summaryEl, [{ label: msg, jumpId: ids.editFirstDate }]);
    return;
  }
  const paymentDay = Math.max(1, Math.min(31, Math.floor(firstParts.d)));
  let endDateISO = (endInp?.value || "").trim();
  if (interval === "once") {
    endDateISO = "";
  } else if (endDateISO && !datePartsFromIso(endDateISO)) {
    const msg = L.endDateHint || "Ogiltigt slutdatum för betalning.";
    if (note) note.textContent = msg;
    setTaggedEditorInlineError(cat, "endDate", msg);
    renderErrorSummary(summaryEl, [{ label: msg, jumpId: ids.editEndDate }]);
    return;
  }
  const amount = parseKrLikeList(amtInp.value);
  if (amount <= 0) {
    const msg = "Ange belopp större än noll.";
    if (note) note.textContent = msg;
    setTaggedEditorInlineError(cat, "amount", msg);
    renderErrorSummary(summaryEl, [{ label: msg, jumpId: ids.editAmount }]);
    return;
  }
  const payments = buildCarExpensePayments({
    interval,
    firstDateISO,
    endDateISO,
    paymentDay,
    amount
  });
  if (!payments.length) {
    const msg =
      "Inga betalningar kunde skapas inom appens datumfönster. Kontrollera intervall, datum och eventuellt slutdatum.";
    if (note) note.textContent = msg;
    setTaggedEditorInlineError(cat, "firstDate", msg);
    renderErrorSummary(summaryEl, [{ label: msg, jumpId: ids.editFirstDate }]);
    return;
  }
  const prevRow = u.editingId ? (state.expenses || []).find((x) => x.id === u.editingId) : null;
  const prevMeta =
    prevRow && typeof prevRow.metadata === "object" && prevRow.metadata && !Array.isArray(prevRow.metadata)
      ? deepCloneJson(prevRow.metadata)
      : {};
  prevMeta.schedule = {
    paymentDay: interval === "once" ? firstParts.d : paymentDay,
    firstDate: firstDateISO,
    endDate: endDateISO
  };
  const base = {
    name,
    interval,
    payments,
    category: C.category,
    metadata: prevMeta
  };
  base[kf] = typeKey;

  if (u.editingId) {
    const idx = (state.expenses || []).findIndex((x) => x.id === u.editingId);
    if (idx >= 0) state.expenses[idx] = canonicalizeExpenseRecord({ ...state.expenses[idx], ...base, id: state.expenses[idx].id });
  } else {
    state.expenses.push(canonicalizeExpenseRecord({ id: uid(), ...base }));
  }
  saveState();
  if (note) note.textContent = "";
  clearTaggedEditorInlineErrors(cat);
  u.editorOpen = false;
  u.editingId = null;
  renderTaggedCategoryPage(cat);
  renderOverviewIfOnOverview();
  renderExpensesList();
}

function deleteTaggedCategoryFromEditor(cat) {
  const u = ui.tagged[cat];
  if (!u.editingId) return;
  state.expenses = (state.expenses || []).filter((x) => x.id !== u.editingId);
  saveState();
  u.editorOpen = false;
  u.editingId = null;
  renderTaggedCategoryPage(cat);
  renderOverviewIfOnOverview();
  renderExpensesList();
}

function renderCarPage() {
  renderTaggedCategoryPage("car");
}

function renderHomePage() {
  renderTaggedCategoryPage("home");
}

function renderChildrenPage() {
  renderTaggedCategoryPage("children");
}

function renderSavingsPage() {
  renderTaggedCategoryPage("savings");
}

function saveCarExpenseFromEditor() {
  saveTaggedCategoryFromEditor("car");
}

function deleteCarExpenseFromEditor() {
  deleteTaggedCategoryFromEditor("car");
}

function renderFoodPage() {
  const foodNoteClear = document.getElementById("foodNote");
  if (foodNoteClear) foodNoteClear.textContent = "";
  hideErrorSummaryById("foodErrorSummary");
  hideErrorSummaryById("foodCustodyErrorSummary");
  hideErrorSummaryById("foodHouseholdErrorSummary");
  hideErrorSummaryById("foodDeviationErrorSummary");

  const previewYearSel = document.getElementById("foodPreviewYear");
  const previewMonthSel = document.getElementById("foodPreviewMonth");
  const cur = currentYearMonth();
  if (ui.foodPreviewYear == null || !Number.isFinite(Number(ui.foodPreviewYear))) ui.foodPreviewYear = cur.year;
  if (ui.foodPreviewMonth == null || !Number.isFinite(Number(ui.foodPreviewMonth))) ui.foodPreviewMonth = cur.month;
  const previewYear = Number(previewYearSel?.value || ui.foodPreviewYear);
  const previewMonth = Number(previewMonthSel?.value || ui.foodPreviewMonth);
  ui.foodPreviewYear = previewYear;
  ui.foodPreviewMonth = previewMonth;
  ui.expensesFoodMonth = previewMonth;
  if (previewYearSel) setYear3Options(previewYearSel, previewYear);
  if (previewYearSel) previewYearSel.onchange = () => renderFoodPage();
  if (previewMonthSel) setMonthOptions(previewMonthSel, previewMonth);
  if (previewMonthSel) previewMonthSel.onchange = () => renderFoodPage();
  syncFoodPreviewSummaryLabel();
  const foodWindowLabel = `${getSelectableAppYears()[0]}–${getSelectableAppYears()[2]}`;
  const cfg = getSharedFoodConfig();
  const periodsCopy = Array.isArray(cfg.custodyPeriods)
    ? cfg.custodyPeriods.map((p) => {
      const n = normalizeCustodyPeriodEntry(p);
      return { ...n, absent: { ...n.absent } };
    })
    : [];
  ui.foodConfigDraft = {
    ...cfg,
    household: {
      ...cfg.household
    },
    custodyPeriods: periodsCopy,
    custodySchedule: normalizeCustodySchedule(cfg.custodySchedule)
  };
  delete ui.foodConfigDraft._custodyHhSnap;
  updateFoodMatHubTitles(ui.foodConfigDraft);
  if (periodsCopy.length > 0) {
    const bc = Math.max(0, Math.floor(asNumber(ui.foodConfigDraft.household.children)));
    const bt = Math.max(0, Math.floor(asNumber(ui.foodConfigDraft.household.teens)));
    ui.foodConfigDraft._custodyHhSnapGlobal = { c: bc, t: bt };
  } else {
    delete ui.foodConfigDraft._custodyHhSnapGlobal;
  }

  const els = {
    autoSection: document.getElementById("foodAutoSection"),
    manualSection: document.getElementById("foodManualSection"),
    adultsInput: document.getElementById("foodAdultsInput"),
    teensInput: document.getElementById("foodTeensInput"),
    childrenInput: document.getElementById("foodChildrenInput"),
    manualWeeklyInput: document.getElementById("foodManualWeeklyInput"),
    previewNormalWeek: document.getElementById("foodPreviewNormalWeek"),
    previewWeekSpread: document.getElementById("foodPreviewWeekSpread"),
    previewWeekAvg: document.getElementById("foodPreviewWeekAvg"),
    previewMonthTotal: document.getElementById("foodPreviewMonthTotal"),
    previewWeeks: document.getElementById("foodPreviewWeeks"),
    previewWeeksTitle: document.getElementById("foodPreviewWeeksTitle"),
    calcBaseWeek: document.getElementById("foodCalcBaseWeek"),
    calcAdjustedWeek: document.getElementById("foodCalcAdjustedWeek"),
    calcFinalWeek: document.getElementById("foodCalcFinalWeek"),
    saveContext: document.getElementById("foodSaveContext"),
    custodyGlobalWarn: document.getElementById("foodCustodyGlobalWarn"),
    custodyList: document.getElementById("foodCustodyPeriodsList"),
    custodyListBox: document.getElementById("foodCustodyListBox"),
    custodyListError: document.getElementById("foodCustodyListError"),
    custodyEditor: document.getElementById("foodCustodyEditor"),
    custodyEditorWeekCost: document.getElementById("foodCustodyEditorWeekCost"),
    custodyExampleBlock: document.getElementById("foodCustodyExampleBlock"),
    custodyExampleWeeks: document.getElementById("foodCustodyExampleWeeks"),
    foodLevelHelp: document.getElementById("foodLevelHelp"),
    foodScopeHelp: document.getElementById("foodScopeHelp"),
    hhList: document.getElementById("foodHouseholdChangesList"),
    devList: document.getElementById("foodDeviationsList"),
    warnEl: document.getElementById("foodNote")
  };

  const setChipState = (id, active) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute("aria-pressed", active ? "true" : "false");
    el.classList.toggle("active", active);
  };
  const setCustodyFieldErr = (el, msg) => {
    if (!el) return;
    if (msg) {
      el.hidden = false;
      el.textContent = msg;
    } else {
      el.hidden = true;
      el.textContent = "";
    }
  };

  let editingCustodyIndex = -1;
  let custodyEditorDraft = null;
  let custodyEditorBackup = null;

  const writeCustodyEditorAbsent = (key, rawValue) => {
    const baseC = Math.max(0, Math.floor(asNumber(ui.foodConfigDraft.household?.children)));
    const baseT = Math.max(0, Math.floor(asNumber(ui.foodConfigDraft.household?.teens)));
    if (key === "children") {
      const nv = Math.min(baseC, Math.max(0, Math.floor(asNumber(rawValue))));
      if (editingCustodyIndex >= 0) {
        const p = ui.foodConfigDraft.custodyPeriods?.[editingCustodyIndex];
        if (p) {
          if (!p.absent) p.absent = { children: 0, teens: 0 };
          p.absent.children = nv;
        }
      } else if (custodyEditorDraft) {
        if (!custodyEditorDraft.absent) custodyEditorDraft.absent = { children: 0, teens: 0 };
        custodyEditorDraft.absent.children = nv;
      }
      const el = document.getElementById("foodCustodyEditChildrenInput");
      if (el) el.value = String(nv);
    } else {
      const nv = Math.min(baseT, Math.max(0, Math.floor(asNumber(rawValue))));
      if (editingCustodyIndex >= 0) {
        const p = ui.foodConfigDraft.custodyPeriods?.[editingCustodyIndex];
        if (p) {
          if (!p.absent) p.absent = { children: 0, teens: 0 };
          p.absent.teens = nv;
        }
      } else if (custodyEditorDraft) {
        if (!custodyEditorDraft.absent) custodyEditorDraft.absent = { children: 0, teens: 0 };
        custodyEditorDraft.absent.teens = nv;
      }
      const el = document.getElementById("foodCustodyEditTeensInput");
      if (el) el.value = String(nv);
    }
  };

  const readCustodyEditorFromDom = () => ({
    startDate: document.getElementById("foodCustodyEditStart")?.value || "",
    endDate: document.getElementById("foodCustodyEditEnd")?.value || "",
    ratioKey: document.getElementById("foodCustodyEditRatio")?.value || "7-7",
    absent: {
      children: Math.max(0, Math.floor(asNumber(document.getElementById("foodCustodyEditChildrenInput")?.value))),
      teens: Math.max(0, Math.floor(asNumber(document.getElementById("foodCustodyEditTeensInput")?.value)))
    }
  });

  const clearCustodyEditorFieldErrors = () => {
    setCustodyFieldErr(document.getElementById("foodCustodyErrStart"), "");
    setCustodyFieldErr(document.getElementById("foodCustodyErrEnd"), "");
    setCustodyFieldErr(document.getElementById("foodCustodyErrCounts"), "");
    const st = document.getElementById("foodCustodyEditStart");
    const end = document.getElementById("foodCustodyEditEnd");
    const cInp = document.getElementById("foodCustodyEditChildrenInput");
    const tInp = document.getElementById("foodCustodyEditTeensInput");
    if (st) st.classList.remove("input-invalid");
    if (end) end.classList.remove("input-invalid");
    if (cInp) cInp.classList.remove("input-invalid");
    if (tInp) tInp.classList.remove("input-invalid");
  };

  const renderCustodyEditor = () => {
    const editor = els.custodyEditor;
    if (!editor) return;
    const arr = ui.foodConfigDraft.custodyPeriods || [];
    const p = editingCustodyIndex >= 0 ? arr[editingCustodyIndex] : custodyEditorDraft;
    const addBtn = document.getElementById("foodAddCustodyPeriodBtn");
    if (!p) {
      editor.hidden = true;
      if (addBtn) addBtn.disabled = false;
      return;
    }
    editor.hidden = false;
    if (addBtn) addBtn.disabled = true;
    document.getElementById("foodCustodyEditStart").value = p.startDate || "";
    document.getElementById("foodCustodyEditEnd").value = p.endDate || "";
    const ratioSel = document.getElementById("foodCustodyEditRatio");
    const ratioSummaryEl = document.getElementById("foodCustodyEditRatioSummary");
    if (ratioSel) ratioSel.value = p.ratioKey || "7-7";
    if (ratioSummaryEl) {
      const opt = ratioSel ? ratioSel.options[ratioSel.selectedIndex] : null;
      ratioSummaryEl.textContent = opt ? opt.textContent : "—";
    }
    document.getElementById("foodCustodyEditChildrenInput").value = asNumber(p.absent?.children);
    document.getElementById("foodCustodyEditTeensInput").value = asNumber(p.absent?.teens);

    const saveBtn = document.getElementById("foodCustodyEditSaveBtn");
    if (saveBtn) saveBtn.textContent = editingCustodyIndex >= 0 ? "Uppdatera period" : "Lägg till period";

    const panelLegend = document.getElementById("foodCustodyEditorPanelLegend");
    if (panelLegend) panelLegend.textContent = editingCustodyIndex >= 0 ? "Redigera period" : "Lägg till period";

    const delBtn = document.getElementById("foodCustodyEditDeleteBtn");
    if (delBtn) delBtn.hidden = editingCustodyIndex < 0;
    clearCustodyEditorFieldErrors();
    const sInp = document.getElementById("foodCustodyEditStart");
    const eInp = document.getElementById("foodCustodyEditEnd");
    if (sInp instanceof HTMLInputElement) syncDateFieldRow(sInp);
    if (eInp instanceof HTMLInputElement) syncDateFieldRow(eInp);
  };

  const renderCustodyPeriodsList = (custodyAccept) => {
    const list = els.custodyList;
    const arr = ui.foodConfigDraft.custodyPeriods || [];
    if (els.custodyListBox) els.custodyListBox.hidden = arr.length === 0;
    if (els.custodyListError) {
      els.custodyListError.hidden = true;
      els.custodyListError.textContent = "";
    }
    if (!list) return;
    const custodyEditorEl = document.getElementById("foodCustodyEditor");
    const lockCustodyLinks = Boolean(custodyEditorEl && !custodyEditorEl.hidden);
    const sorted = arr.map((p, idx) => ({ p, idx })).sort(
      (a, b) => String(a.p.startDate || "").localeCompare(String(b.p.startDate || "")) || a.idx - b.idx
    );
    list.innerHTML = sorted.map(({ p, idx }) => {
      const shadow = custodyAccept.shadowedOrigIndices.has(idx);
      const sDt = parseDateISO(p.startDate);
      const startText = sDt ? formatPlanningDateLongSv(sDt) : (p.startDate || "-");
      const endStr = p.endDate && String(p.endDate).trim() ? String(p.endDate).trim() : "";
      const eDt = endStr ? parseDateISO(endStr) : null;
      const endText = endStr ? (eDt ? formatPlanningDateLongSv(eDt) : endStr) : "tillsvidare";
      const range = `${escapeHtml(startText)} – ${escapeHtml(endText)}`;
      const meta = shadow ? ` <span class="food-period-bb-row-meta">(överlapp — räknas ej)</span>` : "";
      return `
        <button
          type="button"
          class="food-period-bb-row ${shadow ? "food-period-bb-row--shadowed" : ""}"
          data-custody-row="${idx}"
          ${lockCustodyLinks ? "disabled" : ""}
          aria-label="Redigera period ${range}"
        >
          <span class="food-period-bb-row-main">${range}</span>
          ${meta}
          <span class="food-period-bb-row-chevron" aria-hidden="true">${LIST_ROW_CHEVRON_SVG}</span>
        </button>
      `;
    }).join("");
    list.querySelectorAll("[data-custody-row]").forEach((btn) => {
      btn.onclick = () => {
        if (lockCustodyLinks) return;
        const i = Number(btn.getAttribute("data-custody-row"));
        // Backup så att Avbryt inte lämnar kvar interimändringar i `ui.foodConfigDraft`.
        custodyEditorBackup = JSON.parse(JSON.stringify(ui.foodConfigDraft.custodyPeriods?.[i] || null));
        editingCustodyIndex = i;
        custodyEditorDraft = null;
        renderCustodyEditor();
        draw();
      };
    });
  };

  let draw = () => {
    const d = ui.foodConfigDraft;
    d.foodBudgetYear = currentYearMonth().year;
    const editorAbsentRef = custodyEditorDraft ? custodyEditorDraft.absent : null;
    syncCustodyPeriodsAbsentWithHousehold(d, editorAbsentRef);
    if (els.custodyEditor && !els.custodyEditor.hidden) {
      if (editingCustodyIndex >= 0) {
        const cur = (d.custodyPeriods || [])[editingCustodyIndex];
        if (cur) {
          const cInp = document.getElementById("foodCustodyEditChildrenInput");
          const tInp = document.getElementById("foodCustodyEditTeensInput");
          if (cInp) cInp.value = asNumber(cur.absent.children);
          if (tInp) tInp.value = asNumber(cur.absent.teens);
        }
      } else if (custodyEditorDraft) {
        const cInp = document.getElementById("foodCustodyEditChildrenInput");
        const tInp = document.getElementById("foodCustodyEditTeensInput");
        if (cInp) cInp.value = asNumber(custodyEditorDraft.absent.children);
        if (tInp) tInp.value = asNumber(custodyEditorDraft.absent.teens);
      }
    }
    const auto = d.mode !== "manual";
    if (els.manualSection) els.manualSection.hidden = auto;
    const autoOnly = document.getElementById("foodAutoOnlySection");
    const autoCalc = document.getElementById("foodAutoCalcSection");
    if (autoOnly) autoOnly.hidden = !auto;
    if (autoCalc) autoCalc.hidden = !auto;
    if (els.adultsInput) els.adultsInput.value = d.household.adults;
    if (els.teensInput) els.teensInput.value = d.household.teens;
    if (els.childrenInput) els.childrenInput.value = d.household.children;
    if (els.manualWeeklyInput) els.manualWeeklyInput.value = asNumber(d.manualWeeklyCost);

    setChipState("foodModeAutoBtn", d.mode === "auto");
    setChipState("foodModeManualBtn", d.mode === "manual");
    setChipState("foodLevelBudgetBtn", d.costLevel === "budget");
    setChipState("foodLevelNormalBtn", d.costLevel === "normal");
    setChipState("foodLevelHighBtn", d.costLevel === "high");
    const scopeSel = document.getElementById("foodScopeSelect");
    if (scopeSel) scopeSel.value = String(d.foodScope || "groceries");
    syncFoodScopeSummaryLabel();

    const baseChildren = Math.max(0, Math.floor(asNumber(d.household?.children)));
    const baseTeens = Math.max(0, Math.floor(asNumber(d.household?.teens)));
    const custodyAccept = buildCustodyPeriodAcceptance(d.custodyPeriods || [], 0);
    if (els.custodyGlobalWarn) {
      if (custodyAccept.shadowedOrigIndices.size > 0) {
        els.custodyGlobalWarn.hidden = false;
        els.custodyGlobalWarn.textContent = "Minst två perioder överlappar. Den som börjar senare räknas inte — justera datumen innan du kan spara.";
      } else {
        els.custodyGlobalWarn.hidden = true;
        els.custodyGlobalWarn.textContent = "";
      }
    }
    renderCustodyPeriodsList(custodyAccept);

    const edLive = readCustodyEditorFromDom();
    const editorOpen = els.custodyEditor && !els.custodyEditor.hidden;
    const aCed = Math.max(0, Math.floor(asNumber(edLive.absent.children)));
    const aTed = Math.max(0, Math.floor(asNumber(edLive.absent.teens)));
    const chMinBtn = document.getElementById("foodCustodyEditChildrenMinusBtn");
    const chPlusBtn = document.getElementById("foodCustodyEditChildrenPlusBtn");
    const teMinBtn = document.getElementById("foodCustodyEditTeensMinusBtn");
    const tePlusBtn = document.getElementById("foodCustodyEditTeensPlusBtn");
    if (editorOpen) {
      if (chMinBtn) chMinBtn.disabled = baseChildren <= 0 || aCed <= 0;
      if (chPlusBtn) chPlusBtn.disabled = baseChildren <= 0 || aCed >= baseChildren;
      if (teMinBtn) teMinBtn.disabled = baseTeens <= 0 || aTed <= 0;
      if (tePlusBtn) tePlusBtn.disabled = baseTeens <= 0 || aTed >= baseTeens;
      const chi = document.getElementById("foodCustodyEditChildrenInput");
      const tei = document.getElementById("foodCustodyEditTeensInput");
      if (chi) chi.disabled = baseChildren <= 0;
      if (tei) tei.disabled = baseTeens <= 0;
    }

    // Helper texts (auto only)
    if (els.foodLevelHelp) {
      els.foodLevelHelp.textContent = d.costLevel === "budget"
        ? "Budgetnivå med lägre veckokostnad."
        : (d.costLevel === "high" ? "Hög nivå med högre veckokostnad." : "Normal nivå för vardaglig matplanering.");
    }
    if (els.foodScopeHelp) {
      els.foodScopeHelp.textContent = d.foodScope === "groceries"
        ? "Endast matvaror - Mat som köps hem och lagas hemma."
        : (d.foodScope === "mixed"
          ? "Matvaror + restaurang - Mat hemma plus enstaka lunch eller take-away."
          : "All mat - All mat inklusive restaurang, take-away och spontanköp.");
    }

    let custodyOk = true;
    const periods = d.custodyPeriods || [];
    if (custodyAccept.shadowedOrigIndices.size > 0) custodyOk = false;
    for (let i = 0; i < periods.length; i++) {
      const p = normalizeCustodyPeriodEntry(periods[i]);
      if (!p.startDate || !String(p.startDate).trim()) continue;
      if (!custodyPeriodEndDateValid(p)) custodyOk = false;
      if (p.absent.children > baseChildren || p.absent.teens > baseTeens) custodyOk = false;
    }

    if (els.custodyEditorWeekCost) {
      const sEd = parseDateISO(edLive.startDate);
      if (editorOpen && sEd) {
        const ws = getIsoWeekMondayFromDate(sEd);
        els.custodyEditorWeekCost.textContent = formatKr(
          computeFoodWeekTotalCustodyEditorOnly(d, edLive, ws)
        );
      } else {
        els.custodyEditorWeekCost.textContent = "—";
      }
    }

    if (els.custodyExampleBlock && els.custodyExampleWeeks) {
      const sEx = parseDateISO(edLive.startDate);
      if (editorOpen && sEx) {
        els.custodyExampleBlock.hidden = false;
        const pNorm = normalizeCustodyPeriodEntry(edLive);
        const budgetYear = Number(d.foodBudgetYear) || currentYearMonth().year;
        const effEnd = getCustodyPeriodEffectiveEnd(pNorm, budgetYear);
        const periodStartMonday = getIsoWeekMondayFromDate(sEx);
        const rows = [];
        for (let i = 0; i < 24 && rows.length < 4; i++) {
          const ws = addDays(periodStartMonday, i * 7);
          const we = addDays(ws, 6);
          if (ws.getTime() > effEnd.getTime()) break;
          if (we.getTime() < sEx.getTime()) continue;
          const total = computeFoodWeekTotalCustodyEditorOnly(d, edLive, ws);
          const { week } = getISOWeekInfo(ws);
          const rangeStr = formatIsoWeekRangeLongSv(ws, we);
          rows.push({ week, total, rangeStr });
        }
        els.custodyExampleWeeks.innerHTML = rows
          .map(
            (r) => `<div class="food-preview-week-block food-custody-example-week">
  <div class="food-preview-week-top">
    <strong class="food-preview-week-num">Vecka ${escapeHtml(String(r.week))}</strong>
    <strong class="food-preview-week-total">${escapeHtml(formatKr(r.total))}</strong>
  </div>
  <div class="food-preview-week-range">${escapeHtml(r.rangeStr)}</div>
</div>`
          )
          .join("");
      } else {
        els.custodyExampleBlock.hidden = true;
        els.custodyExampleWeeks.innerHTML = "";
      }
    }

    // Disable save while errors exist (inline validation)
    const saveBtn = document.getElementById("foodSaveBtn");
    let canSave = true;
    if (!custodyOk) canSave = false;
    if (auto) {
      if ((d.householdChanges || []).some(isBadHouseholdChangeDateRange)) canSave = false;
      if ((d.deviations || []).some(isBadDeviationDateRange)) canSave = false;
    }
    if (saveBtn) saveBtn.disabled = !canSave;

    let saveBlockMsg = "";
    if (custodyAccept.shadowedOrigIndices.size > 0) {
      saveBlockMsg = "Växelvis boende: justera överlappande perioder innan du kan spara.";
    } else if (!custodyOk) {
      saveBlockMsg = "Växelvis: kontrollera periodernas datum och antal som är borta.";
    } else if (auto && (d.householdChanges || []).some(isBadHouseholdChangeDateRange)) {
      saveBlockMsg =
        "Ändrat hushåll: ange startdatum; slutdatum ska vara samma eller efter start, eller lämna slut tomt (tillsvidare).";
    } else if (auto && (d.deviations || []).some(isBadDeviationDateRange)) {
      saveBlockMsg =
        "Avvikande kostnad: ange startdatum; slut ska vara samma eller efter start, eller lämna slut tomt (tillsvidare).";
    }
    if (els.saveContext) {
      els.saveContext.textContent = saveBlockMsg;
      els.saveContext.classList.toggle("field-error", Boolean(saveBlockMsg));
      els.saveContext.setAttribute("role", saveBlockMsg ? "alert" : "status");
    }

    const normalWeekly = d.mode === "manual" ? Math.max(0, asNumber(d.manualWeeklyCost)) : computeFoodWeeklyCost(d);
    if (els.previewNormalWeek) els.previewNormalWeek.textContent = formatKr(normalWeekly);
    const baseWeekly = Math.round(
      asNumber(d.household?.adults) * FOOD_BASE_COSTS.adults +
      asNumber(d.household?.teens) * FOOD_BASE_COSTS.teens +
      asNumber(d.household?.children) * FOOD_BASE_COSTS.children
    );
    const levelF = FOOD_LEVEL_FACTORS[d.costLevel] || 1.0;
    const scopeF = FOOD_SCOPE_FACTORS[d.foodScope] || 1.0;
    const adjustedWeekly = Math.round(baseWeekly * levelF * scopeF);
    if (els.calcBaseWeek) els.calcBaseWeek.textContent = formatKr(baseWeekly);
    if (els.calcAdjustedWeek) els.calcAdjustedWeek.textContent = formatKr(adjustedWeekly);
    if (els.calcFinalWeek) els.calcFinalWeek.textContent = formatKr(adjustedWeekly);
    const appYears = getSelectableAppYears();
    if (!els.previewWeeks) return;
    const planningDay = Math.max(1, Math.min(7, Math.floor(asNumber(state.settings.foodPlanningWeekday || 1))));
    const weeks = [];
    for (const y of appYears) {
      for (const w of getIsoWeeksForYear(y)) {
        const planningDate = addDays(w.weekStart, planningDay - 1);
        const { amount, labels } = computeFoodWeekAmountAndLabels(d, w.weekStart, w.weekEnd);
        weeks.push({ ...w, planningDate, amount, labels });
      }
    }
    weeks.sort((a, b) => a.planningDate.getTime() - b.planningDate.getTime());
    const monthWeeks = weeks.filter(
      (w) => w.planningDate.getMonth() + 1 === Number(previewMonth) && w.planningDate.getFullYear() === Number(previewYear)
    );
    const monthSum = monthWeeks.reduce((s, w) => s + asNumber(w.amount), 0);
    const amounts = monthWeeks.map((w) => Math.round(asNumber(w.amount)));
    const spread =
      amounts.length >= 2 ? Math.max(...amounts) - Math.min(...amounts) : 0;
    const avg =
      monthWeeks.length > 0 ? Math.round(monthSum / monthWeeks.length) : 0;
    if (els.previewWeekSpread) els.previewWeekSpread.textContent = formatKr(spread);
    if (els.previewWeekAvg) els.previewWeekAvg.textContent = formatKr(avg);
    if (els.previewMonthTotal) {
      els.previewMonthTotal.textContent = `Totalt denna månad: ${formatKr(monthSum)}`;
    }
    if (els.previewWeeksTitle) {
      const m = Math.max(1, Math.min(12, Math.floor(Number(previewMonth)) || 1));
      const monthLong = new Date(2000, m - 1, 1).toLocaleDateString("sv-SE", { month: "long" });
      const cap = monthLong ? monthLong.charAt(0).toUpperCase() + monthLong.slice(1) : "";
      els.previewWeeksTitle.textContent = cap ? `Veckor i ${cap}` : "Veckor";
    }
    els.previewWeeks.innerHTML = monthWeeks
      .map((w) => {
        const wkKey = `${w.isoYear}-W${pad2(w.week)}`;
        const rangeStr = formatIsoWeekRangeLongSv(w.weekStart, w.weekEnd);
        return `<div class="food-preview-week-block" data-food-week="${escapeHtml(wkKey)}">
  <div class="food-preview-week-top">
    <strong class="food-preview-week-num">Vecka ${escapeHtml(String(w.week))}</strong>
    <strong class="food-preview-week-total">${escapeHtml(formatKr(w.amount))}</strong>
  </div>
  <div class="food-preview-week-range">${escapeHtml(rangeStr)}</div>
</div>`;
      })
      .join("");
  };

  const setWarn = (msg) => {
    if (!els.warnEl) return;
    if (msg) els.warnEl.textContent = msg;
  };

  const bump = (key, delta) => {
    ui.foodConfigDraft.household[key] = Math.max(0, Math.floor(asNumber(ui.foodConfigDraft.household[key]) + delta));
    draw();
  };
  document.getElementById("foodModeAutoBtn").onclick = () => { ui.foodConfigDraft.mode = "auto"; draw(); };
  document.getElementById("foodModeManualBtn").onclick = () => { ui.foodConfigDraft.mode = "manual"; draw(); };
  document.getElementById("foodLevelBudgetBtn").onclick = () => { ui.foodConfigDraft.costLevel = "budget"; draw(); };
  document.getElementById("foodLevelNormalBtn").onclick = () => { ui.foodConfigDraft.costLevel = "normal"; draw(); };
  document.getElementById("foodLevelHighBtn").onclick = () => { ui.foodConfigDraft.costLevel = "high"; draw(); };

  const scopeSel = document.getElementById("foodScopeSelect");
  if (scopeSel) scopeSel.value = String(ui.foodConfigDraft.foodScope || "groceries");
  syncFoodScopeSummaryLabel();
  document.getElementById("foodScopeOpenBtn")?.addEventListener("click", () => {
    const sel = document.getElementById("foodScopeSelect");
    if (!sel) return;
    const options = Array.from(sel.options).map((o) => ({ value: o.value, label: o.textContent || o.value }));
    openListPickerSheet({
      title: "Vad ska räknas med?",
      options,
      currentValue: String(sel.value || "groceries"),
      onSelect: (value) => {
        ui.foodConfigDraft.foodScope = value;
        sel.value = value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        syncFoodScopeSummaryLabel();
        draw();
      }
    });
  });

  document.getElementById("foodAdultsMinusBtn").onclick = () => bump("adults", -1);
  document.getElementById("foodAdultsPlusBtn").onclick = () => bump("adults", +1);
  document.getElementById("foodTeensMinusBtn").onclick = () => bump("teens", -1);
  document.getElementById("foodTeensPlusBtn").onclick = () => bump("teens", +1);
  document.getElementById("foodChildrenMinusBtn").onclick = () => bump("children", -1);
  document.getElementById("foodChildrenPlusBtn").onclick = () => bump("children", +1);
  document.getElementById("foodAdultsInput").oninput = () => { ui.foodConfigDraft.household.adults = Math.max(0, Math.floor(asNumber(document.getElementById("foodAdultsInput").value))); draw(); };
  document.getElementById("foodTeensInput").oninput = () => { ui.foodConfigDraft.household.teens = Math.max(0, Math.floor(asNumber(document.getElementById("foodTeensInput").value))); draw(); };
  document.getElementById("foodChildrenInput").oninput = () => { ui.foodConfigDraft.household.children = Math.max(0, Math.floor(asNumber(document.getElementById("foodChildrenInput").value))); draw(); };
  document.getElementById("foodManualWeeklyInput").oninput = () => { ui.foodConfigDraft.manualWeeklyCost = Math.max(0, asNumber(document.getElementById("foodManualWeeklyInput").value)); draw(); };
  document.getElementById("foodManualMinus500Btn").onclick = () => {
    ui.foodConfigDraft.manualWeeklyCost = Math.max(0, asNumber(ui.foodConfigDraft.manualWeeklyCost) - 500);
    draw();
  };
  document.getElementById("foodManualPlus500Btn").onclick = () => {
    ui.foodConfigDraft.manualWeeklyCost = Math.max(0, asNumber(ui.foodConfigDraft.manualWeeklyCost) + 500);
    draw();
  };

  const bumpCustodyEditorAbsent = (key, delta) => {
    const el = key === "children" ? document.getElementById("foodCustodyEditChildrenInput") : document.getElementById("foodCustodyEditTeensInput");
    const cur = Math.max(0, Math.floor(asNumber(el?.value)));
    writeCustodyEditorAbsent(key, cur + delta);
    clearCustodyEditorFieldErrors();
    hideErrorSummaryById("foodCustodyErrorSummary");
    draw();
  };
  document.getElementById("foodAddCustodyPeriodBtn").onclick = () => {
    const c = Math.max(0, Math.floor(asNumber(ui.foodConfigDraft.household?.children)));
    const t = Math.max(0, Math.floor(asNumber(ui.foodConfigDraft.household?.teens)));
    custodyEditorDraft = normalizeCustodyPeriodEntry({
      startDate: "",
      endDate: "",
      ratioKey: "7-7",
      absent: { children: c, teens: t }
    });
    editingCustodyIndex = -1;
    custodyEditorBackup = null;
    openFoodMatSubPanel("custody");
    renderCustodyEditor();
    draw();
  };
  document.getElementById("foodCustodyEditCancelBtn").onclick = () => {
    const idxToRestore = editingCustodyIndex;
    if (idxToRestore >= 0 && custodyEditorBackup && Array.isArray(ui.foodConfigDraft?.custodyPeriods)) {
      ui.foodConfigDraft.custodyPeriods[idxToRestore] = custodyEditorBackup;
    }
    editingCustodyIndex = -1;
    custodyEditorDraft = null;
    custodyEditorBackup = null;
    clearCustodyEditorFieldErrors();
    hideErrorSummaryById("foodErrorSummary");
    hideErrorSummaryById("foodCustodyErrorSummary");
    hideErrorSummaryById("foodHouseholdErrorSummary");
    hideErrorSummaryById("foodDeviationErrorSummary");
    renderCustodyEditor();
    draw();
  };

  const custodyDeleteBtn = document.getElementById("foodCustodyEditDeleteBtn");
  if (custodyDeleteBtn) {
    custodyDeleteBtn.onclick = () => {
      if (editingCustodyIndex < 0) return;
      const idxToDelete = editingCustodyIndex;
      ui.foodConfigDraft.custodyPeriods.splice(idxToDelete, 1);
      if (ui.foodConfigDraft.custodyPeriods.length === 0) delete ui.foodConfigDraft._custodyHhSnapGlobal;
      editingCustodyIndex = -1;
      custodyEditorDraft = null;
      custodyEditorBackup = null;
      clearCustodyEditorFieldErrors();
      hideErrorSummaryById("foodCustodyErrorSummary");
      renderCustodyEditor();
      draw();
    };
  }
  document.getElementById("foodCustodyEditStart").oninput = () => {
    clearCustodyEditorFieldErrors();
    hideErrorSummaryById("foodCustodyErrorSummary");
    draw();
  };
  document.getElementById("foodCustodyEditStart").onchange = () => {
    clearCustodyEditorFieldErrors();
    hideErrorSummaryById("foodCustodyErrorSummary");
    draw();
  };
  document.getElementById("foodCustodyEditEnd").oninput = () => {
    clearCustodyEditorFieldErrors();
    hideErrorSummaryById("foodCustodyErrorSummary");
    draw();
  };
  document.getElementById("foodCustodyEditEnd").onchange = () => {
    clearCustodyEditorFieldErrors();
    hideErrorSummaryById("foodCustodyErrorSummary");
    draw();
  };
  document.getElementById("foodCustodyEditRatio").onchange = () => {
    clearCustodyEditorFieldErrors();
    hideErrorSummaryById("foodCustodyErrorSummary");
    draw();
  };

  // Replace native select with bottom-sheet list picker (card-like).
  const ratioOpenBtn = document.getElementById("foodCustodyEditRatioOpenBtn");
  const ratioSel = document.getElementById("foodCustodyEditRatio");
  const ratioSummaryEl = document.getElementById("foodCustodyEditRatioSummary");
  if (ratioOpenBtn && ratioSel) {
    ratioOpenBtn.onclick = () => {
      const options = Array.from(ratioSel.options).map((opt) => ({ value: opt.value, label: opt.textContent }));
      openListPickerSheet({
        title: "Välj intervall",
        options,
        currentValue: ratioSel.value,
        onSelect: (val) => {
          ratioSel.value = val;
          if (ratioSummaryEl) {
            const opt = ratioSel.options[ratioSel.selectedIndex];
            ratioSummaryEl.textContent = opt ? opt.textContent : "—";
          }
          ratioSel.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    };
  }
  document.getElementById("foodCustodyEditChildrenMinusBtn").onclick = () => bumpCustodyEditorAbsent("children", -1);
  document.getElementById("foodCustodyEditChildrenPlusBtn").onclick = () => bumpCustodyEditorAbsent("children", +1);
  document.getElementById("foodCustodyEditTeensMinusBtn").onclick = () => bumpCustodyEditorAbsent("teens", -1);
  document.getElementById("foodCustodyEditTeensPlusBtn").onclick = () => bumpCustodyEditorAbsent("teens", +1);
  document.getElementById("foodCustodyEditChildrenInput").oninput = () => {
    writeCustodyEditorAbsent("children", document.getElementById("foodCustodyEditChildrenInput").value);
    clearCustodyEditorFieldErrors();
    hideErrorSummaryById("foodCustodyErrorSummary");
    draw();
  };
  document.getElementById("foodCustodyEditTeensInput").oninput = () => {
    writeCustodyEditorAbsent("teens", document.getElementById("foodCustodyEditTeensInput").value);
    clearCustodyEditorFieldErrors();
    hideErrorSummaryById("foodCustodyErrorSummary");
    draw();
  };
  document.getElementById("foodCustodyEditSaveBtn").onclick = () => {
    clearCustodyEditorFieldErrors();
    const cErr = document.getElementById("foodCustodyErrCounts");
    const next = normalizeCustodyPeriodEntry(readCustodyEditorFromDom());
    const s = parseDateISO(next.startDate);
    if (!s) {
      setCustodyFieldErr(document.getElementById("foodCustodyErrStart"), "Ange startdatum.");
      document.getElementById("foodCustodyEditStart")?.classList.add("input-invalid");
      renderErrorSummary(document.getElementById("foodCustodyErrorSummary"), [{ label: "Ange startdatum.", jumpId: "foodCustodyEditStart" }]);
      return;
    }
    const endStr = next.endDate && String(next.endDate).trim();
    if (endStr) {
      const eDt = parseDateISO(endStr);
      if (!eDt || diffCalendarDays(s, eDt) < 1) {
        setCustodyFieldErr(document.getElementById("foodCustodyErrEnd"), "Slutdatum måste vara minst en kalenderdag efter start.");
        document.getElementById("foodCustodyEditEnd")?.classList.add("input-invalid");
        renderErrorSummary(document.getElementById("foodCustodyErrorSummary"), [
          { label: "Slutdatum måste vara minst en kalenderdag efter start.", jumpId: "foodCustodyEditEnd" }
        ]);
        return;
      }
    }
    const baseChildren = Math.max(0, Math.floor(asNumber(ui.foodConfigDraft.household?.children)));
    const baseTeens = Math.max(0, Math.floor(asNumber(ui.foodConfigDraft.household?.teens)));
    if (next.absent.children > baseChildren || next.absent.teens > baseTeens) {
      setCustodyFieldErr(cErr, `Du kan inte ange fler än i grundhushållet (barn: ${baseChildren}, tonåringar: ${baseTeens}).`);
      const jumpId = next.absent.children > baseChildren ? "foodCustodyEditChildrenInput" : "foodCustodyEditTeensInput";
      document.getElementById(jumpId)?.classList.add("input-invalid");
      renderErrorSummary(document.getElementById("foodCustodyErrorSummary"), [{ label: cErr?.textContent || "Kontrollera antal borta.", jumpId }]);
      return;
    }
    ui.foodConfigDraft.custodyPeriods = ui.foodConfigDraft.custodyPeriods || [];
    const tryAccept = (periods) => buildCustodyPeriodAcceptance(periods, 0);
    let trial;
    if (editingCustodyIndex >= 0) {
      trial = ui.foodConfigDraft.custodyPeriods.map((p, i) => (i === editingCustodyIndex ? next : p));
    } else {
      trial = [...ui.foodConfigDraft.custodyPeriods, next];
    }
    const trialAccept = tryAccept(trial);
    if (trialAccept.shadowedOrigIndices.size > 0) {
      // Hitta vilken befintlig period som krockar mest relevant med den nya.
      const eEff = getCustodyPeriodEffectiveEnd(next, 0);
      const overlaps = trialAccept.accepted.filter((acc) => calendarRangesOverlapCustody(s, eEff, acc.s, acc.e));
      const conflict = overlaps[0] || null;

      const makeStartLabel = () => "Perioden överlappar en annan. Ändra den nya periodens startdatum >";
      const makeEndLabel = () => "Perioden överlappar en annan. Ändra den nya periodens slutdatum >";

      const actions = [];

      if (conflict) {
        const conflictEndInfinite = !String(conflict.p.endDate || "").trim();

        if (conflictEndInfinite) {
          // Befintlig period är [Datum X] - [Tills vidare]
          if (diffCalendarDays(s, conflict.s) > 0) actions.push({ label: makeStartLabel(), jumpId: "foodCustodyEditStart", errId: "foodCustodyErrStart" });
          else actions.push({ label: makeEndLabel(), jumpId: "foodCustodyEditEnd", errId: "foodCustodyErrEnd" });
        } else {
          // Befintlig period är [Datum X] - [Datum Y]
          const newInsideExisting = diffCalendarDays(s, conflict.s) > 0 && diffCalendarDays(eEff, conflict.e) < 0;
          if (newInsideExisting) {
            actions.push(
              { label: makeStartLabel(), jumpId: "foodCustodyEditStart", errId: "foodCustodyErrStart" },
              { label: makeEndLabel(), jumpId: "foodCustodyEditEnd", errId: "foodCustodyErrEnd" }
            );
          } else if (diffCalendarDays(s, conflict.s) > 0) {
            // Överlapp pga att nya perioden startar inuti/efter X
            actions.push({ label: makeStartLabel(), jumpId: "foodCustodyEditStart", errId: "foodCustodyErrStart" });
          } else {
            // Överlapp pga att nya perioden slutar inuti/börjar före X
            actions.push({ label: makeEndLabel(), jumpId: "foodCustodyEditEnd", errId: "foodCustodyErrEnd" });
          }
        }
      }

      // Visa inline-fel på de fält som föreslås justeras (försvinner när du börjar skriva).
      for (const a of actions) {
        setCustodyFieldErr(document.getElementById(a.errId), "Perioden överlappar en annan. Justera datumen.");
        // Markerar det föreslagna fältet visuellt.
        if (a.jumpId) document.getElementById(a.jumpId)?.classList.add("input-invalid");
      }

      renderErrorSummary(
        document.getElementById("foodCustodyErrorSummary"),
        actions.map(({ label, jumpId }) => ({ label, jumpId }))
      );
      return;
    }
    if (editingCustodyIndex >= 0) ui.foodConfigDraft.custodyPeriods[editingCustodyIndex] = next;
    else ui.foodConfigDraft.custodyPeriods.push(next);
    editingCustodyIndex = -1;
    custodyEditorDraft = null;
    custodyEditorBackup = null;
    renderCustodyEditor();
    draw();
  };
  document.getElementById("foodHubOpenCustody") &&
    (document.getElementById("foodHubOpenCustody").onclick = () => {
      const arr = ui.foodConfigDraft.custodyPeriods || [];
      if (arr.length === 0) {
        const c = Math.max(0, Math.floor(asNumber(ui.foodConfigDraft.household?.children)));
        const t = Math.max(0, Math.floor(asNumber(ui.foodConfigDraft.household?.teens)));
        custodyEditorDraft = normalizeCustodyPeriodEntry({
          startDate: "",
          endDate: "",
          ratioKey: "7-7",
          absent: { children: c, teens: t }
        });
        editingCustodyIndex = -1;
        custodyEditorBackup = null;
      } else {
        // När det finns tidigare perioder: håll editorn stängd tills man klickar "+" eller ✎.
        editingCustodyIndex = -1;
        custodyEditorDraft = null;
        custodyEditorBackup = null;
      }

      openFoodMatSubPanel("custody");
      renderCustodyEditor();
      draw();
    });
  document.getElementById("foodHubOpenHousehold") &&
    (document.getElementById("foodHubOpenHousehold").onclick = () => {
      const arr = ui.foodConfigDraft.householdChanges || [];
      if (arr.length === 0) {
        householdEditorDraft = {
          startDate: "",
          endDate: "",
          household: {
            adults: Math.max(0, Math.floor(asNumber(ui.foodConfigDraft.household?.adults))),
            teens: Math.max(0, Math.floor(asNumber(ui.foodConfigDraft.household?.teens))),
            children: Math.max(0, Math.floor(asNumber(ui.foodConfigDraft.household?.children)))
          }
        };
        editingHouseholdChangeIndex = -1;
        householdEditorBackup = null;
      } else {
        editingHouseholdChangeIndex = -1;
        householdEditorDraft = null;
        householdEditorBackup = null;
      }

      openFoodMatSubPanel("household");
      renderHouseholdChanges();
      renderHouseholdEditor();
      draw();
    });
  document.getElementById("foodHubOpenDeviation") &&
    (document.getElementById("foodHubOpenDeviation").onclick = () => {
      const arr = ui.foodConfigDraft.deviations || [];
      if (arr.length === 0) {
        deviationEditorDraft = { startDate: "", endDate: "", adjustmentType: "factor", value: 1.2 };
        editingDeviationIndex = -1;
        deviationEditorBackup = null;
      } else {
        editingDeviationIndex = -1;
        deviationEditorDraft = null;
        deviationEditorBackup = null;
      }

      openFoodMatSubPanel("deviation");
      renderDeviations();
      renderDeviationEditor();
      draw();
    });
  const foodMatBackCustody = document.getElementById("foodMatBackCustody");
  const foodMatBackHousehold = document.getElementById("foodMatBackHousehold");
  const foodMatBackDeviation = document.getElementById("foodMatBackDeviation");
  if (foodMatBackCustody) foodMatBackCustody.onclick = () => closeFoodMatSubPanelFromBackButton();
  if (foodMatBackHousehold) foodMatBackHousehold.onclick = () => closeFoodMatSubPanelFromBackButton();
  if (foodMatBackDeviation) foodMatBackDeviation.onclick = () => closeFoodMatSubPanelFromBackButton();

  // Household changes section
  let editingHouseholdChangeIndex = -1;
  let householdEditorDraft = null;
  let householdEditorBackup = null;
  const renderHouseholdChanges = () => {
    const list = els.hhList;
    const arr = ui.foodConfigDraft.householdChanges || [];
    const editor = document.getElementById("foodHouseholdEditor");
    const listBoxEl = document.getElementById("foodHhListBox");
    if (listBoxEl) listBoxEl.hidden = arr.length === 0;
    if (!list || !editor) return;
    /* Samma som växelvis: lås bara när redigeraren faktiskt syns (undvik spök-lås om draft/index och DOM divergerar). */
    const isHhEditingLocked = () => Boolean(editor && !editor.hidden);

    const sorted = arr
      .map((ch, idx) => ({ ch, idx }))
      .sort((a, b) => String(a.ch.startDate || "").localeCompare(String(b.ch.startDate || "")));
    list.innerHTML = sorted.map(({ ch, idx }) => {
      const sDt = parseDateISO(ch.startDate);
      const startText = sDt ? formatPlanningDateLongSv(sDt) : (ch.startDate || "-");
      const endStrRaw = ch.endDate && String(ch.endDate).trim();
      const eDt = endStrRaw ? parseDateISO(ch.endDate) : null;
      const endText = endStrRaw ? (eDt ? formatPlanningDateLongSv(eDt) : endStrRaw) : "tillsvidare";
      const range = `${escapeHtml(startText)} - ${escapeHtml(endText)}`;
      return `
        <button
          type="button"
          class="food-period-bb-row"
          data-hh-row="${idx}"
          ${isHhEditingLocked() ? "disabled" : ""}
          aria-label="Redigera period ${range}"
        >
          <span class="food-period-bb-row-main">${range}</span>
          <span class="food-period-bb-row-chevron" aria-hidden="true">${LIST_ROW_CHEVRON_SVG}</span>
        </button>
      `;
    }).join("");

    list.querySelectorAll("[data-hh-row]").forEach((btn) => {
      btn.onclick = () => {
        if (isHhEditingLocked()) return;
        const i = Number(btn.getAttribute("data-hh-row"));
        // Backup så Avbryt inte lämnar kvar interimändringar i `ui.foodConfigDraft`.
        householdEditorBackup = JSON.parse(JSON.stringify(ui.foodConfigDraft.householdChanges?.[i] || null));
        editingHouseholdChangeIndex = i;
        householdEditorDraft = null;
        renderHouseholdEditor();
        draw();
      };
    });
  };
  const renderHouseholdEditor = () => {
    const editor = document.getElementById("foodHouseholdEditor");
    if (!editor) return;
    const arr = ui.foodConfigDraft.householdChanges || [];
    const ch = editingHouseholdChangeIndex >= 0 ? arr[editingHouseholdChangeIndex] : householdEditorDraft;
    const addBtn = document.getElementById("foodAddHouseholdChangeBtn");
    if (!ch) {
      editor.hidden = true;
      if (addBtn) addBtn.disabled = false;
      const sInp = document.getElementById("foodHhEditStart");
      const eInp = document.getElementById("foodHhEditEnd");
      if (sInp instanceof HTMLInputElement) {
        sInp.value = "";
        syncDateFieldRow(sInp);
      }
      if (eInp instanceof HTMLInputElement) {
        eInp.value = "";
        syncDateFieldRow(eInp);
      }
      const aInp = document.getElementById("foodHhEditAdults");
      const tInp = document.getElementById("foodHhEditTeens");
      const cInp = document.getElementById("foodHhEditChildren");
      if (aInp instanceof HTMLInputElement) aInp.value = "";
      if (tInp instanceof HTMLInputElement) tInp.value = "";
      if (cInp instanceof HTMLInputElement) cInp.value = "";
      ["foodHhErrStart", "foodHhErrEnd"].forEach((id) => {
        const errEl = document.getElementById(id);
        if (errEl) {
          errEl.hidden = true;
          errEl.textContent = "";
        }
      });
      return;
    }
    editor.hidden = false;
    if (addBtn) addBtn.disabled = true;
    const hhBlockErr = document.getElementById("foodHouseholdError");
    if (hhBlockErr) {
      hhBlockErr.hidden = true;
      hhBlockErr.textContent = "";
    }
    ["foodHhErrStart", "foodHhErrEnd"].forEach((id) => {
      const errEl = document.getElementById(id);
      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = "";
      }
    });
    document.getElementById("foodHhEditStart")?.classList.remove("input-invalid");
    document.getElementById("foodHhEditEnd")?.classList.remove("input-invalid");
    document.getElementById("foodHhEditStart").value = ch.startDate || "";
    document.getElementById("foodHhEditEnd").value = ch.endDate || "";
    document.getElementById("foodHhEditAdults").value = asNumber(ch.household?.adults);
    document.getElementById("foodHhEditTeens").value = asNumber(ch.household?.teens);
    document.getElementById("foodHhEditChildren").value = asNumber(ch.household?.children);

    const saveBtn = document.getElementById("foodHhEditSaveBtn");
    if (saveBtn) saveBtn.textContent = editingHouseholdChangeIndex >= 0 ? "Uppdatera period" : "Lägg till period";

    const delBtn = document.getElementById("foodHhEditDeleteBtn");
    if (delBtn) delBtn.hidden = editingHouseholdChangeIndex < 0;

    const panelLegend = document.getElementById("foodHouseholdEditorPanelLegend");
    if (panelLegend) panelLegend.textContent = editingHouseholdChangeIndex >= 0 ? "Redigera period" : "Lägg till period";

    const sInp = document.getElementById("foodHhEditStart");
    const eInp = document.getElementById("foodHhEditEnd");
    if (sInp instanceof HTMLInputElement) syncDateFieldRow(sInp);
    if (eInp instanceof HTMLInputElement) syncDateFieldRow(eInp);
  };
  const readHouseholdEditor = () => {
    const arr = ui.foodConfigDraft.householdChanges || [];
    const target = editingHouseholdChangeIndex >= 0 ? arr[editingHouseholdChangeIndex] : householdEditorDraft;
    if (!target) return null;
    const startDate = document.getElementById("foodHhEditStart").value || "";
    const endDate = (document.getElementById("foodHhEditEnd").value || "").trim();
    target.startDate = startDate;
    target.endDate = endDate;
    target.household = {
      adults: Math.max(0, Math.floor(asNumber(document.getElementById("foodHhEditAdults").value))),
      teens: Math.max(0, Math.floor(asNumber(document.getElementById("foodHhEditTeens").value))),
      children: Math.max(0, Math.floor(asNumber(document.getElementById("foodHhEditChildren").value)))
    };
    return target;
  };
  document.getElementById("foodHhEditSaveBtn").onclick = () => {
    const hhErr = document.getElementById("foodHouseholdError");
    if (hhErr) {
      hhErr.hidden = true;
      hhErr.textContent = "";
    }
    document.getElementById("foodHhEditStart")?.classList.remove("input-invalid");
    document.getElementById("foodHhEditEnd")?.classList.remove("input-invalid");
    ["foodHhErrStart", "foodHhErrEnd"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.hidden = true;
        el.textContent = "";
      }
    });
    hideErrorSummaryById("foodHouseholdErrorSummary");
    const next = readHouseholdEditor();
    if (!next) return;
    const s = parseDateISO(next.startDate);
    const endStr = next.endDate != null ? String(next.endDate).trim() : "";
    if (!s) {
      const startErr = document.getElementById("foodHhErrStart");
      if (startErr) {
        startErr.hidden = false;
        startErr.textContent = "Ange när perioden börjar.";
      }
      if (hhErr) {
        hhErr.hidden = false;
        hhErr.textContent = "Ange när perioden börjar.";
      }
      document.getElementById("foodHhEditStart")?.classList.add("input-invalid");
      renderErrorSummary(document.getElementById("foodHouseholdErrorSummary"), [
        { label: "Ange när perioden börjar.", jumpId: "foodHhEditStart" }
      ]);
      return;
    }
    if (endStr) {
      const e = parseDateISO(endStr);
      if (!e || e.getTime() < s.getTime()) {
        const endErrEl = document.getElementById("foodHhErrEnd");
        if (endErrEl) {
          endErrEl.hidden = false;
          endErrEl.textContent = "Till måste vara samma eller efter från (eller lämna tomt för tillsvidare).";
        }
        if (hhErr) {
          hhErr.hidden = false;
          hhErr.textContent = "Till måste vara samma eller efter från (eller lämna tomt för tillsvidare).";
        }
        document.getElementById("foodHhEditEnd")?.classList.add("input-invalid");
        renderErrorSummary(document.getElementById("foodHouseholdErrorSummary"), [
          {
            label: "Till måste vara samma eller efter från (eller lämna tomt för tillsvidare).",
            jumpId: "foodHhEditEnd"
          }
        ]);
        return;
      }
    }
    if (editingHouseholdChangeIndex < 0) {
      ui.foodConfigDraft.householdChanges.push({
        startDate: next.startDate,
        endDate: next.endDate,
        household: { ...next.household }
      });
    }
    editingHouseholdChangeIndex = -1;
    householdEditorDraft = null;
    // Stäng redigeraren först, annars ritas listan med `disabled` (redigeraren kan vara synlig än).
    renderHouseholdEditor();
    renderHouseholdChanges();
    draw();
  };
  document.getElementById("foodHhEditCancelBtn").onclick = () => {
    const idxToRestore = editingHouseholdChangeIndex;
    if (idxToRestore >= 0 && householdEditorBackup && Array.isArray(ui.foodConfigDraft?.householdChanges)) {
      ui.foodConfigDraft.householdChanges[idxToRestore] = householdEditorBackup;
    }
    editingHouseholdChangeIndex = -1;
    householdEditorDraft = null;
    householdEditorBackup = null;
    const hhErr = document.getElementById("foodHouseholdError");
    if (hhErr) {
      hhErr.hidden = true;
      hhErr.textContent = "";
    }
    document.getElementById("foodHhEditStart")?.classList.remove("input-invalid");
    document.getElementById("foodHhEditEnd")?.classList.remove("input-invalid");
    ["foodHhErrStart", "foodHhErrEnd"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.hidden = true;
        el.textContent = "";
      }
    });
    hideErrorSummaryById("foodHouseholdErrorSummary");
    renderHouseholdEditor();
    renderHouseholdChanges();
  };

  const hhDeleteBtn = document.getElementById("foodHhEditDeleteBtn");
  if (hhDeleteBtn) {
    hhDeleteBtn.onclick = () => {
      if (editingHouseholdChangeIndex < 0) return;
      const idxToDelete = editingHouseholdChangeIndex;
      ui.foodConfigDraft.householdChanges.splice(idxToDelete, 1);
      editingHouseholdChangeIndex = -1;
      householdEditorDraft = null;
      householdEditorBackup = null;
      const hhErr = document.getElementById("foodHouseholdError");
      if (hhErr) {
        hhErr.hidden = true;
        hhErr.textContent = "";
      }
      ["foodHhErrStart", "foodHhErrEnd"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.hidden = true;
          el.textContent = "";
        }
      });
      document.getElementById("foodHhEditStart")?.classList.remove("input-invalid");
      document.getElementById("foodHhEditEnd")?.classList.remove("input-invalid");
      hideErrorSummaryById("foodHouseholdErrorSummary");
      renderHouseholdEditor();
      renderHouseholdChanges();
      draw();
    };
  }
  document.getElementById("foodAddHouseholdChangeBtn").onclick = () => {
    ui.foodConfigDraft.householdChanges = ui.foodConfigDraft.householdChanges || [];
    householdEditorDraft = {
      startDate: "",
      endDate: "",
      household: { adults: ui.foodConfigDraft.household.adults, teens: ui.foodConfigDraft.household.teens, children: ui.foodConfigDraft.household.children }
    };
    editingHouseholdChangeIndex = -1;
    householdEditorBackup = null;
    openFoodMatSubPanel("household");
    renderHouseholdChanges();
    renderHouseholdEditor();
  };

  // Deviations section
  let editingDeviationIndex = -1;
  let deviationEditorDraft = null;
  let deviationEditorBackup = null;
  const deviationPresetFromValue = (value) => {
    const v = Number(value);
    if (Math.abs(v - 0.8) < 0.0001) return "0.8";
    if (Math.abs(v - 0.6) < 0.0001) return "0.6";
    if (Math.abs(v - 1.2) < 0.0001) return "1.2";
    if (Math.abs(v - 1.4) < 0.0001) return "1.4";
    return "1.2";
  };
  const renderDeviationEditor = () => {
    const editor = document.getElementById("foodDeviationEditor");
    if (!editor) return;
    const arr = ui.foodConfigDraft.deviations || [];
    const dv = editingDeviationIndex >= 0 ? arr[editingDeviationIndex] : deviationEditorDraft;
    const addBtn = document.getElementById("foodAddDeviationBtn");
    if (!dv) {
      editor.hidden = true;
      if (addBtn) addBtn.disabled = false;
      const sInp = document.getElementById("foodDevEditStart");
      const eInp = document.getElementById("foodDevEditEnd");
      if (sInp instanceof HTMLInputElement) {
        sInp.value = "";
        syncDateFieldRow(sInp);
      }
      if (eInp instanceof HTMLInputElement) {
        eInp.value = "";
        syncDateFieldRow(eInp);
      }
      const pSel = document.getElementById("foodDevEditPreset");
      if (pSel instanceof HTMLSelectElement) pSel.value = "1.2";
      syncFoodDeviationPresetSummaryLabel();
      ["foodDevErrStart", "foodDevErrEnd"].forEach((id) => {
        const errEl = document.getElementById(id);
        if (errEl) {
          errEl.hidden = true;
          errEl.textContent = "";
        }
      });
      return;
    }
    editor.hidden = false;
    if (addBtn) addBtn.disabled = true;
    const devBlockErr = document.getElementById("foodDeviationsError");
    if (devBlockErr) {
      devBlockErr.hidden = true;
      devBlockErr.textContent = "";
    }
    ["foodDevErrStart", "foodDevErrEnd"].forEach((id) => {
      const errEl = document.getElementById(id);
      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = "";
      }
    });
    document.getElementById("foodDevEditStart")?.classList.remove("input-invalid");
    document.getElementById("foodDevEditEnd")?.classList.remove("input-invalid");
    document.getElementById("foodDevEditStart").value = dv.startDate || "";
    document.getElementById("foodDevEditEnd").value = dv.endDate || "";
    document.getElementById("foodDevEditPreset").value = deviationPresetFromValue(dv.value);
    syncFoodDeviationPresetSummaryLabel();

    const saveBtn = document.getElementById("foodDevEditSaveBtn");
    if (saveBtn) saveBtn.textContent = editingDeviationIndex >= 0 ? "Uppdatera period" : "Lägg till period";

    const delBtn = document.getElementById("foodDevEditDeleteBtn");
    if (delBtn) delBtn.hidden = editingDeviationIndex < 0;

    const panelLegend = document.getElementById("foodDeviationEditorPanelLegend");
    if (panelLegend) panelLegend.textContent = editingDeviationIndex >= 0 ? "Redigera period" : "Lägg till period";

    const sInp = document.getElementById("foodDevEditStart");
    const eInp = document.getElementById("foodDevEditEnd");
    if (sInp instanceof HTMLInputElement) syncDateFieldRow(sInp);
    if (eInp instanceof HTMLInputElement) syncDateFieldRow(eInp);
  };
  const readDeviationEditor = () => {
    const arr = ui.foodConfigDraft.deviations || [];
    const target = editingDeviationIndex >= 0 ? arr[editingDeviationIndex] : deviationEditorDraft;
    if (!target) return null;
    const startDate = document.getElementById("foodDevEditStart").value || "";
    const endDate = (document.getElementById("foodDevEditEnd").value || "").trim();
    const preset = Number(document.getElementById("foodDevEditPreset").value || 1.2);
    target.startDate = startDate;
    target.endDate = endDate;
    target.adjustmentType = "factor";
    target.value = preset;
    return target;
  };
  const renderDeviations = () => {
    const list = els.devList;
    const arr = ui.foodConfigDraft.deviations || [];
    const listBoxEl = document.getElementById("foodDevListBox");
    if (listBoxEl) listBoxEl.hidden = arr.length === 0;
    if (!list) return;
    const editor = document.getElementById("foodDeviationEditor");
    const isDevEditingLocked = () => Boolean(editor && !editor.hidden);
    const sorted = arr
      .map((dv, idx) => ({ dv, idx }))
      .sort((a, b) => String(a.dv.startDate || "").localeCompare(String(b.dv.startDate || "")));
    list.innerHTML = sorted.map(({ dv, idx }) => {
      const sDt = parseDateISO(dv.startDate);
      const startText = sDt ? formatPlanningDateLongSv(sDt) : (dv.startDate || "-");
      const endStrRaw = dv.endDate && String(dv.endDate).trim();
      const eDt = endStrRaw ? parseDateISO(dv.endDate) : null;
      const endText = endStrRaw ? (eDt ? formatPlanningDateLongSv(eDt) : endStrRaw) : "tillsvidare";
      const range = `${escapeHtml(startText)} - ${escapeHtml(endText)}`;
      return `
        <button
          type="button"
          class="food-period-bb-row"
          data-dev-row="${idx}"
          ${isDevEditingLocked() ? "disabled" : ""}
          aria-label="Redigera period ${range}"
        >
          <span class="food-period-bb-row-main">${range}</span>
          <span class="food-period-bb-row-chevron" aria-hidden="true">${LIST_ROW_CHEVRON_SVG}</span>
        </button>
      `;
    }).join("");
    list.querySelectorAll("[data-dev-row]").forEach((btn) => {
      btn.onclick = () => {
        if (isDevEditingLocked()) return;
        const i = Number(btn.getAttribute("data-dev-row"));
        deviationEditorBackup = JSON.parse(JSON.stringify(ui.foodConfigDraft.deviations?.[i] || null));
        editingDeviationIndex = i;
        deviationEditorDraft = null;
        renderDeviationEditor();
        draw();
      };
    });
  };
  document.getElementById("foodDevEditSaveBtn").onclick = () => {
    const devErr = document.getElementById("foodDeviationsError");
    if (devErr) {
      devErr.hidden = true;
      devErr.textContent = "";
    }
    document.getElementById("foodDevEditStart")?.classList.remove("input-invalid");
    document.getElementById("foodDevEditEnd")?.classList.remove("input-invalid");
    ["foodDevErrStart", "foodDevErrEnd"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.hidden = true;
        el.textContent = "";
      }
    });
    hideErrorSummaryById("foodDeviationErrorSummary");
    const next = readDeviationEditor();
    if (!next) return;
    const s = parseDateISO(next.startDate);
    const endStr = next.endDate != null ? String(next.endDate).trim() : "";
    if (!s) {
      const startErr = document.getElementById("foodDevErrStart");
      if (startErr) {
        startErr.hidden = false;
        startErr.textContent = "Ange när perioden börjar.";
      }
      if (devErr) {
        devErr.hidden = false;
        devErr.textContent = "Ange när perioden börjar.";
      }
      document.getElementById("foodDevEditStart")?.classList.add("input-invalid");
      renderErrorSummary(document.getElementById("foodDeviationErrorSummary"), [
        { label: "Ange när perioden börjar.", jumpId: "foodDevEditStart" }
      ]);
      return;
    }
    if (endStr) {
      const e = parseDateISO(endStr);
      if (!e || e.getTime() < s.getTime()) {
        const endErrEl = document.getElementById("foodDevErrEnd");
        if (endErrEl) {
          endErrEl.hidden = false;
          endErrEl.textContent = "Till måste vara samma eller efter från (eller lämna tomt för tillsvidare).";
        }
        if (devErr) {
          devErr.hidden = false;
          devErr.textContent = "Till måste vara samma eller efter från (eller lämna tomt för tillsvidare).";
        }
        document.getElementById("foodDevEditEnd")?.classList.add("input-invalid");
        renderErrorSummary(document.getElementById("foodDeviationErrorSummary"), [
          {
            label: "Till måste vara samma eller efter från (eller lämna tomt för tillsvidare).",
            jumpId: "foodDevEditEnd"
          }
        ]);
        return;
      }
    }
    if (editingDeviationIndex < 0) {
      ui.foodConfigDraft.deviations.push({
        startDate: next.startDate,
        endDate: next.endDate,
        adjustmentType: "factor",
        value: next.value
      });
    }
    editingDeviationIndex = -1;
    deviationEditorDraft = null;
    // Stäng redigeraren först, annars ritas listan med `disabled` (redigeraren kan vara synlig än).
    renderDeviationEditor();
    renderDeviations();
    draw();
  };

  document.getElementById("foodDevEditPresetOpenBtn")?.addEventListener("click", () => {
    const sel = document.getElementById("foodDevEditPreset");
    if (!sel) return;
    const options = Array.from(sel.options).map((o) => ({ value: o.value, label: o.textContent || o.value }));
    openListPickerSheet({
      title: "Kostnaden för perioden är",
      options,
      currentValue: String(sel.value || "1.2"),
      onSelect: (value) => {
        sel.value = value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        syncFoodDeviationPresetSummaryLabel();
      }
    });
  });
  document.getElementById("foodDevEditCancelBtn").onclick = () => {
    const idxToRestore = editingDeviationIndex;
    if (idxToRestore >= 0 && deviationEditorBackup && Array.isArray(ui.foodConfigDraft?.deviations)) {
      ui.foodConfigDraft.deviations[idxToRestore] = deviationEditorBackup;
    }
    editingDeviationIndex = -1;
    deviationEditorDraft = null;
    deviationEditorBackup = null;
    const devErr = document.getElementById("foodDeviationsError");
    if (devErr) {
      devErr.hidden = true;
      devErr.textContent = "";
    }
    document.getElementById("foodDevEditStart")?.classList.remove("input-invalid");
    document.getElementById("foodDevEditEnd")?.classList.remove("input-invalid");
    ["foodDevErrStart", "foodDevErrEnd"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.hidden = true;
        el.textContent = "";
      }
    });
    hideErrorSummaryById("foodDeviationErrorSummary");
    renderDeviationEditor();
    renderDeviations();
  };

  const devDeleteBtn = document.getElementById("foodDevEditDeleteBtn");
  if (devDeleteBtn) {
    devDeleteBtn.onclick = () => {
      if (editingDeviationIndex < 0) return;
      const idxToDelete = editingDeviationIndex;
      ui.foodConfigDraft.deviations.splice(idxToDelete, 1);
      editingDeviationIndex = -1;
      deviationEditorDraft = null;
      deviationEditorBackup = null;
      const devErr = document.getElementById("foodDeviationsError");
      if (devErr) {
        devErr.hidden = true;
        devErr.textContent = "";
      }
      ["foodDevErrStart", "foodDevErrEnd"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.hidden = true;
          el.textContent = "";
        }
      });
      document.getElementById("foodDevEditStart")?.classList.remove("input-invalid");
      document.getElementById("foodDevEditEnd")?.classList.remove("input-invalid");
      hideErrorSummaryById("foodDeviationErrorSummary");
      renderDeviationEditor();
      renderDeviations();
      draw();
    };
  }
  document.getElementById("foodAddDeviationBtn").onclick = () => {
    ui.foodConfigDraft.deviations = ui.foodConfigDraft.deviations || [];
    deviationEditorDraft = { startDate: "", endDate: "", adjustmentType: "factor", value: 1.2 };
    editingDeviationIndex = -1;
    deviationEditorBackup = null;
    openFoodMatSubPanel("deviation");
    renderDeviations();
    renderDeviationEditor();
  };

  // Inline error försvinner när du börjar skriva/manipulera igen.
  const dismissHhInlineErrors = () => {
    const hhErr = document.getElementById("foodHouseholdError");
    if (hhErr) {
      hhErr.hidden = true;
      hhErr.textContent = "";
    }
    ["foodHhErrStart", "foodHhErrEnd"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.hidden = true;
        el.textContent = "";
      }
    });
    document.getElementById("foodHhEditStart")?.classList.remove("input-invalid");
    document.getElementById("foodHhEditEnd")?.classList.remove("input-invalid");
    hideErrorSummaryById("foodHouseholdErrorSummary");
  };
  ["foodHhEditStart", "foodHhEditEnd", "foodHhEditAdults", "foodHhEditTeens", "foodHhEditChildren"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.oninput = () => dismissHhInlineErrors();
    el.onchange = () => dismissHhInlineErrors();
  });

  const hhBump = (id, delta) => {
    const el = document.getElementById(id);
    if (!(el instanceof HTMLInputElement)) return;
    el.value = String(Math.max(0, Math.floor(asNumber(el.value) + delta)));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  document.getElementById("foodHhEditAdultsMinusBtn")?.addEventListener("click", () => hhBump("foodHhEditAdults", -1));
  document.getElementById("foodHhEditAdultsPlusBtn")?.addEventListener("click", () => hhBump("foodHhEditAdults", +1));
  document.getElementById("foodHhEditTeensMinusBtn")?.addEventListener("click", () => hhBump("foodHhEditTeens", -1));
  document.getElementById("foodHhEditTeensPlusBtn")?.addEventListener("click", () => hhBump("foodHhEditTeens", +1));
  document.getElementById("foodHhEditChildrenMinusBtn")?.addEventListener("click", () => hhBump("foodHhEditChildren", -1));
  document.getElementById("foodHhEditChildrenPlusBtn")?.addEventListener("click", () => hhBump("foodHhEditChildren", +1));

  const dismissDevInlineErrors = () => {
    const devErr = document.getElementById("foodDeviationsError");
    if (devErr) {
      devErr.hidden = true;
      devErr.textContent = "";
    }
    ["foodDevErrStart", "foodDevErrEnd"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.hidden = true;
        el.textContent = "";
      }
    });
    document.getElementById("foodDevEditStart")?.classList.remove("input-invalid");
    document.getElementById("foodDevEditEnd")?.classList.remove("input-invalid");
    hideErrorSummaryById("foodDeviationErrorSummary");
  };
  ["foodDevEditStart", "foodDevEditEnd", "foodDevEditPreset"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.oninput = () => dismissDevInlineErrors();
    el.onchange = () => {
      dismissDevInlineErrors();
      if (id === "foodDevEditPreset") syncFoodDeviationPresetSummaryLabel();
    };
  });

  renderCustodyEditor();
  renderHouseholdChanges();
  renderHouseholdEditor();
  renderDeviations();
  renderDeviationEditor();

  // Simple warnings (non-blocking)
  const weeklyWarn = () => {
    const draft = ui.foodConfigDraft;
    const w = computeFoodWeeklyCost(draft);
    const scopeF = FOOD_SCOPE_FACTORS[draft.foodScope] || 1.0;
    // I auto-läge kommer `all` höja veckokostnaden via scope-faktor; varningen ska därför jämföras på "baseline"
    // så att enbart byte av scope inte triggar varningen.
    const compareW = draft.mode === "manual" ? w : (scopeF > 0 ? w / scopeF : w);
    if (compareW > 20000) setWarn("Varning: ovanligt hög veckokostnad.");
    else setWarn("");
  };
  const originalDraw = draw;
  const wrappedDraw = () => {
    originalDraw();
    weeklyWarn();
    applyFoodOverlayDateBounds();
    updateFoodMatHubTitles(ui.foodConfigDraft);
  };
  // replace draw calls by wrappedDraw via function alias
  draw = wrappedDraw;
  draw();
}

function renderSettingsPage() {
  // Settings inputs
  document.getElementById("backupIntervalDays").value = asNumber(state.settings.backupIntervalDays);
  document.getElementById("backupFilenamePattern").value = state.settings.backupFilenamePattern || "";
  const foodDay = document.getElementById("foodPlanningWeekday");
  if (foodDay) foodDay.value = String(state.settings.foodPlanningWeekday || 1);
  syncThemeModeSummaryLabel();
  syncFoodWeekdaySummaryLabel();
}

function renderRoute(route) {
  switch (route) {
    case "overview": {
      // init pickers if needed
      const { year, month } = currentYearMonth();
      ui.overviewYear = ui.overviewYear ?? year;
      ui.overviewMonth = ui.overviewMonth ?? month;

      const years = getAvailableYears();
      const yearSel = document.getElementById("overviewYear");
      const monthSel = document.getElementById("overviewMonth");
      setSelectOptions(yearSel, years, ui.overviewYear);
      setMonthOptions(monthSel, ui.overviewMonth);

      yearSel.onchange = () => {
        ui.overviewYear = Number(yearSel.value);
        renderOverview();
      };
      monthSel.onchange = () => {
        ui.overviewMonth = Number(monthSel.value);
        renderOverview();
      };

      renderOverview();
      break;
    }
    case "incomes": {
      renderIncomesPage();
      break;
    }
    case "expenses": {
      renderExpensesPage();
      break;
    }
    case "savings": {
      renderExpensesPage({ openSavingsOverlay: true });
      break;
    }
    case "settings": {
      requireEl("headerSubtitle").textContent = "Inställn.";
      const themeModeSel = document.getElementById("themeMode");
      if (themeModeSel) themeModeSel.value = state.themeMode || "system";
      document.getElementById("themeMode") &&
        (document.getElementById("themeMode").onchange = () => {
        state.themeMode = themeModeSel.value;
        saveState();
        applyTheme();
        syncThemeModeSummaryLabel();
      });

      renderSettingsPage();
      break;
    }
    default:
      renderOverview();
  }
}

function renderOverviewIfOnOverview() {
  if (ui.activeRoute === "overview") renderOverview();
}

function incomeYearsForFilter() {
  const years = new Set();
  years.add("all");
  for (const inc of state.incomes || []) {
    for (const p of inc.payments || []) {
      if (!p?.date) continue;
      const dt = parseDateISO(String(p.date));
      if (!dt) continue;
      years.add(String(dt.getFullYear()));
    }
  }
  for (const loan of state.special?.loans?.items || []) {
    const fp = datePartsFromIso(String(loan?.firstPaymentDate || ""));
    if (fp) years.add(String(fp.y));
    if (loan?.endDate) {
      const ep = datePartsFromIso(String(loan.endDate));
      if (ep) years.add(String(ep.y));
    }
  }
  // Include +/- 1 year around current to make it easy to filter
  const cur = currentYearMonth().year;
  years.add(String(cur - 1));
  years.add(String(cur));
  years.add(String(cur + 1));
  const arr = Array.from(years);
  const nums = arr.filter((x) => x !== "all").map((x) => Number(x)).filter((n) => Number.isFinite(n)).sort((a, b) => b - a);
  return ["all", ...nums.map(String)];
}

function setYearFilterOptions(selectEl, selected) {
  selectEl.innerHTML = "";
  const years = incomeYearsForFilter();
  for (const y of years) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y === "all" ? "Alla" : y;
    if (String(selected) === y) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function setMonthFilterOptions(selectEl, selected) {
  selectEl.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "Alla";
  if (String(selected) === "all") allOpt.selected = true;
  selectEl.appendChild(allOpt);

  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement("option");
    opt.value = String(m);
    opt.textContent = monthName(m);
    if (Number(selected) === m) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function buildIncomePaymentRowsForList(yearFilter) {
  const rows = [];
  const monthFilter = ui.incomeMonthFilter || "all";
  for (const inc of state.incomes || []) {
    const lineTitle = incomeDisplayName(inc);
    for (const p of inc.payments || []) {
      const amt = asNumber(p.amount);
      if (amt <= 0) continue;
      const iso = p.date || "";
      const dt = iso ? parseDateISO(String(iso)) : null;
      if (!dt) continue;
      const y = dt.getFullYear();
      if (yearFilter !== "all" && String(y) !== String(yearFilter)) continue;
      const mo = dt.getMonth() + 1;
      if (monthFilter !== "all" && Number(monthFilter) !== mo) continue;
      rows.push({
        incomeId: inc.id,
        paymentId: p.id,
        name: lineTitle,
        lineTitle,
        isoDate: iso,
        date: dt,
        amount: amt,
        dateLong: formatExpenseListLongDate(dt)
      });
    }
  }
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return rows;
}

function renderIncomesPage() {
  requireEl("headerSubtitle").textContent = "Intäkter";

  const filterEl = requireEl("incomeYearFilter");
  if (!ui.incomeYearFilter) ui.incomeYearFilter = String(currentYearMonth().year);
  setYearFilterOptions(filterEl, ui.incomeYearFilter);
  filterEl.onchange = () => {
    ui.incomeYearFilter = filterEl.value;
    renderIncomesList();
  };

  const monthFilterEl = requireEl("incomeMonthFilter");
  if (!ui.incomeMonthFilter) ui.incomeMonthFilter = "all";
  setMonthFilterOptions(monthFilterEl, ui.incomeMonthFilter);
  monthFilterEl.onchange = () => {
    ui.incomeMonthFilter = monthFilterEl.value;
    renderIncomesList();
  };
  syncIncomeFilterSummaryLabel();

  requireEl("openIncomeOverlayBtn").onclick = () => openIncomeOverlay(null);

  const salPayDayInit = document.getElementById("incomeSalaryPayDay");
  if (salPayDayInit && salPayDayInit.options.length === 0) {
    setDayOptions(salPayDayInit, ui.incomeDefaults?.day || 25);
  }

  const salKindBtn = document.getElementById("incomeKindSalaryBtn");
  if (salKindBtn) {
    salKindBtn.onclick = () => {
      ui.incomeEditorKind = "salary";
      requireEl("incomeNameInput").value = "Lön";
      requireEl("incomeIntervalSelect").value = "monthly";
      updateIncomeSalaryBandLabels();
      const editingId = ui.editIncomeId;
      const inc = editingId ? (state.incomes || []).find((x) => x.id === editingId) : null;
      if (inc && isSalaryIncome(inc)) {
        writeSalaryByYearToBandInputs(inc.metadata?.salary?.byYear || {});
      } else {
        writeSalaryByYearToBandInputs({});
      }
      const paySel = document.getElementById("incomeSalaryPayDay");
      if (paySel) {
        const pd = inc && isSalaryIncome(inc) ? inc.metadata?.salary?.payDay : null;
        const n = Number(pd);
        const d = Number.isFinite(n) && n >= 1 && n <= 31 ? n : ui.incomeDefaults?.day || 25;
        setDayOptions(paySel, d);
      }
      syncIncomeModalKindUI();
      if (ui.incomeEditorPayments?.length) regenerateSalaryEditorPayments();
      else renderIncomePaymentsEditorRows();
    };
  }

  const othKindBtn = document.getElementById("incomeKindOtherBtn");
  if (othKindBtn) {
    othKindBtn.onclick = () => {
      ui.incomeEditorKind = "other";
      syncIncomeModalKindUI();
      resetIncomeEditorRowsForInterval();
    };
  }

  const genSalBtn = document.getElementById("incomeSalaryGenerateBtn");
  if (genSalBtn) {
    genSalBtn.onclick = () => {
      if (ui.incomeEditorKind !== "salary") return;
      regenerateSalaryEditorPayments();
    };
  }

  document.querySelectorAll("[data-income-suggest]").forEach((btn) => {
    btn.onclick = () => {
      const v = btn.getAttribute("data-income-suggest") || "";
      const nameInp = document.getElementById("incomeNameInput");
      if (nameInp) nameInp.value = v;
      ui.incomeEditorKind = "other";
      syncIncomeModalKindUI();
    };
  });

  requireEl("incomeIntervalSelect").onchange = () => {
    if (ui.incomeEditorKind === "salary") return;
    resetIncomeEditorRowsForInterval();
  };

  // Defaults (used to prefill rows)
  const defYear = requireEl("incomeDefaultYear");
  const defDay = requireEl("incomeDefaultDay");
  const defAmt = requireEl("incomeDefaultAmount");

  if (!ui.incomeDefaults) {
    ui.incomeDefaults = { year: currentYearMonth().year, day: 25, amount: 0 };
  }

  setYear3Options(defYear, ui.incomeDefaults.year);
  setDayOptions(defDay, ui.incomeDefaults.day);
  defAmt.value = asNumber(ui.incomeDefaults.amount);

  defYear.onchange = () => {
    ui.incomeDefaults.year = Number(defYear.value);
    applyIncomeDefaultFieldToEditorRows("year");
  };
  defDay.onchange = () => {
    ui.incomeDefaults.day = Number(defDay.value);
    applyIncomeDefaultFieldToEditorRows("day");
  };
  defAmt.oninput = () => {
    ui.incomeDefaults.amount = asNumber(defAmt.value);
    applyIncomeDefaultFieldToEditorRows("amount");
  };

  requireEl("closeIncomeModalBtn").onclick = closeIncomeOverlay;
  requireEl("incomeCancelBtn").onclick = closeIncomeOverlay;
  requireEl("incomeSaveBtn").onclick = saveIncomeFromOverlay;

  renderIncomesList();
}

function updateIncomeModalTitle() {
  const titleEl = document.getElementById("incomeModalTitle");
  if (!titleEl) return;
  const editing = Boolean(ui.editIncomeId);
  const sal = ui.incomeEditorKind === "salary";
  if (!editing) titleEl.textContent = sal ? "Ny lön" : "Ny intäkt";
  else titleEl.textContent = sal ? "Redigera lön" : "Redigera intäkt";
}

function updateIncomePaymentsEditorHeading() {
  const h = document.getElementById("incomePaymentsEditorTitle");
  const table = document.querySelector("#incomeModal .income-payments-editor-card table");
  if (!h) return;
  const sal = ui.incomeEditorKind === "salary";
  h.textContent = sal ? "Utbetalningar (3 år × 12 mån)" : "Inbetalningar";
  if (table) table.setAttribute("aria-label", sal ? "Löneutbetalningar per månad" : "Inbetalningar");
}

function syncIncomeModalKindUI() {
  const sal = ui.incomeEditorKind === "salary";
  const salSec = document.getElementById("incomeSalarySection");
  const othSec = document.getElementById("incomeOtherSection");
  if (salSec) salSec.hidden = !sal;
  if (othSec) othSec.hidden = sal;
  const bSal = document.getElementById("incomeKindSalaryBtn");
  const bOth = document.getElementById("incomeKindOtherBtn");
  if (bSal) bSal.setAttribute("aria-pressed", sal ? "true" : "false");
  if (bOth) bOth.setAttribute("aria-pressed", !sal ? "true" : "false");
  const nameInp = document.getElementById("incomeNameInput");
  if (nameInp) {
    nameInp.readOnly = sal;
    nameInp.classList.toggle("input-readonly-like", sal);
  }
  const note = document.getElementById("incomeSalaryHelpNote");
  if (note) note.hidden = !sal;
  updateIncomeModalTitle();
  updateIncomePaymentsEditorHeading();
}

function openIncomeOverlay(incomeId, opts = {}) {
  ui.editIncomeId = incomeId;
  ui.scrollToPaymentId = opts?.scrollToPaymentId || null;
  ui.scrollToPaymentDateISO = opts?.scrollToPaymentDateISO || null;
  ui.focusPaymentId = null;
  ui.focusPaymentDateISO = null;
  const modal = requireEl("incomeModal");
  const backdrop = requireEl("incomeModalBackdrop");

  const editing = Boolean(incomeId);
  modal.dataset.mode = editing ? "edit" : "create";
  requireEl("incomeEditorNote").textContent = "";
  hideErrorSummaryById("incomeErrorSummary");
  requireEl("incomeDeleteBtn").hidden = !editing;

  const inc = editing ? (state.incomes || []).find((x) => x.id === incomeId) : null;
  const isSal = inc ? isSalaryIncome(inc) : false;
  ui.incomeEditorKind = isSal ? "salary" : "other";

  requireEl("incomeNameInput").value = isSal ? (String(inc?.name || "").trim() || "Lön") : inc?.name || "";
  requireEl("incomeIntervalSelect").value = isSal ? "monthly" : inc?.interval || "once";

  if (isSal) {
    updateIncomeSalaryBandLabels();
    const metaSal = inc?.metadata?.salary || {};
    writeSalaryByYearToBandInputs(metaSal.byYear || {});
    const payPd = Math.max(1, Math.min(31, Math.floor(asNumber(metaSal.payDay)))) || 25;
    const paySel = document.getElementById("incomeSalaryPayDay");
    if (paySel) setDayOptions(paySel, payPd);
  }

  ui.incomeEditorPayments = Array.isArray(inc?.payments)
    ? inc.payments.map((p) => {
        const parts = datePartsFromIso(p.date) || null;
        return {
          id: p.id || uid(),
          year: parts ? String(parts.y) : "",
          month: parts ? pad2(parts.m) : "",
          day: parts ? String(parts.d) : "",
          amount: asNumber(p.amount)
        };
      })
    : [];

  if (ui.scrollToPaymentId) {
    const pid = String(ui.scrollToPaymentId);
    const hasIdMatch = ui.incomeEditorPayments.some((p) => String(p.id || "") === pid);
    if (hasIdMatch) ui.focusPaymentId = pid;
  }
  if (!ui.focusPaymentId && ui.scrollToPaymentDateISO) {
    ui.focusPaymentDateISO = String(ui.scrollToPaymentDateISO);
  }
  const curY = currentYearMonth().year;
  const firstPayment = (ui.incomeEditorPayments || []).find((p) => asNumber(p.amount) > 0 && p.year && p.month && p.day);
  const parts =
    firstPayment && parseIntOrNull(firstPayment.year) && parseIntOrNull(firstPayment.month) && parseIntOrNull(firstPayment.day)
      ? { y: Number(firstPayment.year), m: Number(firstPayment.month), d: Number(firstPayment.day) }
      : null;
  ui.incomeDefaults = ui.incomeDefaults || { year: curY, day: 25, amount: 0 };
  ui.incomeDefaults.year = parts?.y || ui.incomeDefaults.year || curY;
  ui.incomeDefaults.day = parts?.d || ui.incomeDefaults.day || 25;
  ui.incomeDefaults.amount = firstPayment ? asNumber(firstPayment.amount) : ui.incomeDefaults.amount;

  const defYear = requireEl("incomeDefaultYear");
  const defDay = requireEl("incomeDefaultDay");
  const defAmt = requireEl("incomeDefaultAmount");
  setYear3Options(defYear, ui.incomeDefaults.year);
  setDayOptions(defDay, ui.incomeDefaults.day);
  defAmt.value = asNumber(ui.incomeDefaults.amount);

  syncIncomeModalKindUI();

  if (!editing) {
    if (isSal) {
      ui.incomeEditorPayments = [];
      renderIncomePaymentsEditorRows();
    } else {
      resetIncomeEditorRowsForInterval();
    }
  } else {
    renderIncomePaymentsEditorRows();
  }

  backdrop.hidden = false;
  modal.hidden = false;
  document.documentElement.classList.add("modal-open");
  document.body.classList.add("modal-open");

  if (ui.scrollToPaymentId || ui.focusPaymentDateISO) {
    requestAnimationFrame(() => {
      scrollToIncomePaymentRow({
        paymentId: ui.focusPaymentId || ui.scrollToPaymentId,
        dateISO: ui.focusPaymentDateISO || ui.scrollToPaymentDateISO
      });
      ui.scrollToPaymentId = null;
      ui.scrollToPaymentDateISO = null;
    });
  }
}

function closeIncomeOverlay() {
  ui.editIncomeId = null;
  ui.incomeEditorPayments = null;
  ui.focusPaymentId = null;
  ui.focusPaymentDateISO = null;
  ui.incomeEditorKind = "other";
  syncIncomeModalKindUI();
  hideErrorSummaryById("incomeErrorSummary");
  requireEl("incomeModalBackdrop").hidden = true;
  requireEl("incomeModal").hidden = true;
  delete requireEl("incomeModal").dataset.mode;
  document.documentElement.classList.remove("modal-open");
  document.body.classList.remove("modal-open");
}

function showConfirmDeleteIncomeModal() {
  requireEl("confirmDeleteIncomeBackdrop").hidden = false;
  requireEl("confirmDeleteIncomeModal").hidden = false;
}

function hideConfirmDeleteIncomeModal() {
  requireEl("confirmDeleteIncomeBackdrop").hidden = true;
  requireEl("confirmDeleteIncomeModal").hidden = true;
}

function paymentsCountForInterval(interval) {
  if (interval === "monthly") return 12;
  if (interval === "quarterly") return 3;
  if (interval === "yearly") return 1;
  return 1; // once
}

function monthsForInterval(interval) {
  if (interval === "monthly") return Array.from({ length: 12 }).map((_, i) => i + 1);
  if (interval === "quarterly") return [3, 6, 9]; // kvartal: 3 utbetalningar (ex mars/juni/sep) - kan justeras senare
  if (interval === "yearly") return [1];
  // once
  return [new Date().getMonth() + 1];
}

function parseIntOrNull(v) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function isAllowedYear(y) {
  const cur = currentYearMonth().year;
  return y === cur - 1 || y === cur || y === cur + 1;
}

function validateIncomePaymentParts({ year, month, day, amount }) {
  const y = parseIntOrNull(year);
  const m = parseIntOrNull(month);
  const d = parseIntOrNull(day);
  const amt = asNumber(amount);

  if (y === null || !isAllowedYear(y)) return { ok: false, message: "År måste vara föregående, innevarande eller nästa år." };
  if (m === null || m < 1 || m > 12) return { ok: false, message: "Månad måste vara 1–12." };
  if (d === null || d < 1 || d > 31) return { ok: false, message: "Dag måste vara 1–31." };

  const max = daysInMonth(y, m);
  if (d > max) return { ok: false, message: `Ogiltig dag för vald månad (max ${max}).` };

  // Belopp får vara 0; datumkrav hanteras vid Spara för rader med belopp > 0.
  if (amt < 0) return { ok: false, message: "Belopp kan inte vara negativt." };
  return { ok: true, message: "" };
}

function getIncomeDefaultsFromUI() {
  const defYear = asNumber(document.getElementById("incomeDefaultYear")?.value || ui.incomeDefaults?.year);
  const defDay = asNumber(document.getElementById("incomeDefaultDay")?.value || ui.incomeDefaults?.day);
  const defAmt = asNumber(document.getElementById("incomeDefaultAmount")?.value || ui.incomeDefaults?.amount);
  return {
    year: String(defYear || currentYearMonth().year),
    day: String(defDay || 25),
    amount: defAmt
  };
}

function resetIncomeEditorRowsForInterval() {
  if (ui.incomeEditorKind === "salary") return;
  const interval = document.getElementById("incomeIntervalSelect")?.value || "once";
  const count = paymentsCountForInterval(interval);
  const months = monthsForInterval(interval);
  const defaults = getIncomeDefaultsFromUI();

  ui.incomeEditorPayments = [];
  for (let i = 0; i < count; i++) {
    const m = months[Math.min(i, months.length - 1)] || 1;
    ui.incomeEditorPayments.push({
      id: uid(),
      year: defaults.year,
      month: pad2(m),
      day: defaults.day,
      amount: defaults.amount
    });
  }
  renderIncomePaymentsEditorRows();
}

function applyIncomeDefaultFieldToEditorRows(field) {
  if (ui.incomeEditorKind === "salary") return;
  if (!Array.isArray(ui.incomeEditorPayments)) ui.incomeEditorPayments = [];
  const defaults = getIncomeDefaultsFromUI();

  ui.incomeEditorPayments = ui.incomeEditorPayments.map((p) => {
    if (field === "year") return { ...p, year: defaults.year };
    if (field === "day") return { ...p, day: defaults.day };
    if (field === "amount") return { ...p, amount: defaults.amount };
    return p;
  });

  renderIncomePaymentsEditorRows();
}

function applyIncomeDefaultsToEditorRows(overwriteExisting) {
  if (ui.incomeEditorKind === "salary") return;
  const interval = document.getElementById("incomeIntervalSelect")?.value || "once";
  const count = paymentsCountForInterval(interval);
  const months = monthsForInterval(interval);

  const defYear = asNumber(document.getElementById("incomeDefaultYear")?.value || ui.incomeDefaults?.year);
  const defDay = asNumber(document.getElementById("incomeDefaultDay")?.value || ui.incomeDefaults?.day);
  const defAmt = asNumber(document.getElementById("incomeDefaultAmount")?.value || ui.incomeDefaults?.amount);

  if (!Array.isArray(ui.incomeEditorPayments)) ui.incomeEditorPayments = [];

  // Ensure length
  while (ui.incomeEditorPayments.length < count)
    ui.incomeEditorPayments.push({ id: uid(), year: "", month: "", day: "", amount: 0 });
  if (ui.incomeEditorPayments.length > count) ui.incomeEditorPayments = ui.incomeEditorPayments.slice(0, count);

  // Overwrite values based on defaults + interval
  ui.incomeEditorPayments = ui.incomeEditorPayments.map((p, idx) => {
    const month = months[Math.min(idx, months.length - 1)] || 1;
    const shouldOverwrite = overwriteExisting || !p.year || !p.month || !p.day;
    if (!shouldOverwrite) return p;
    return {
      ...p,
      year: String(defYear || currentYearMonth().year),
      month: pad2(month),
      day: String(defDay || 25),
      amount: overwriteExisting ? defAmt : asNumber(p.amount)
    };
  });

  renderIncomePaymentsEditorRows();
}

function renderIncomePaymentsEditorRows() {
  const isSalary = ui.incomeEditorKind === "salary";
  const interval = document.getElementById("incomeIntervalSelect")?.value || "once";
  const count = isSalary ? ui.incomeEditorPayments?.length || 0 : paymentsCountForInterval(interval);

  if (!Array.isArray(ui.incomeEditorPayments)) ui.incomeEditorPayments = [];
  if (!isSalary) {
    while (ui.incomeEditorPayments.length < count)
      ui.incomeEditorPayments.push({ id: uid(), year: "", month: "", day: "", amount: 0 });
    if (ui.incomeEditorPayments.length > count) ui.incomeEditorPayments = ui.incomeEditorPayments.slice(0, count);
  }

  const body = document.getElementById("incomePaymentsEditorBody");
  if (!body) return;
  body.innerHTML = "";

  ui.incomeEditorPayments.forEach((p, idx) => {
    const y = parseIntOrNull(p.year);
    const m = parseIntOrNull(p.month);
    const d = parseIntOrNull(p.day);
    const rowISO = y !== null && m !== null && d !== null ? `${y}-${pad2(m)}-${pad2(d)}` : "";

    const tr = document.createElement("tr");
    tr.setAttribute("data-inc-editor-row", String(idx));
    tr.setAttribute("data-inc-payment-id", String(p.id || ""));
    tr.setAttribute("data-inc-payment-date", rowISO);
    const idMatch = ui.focusPaymentId && String(p.id || "") === String(ui.focusPaymentId);
    const dateMatch = ui.focusPaymentDateISO && rowISO === String(ui.focusPaymentDateISO);
    if (idMatch || (!ui.focusPaymentId && dateMatch)) {
      tr.classList.add("row-focused");
    }
    tr.innerHTML = `
      <td>
        <input class="tight" inputmode="numeric" type="number" step="1" data-inc-pay-year="${idx}" placeholder="2026" value="${escapeHtml(
          p.year ?? ""
        )}" />
      </td>
      <td>
        <input class="tight" inputmode="numeric" type="text" maxlength="2" data-inc-pay-month="${idx}" placeholder="01-12" value="${escapeHtml(
          p.month ?? ""
        )}" />
      </td>
      <td>
        <input class="tight" inputmode="numeric" type="number" step="1" data-inc-pay-day="${idx}" placeholder="1-31" value="${escapeHtml(
          p.day ?? ""
        )}" />
      </td>
      <td class="right"><input type="number" inputmode="decimal" min="0" step="1" class="tight" data-inc-pay-amt="${idx}" placeholder="0" value="${escapeHtml(
        asNumber(p.amount)
      )}" /></td>
    `;
    body.appendChild(tr);

    const errTr = document.createElement("tr");
    errTr.innerHTML = `<td colspan="4"><div class="field-error" data-inc-pay-err="${idx}"></div></td>`;
    body.appendChild(errTr);
  });

  const updateRowValidationUI = (idx) => {
    const row = ui.incomeEditorPayments[idx];
    const res = validateIncomePaymentParts(row);
    const err = document.querySelector(`[data-inc-pay-err="${idx}"]`);
    const show = asNumber(row.amount) > 0;
    if (err) err.textContent = show && !res.ok ? res.message : "";

    ["year", "month", "day"].forEach((k) => {
      const el = document.querySelector(`[data-inc-pay-${k}="${idx}"]`);
      if (!el) return;
      const isInvalid = show && !res.ok;
      el.classList.toggle("input-invalid", isInvalid);
      el.setAttribute("aria-invalid", isInvalid ? "true" : "false");
    });
  };

  document.querySelectorAll("[data-inc-pay-year]").forEach((el) => {
    const idx = Number(el.getAttribute("data-inc-pay-year"));
    el.oninput = () => {
      ui.incomeEditorPayments[idx].year = el.value;
      updateRowValidationUI(idx);
    };
    updateRowValidationUI(idx);
  });

  document.querySelectorAll("[data-inc-pay-month]").forEach((el) => {
    const idx = Number(el.getAttribute("data-inc-pay-month"));
    el.oninput = () => {
      ui.incomeEditorPayments[idx].month = el.value;
      updateRowValidationUI(idx);
    };
  });

  document.querySelectorAll("[data-inc-pay-day]").forEach((el) => {
    const idx = Number(el.getAttribute("data-inc-pay-day"));
    el.oninput = () => {
      ui.incomeEditorPayments[idx].day = el.value;
      updateRowValidationUI(idx);
    };
  });

  document.querySelectorAll("[data-inc-pay-amt]").forEach((el) => {
    el.oninput = () => {
      const idx = Number(el.getAttribute("data-inc-pay-amt"));
      ui.incomeEditorPayments[idx].amount = asNumber(el.value);
      updateRowValidationUI(idx);
    };
  });
}

function scrollToIncomePaymentRow({ paymentId, dateISO }) {
  const body = document.getElementById("incomePaymentsEditorBody");
  if (!body) return;
  const pid = paymentId ? String(paymentId) : "";
  const iso = dateISO ? String(dateISO) : "";

  let targetRow = null;
  if (pid) {
    targetRow = Array.from(body.querySelectorAll("[data-inc-payment-id]")).find(
      (el) => el.getAttribute("data-inc-payment-id") === pid
    );
  }
  if (!targetRow && iso) {
    targetRow = Array.from(body.querySelectorAll("[data-inc-payment-date]")).find(
      (el) => el.getAttribute("data-inc-payment-date") === iso
    );
  }
  if (!targetRow) return;

  targetRow.classList.add("row-highlight");
  const container = document.querySelector("#incomeModal .modal-body");
  if (container) {
    const cRect = container.getBoundingClientRect();
    const rRect = targetRow.getBoundingClientRect();
    const delta = rRect.top - cRect.top;
    const top = container.scrollTop + delta - 80;
    container.scrollTo({ top, behavior: "smooth" });
  } else {
    targetRow.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  // Focus amount field on target row
  const amountInput = targetRow.querySelector("[data-inc-pay-amt]");
  if (amountInput) amountInput.focus({ preventScroll: true });
  setTimeout(() => targetRow.classList.remove("row-highlight"), 1600);
}

function saveIncomeFromOverlay() {
  const isSal = ui.incomeEditorKind === "salary";
  const name = isSal ? "Lön" : (document.getElementById("incomeNameInput").value || "").trim();
  const interval = isSal ? "monthly" : document.getElementById("incomeIntervalSelect").value || "once";
  const note = document.getElementById("incomeEditorNote");
  const summaryEl = document.getElementById("incomeErrorSummary");
  if (summaryEl) hideErrorSummaryByEl(summaryEl);

  if (!isSal && !name) {
    note.textContent = "";
    renderErrorSummary(summaryEl, [{ label: "Ange ett namn.", jumpId: "incomeNameInput" }]);
    return;
  }

  const payments = (ui.incomeEditorPayments || []).map((p) => ({
    id: p.id || uid(),
    year: p.year,
    month: p.month,
    day: p.day,
    amount: asNumber(p.amount)
  }));

  const errors = [];
  payments.forEach((p, idx) => {
    if (asNumber(p.amount) <= 0) return;
    const res = validateIncomePaymentParts(p);
    if (!res.ok) {
      const jump = paymentErrorJump({ idx, msg: res.message, kindPrefix: "inc" });
      errors.push({ label: jump.label, jumpSelector: jump.jumpSelector });
    }
  });

  if (errors.length > 0) {
    note.textContent = "";
    renderErrorSummary(summaryEl, errors);
    return;
  }

  const storedPayments = payments.map((p) => {
    const y = parseIntOrNull(p.year);
    const m = parseIntOrNull(p.month);
    const d = parseIntOrNull(p.day);
    const amt = asNumber(p.amount);
    const valid = y !== null && m !== null && d !== null && isAllowedYear(y) && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
    return {
      id: p.id,
      date: valid ? `${y}-${pad2(m)}-${pad2(d)}` : "",
      amount: amt
    };
  });

  const editing = Boolean(ui.editIncomeId);
  const prevInc = editing ? (state.incomes || []).find((x) => x.id === ui.editIncomeId) : null;
  const baseMeta =
    prevInc && typeof prevInc.metadata === "object" && prevInc.metadata && !Array.isArray(prevInc.metadata)
      ? deepCloneJson(prevInc.metadata)
      : {};
  if (isSal) {
    const byYear = readSalaryByYearFromBandInputs();
    const paySel = document.getElementById("incomeSalaryPayDay");
    const pd = Math.floor(asNumber(paySel?.value));
    const payDay = Number.isFinite(pd) && pd >= 1 && pd <= 31 ? pd : 25;
    baseMeta.salary = { byYear, payDay };
  } else {
    delete baseMeta.salary;
  }
  const hasMetaKeys = Object.keys(baseMeta).length > 0;

  const raw = {
    id: editing ? ui.editIncomeId : uid(),
    name,
    interval,
    category: isSal ? INCOME_CATEGORY_SALARY : INCOME_CATEGORY_OTHER,
    payments: storedPayments,
    ...(hasMetaKeys ? { metadata: baseMeta } : {})
  };
  const normalized = normalizeIncomeRecord(raw);

  if (editing) {
    const idx = (state.incomes || []).findIndex((x) => x.id === ui.editIncomeId);
    if (idx >= 0) state.incomes[idx] = normalized;
  } else {
    state.incomes.push(normalized);
  }

  saveState();
  closeIncomeOverlay();
  renderIncomesList();
  renderOverviewIfOnOverview();
}

function renderIncomesList() {
  ensureIncomePaymentsListDelegation();
  const yearFilter = ui.incomeYearFilter || "all";
  const rows = buildIncomePaymentRowsForList(yearFilter);
  ui.lastIncomeListRows = rows;
  const mount = requireEl("incomePaymentsListMount");
  mount.innerHTML = "";
  const note = requireEl("incomeListNote");
  note.textContent = "";
  if (rows.length === 0) {
    mount.innerHTML = `<div class="tagged-expense-list-empty">Inga utbetalningar för valt filter.</div>`;
    return;
  }
  const total = rows.reduce((s, r) => s + asNumber(r.amount), 0);
  note.textContent = `Intäkter totalt: ${formatKr(total)}`;
  let prevMonthKey = null;
  for (const r of rows) {
    const monthKey = `${r.date.getFullYear()}-${pad2(r.date.getMonth() + 1)}`;
    if (!prevMonthKey || monthKey !== prevMonthKey) {
      const heading = document.createElement("div");
      heading.className = "expense-list-month-heading";
      heading.innerHTML = `<div class="month-divider expense-list-month-divider"><span>${escapeHtml(monthName(r.date.getMonth() + 1))} ${escapeHtml(
        String(r.date.getFullYear())
      )}</span></div>`;
      mount.appendChild(heading);
      prevMonthKey = monthKey;
    }
    const rowWrap = document.createElement("div");
    rowWrap.className = "tagged-expense-preview-row";
    rowWrap.setAttribute("role", "listitem");
    rowWrap.innerHTML = `
      <button type="button" class="tagged-expense-row-btn income-payment-row-btn" data-edit-income="${escapeHtml(
        String(r.incomeId)
      )}" data-edit-income-payment="${escapeHtml(String(r.paymentId || ""))}" data-edit-income-iso="${escapeHtml(
        String(r.isoDate || "")
      )}" aria-label="Redigera ${escapeHtml(r.lineTitle)}">
        <span class="tagged-expense-row-btn-main">
          <span class="tagged-expense-row-line1">
            <span class="tagged-expense-name">${escapeHtml(r.lineTitle)}</span>
            <span class="tagged-expense-amt">${escapeHtml(formatKr(r.amount))}</span>
          </span>
          <span class="tagged-expense-row-line2">${escapeHtml(r.dateLong)}</span>
        </span>
        <span class="tagged-expense-row-chev" aria-hidden="true">${LIST_ROW_CHEVRON_SVG}</span>
      </button>
    `;
    mount.appendChild(rowWrap);
  }
}

function expenseYearsForFilter() {
  const years = new Set();
  years.add("all");
  for (const exp of state.expenses || []) {
    for (const p of exp.payments || []) {
      if (!p?.date) continue;
      const dt = parseDateISO(String(p.date));
      if (!dt) continue;
      years.add(String(dt.getFullYear()));
    }
  }
  const cur = currentYearMonth().year;
  years.add(String(cur - 1));
  years.add(String(cur));
  years.add(String(cur + 1));
  const arr = Array.from(years);
  const nums = arr.filter((x) => x !== "all").map((x) => Number(x)).filter((n) => Number.isFinite(n)).sort((a, b) => b - a);
  return ["all", ...nums.map(String)];
}

function setExpenseYearFilterOptions(selectEl, selected) {
  selectEl.innerHTML = "";
  for (const y of expenseYearsForFilter()) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y === "all" ? "Alla" : y;
    if (String(selected) === y) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function expensePaymentRowDisplayParts(exp) {
  const rawName = String(exp?.name || "Utgift").trim() || "Utgift";
  if (!isMatLikeExpense(exp)) {
    return { weekPrefix: "", title: rawName };
  }
  const mv = /^Mat v\.(\d+)$/i.exec(rawName);
  let weekPrefix = "";
  if (mv) weekPrefix = `v${mv[1]}`;
  else {
    const wk = exp?.metadata?.food?.weekKey ? String(exp.metadata.food.weekKey) : "";
    const wm = /(?:^|-)W(\d{1,2})$/i.exec(wk);
    if (wm) weekPrefix = `v${Number(wm[1])}`;
  }
  return { weekPrefix, title: "Mat" };
}

function formatExpenseListLongDate(dt) {
  if (!dt || Number.isNaN(dt.getTime())) return "—";
  return `${dt.getDate()} ${monthName(dt.getMonth() + 1)} ${dt.getFullYear()}`;
}

function buildExpensePaymentRowsForList(yearFilter) {
  const rows = [];
  const monthFilter = ui.expenseMonthFilter || "all";
  for (const exp of state.expenses || []) {
    const name = exp.name || "Utgift";
    const disp = expensePaymentRowDisplayParts(exp);
    for (const p of exp.payments || []) {
      const amt = asNumber(p.amount);
      if (amt <= 0) continue;
      const iso = p.date || "";
      const dt = iso ? parseDateISO(String(iso)) : null;
      if (!dt) continue;
      if (yearFilter !== "all" && String(dt.getFullYear()) !== String(yearFilter)) continue;
      if (monthFilter !== "all" && Number(monthFilter) !== dt.getMonth() + 1) continue;
      rows.push({
        expenseId: exp.id,
        paymentId: p.id,
        name,
        isoDate: iso,
        date: dt,
        amount: amt,
        isFoodPayment: isMatLikeExpense(exp),
        isLoanMirror: isMirroredLoanExpense(exp),
        loanId: exp.metadata?.loanId,
        foodYear: exp?.metadata?.food?.year,
        foodWeekKey: exp?.metadata?.food?.weekKey,
        weekPrefix: disp.weekPrefix,
        lineTitle: disp.title,
        dateLong: formatExpenseListLongDate(dt)
      });
    }
  }
  // Utgifter: stigande (Januari -> December)
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return rows;
}

function openFoodOverlayForExpenseRow(row) {
  openExpenseCategoryOverlay("food");
  const year = Number(row?.foodYear) || (row?.date ? row.date.getFullYear() : ui.foodPreviewYear || currentYearMonth().year);
  const month = row?.date ? row.date.getMonth() + 1 : (ui.foodPreviewMonth || ui.expensesFoodMonth || currentYearMonth().month);
  ui.foodPreviewYear = year;
  ui.foodPreviewMonth = month;
  ui.expensesFoodMonth = month;
  ui.foodScrollWeekKey = row?.foodWeekKey || null;
  renderFoodPage();
  requestAnimationFrame(() => {
    const overlay = document.querySelector('[data-expview="food"]');
    if (overlay && typeof overlay.scrollTo === "function") overlay.scrollTo({ top: 0, behavior: "smooth" });
    if (ui.foodScrollWeekKey) {
      // wait for preview rows to exist
      requestAnimationFrame(() => {
        const target = overlay?.querySelector?.(`[data-food-week="${CSS.escape(String(ui.foodScrollWeekKey))}"]`);
        if (target) {
          target.classList.add("food-week-highlight");
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => target.classList.remove("food-week-highlight"), 2200);
        }
        ui.foodScrollWeekKey = null;
      });
    }
  });
}

function renderExpensesSummaryPage() {
  const yearEl = requireEl("expenseYearFilter");
  if (!ui.expenseYearFilter) ui.expenseYearFilter = String(currentYearMonth().year);
  setExpenseYearFilterOptions(yearEl, ui.expenseYearFilter);
  yearEl.onchange = () => {
    ui.expenseYearFilter = yearEl.value;
    renderExpensesList();
  };

  const monthEl = requireEl("expenseMonthFilter");
  if (!ui.expenseMonthFilter) ui.expenseMonthFilter = "all";
  setMonthFilterOptions(monthEl, ui.expenseMonthFilter);
  monthEl.onchange = () => {
    ui.expenseMonthFilter = monthEl.value;
    renderExpensesList();
  };
  syncExpenseFilterSummaryLabel();

  requireEl("expenseIntervalSelect").onchange = () => resetExpenseEditorRowsForInterval();

  const defYear = requireEl("expenseDefaultYear");
  const defDay = requireEl("expenseDefaultDay");
  const defAmt = requireEl("expenseDefaultAmount");
  if (!ui.expenseDefaults) ui.expenseDefaults = { year: currentYearMonth().year, day: 25, amount: 0 };
  setYear3Options(defYear, ui.expenseDefaults.year);
  setDayOptions(defDay, ui.expenseDefaults.day);
  defAmt.value = asNumber(ui.expenseDefaults.amount);
  defYear.onchange = () => {
    ui.expenseDefaults.year = Number(defYear.value);
    applyExpenseDefaultFieldToEditorRows("year");
  };
  defDay.onchange = () => {
    ui.expenseDefaults.day = Number(defDay.value);
    applyExpenseDefaultFieldToEditorRows("day");
  };
  defAmt.oninput = () => {
    ui.expenseDefaults.amount = asNumber(defAmt.value);
    applyExpenseDefaultFieldToEditorRows("amount");
  };

  requireEl("closeExpenseModalBtn").onclick = closeExpenseOverlay;
  requireEl("expenseCancelBtn").onclick = closeExpenseOverlay;
  requireEl("expenseSaveBtn").onclick = saveExpenseFromOverlay;
  requireEl("expenseDeleteBtn").onclick = () => {
    if (!ui.editExpenseId) return;
    showConfirmDeleteExpenseModal();
  };
  requireEl("closeDeleteExpenseModalBtn").onclick = hideConfirmDeleteExpenseModal;
  requireEl("cancelDeleteExpenseBtn").onclick = hideConfirmDeleteExpenseModal;
  requireEl("confirmDeleteExpenseBtn").onclick = () => {
    if (!ui.editExpenseId) return hideConfirmDeleteExpenseModal();
    state.expenses = (state.expenses || []).filter((x) => x.id !== ui.editExpenseId);
    saveState();
    hideConfirmDeleteExpenseModal();
    closeExpenseOverlay();
    renderExpensesList();
    renderOverviewIfOnOverview();
  };

  renderExpensesList();
}

function ensureExpensePaymentsListDelegation() {
  const mount = document.getElementById("expensePaymentsListMount");
  if (!mount || mount.dataset.expPayDel === "1") return;
  mount.dataset.expPayDel = "1";
  mount.addEventListener("click", (e) => {
    const btn = e.target.closest(".expense-payment-row-btn");
    if (!btn || !mount.contains(btn)) return;
    const rows = ui.lastExpenseListRows || [];
    const loanId = btn.getAttribute("data-edit-loan");
    if (loanId) {
      openExpenseCategoryOverlay("loans");
      openLoanEditor(loanId);
      return;
    }
    const expenseId = btn.getAttribute("data-edit-expense");
    const paymentId = btn.getAttribute("data-edit-expense-payment");
    const iso = btn.getAttribute("data-edit-expense-iso");
    const row = rows.find(
      (r) => String(r.expenseId) === String(expenseId) && (!paymentId || String(r.paymentId) === String(paymentId))
    );
    if (row?.isFoodPayment) {
      openFoodOverlayForExpenseRow(row);
      return;
    }
    if (row?.isLoanMirror && row.loanId) {
      openExpenseCategoryOverlay("loans");
      openLoanEditor(String(row.loanId));
      return;
    }
    openExpenseOverlay(expenseId, { scrollToPaymentId: paymentId, scrollToPaymentDateISO: iso });
  });
}

function ensureIncomePaymentsListDelegation() {
  const mount = document.getElementById("incomePaymentsListMount");
  if (!mount || mount.dataset.incPayDel === "1") return;
  mount.dataset.incPayDel = "1";
  mount.addEventListener("click", (e) => {
    const btn = e.target.closest(".income-payment-row-btn");
    if (!btn || !mount.contains(btn)) return;
    const incomeId = btn.getAttribute("data-edit-income");
    const paymentId = btn.getAttribute("data-edit-income-payment");
    const iso = btn.getAttribute("data-edit-income-iso");
    openIncomeOverlay(incomeId, { scrollToPaymentId: paymentId, scrollToPaymentDateISO: iso });
  });
}

function renderExpensesList() {
  ensureExpensePaymentsListDelegation();
  const rows = buildExpensePaymentRowsForList(ui.expenseYearFilter || "all");
  ui.lastExpenseListRows = rows;
  const mount = requireEl("expensePaymentsListMount");
  mount.innerHTML = "";
  const noteEl = requireEl("expenseListNote");
  noteEl.textContent = "";
  if (rows.length === 0) {
    mount.innerHTML = `<div class="tagged-expense-list-empty">Inga utgifter för valt filter.</div>`;
    return;
  }
  const total = rows.reduce((s, r) => s + asNumber(r.amount), 0);
  noteEl.textContent = `Utgifter totalt: ${formatKr(total)}`;
  let prevMonthKey = null;
  for (const r of rows) {
    const monthKey = `${r.date.getFullYear()}-${pad2(r.date.getMonth() + 1)}`;
    if (!prevMonthKey || monthKey !== prevMonthKey) {
      const heading = document.createElement("div");
      heading.className = "expense-list-month-heading";
      heading.innerHTML = `<div class="month-divider expense-list-month-divider"><span>${escapeHtml(monthName(r.date.getMonth() + 1))} ${escapeHtml(
        String(r.date.getFullYear())
      )}</span></div>`;
      mount.appendChild(heading);
      prevMonthKey = monthKey;
    }
    const rowWrap = document.createElement("div");
    rowWrap.className = "tagged-expense-preview-row";
    rowWrap.setAttribute("role", "listitem");
    const loanMirror = r.isLoanMirror && r.loanId;
    const attrs = loanMirror
      ? `data-edit-loan="${escapeHtml(String(r.loanId))}"`
      : `data-edit-expense="${escapeHtml(String(r.expenseId))}" data-edit-expense-payment="${escapeHtml(
          String(r.paymentId || "")
        )}" data-edit-expense-iso="${escapeHtml(String(r.isoDate || ""))}"`;
    const prefixHtml = r.weekPrefix
      ? `<span class="expense-payment-week-prefix">${escapeHtml(r.weekPrefix)}</span>`
      : "";
    const line1Left = r.weekPrefix
      ? `<span class="expense-payment-line1-left">${prefixHtml}<span class="tagged-expense-name">${escapeHtml(r.lineTitle)}</span></span>`
      : `<span class="tagged-expense-name">${escapeHtml(r.lineTitle)}</span>`;
    rowWrap.innerHTML = `
      <button type="button" class="tagged-expense-row-btn expense-payment-row-btn" ${attrs} aria-label="Redigera ${escapeHtml(r.lineTitle)}">
        <span class="tagged-expense-row-btn-main">
          <span class="tagged-expense-row-line1">
            ${line1Left}
            <span class="tagged-expense-amt">${escapeHtml(formatKr(r.amount))}</span>
          </span>
          <span class="tagged-expense-row-line2">${escapeHtml(r.dateLong)}</span>
        </span>
        <span class="tagged-expense-row-chev" aria-hidden="true">${LIST_ROW_CHEVRON_SVG}</span>
      </button>
    `;
    mount.appendChild(rowWrap);
  }
}

function getExpenseDefaultsFromUI() {
  const defYear = asNumber(document.getElementById("expenseDefaultYear")?.value || ui.expenseDefaults?.year);
  const defDay = asNumber(document.getElementById("expenseDefaultDay")?.value || ui.expenseDefaults?.day);
  const defAmt = asNumber(document.getElementById("expenseDefaultAmount")?.value || ui.expenseDefaults?.amount);
  return { year: String(defYear || currentYearMonth().year), day: String(defDay || 25), amount: defAmt };
}

function resetExpenseEditorRowsForInterval() {
  const interval = document.getElementById("expenseIntervalSelect")?.value || "once";
  const count = paymentsCountForInterval(interval);
  const months = monthsForInterval(interval);
  const defaults = getExpenseDefaultsFromUI();
  ui.expenseEditorPayments = [];
  for (let i = 0; i < count; i++) {
    const m = months[Math.min(i, months.length - 1)] || 1;
    ui.expenseEditorPayments.push({ id: uid(), year: defaults.year, month: pad2(m), day: defaults.day, amount: defaults.amount, date: `${defaults.year}-${pad2(m)}-${pad2(Number(defaults.day))}` });
  }
  renderExpensePaymentsEditorRows();
}

function applyExpenseDefaultFieldToEditorRows(field) {
  if (!Array.isArray(ui.expenseEditorPayments)) ui.expenseEditorPayments = [];
  const defaults = getExpenseDefaultsFromUI();
  ui.expenseEditorPayments = ui.expenseEditorPayments.map((p) => {
    if (field === "year") return { ...p, year: defaults.year };
    if (field === "day") return { ...p, day: defaults.day };
    if (field === "amount") return { ...p, amount: defaults.amount };
    return p;
  });
  renderExpensePaymentsEditorRows();
}

function openExpenseOverlay(expenseId, opts = {}) {
  if (expenseId == null || expenseId === "") return;
  ui.editExpenseId = expenseId;
  ui.expenseScrollToPaymentId = opts?.scrollToPaymentId || null;
  ui.expenseScrollToPaymentDateISO = opts?.scrollToPaymentDateISO || null;
  ui.expenseFocusPaymentId = null;
  ui.expenseFocusPaymentDateISO = null;
  const modal = requireEl("expenseModal");
  const backdrop = requireEl("expenseModalBackdrop");
  modal.dataset.mode = "edit";
  requireEl("expenseModalTitle").textContent = "Redigera utgift";
  requireEl("expenseEditorNote").textContent = "";
  hideErrorSummaryById("expenseErrorSummary");
  requireEl("expenseDeleteBtn").hidden = false;
  const exp = (state.expenses || []).find((x) => x.id === expenseId);
  if (!exp) return;
  if (isMirroredLoanExpense(exp)) {
    closeExpenseOverlay();
    openExpenseCategoryOverlay("loans");
    openLoanEditor(String(exp.metadata.loanId));
    return;
  }
  if (isMatLikeExpense(exp)) {
    // Food is system-generated; redirect to Mat.
    closeExpenseOverlay();
    const p0 = exp?.payments?.[0];
    openFoodOverlayForExpenseRow({
      date: p0?.date ? new Date(p0.date) : null,
      foodYear:
        exp.metadata?.food?.year != null && exp.metadata?.food?.year !== ""
          ? Number(exp.metadata.food.year)
          : undefined,
      foodWeekKey: exp.metadata?.food?.weekKey
    });
    return;
  }
  const tagCat = getTaggedExpenseCategory(exp);
  if (tagCat) {
    closeExpenseOverlay();
    const u = ui.tagged[tagCat];
    u.editingId = expenseId;
    u.editorOpen = true;
    const p0 = exp?.payments?.[0];
    if (p0?.date) {
      const d = new Date(p0.date);
      if (!Number.isNaN(d.getTime())) {
        u.listYear = d.getFullYear();
        u.listMonth = d.getMonth() + 1;
      }
    }
    openExpenseCategoryOverlay(TAGGED_CATEGORY_CONFIG[tagCat].overlayKey);
    return;
  }
  requireEl("expenseNameInput").value = exp?.name || "";
  requireEl("expenseIntervalSelect").value = exp?.interval || "once";
  ui.expenseEditorPayments = Array.isArray(exp?.payments)
    ? exp.payments.map((p) => {
        const parts = datePartsFromIso(p.date) || null;
        return { id: p.id || uid(), date: p.date || "", year: parts ? String(parts.y) : "", month: parts ? pad2(parts.m) : "", day: parts ? String(parts.d) : "", amount: asNumber(p.amount) };
      })
    : [];
  if (ui.expenseScrollToPaymentId) {
    const pid = String(ui.expenseScrollToPaymentId);
    if (ui.expenseEditorPayments.some((p) => String(p.id || "") === pid)) ui.expenseFocusPaymentId = pid;
  }
  if (!ui.expenseFocusPaymentId && ui.expenseScrollToPaymentDateISO) ui.expenseFocusPaymentDateISO = String(ui.expenseScrollToPaymentDateISO);

  const firstPayment = (ui.expenseEditorPayments || []).find((p) => asNumber(p.amount) > 0 && p.year && p.month && p.day);
  const parts = firstPayment ? { y: Number(firstPayment.year), d: Number(firstPayment.day) } : null;
  ui.expenseDefaults = ui.expenseDefaults || { year: currentYearMonth().year, day: 25, amount: 0 };
  ui.expenseDefaults.year = parts?.y || ui.expenseDefaults.year;
  ui.expenseDefaults.day = parts?.d || ui.expenseDefaults.day;
  ui.expenseDefaults.amount = firstPayment ? asNumber(firstPayment.amount) : ui.expenseDefaults.amount;
  setYear3Options(requireEl("expenseDefaultYear"), ui.expenseDefaults.year);
  setDayOptions(requireEl("expenseDefaultDay"), ui.expenseDefaults.day);
  requireEl("expenseDefaultAmount").value = asNumber(ui.expenseDefaults.amount);

  renderExpensePaymentsEditorRows();

  backdrop.hidden = false;
  modal.hidden = false;
  document.documentElement.classList.add("modal-open");
  document.body.classList.add("modal-open");
  if (ui.expenseScrollToPaymentId || ui.expenseScrollToPaymentDateISO) {
    requestAnimationFrame(() => {
      scrollToExpensePaymentRow({
        paymentId: ui.expenseFocusPaymentId || ui.expenseScrollToPaymentId,
        dateISO: ui.expenseFocusPaymentDateISO || ui.expenseScrollToPaymentDateISO
      });
      ui.expenseScrollToPaymentId = null;
      ui.expenseScrollToPaymentDateISO = null;
    });
  }
}

function closeExpenseOverlay() {
  ui.editExpenseId = null;
  ui.expenseEditorPayments = null;
  ui.expenseFocusPaymentId = null;
  ui.expenseFocusPaymentDateISO = null;
  hideErrorSummaryById("expenseErrorSummary");
  requireEl("expenseModalBackdrop").hidden = true;
  requireEl("expenseModal").hidden = true;
  delete requireEl("expenseModal").dataset.mode;
  document.documentElement.classList.remove("modal-open");
  document.body.classList.remove("modal-open");
}

function showConfirmDeleteExpenseModal() {
  requireEl("confirmDeleteExpenseBackdrop").hidden = false;
  requireEl("confirmDeleteExpenseModal").hidden = false;
}
function hideConfirmDeleteExpenseModal() {
  requireEl("confirmDeleteExpenseBackdrop").hidden = true;
  requireEl("confirmDeleteExpenseModal").hidden = true;
}

/** Escape + backdrop: samma mönster för intäkts- och utgiftsredigerare (och deras radera-dialoger). */
function initBudgetEditorModalDismiss() {
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      if (periodSheetOpen || listPickerOpen || dateSheetOpen) return;
      const foodOverlay = document.querySelector('.exp-overlay[data-expview="food"]');
      const foodPanelOpen =
        foodOverlay &&
        !foodOverlay.hidden &&
        Array.from(foodOverlay.querySelectorAll(".food-mat-panel")).some((p) => !p.hidden);
      if (foodPanelOpen) return;

      const incDel = document.getElementById("confirmDeleteIncomeModal");
      if (incDel && !incDel.hidden) {
        e.preventDefault();
        hideConfirmDeleteIncomeModal();
        return;
      }
      const expDel = document.getElementById("confirmDeleteExpenseModal");
      if (expDel && !expDel.hidden) {
        e.preventDefault();
        hideConfirmDeleteExpenseModal();
        return;
      }
      const incomeM = document.getElementById("incomeModal");
      if (incomeM && !incomeM.hidden) {
        e.preventDefault();
        closeIncomeOverlay();
        return;
      }
      const expenseM = document.getElementById("expenseModal");
      if (expenseM && !expenseM.hidden) {
        e.preventDefault();
        closeExpenseOverlay();
        return;
      }
    },
    true
  );

  document.getElementById("incomeModalBackdrop")?.addEventListener("click", () => {
    if (!document.getElementById("incomeModal")?.hidden) closeIncomeOverlay();
  });
  document.getElementById("expenseModalBackdrop")?.addEventListener("click", () => {
    if (!document.getElementById("expenseModal")?.hidden) closeExpenseOverlay();
  });
  document.getElementById("confirmDeleteIncomeBackdrop")?.addEventListener("click", () => {
    if (!document.getElementById("confirmDeleteIncomeModal")?.hidden) hideConfirmDeleteIncomeModal();
  });
  document.getElementById("confirmDeleteExpenseBackdrop")?.addEventListener("click", () => {
    if (!document.getElementById("confirmDeleteExpenseModal")?.hidden) hideConfirmDeleteExpenseModal();
  });
}

function renderExpensePaymentsEditorRows() {
  const interval = requireEl("expenseIntervalSelect").value || "once";
  const count = paymentsCountForInterval(interval);
  if (!Array.isArray(ui.expenseEditorPayments)) ui.expenseEditorPayments = [];
  while (ui.expenseEditorPayments.length < count) ui.expenseEditorPayments.push({ id: uid(), year: "", month: "", day: "", amount: 0, date: "" });
  if (ui.expenseEditorPayments.length > count) ui.expenseEditorPayments = ui.expenseEditorPayments.slice(0, count);
  const body = requireEl("expensePaymentsEditorBody");
  body.innerHTML = "";
  ui.expenseEditorPayments.forEach((p, idx) => {
    const y = parseIntOrNull(p.year);
    const m = parseIntOrNull(p.month);
    const d = parseIntOrNull(p.day);
    const rowISO = y !== null && m !== null && d !== null ? `${y}-${pad2(m)}-${pad2(d)}` : "";
    const tr = document.createElement("tr");
    tr.setAttribute("data-exp-editor-row", String(idx));
    tr.setAttribute("data-exp-payment-id", String(p.id || ""));
    tr.setAttribute("data-exp-payment-date", rowISO);
    const idMatch = ui.expenseFocusPaymentId && String(p.id || "") === String(ui.expenseFocusPaymentId);
    const dateMatch = ui.expenseFocusPaymentDateISO && rowISO === String(ui.expenseFocusPaymentDateISO);
    if (idMatch || (!ui.expenseFocusPaymentId && dateMatch)) tr.classList.add("row-focused");
    tr.innerHTML = `
      <td><input class="tight" inputmode="numeric" type="number" step="1" data-exp-pay-year="${idx}" placeholder="2026" value="${escapeHtml(p.year ?? "")}" /></td>
      <td><input class="tight" inputmode="numeric" type="text" maxlength="2" data-exp-pay-month="${idx}" placeholder="01-12" value="${escapeHtml(p.month ?? "")}" /></td>
      <td><input class="tight" inputmode="numeric" type="number" step="1" data-exp-pay-day="${idx}" placeholder="1-31" value="${escapeHtml(p.day ?? "")}" /></td>
      <td class="right"><input type="number" inputmode="decimal" min="0" step="1" class="tight" data-exp-pay-amt="${idx}" placeholder="0" value="${escapeHtml(
        asNumber(p.amount)
      )}" /></td>
    `;
    body.appendChild(tr);
    const errTr = document.createElement("tr");
    errTr.innerHTML = `<td colspan="4"><div class="field-error" data-exp-pay-err="${idx}"></div></td>`;
    body.appendChild(errTr);
  });
  const update = (idx) => {
    const row = ui.expenseEditorPayments[idx];
    const res = validateIncomePaymentParts(row);
    const err = document.querySelector(`[data-exp-pay-err="${idx}"]`);
    const show = asNumber(row.amount) > 0;
    if (err) err.textContent = show && !res.ok ? res.message : "";
    ["year", "month", "day"].forEach((k) => {
      const el = document.querySelector(`[data-exp-pay-${k}="${idx}"]`);
      if (!el) return;
      const invalid = show && !res.ok;
      el.classList.toggle("input-invalid", invalid);
      el.setAttribute("aria-invalid", invalid ? "true" : "false");
    });
  };
  document.querySelectorAll("[data-exp-pay-year]").forEach((el) => {
    const idx = Number(el.getAttribute("data-exp-pay-year"));
    el.oninput = () => {
      ui.expenseEditorPayments[idx].year = el.value;
      update(idx);
    };
    update(idx);
  });
  document.querySelectorAll("[data-exp-pay-month]").forEach((el) => {
    const idx = Number(el.getAttribute("data-exp-pay-month"));
    el.oninput = () => {
      ui.expenseEditorPayments[idx].month = el.value;
      update(idx);
    };
  });
  document.querySelectorAll("[data-exp-pay-day]").forEach((el) => {
    const idx = Number(el.getAttribute("data-exp-pay-day"));
    el.oninput = () => {
      ui.expenseEditorPayments[idx].day = el.value;
      update(idx);
    };
  });
  document.querySelectorAll("[data-exp-pay-amt]").forEach((el) => {
    const idx = Number(el.getAttribute("data-exp-pay-amt"));
    el.oninput = () => {
      ui.expenseEditorPayments[idx].amount = asNumber(el.value);
      update(idx);
    };
  });
}

function scrollToExpensePaymentRow({ paymentId, dateISO }) {
  const body = requireEl("expensePaymentsEditorBody");
  let target = null;
  if (paymentId) {
    target = Array.from(body.querySelectorAll("[data-exp-payment-id]")).find((el) => el.getAttribute("data-exp-payment-id") === String(paymentId));
  }
  if (!target && dateISO) {
    target = Array.from(body.querySelectorAll("[data-exp-payment-date]")).find((el) => el.getAttribute("data-exp-payment-date") === String(dateISO));
  }
  if (!target) return;
  target.classList.add("row-highlight");
  const container = document.querySelector("#expenseModal .modal-body");
  if (container) {
    const cRect = container.getBoundingClientRect();
    const rRect = target.getBoundingClientRect();
    const top = container.scrollTop + (rRect.top - cRect.top) - 80;
    container.scrollTo({ top, behavior: "smooth" });
  }
  const amountInput = target.querySelector("[data-exp-pay-amt]");
  if (amountInput) amountInput.focus({ preventScroll: true });
  setTimeout(() => target.classList.remove("row-highlight"), 1600);
}

function saveExpenseFromOverlay() {
  if (!ui.editExpenseId) return;
  const name = (requireEl("expenseNameInput").value || "").trim();
  const interval = requireEl("expenseIntervalSelect").value || "once";
  const note = requireEl("expenseEditorNote");
  const summaryEl = document.getElementById("expenseErrorSummary");
  if (summaryEl) hideErrorSummaryByEl(summaryEl);

  if (!name) {
    note.textContent = "";
    renderErrorSummary(summaryEl, [{ label: "Ange namn på utgift.", jumpId: "expenseNameInput" }]);
    return;
  }
  const payments = (ui.expenseEditorPayments || []).map((p) => ({ id: p.id || uid(), year: p.year, month: p.month, day: p.day, amount: asNumber(p.amount) }));
  const errors = [];
  payments.forEach((p, idx) => {
    if (asNumber(p.amount) <= 0) return;
    const res = validateIncomePaymentParts(p);
    if (!res.ok) {
      const jump = paymentErrorJump({ idx, msg: res.message, kindPrefix: "exp" });
      errors.push({ label: jump.label, jumpSelector: jump.jumpSelector });
    }
  });
  if (errors.length > 0) {
    note.textContent = "";
    renderErrorSummary(summaryEl, errors);
    return;
  }
  const stored = payments.map((p) => {
    const y = parseIntOrNull(p.year);
    const m = parseIntOrNull(p.month);
    const d = parseIntOrNull(p.day);
    const amt = asNumber(p.amount);
    const valid = y !== null && m !== null && d !== null && isAllowedYear(y) && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
    return { id: p.id, date: valid ? `${y}-${pad2(m)}-${pad2(d)}` : "", amount: amt };
  });
  const idx = (state.expenses || []).findIndex((x) => x.id === ui.editExpenseId);
  if (idx >= 0) {
    state.expenses[idx] = canonicalizeExpenseRecord({ ...state.expenses[idx], name, interval, payments: stored, id: state.expenses[idx].id });
  }
  saveState();
  closeExpenseOverlay();
  renderExpensesList();
  renderOverviewIfOnOverview();
}

function renderExpensesPage(opts = {}) {
  const openSavings = opts.openSavingsOverlay === true;
  const subEl = document.getElementById("headerSubtitle");
  if (subEl) subEl.textContent = openSavings ? "Spar" : "Utgifter";
  ui.expensesYear = ui.expensesYear || ui.overviewYear || currentYearMonth().year;

  // Ensure overlays start hidden
  document.querySelectorAll(".exp-overlay").forEach((el) => {
    if (el.hidden !== true) el.hidden = true;
  });

  document.querySelectorAll("[data-exp-overlay]").forEach((btn) => {
    btn.onclick = () => {
      const key = btn.getAttribute("data-exp-overlay");
      openExpenseCategoryOverlay(key);
    };
  });

  document.querySelectorAll("[data-exp-close]").forEach((btn) => {
    btn.onclick = () => closeExpenseCategoryOverlayFromUi();
  });

  renderExpensesSummaryPage();
  if (openSavings) {
    openExpenseCategoryOverlay("savings", { skipHistory: true });
  }
}

function openExpenseCategoryOverlay(key, opts = {}) {
  const skipHistory = opts.skipHistory === true;
  const map = {
    home: renderHomePage,
    loans: renderLoansPage,
    car: renderCarPage,
    food: renderFoodPage,
    children: renderChildrenPage,
    savings: renderSavingsPage
  };
  if (map[key]) map[key]();
  const target = document.querySelector(`[data-expview="${key}"]`);
  if (!target) return;
  const wasAnyOpen = anyExpenseOverlayOpen();
  target.hidden = false;
  document.documentElement.classList.add("modal-open");
  document.body.classList.add("modal-open");
  if (!skipHistory && !wasAnyOpen) {
    history.pushState({ expOverlay: true, key }, "");
    expenseOverlayHistoryDepth += 1;
  }
}

function closeExpenseCategoryOverlay(opts = { fromHistory: false }) {
  resetFoodMatSubPanelsWhenFoodOverlayCloses();
  document.querySelectorAll(".exp-overlay").forEach((el) => (el.hidden = true));
  closeLoanEditor();
  hideConfirmDeleteLoanModal();
  for (const k of TAGGED_CATEGORY_KEYS) {
    ui.tagged[k].editorOpen = false;
    ui.tagged[k].editingId = null;
  }
  document.documentElement.classList.remove("modal-open");
  document.body.classList.remove("modal-open");
  if (!opts?.fromHistory && expenseOverlayHistoryDepth > 0) {
    // Close initiated by UI: keep browser back consistent.
    expenseOverlayHistoryDepth = Math.max(0, expenseOverlayHistoryDepth - 1);
  }
}

function renderLoansPage() {
  const mount = document.getElementById("loansListMount");
  if (!mount) return;
  if (!ui.loanEditorOpen) hideErrorSummaryById("loanErrorSummary");
  const loanAddBtn = document.getElementById("loanAddNewBtn");
  if (loanAddBtn) {
    loanAddBtn.disabled = Boolean(ui.loanEditorOpen);
    loanAddBtn.setAttribute("aria-disabled", ui.loanEditorOpen ? "true" : "false");
  }

  const endKey = (loan) => {
    const ed = loan.endDate ? datePartsFromIso(String(loan.endDate)) : null;
    return ed ? ymValue(ed.y, ed.m) : null;
  };
  const loans = getAllLoans().slice().sort((a, b) => {
    const byExactName = (a.name || "").localeCompare(b.name || "", "sv");
    if (byExactName !== 0) return byExactName;
    const ae = endKey(a);
    const be = endKey(b);
    if (ae === null && be === null) return 0;
    if (ae === null) return 1;
    if (be === null) return -1;
    return ae - be;
  });
  mount.innerHTML = "";
  const editorBusy = Boolean(ui.loanEditorOpen);
  if (loans.length === 0) {
    mount.innerHTML = `<div class="tagged-expense-list-empty">Inga lån ännu.</div>`;
  } else {
    for (const loan of loans) {
      const displayName = loan.name || "Lån";
      const displayBank = String(loan.bank || "").trim();
      const amt = getLoanTotalPayment(loan);
      const hasEnd = Boolean(loan.endDate);
      const lastPaymentDate = hasEnd ? String(loan.endDate) : "";
      const line2Parts = [];
      if (displayBank) line2Parts.push(displayBank);
      if (hasEnd) line2Parts.push(`Sista betalning: ${lastPaymentDate}`);
      const line2 = line2Parts.length > 0 ? line2Parts.join(" · ") : "—";
      const row = document.createElement("div");
      row.className = "tagged-expense-preview-row";
      const dis = editorBusy ? "disabled" : "";
      const ariaDis = editorBusy ? "true" : "false";
      row.innerHTML = `
        <button type="button" class="tagged-expense-row-btn" data-loan-edit-id="${escapeHtml(loan.id)}" aria-label="Redigera lån" ${dis} aria-disabled="${ariaDis}">
          <span class="tagged-expense-row-btn-main">
            <span class="tagged-expense-row-line1">
              <span class="tagged-expense-name">${escapeHtml(displayName)}</span>
              <span class="tagged-expense-amt">${escapeHtml(formatKr(amt))}</span>
            </span>
            <span class="tagged-expense-row-line2">${escapeHtml(line2)}</span>
          </span>
          <span class="tagged-expense-row-chev" aria-hidden="true">${LIST_ROW_CHEVRON_SVG}</span>
        </button>
      `;
      mount.appendChild(row);
    }
  }

  mount.onclick = (e) => {
    if (ui.loanEditorOpen) return;
    const btn = e.target.closest(".tagged-expense-row-btn[data-loan-edit-id]");
    if (!btn) return;
    const id = btn.getAttribute("data-loan-edit-id");
    if (!id) return;
    openLoanEditor(id);
  };

  const editor = document.getElementById("loanEditorSection");
  if (editor) editor.hidden = !ui.loanEditorOpen;
  updateLoanDerivedFields();
  applyLoanOverlayDateBounds();
}

function updateLoanDerivedFields() {
  const draft = {
    principal: parseKrLikeList(document.getElementById("loanPrincipal")?.value),
    rate: asNumber(document.getElementById("loanRate")?.value),
    amortization: parseKrLikeList(document.getElementById("loanAmortization")?.value)
  };
  const interest = getLoanInterestAmount(draft);
  const total = interest + asNumber(draft.amortization);
  const interestEl = document.getElementById("loanInterestAmount");
  const totalEl = document.getElementById("loanTotalPayment");
  if (interestEl) interestEl.textContent = `Räntebelopp: ${formatKr(interest)}`;
  if (totalEl) totalEl.textContent = `Månadskostnad: ${formatKr(total)}`;
}

function getLoanDraftFromInputs() {
  const firstIso = (document.getElementById("loanFirstDate")?.value || "").trim();
  const endIso = (document.getElementById("loanEndDate")?.value || "").trim();
  const fp = datePartsFromIso(firstIso);
  const ep = endIso ? datePartsFromIso(endIso) : null;
  return {
    id: ui.editLoanId || uid(),
    name: String(document.getElementById("loanNameInput")?.value || "").trim(),
    bank: String(document.getElementById("loanBankInput")?.value || "").trim(),
    principal: parseKrLikeList(document.getElementById("loanPrincipal")?.value),
    rate: asNumber(document.getElementById("loanRate")?.value),
    amortization: parseKrLikeList(document.getElementById("loanAmortization")?.value),
    firstPaymentDate: fp ? `${fp.y}-${pad2(fp.m)}-${pad2(fp.d)}` : "",
    endDate: ep ? `${ep.y}-${pad2(ep.m)}-${pad2(ep.d)}` : null
  };
}

function renderLoanDateInlineError() {
  const el = document.getElementById("loanDateError");
  if (!el) return true;
  const msg = validateLoanDateRange(getLoanDraftFromInputs());
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    return true;
  }
  el.hidden = false;
  el.textContent = msg;
  return false;
}

function openLoanEditor(loanId = null) {
  const existing = loanId ? getAllLoans().find((x) => x.id === loanId) : null;
  ui.editLoanId = existing?.id || null;
  ui.loanEditorOpen = true;
  const editor = document.getElementById("loanEditorSection");
  if (editor) editor.hidden = false;
  const loanLeg = document.getElementById("loanEditorPanelLegend");
  const loanPanel = document.querySelector(".loan-editor-panel");
  if (loanLeg) loanLeg.textContent = existing ? "Redigera lån" : "Lägg till lån";
  if (loanPanel) loanPanel.setAttribute("aria-label", existing ? "Redigera lån" : "Lägg till lån");
  document.getElementById("loanNameInput").value = existing?.name || "";
  document.getElementById("loanBankInput").value = existing?.bank || "";
  document.getElementById("loanPrincipal").value =
    existing && asNumber(existing.principal) > 0 ? formatKrLikeList(asNumber(existing.principal)) : "";
  document.getElementById("loanRate").value =
    existing && existing.rate !== undefined && existing.rate !== null && String(existing.rate).trim() !== ""
      ? String(asNumber(existing.rate))
      : "";
  document.getElementById("loanAmortization").value =
    existing && asNumber(existing.amortization) > 0 ? formatKrLikeList(asNumber(existing.amortization)) : "";
  const firstInp = document.getElementById("loanFirstDate");
  const endInp = document.getElementById("loanEndDate");
  if (firstInp) {
    firstInp.value = existing?.firstPaymentDate && datePartsFromIso(String(existing.firstPaymentDate)) ? String(existing.firstPaymentDate) : "";
  }
  if (endInp) {
    endInp.value = existing?.endDate && datePartsFromIso(String(existing.endDate)) ? String(existing.endDate) : "";
  }
  applyLoanOverlayDateBounds();
  if (firstInp) {
    syncDateFieldRow(firstInp);
    applyDateFieldRowTabState(firstInp);
  }
  if (endInp) {
    syncDateFieldRow(endInp);
    applyDateFieldRowTabState(endInp);
  }
  const deleteBtn = document.getElementById("loanDeleteBtn");
  if (deleteBtn) deleteBtn.hidden = !existing;
  document.getElementById("loanDateError").hidden = true;
  document.getElementById("loanDateError").textContent = "";
  hideErrorSummaryById("loanErrorSummary");
  // Visa inte "Ange betaldatum" direkt vid nytt lån — validera vid datumändring eller Spara.
  if (existing) renderLoanDateInlineError();
  updateLoanDerivedFields();
  requestAnimationFrame(() => {
    const overlay = document.querySelector('[data-expview="loans"]');
    if (overlay && typeof overlay.scrollTo === "function") overlay.scrollTo({ top: 0, behavior: "smooth" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function closeLoanEditor() {
  ui.loanEditorOpen = false;
  ui.editLoanId = null;
  const editor = document.getElementById("loanEditorSection");
  if (editor) editor.hidden = true;
  hideErrorSummaryById("loanErrorSummary");
  document.getElementById("loanNameInput").value = "";
  document.getElementById("loanBankInput").value = "";
  document.getElementById("loanPrincipal").value = "";
  document.getElementById("loanRate").value = "";
  document.getElementById("loanAmortization").value = "";
  const firstClear = document.getElementById("loanFirstDate");
  const endClear = document.getElementById("loanEndDate");
  if (firstClear) firstClear.value = "";
  if (endClear) endClear.value = "";
  applyLoanOverlayDateBounds();
  if (firstClear) {
    syncDateFieldRow(firstClear);
    applyDateFieldRowTabState(firstClear);
  }
  if (endClear) {
    syncDateFieldRow(endClear);
    applyDateFieldRowTabState(endClear);
  }
  const deleteBtn = document.getElementById("loanDeleteBtn");
  if (deleteBtn) deleteBtn.hidden = true;
  document.getElementById("loanDateError").hidden = true;
  document.getElementById("loanDateError").textContent = "";
  updateLoanDerivedFields();
}

function showConfirmDeleteLoanModal() {
  requireEl("confirmDeleteLoanBackdrop").hidden = false;
  requireEl("confirmDeleteLoanModal").hidden = false;
}

function hideConfirmDeleteLoanModal() {
  requireEl("confirmDeleteLoanBackdrop").hidden = true;
  requireEl("confirmDeleteLoanModal").hidden = true;
}

function initActions() {
  // CAR
  const wireTaggedCategoryActions = (cat) => {
    const C = TAGGED_CATEGORY_CONFIG[cat];
    if (!C) return;
    const ids = C.ids;
    const u = ui.tagged[cat];
    const addBtn = document.getElementById(ids.addBtn);
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        u.editingId = null;
        u.editorOpen = true;
        if (cat === "car") renderCarPage();
        else if (cat === "home") renderHomePage();
        else if (cat === "children") renderChildrenPage();
        else if (cat === "savings") renderSavingsPage();
        const editorCard = document.getElementById(ids.editorCard);
        if (editorCard) editorCard.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    const saveBtn = document.getElementById(ids.saveBtn);
    if (saveBtn) saveBtn.addEventListener("click", () => saveTaggedCategoryFromEditor(cat));
    const delBtn = document.getElementById(ids.deleteBtn);
    if (delBtn) delBtn.addEventListener("click", () => deleteTaggedCategoryFromEditor(cat));
    const cancelBtn = document.getElementById(ids.cancelBtn);
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        u.editorOpen = false;
        u.editingId = null;
        const note = document.getElementById(ids.note);
        if (note) note.textContent = "";
        clearTaggedEditorInlineErrors(cat);
        if (cat === "car") renderCarPage();
        else if (cat === "home") renderHomePage();
        else if (cat === "children") renderChildrenPage();
        else if (cat === "savings") renderSavingsPage();
      });
    }
  };
  wireTaggedCategoryActions("car");
  wireTaggedCategoryActions("home");
  wireTaggedCategoryActions("children");
  wireTaggedCategoryActions("savings");

  // FOOD
  document.getElementById("foodSaveBtn").addEventListener("click", () => {
    const appYears = getSelectableAppYears();
    const cfg = ui.foodConfigDraft ? (() => {
      const { _custodyHhSnapGlobal: _cg, _custodyHhSnap: _cs, ...rest } = ui.foodConfigDraft;
      const custodyPeriods = (rest.custodyPeriods || []).map(normalizeCustodyPeriodEntry).filter((p) => p.startDate && String(p.startDate).trim());
      return {
        ...rest,
        household: { ...rest.household },
        custodyPeriods,
        custodySchedule: normalizeCustodySchedule({ type: "off" }),
        foodBudgetYear: currentYearMonth().year
      };
    })() : getSharedFoodConfig();
    const totalPeople = asNumber(cfg.household?.adults) + asNumber(cfg.household?.teens) + asNumber(cfg.household?.children);
    if (cfg.mode !== "manual" && totalPeople <= 0) {
      const msg = "Lägg till minst 1 person i hushållet eller välj manuell inmatning.";
      document.getElementById("foodNote").textContent = msg;
      renderErrorSummary(document.getElementById("foodErrorSummary"), [{ label: msg, jumpId: "foodAdultsInput" }]);
      return;
    }
    // basic date validation for household changes / deviations
    if ((cfg.householdChanges || []).some(isBadHouseholdChangeDateRange)) {
      const msg =
        "Ändrat hushåll: kontrollera datum (start krävs; slut ska vara samma eller efter start, eller lämna slut tomt för tillsvidare).";
      document.getElementById("foodNote").textContent = msg;
      renderErrorSummary(document.getElementById("foodErrorSummary"), [{ label: msg, jumpId: "foodHouseholdChangesSection" }]);
      return;
    }
    if ((cfg.deviations || []).some(isBadDeviationDateRange)) {
      const msg =
        "Avvikande kostnad: kontrollera datum (start krävs; slut ska vara samma eller efter start, eller lämna slut tomt för tillsvidare).";
      document.getElementById("foodNote").textContent = msg;
      renderErrorSummary(document.getElementById("foodErrorSummary"), [{ label: msg, jumpId: "foodDeviationsSection" }]);
      return;
    }
    const custodyForSave = cfg.custodyPeriods || [];
    const custodyAccSave = buildCustodyPeriodAcceptance(custodyForSave, 0);
    if (custodyAccSave.shadowedOrigIndices.size > 0) {
      const msg = "Växelvis boende: justera överlappande perioder innan du sparar.";
      document.getElementById("foodNote").textContent = msg;
      renderErrorSummary(document.getElementById("foodErrorSummary"), [{ label: msg, jumpId: "foodCustodyPeriodsList" }]);
      openFoodMatSubPanel("custody");
      return;
    }
    const baseChildren = Math.max(0, Math.floor(asNumber(cfg.household?.children)));
    const baseTeens = Math.max(0, Math.floor(asNumber(cfg.household?.teens)));
    for (const p of custodyForSave) {
      const n = normalizeCustodyPeriodEntry(p);
      if (!n.startDate || !String(n.startDate).trim()) continue;
      if (!custodyPeriodEndDateValid(n)) {
        const msg = "Växelvis: slutdatum måste vara minst en dag efter start, eller lämna slut tomt.";
        document.getElementById("foodNote").textContent = msg;
        renderErrorSummary(document.getElementById("foodErrorSummary"), [{ label: msg, jumpId: "foodCustodyPeriodsList" }]);
        return;
      }
      if (n.absent.children > baseChildren || n.absent.teens > baseTeens) {
        const msg = "Växelvis: för många barn/tonåringar markerade som borta.";
        document.getElementById("foodNote").textContent = msg;
        renderErrorSummary(document.getElementById("foodErrorSummary"), [{ label: msg, jumpId: "foodKidsSection" }]);
        return;
      }
    }

    const planningDay = Math.max(1, Math.min(7, Math.floor(asNumber(state.settings.foodPlanningWeekday || 1))));
    const weeks = [];
    for (const foodYear of appYears) {
      for (const w of getIsoWeeksForYear(foodYear)) {
        const planningDate = addDays(w.weekStart, planningDay - 1);
        const { amount, labels } = computeFoodWeekAmountAndLabels(cfg, w.weekStart, w.weekEnd);
        weeks.push({
          isoYear: w.isoYear,
          weekNumber: w.week,
          weekStart: isoFromDate(w.weekStart),
          weekEnd: isoFromDate(w.weekEnd),
          planningDate: isoFromDate(planningDate),
          amount,
          labels,
          expenseFoodYear: foodYear
        });
      }
    }

    state.expenses = (state.expenses || []).filter((exp) => !isGeneratedMatExpenseInSelectableWindow(exp));

    for (const wk of weeks) {
      const id = uid();
      state.expenses.push(
        canonicalizeExpenseRecord({
          id,
          name: `Mat v.${wk.weekNumber}`,
          category: "food",
          interval: "once",
          origin: "system",
          metadata: {
            food: {
              generated: true,
              year: Number(wk.expenseFoodYear),
              weekKey: `${wk.isoYear}-W${pad2(wk.weekNumber)}`,
              planningDate: wk.planningDate,
              labels: wk.labels
            }
          },
          payments: [{ id: uid(), date: wk.planningDate, amount: wk.amount }]
        })
      );
    }

    setSharedFoodModel(cfg, weeks);
    saveState();
    const foodNoteOk = document.getElementById("foodNote");
    if (foodNoteOk) foodNoteOk.textContent = "";
    renderOverviewIfOnOverview();
    renderExpensesList();
    renderFoodPage();
    closeExpenseCategoryOverlayFromUi();
  });

  // LOANS
  document.getElementById("loanAddNewBtn").addEventListener("click", () => openLoanEditor(null));
  document.getElementById("loanDeleteBtn").addEventListener("click", () => {
    if (!ui.editLoanId) return;
    showConfirmDeleteLoanModal();
  });
  document.getElementById("loanEditorCancelBtn").addEventListener("click", () => closeLoanEditor());
  requireEl("closeDeleteLoanModalBtn").onclick = hideConfirmDeleteLoanModal;
  requireEl("cancelDeleteLoanBtn").onclick = hideConfirmDeleteLoanModal;
  requireEl("confirmDeleteLoanBtn").onclick = () => {
    if (!ui.editLoanId) return hideConfirmDeleteLoanModal();
    const loans = getAllLoans().filter((x) => x.id !== ui.editLoanId);
    persistAllLoans(loans);
    saveState();
    hideConfirmDeleteLoanModal();
    closeLoanEditor();
    document.getElementById("loanNote").textContent = "Lån borttaget.";
    renderLoansPage();
    renderExpensesList();
    renderOverviewIfOnOverview();
  };
  ["loanPrincipal", "loanRate", "loanAmortization"].forEach((id) => {
    document.getElementById(id).addEventListener("input", updateLoanDerivedFields);
  });
  ["loanFirstDate", "loanEndDate"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", renderLoanDateInlineError);
    el.addEventListener("input", renderLoanDateInlineError);
  });
  wireKrAmountInput("loanPrincipal");
  wireKrAmountInput("loanAmortization");
  document.getElementById("loanSaveBtn").addEventListener("click", () => {
    const loans = getAllLoans();
    const draft = getLoanDraftFromInputs();
    if (!draft.name) {
      const summaryEl = document.getElementById("loanErrorSummary");
      if (summaryEl) {
        renderErrorSummary(summaryEl, [{ label: "Ange namn.", jumpId: "loanNameInput" }]);
      }
      document.getElementById("loanNote").textContent = "";
      return;
    }
    const firstIsoCheck = (document.getElementById("loanFirstDate")?.value || "").trim();
    const fpc = datePartsFromIso(firstIsoCheck);
    if (fpc && !isAllowedYear(fpc.y)) {
      const summaryEl = document.getElementById("loanErrorSummary");
      if (summaryEl) {
        renderErrorSummary(summaryEl, [
          {
            label: "Datum måste ligga inom appens årsspann (föregående, nuvarande, nästa år).",
            jumpId: "loanFirstDate"
          }
        ]);
      }
      document.getElementById("loanNote").textContent = "";
      return;
    }
    const endIsoCheck = (document.getElementById("loanEndDate")?.value || "").trim();
    const epc = endIsoCheck ? datePartsFromIso(endIsoCheck) : null;
    if (epc && !isAllowedYear(epc.y)) {
      const summaryEl = document.getElementById("loanErrorSummary");
      if (summaryEl) {
        renderErrorSummary(summaryEl, [
          {
            label: "Datum måste ligga inom appens årsspann (föregående, nuvarande, nästa år).",
            jumpId: "loanEndDate"
          }
        ]);
      }
      document.getElementById("loanNote").textContent = "";
      return;
    }
    const loanDateOk = renderLoanDateInlineError();
    if (!loanDateOk) {
      const summaryEl = document.getElementById("loanErrorSummary");
      const msg = validateLoanDateRange(draft) || document.getElementById("loanDateError")?.textContent || "Kontrollera datum.";
      const lower = msg.toLowerCase();
      const jumpId = lower.includes("gäller") || lower.includes("slut") || lower.includes("samma") ? "loanEndDate" : "loanFirstDate";
      if (summaryEl) renderErrorSummary(summaryEl, [{ label: msg, jumpId }]);
      document.getElementById("loanNote").textContent = "";
      return;
    }
    const idx = loans.findIndex((x) => x.id === draft.id);
    if (idx >= 0) loans[idx] = draft;
    else loans.push(draft);
    persistAllLoans(loans);
    saveState();
    document.getElementById("loanNote").textContent = "Lån sparat.";
    closeLoanEditor();
    renderLoansPage();
    renderExpensesList();
    renderOverviewIfOnOverview();
  });

  // Inkomster hanteras nu via overlay i Intäkter-vyn.
  requireEl("incomeDeleteBtn").onclick = () => {
    if (!ui.editIncomeId) return;
    showConfirmDeleteIncomeModal();
  };

  requireEl("closeDeleteIncomeModalBtn").onclick = hideConfirmDeleteIncomeModal;
  requireEl("cancelDeleteIncomeBtn").onclick = hideConfirmDeleteIncomeModal;
  requireEl("confirmDeleteIncomeBtn").onclick = () => {
    if (!ui.editIncomeId) {
      hideConfirmDeleteIncomeModal();
      return;
    }
    state.incomes = (state.incomes || []).filter((x) => x.id !== ui.editIncomeId);
    saveState();
    hideConfirmDeleteIncomeModal();
    closeIncomeOverlay();
    renderIncomesList();
    renderOverviewIfOnOverview();
  };

  document.getElementById("saveSettingsBtn").addEventListener("click", () => {
    state.settings.backupIntervalDays = Math.max(1, Math.floor(asNumber(document.getElementById("backupIntervalDays").value)));
    const pat = document.getElementById("backupFilenamePattern").value || "";
    state.settings.backupFilenamePattern = pat.trim();
    const fd = document.getElementById("foodPlanningWeekday");
    if (fd) state.settings.foodPlanningWeekday = Math.max(1, Math.min(7, Math.floor(asNumber(fd.value || 1))));
    saveState();
    document.getElementById("backupRestoreNote").textContent = "Inställningar sparade.";
  });

  // Backup modal
  const backdrop = document.getElementById("backupModalBackdrop");
  const modal = document.getElementById("backupModal");
  const modalTitle = document.getElementById("backupModalTitle");
  const modalText = document.getElementById("backupModalText");
  const closeBtn = document.getElementById("closeBackupModalBtn");
  const laterBtn = document.getElementById("backupLaterBtn");
  const exportBtn = document.getElementById("backupExportModalBtn");

  function showModal(text) {
    modalTitle.textContent = "Backup rekommenderas";
    modalText.textContent = text;
    backdrop.hidden = false;
    modal.hidden = false;
    document.documentElement.classList.add("modal-open");
    document.body.classList.add("modal-open");
  }
  function hideModal() {
    backdrop.hidden = true;
    modal.hidden = true;
    document.documentElement.classList.remove("modal-open");
    document.body.classList.remove("modal-open");
  }
  closeBtn.addEventListener("click", hideModal);
  laterBtn.addEventListener("click", () => {
    state.settings.lastBackupPromptAt = nowMs();
    saveState();
    hideModal();
  });
  exportBtn.addEventListener("click", () => {
    hideModal();
    doExportJson("backup");
  });

  document.getElementById("backupNowBtn").addEventListener("click", () => doExportJson("manual"));

  // Restore import
  document.getElementById("restoreBtn").addEventListener("click", async () => {
    const input = document.getElementById("backupRestoreInput");
    const file = input.files && input.files[0];
    if (!file) {
      document.getElementById("backupRestoreNote").textContent = "Välj en JSON-fil att importera.";
      return;
    }
    const text = await file.text();
    const parsed = safeParseJson(text);
    if (!parsed || parsed.version !== 1) {
      document.getElementById("backupRestoreNote").textContent = "Filen verkar inte vara en giltig Björklunds-budget-backup.";
      return;
    }
    state = normalizeStateShape(parsed);
    saveState();
    document.getElementById("backupRestoreNote").textContent = "Import klar. Laddar om...";
    setTimeout(() => location.reload(), 600);
  });

  function getFilenameForBackup(kind) {
    const pattern = state.settings.backupFilenamePattern || "bjorklunds_budget_{YYYY}-{MM}.json";
    const d = new Date();
    const y = d.getFullYear();
    const mo = pad2(d.getMonth() + 1);
    const fn = pattern
      .replaceAll("{YYYY}", String(y))
      .replaceAll("{MM}", mo)
      .replaceAll("{KIND}", kind);
    return fn;
  }

  function doExportJson(kind) {
    const filename = getFilenameForBackup(kind);
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Make functions reachable
  window.__bjk_doExportJson = doExportJson;

  function maybePromptBackup() {
    const intervalDays = Math.max(1, Math.floor(asNumber(state.settings.backupIntervalDays || 30)));
    const last = asNumber(state.settings.lastBackupPromptAt || 0);
    const msInterval = intervalDays * 24 * 60 * 60 * 1000;
    const due = nowMs() - last >= msInterval;
    if (!due) return;
    state.settings.lastBackupPromptAt = nowMs();
    saveState();
    showModal(`Det var ett tag sen senaste backup. Vill du exportera din data som JSON till din telefon/cloud?`);
  }

  // Poll every ~30 minutes; prompt only if interval is due
  setInterval(() => {
    // eslint-disable-next-line no-undef
    maybePromptBackup();
  }, 30 * 60 * 1000);

  // Initial check after a small delay
  setTimeout(() => maybePromptBackup(), 2500);
}

function initYearMonthPickersOverview() {
  // handled in renderRoute("overview")
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    // Silent
  }
}

function initRoot() {
  window.addEventListener("error", (ev) => {
    showDebugToast(`JS-fel: ${ev?.message || ev}`);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    showDebugToast(`Promise-fel: ${ev?.reason?.message || ev?.reason || ev}`);
  });

  try {
    state = loadState();
    applyTheme();
    initSystemThemeListener();
    initDateFieldRows();
    initMobileDateSheetPicker();
    initOverviewPeriodSheet();
    wireTaggedListPeriodPickers();
    initFoodMatSubPanelHistory();
    initFoodMatSwipeBack();
    initExpenseOverlayHistory();
    initBudgetEditorModalDismiss();
    initRouting();
    initActions();
    registerServiceWorker();
  } catch (e) {
    showDebugToast(`Init-fel: ${e?.message || e}`);
    throw e;
  }
}

// Start app
initRoot();

