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

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function recurringMonthlyAmount(item) {
  const amount = asNumber(item?.amount);
  const freq = item?.frequency || "monthly";
  if (freq === "yearly") return amount / 12;
  return amount;
}

function freqLabel(freq) {
  return freq === "yearly" ? "kr/år" : "kr/mån";
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
}

function isGeneratedMatExpenseInSelectableWindow(exp) {
  if (!exp?.foodGenerated) return false;
  const years = getSelectableAppYears();
  const fy = Number(exp.foodYear);
  if (Number.isFinite(fy)) return years.includes(fy);
  const iso = exp?.foodPlanningDate || exp?.payments?.[0]?.date;
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
}

function requireEl(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Saknar element #${id} i DOM`);
  return el;
}

function getSystemTheme() {
  try {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function getDefaultState() {
  const currentYear = new Date().getFullYear();
  return {
    version: 1,
    themeMode: "system", // system | light | dark
    settings: {
      backupIntervalDays: 30,
      backupFilenamePattern: "bjorklunds_budget_{YYYY}-{MM}.json",
      lastBackupPromptAt: 0,
      foodPlanningWeekday: 1
    },
    recurring: {
      expenses: { [String(currentYear)]: [] }
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
      loans: {},
      food: {},
      children: {}
    }
  };
}

function ensureYearArray(map, year) {
  const k = String(year);
  if (!map[k]) map[k] = [];
  return map[k];
}

function ensureOneOffList(root, year, monthIndex1to12) {
  const y = String(year);
  const m = monthKey(monthIndex1to12);
  if (!root[y]) root[y] = {};
  if (!root[y][m]) root[y][m] = [];
  return root[y][m];
}

/** En gemensam matkonfiguration (foodShared); migreras från första bästa årsnyckel under special.food. */
function migrateSpecialFoodToSharedModel(root) {
  const special = root?.special;
  if (!special || typeof special !== "object") return;
  if (special.foodShared?.config && typeof special.foodShared.config === "object") return;
  const food = special.food;
  if (!food || typeof food !== "object") return;
  const cur = currentYearMonth().year;
  const tryOrder = [String(cur), String(cur - 1), String(cur + 1)];
  let pickedConfig = null;
  for (const k of tryOrder) {
    const e = food[k];
    if (e && typeof e === "object" && e.config && typeof e.config === "object") {
      pickedConfig = e.config;
      break;
    }
  }
  if (!pickedConfig) {
    const keys = Object.keys(food).filter((k) => /^\d{4}$/.test(k)).sort();
    for (const k of keys) {
      const e = food[k];
      if (e && e.config && typeof e.config === "object") {
        pickedConfig = e.config;
        break;
      }
    }
  }
  if (pickedConfig) {
    special.foodShared = { config: JSON.parse(JSON.stringify(pickedConfig)), weeks: [] };
  }
}

function normalizeStateShape(state) {
  const base = getDefaultState();
  if (!state || typeof state !== "object") return base;

  const normalized = { ...base, ...state };
  normalized.version = 1;

  normalized.themeMode = ["system", "light", "dark"].includes(normalized.themeMode) ? normalized.themeMode : "system";

  normalized.settings = { ...base.settings, ...(normalized.settings || {}) };
  normalized.settings.backupIntervalDays = Math.max(1, Math.floor(asNumber(normalized.settings.backupIntervalDays || 30)));
  normalized.settings.backupFilenamePattern =
    typeof normalized.settings.backupFilenamePattern === "string" && normalized.settings.backupFilenamePattern.trim()
      ? normalized.settings.backupFilenamePattern
      : base.settings.backupFilenamePattern;
  normalized.settings.foodPlanningWeekday = Math.max(1, Math.min(7, Math.floor(asNumber(normalized.settings.foodPlanningWeekday || 1))));

  normalized.recurring = normalized.recurring || base.recurring;
  normalized.recurring.expenses = normalized.recurring.expenses || base.recurring.expenses;

  normalized.incomes = Array.isArray(normalized.incomes) ? normalized.incomes : [];
  normalized.expenses = Array.isArray(normalized.expenses) ? normalized.expenses : [];

  normalized.oneOff = normalized.oneOff || base.oneOff;
  normalized.oneOff.incomes = normalized.oneOff.incomes || {};
  normalized.oneOff.expenses = normalized.oneOff.expenses || {};

  normalized.special = normalized.special || base.special;
  normalized.special.car = normalized.special.car || {};
  // Migration: gamla "housing" -> nya "home"
  if (normalized.special.housing && !normalized.special.home) normalized.special.home = normalized.special.housing;
  normalized.special.home = normalized.special.home || {};
  normalized.special.loans = normalized.special.loans || {};
  normalized.special.food = normalized.special.food || {};
  normalized.special.children = normalized.special.children || {};

  // Migration: legacy monthly food config -> yearly model { config, weeks }
  for (const y of Object.keys(normalized.special.food || {})) {
    const entry = normalized.special.food?.[y];
    if (!entry || typeof entry !== "object") continue;
    const alreadyYearModel = Boolean(entry.config || entry.weeks);
    if (alreadyYearModel) continue;
    const monthKeys = Object.keys(entry).filter((k) => /^\d{2}$/.test(k));
    if (monthKeys.length === 0) continue;
    const curMonthK = pad2(currentYearMonth().month);
    const pickK = monthKeys.includes(curMonthK) ? curMonthK : monthKeys.sort().slice(-1)[0];
    const mCfg = entry[pickK] || {};
    const cfg = {
      mode: mCfg.mode === "manual" ? "manual" : "auto",
      household: {
        adults: Math.max(0, Math.floor(asNumber(mCfg.household?.adults ?? 1))),
        teens: Math.max(0, Math.floor(asNumber(mCfg.household?.teens ?? 0))),
        children: Math.max(0, Math.floor(asNumber(mCfg.household?.children ?? 0)))
      },
      costLevel: ["budget", "normal", "high"].includes(mCfg.costLevel) ? mCfg.costLevel : "normal",
      foodScope: ["groceries", "mixed", "all"].includes(mCfg.foodScope) ? mCfg.foodScope : "groceries",
      manualWeeklyCost: Math.max(0, asNumber(mCfg.manualWeeklyCost ?? 2800)),
      custodySchedule: normalizeCustodySchedule(mCfg.custodySchedule || mCfg.kidsSchedule),
      custodyPeriods: migrateCustodyPeriodsFromStored(mCfg, Number(y)),
      householdChanges: Array.isArray(mCfg.householdChanges) ? mCfg.householdChanges : [],
      deviations: Array.isArray(mCfg.deviations) ? mCfg.deviations : []
    };
    normalized.special.food[y] = { config: cfg, weeks: [] };
  }

  migrateSpecialFoodToSharedModel(normalized);

  migrateLegacyIncomes(normalized);
  ensureIncomeIds(normalized);
  cleanupIncomeGarbage(normalized);
  migrateLegacyExpenses(normalized);
  migrateLegacyCarSpecialToExpenses(normalized);
  ensureExpenseIds(normalized);
  normalized.expenses = dedupeGeneratedFoodExpenses(normalized.expenses);
  cleanupExpenseGarbage(normalized);

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

function ensureIncomeIds(root) {
  if (!Array.isArray(root.incomes)) root.incomes = [];
  root.incomes = root.incomes.map((inc) => {
    const incomeId = inc?.id || uid();
    const payments = Array.isArray(inc?.payments) ? inc.payments : [];
    const normalizedPayments = payments.map((p) => ({
      id: p?.id || uid(),
      date: p?.date || "",
      amount: asNumber(p?.amount)
    }));
    return {
      id: incomeId,
      name: String(inc?.name || "").trim(),
      interval: inc?.interval || "once",
      payments: normalizedPayments
    };
  });
}

function ensureExpenseIds(root) {
  if (!Array.isArray(root.expenses)) root.expenses = [];
  root.expenses = root.expenses.map((exp) => {
    const expenseId = exp?.id || uid();
    const payments = Array.isArray(exp?.payments) ? exp.payments : [];
    const normalizedPayments = payments.map((p) => ({
      id: p?.id || uid(),
      date: p?.date || "",
      amount: asNumber(p?.amount)
    }));
    const out = {
      id: expenseId,
      name: String(exp?.name || "").trim(),
      interval: exp?.interval || "once",
      payments: normalizedPayments
    };
    // Viktigt: systemgenererad mat måste behålla metadata annars kan inte gamla rader tas bort vid nytt spara → dubbletter.
    if (exp?.foodGenerated) {
      out.foodGenerated = true;
      if (exp.foodYear != null && exp.foodYear !== "") out.foodYear = Number(exp.foodYear);
      if (exp.foodWeekKey) out.foodWeekKey = String(exp.foodWeekKey);
      if (exp.foodPlanningDate) out.foodPlanningDate = String(exp.foodPlanningDate);
      if (Array.isArray(exp.foodLabels)) out.foodLabels = exp.foodLabels.map((x) => String(x));
    }
    if (exp?.expenseCategory === "car") {
      out.expenseCategory = "car";
      if (exp.carTypeKey) out.carTypeKey = String(exp.carTypeKey);
      const cpd = Math.floor(asNumber(exp.carPaymentDay));
      if (Number.isFinite(cpd) && cpd >= 1 && cpd <= 31) out.carPaymentDay = cpd;
      if (exp.carFirstDate) out.carFirstDate = String(exp.carFirstDate);
      if (exp.carEndDate != null) out.carEndDate = String(exp.carEndDate || "");
    }
    return out;
  });
}

function dedupeGeneratedFoodExpenses(expenses) {
  if (!Array.isArray(expenses)) return expenses;
  const seenWeek = new Set();
  const seenLegacyDate = new Set();
  return expenses.filter((exp) => {
    if (exp?.foodGenerated && exp.foodWeekKey) {
      const y = Number(exp.foodYear);
      if (!Number.isFinite(y)) return true;
      const k = `${y}|${exp.foodWeekKey}`;
      if (seenWeek.has(k)) return false;
      seenWeek.add(k);
      return true;
    }
    const name = String(exp?.name || "").trim();
    if (!/^Mat v\.\d+$/i.test(name)) return true;
    const pts = Array.isArray(exp.payments) ? exp.payments : [];
    if (pts.length !== 1) return true;
    const iso = pts[0]?.date;
    if (!iso) return true;
    const legacyKey = `${iso}|${name.toLowerCase()}`;
    if (seenLegacyDate.has(legacyKey)) return false;
    seenLegacyDate.add(legacyKey);
    return true;
  });
}

/** True om utgiften räknas som systemgenererad mat för ett visst kalenderår (inkl. äldre rader utan flaggor). */
function isGeneratedMatExpenseForYear(exp, year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return false;
  if (exp?.foodGenerated) return Number(exp.foodYear) === y;
  const name = String(exp?.name || "").trim();
  if (!/^Mat v\.\d+$/i.test(name)) return false;
  const iso = exp?.payments?.[0]?.date;
  if (!iso || typeof iso !== "string" || iso.length < 4) return false;
  const py = Number(iso.slice(0, 4));
  return Number.isFinite(py) && py === y;
}

function isMatLikeExpense(exp) {
  if (!exp) return false;
  if (exp.foodGenerated) return true;
  return /^Mat v\.\d+$/i.test(String(exp.name || "").trim());
}

/** Bilutgifter sparas som vanliga state.expenses med expenseCategory "car" + carTypeKey. */
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
  return Boolean(exp && exp.expenseCategory === "car");
}

function getCarTypeLabel(carTypeKey) {
  const k = String(carTypeKey || "");
  const row = CAR_EXPENSE_TYPES.find((t) => t.key === k);
  return row ? row.label : k || "Bil";
}

function migrateLegacyCarSpecialToExpenses(root) {
  const car = root?.special?.car;
  if (!car || typeof car !== "object" || !Array.isArray(root.expenses)) return;
  for (const yk of Object.keys(car)) {
    if (!/^\d{4}$/.test(yk)) continue;
    const cfg = car[yk];
    if (!cfg || typeof cfg !== "object" || cfg._legacyMigrated) continue;
    const year = Number(yk);
    if (!isAllowedYear(year)) {
      cfg._legacyMigrated = true;
      continue;
    }
    const entries = [];
    const ins = asNumber(cfg.insurance);
    if (ins > 0) entries.push({ carTypeKey: "insurance", name: "Försäkring", amt: ins });
    const fuel = asNumber(cfg.fuel);
    if (fuel > 0) entries.push({ carTypeKey: "fuel", name: "Drivmedel", amt: fuel });
    const park = asNumber(cfg.parking);
    if (park > 0) entries.push({ carTypeKey: "parking_fee", name: "Parkeringsavgift", amt: park });
    const leased = (cfg.ownership || "owned") === "leased";
    const lease = asNumber(cfg.leasing);
    if (leased && lease > 0) entries.push({ carTypeKey: "leasing", name: "Leasing avgift", amt: lease });
    if (entries.length === 0) {
      cfg._legacyMigrated = true;
      continue;
    }
    const payDay = 25;
    for (const e of entries) {
      const payments = Array.from({ length: 12 }, (_, i) => ({
        id: uid(),
        date: `${year}-${pad2(i + 1)}-${pad2(payDay)}`,
        amount: e.amt
      }));
      root.expenses.push({
        id: uid(),
        name: e.name,
        interval: "monthly",
        payments,
        expenseCategory: "car",
        carTypeKey: e.carTypeKey,
        carPaymentDay: payDay,
        carFirstDate: `${year}-01-${pad2(payDay)}`,
        carEndDate: ""
      });
    }
    cfg._legacyMigrated = true;
    delete cfg.ownership;
    delete cfg.insurance;
    delete cfg.fuel;
    delete cfg.parking;
    delete cfg.leasing;
  }
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

function migrateLegacyIncomes(root) {
  // Legacy: state.recurring.incomes[year] = [{id,name,amount,frequency(monthly|yearly)}]
  const legacy = root?.recurring?.incomes;
  if (!legacy || typeof legacy !== "object") return;

  const legacyYears = Object.keys(legacy);
  if (legacyYears.length === 0) return;

  if (!Array.isArray(root.incomes)) root.incomes = [];

  const DEFAULT_PAYDAY = 25; // används endast för legacy-migrering

  const makeMonthlyPayments = (year, monthlyAmount) =>
    Array.from({ length: 12 }).map((_, i) => ({
      id: uid(),
      date: `${year}-${pad2(i + 1)}-${pad2(DEFAULT_PAYDAY)}`,
      amount: asNumber(monthlyAmount)
    }));

  const makeYearlyPayment = (year, yearlyAmount) => [
    {
      id: uid(),
      date: `${year}-01-01`,
      amount: asNumber(yearlyAmount)
    }
  ];

  for (const y of legacyYears) {
    const year = Number(y);
    if (!Number.isFinite(year)) continue;
    const items = Array.isArray(legacy[y]) ? legacy[y] : [];
    for (const it of items) {
      const name = String(it?.name || "").trim() || "Intäkt";
      const frequency = it?.frequency || "monthly";
      const amount = asNumber(it?.amount);

      const payments =
        frequency === "yearly" ? makeYearlyPayment(year, amount) : makeMonthlyPayments(year, amount);

      root.incomes.push({
        id: uid(),
        name,
        interval: frequency === "yearly" ? "yearly" : "monthly",
        payments
      });
    }
  }

  // Remove legacy store to avoid double counting
  if (!root.recurring) root.recurring = {};
  delete root.recurring.incomes;
}

function migrateLegacyExpenses(root) {
  const legacy = root?.recurring?.expenses;
  if (!legacy || typeof legacy !== "object") return;
  const legacyYears = Object.keys(legacy);
  if (legacyYears.length === 0) return;
  if (!Array.isArray(root.expenses)) root.expenses = [];

  const DEFAULT_PAYDAY = 25;
  const makeMonthlyPayments = (year, monthlyAmount) =>
    Array.from({ length: 12 }).map((_, i) => ({ id: uid(), date: `${year}-${pad2(i + 1)}-${pad2(DEFAULT_PAYDAY)}`, amount: asNumber(monthlyAmount) }));
  const makeYearlyPayment = (year, yearlyAmount) => [{ id: uid(), date: `${year}-01-01`, amount: asNumber(yearlyAmount) }];

  for (const y of legacyYears) {
    const year = Number(y);
    if (!Number.isFinite(year)) continue;
    const items = Array.isArray(legacy[y]) ? legacy[y] : [];
    for (const it of items) {
      const name = String(it?.name || "").trim() || "Utgift";
      const frequency = it?.frequency || "monthly";
      const amount = asNumber(it?.amount);
      const payments = frequency === "yearly" ? makeYearlyPayment(year, amount) : makeMonthlyPayments(year, amount);
      root.expenses.push({ id: uid(), name, interval: frequency === "yearly" ? "yearly" : "monthly", payments });
    }
  }
  if (!root.recurring) root.recurring = {};
  delete root.recurring.expenses;
}

let state = null;
const ui = {
  activeRoute: "overview",
  // Översikt
  overviewYear: null,
  overviewMonth: null,
  // Utgifter
  expensesYear: null,
  expensesTab: "summary",
  // Intäkter
  incomeYearFilter: null,
  incomeMonthFilter: "all",
  // Utgifter
  expenseYearFilter: null,
  expenseMonthFilter: "all",
  loanEditorOpen: false,
  editLoanId: null,
  loanCopySourceName: null,
  foodScrollWeekKey: null,
  carListYear: null,
  carListMonth: null,
  carEditorOpen: false,
  carEditingExpenseId: null
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
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#0b1220" : "#2563eb");
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
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.querySelectorAll("[data-view]").forEach((v) => {
      if (v.getAttribute("data-view") === name) v.classList.add("active");
    });
    document.querySelectorAll(".bottom-nav a").forEach((a) => {
      a.setAttribute("aria-current", a.getAttribute("data-navlink") === name ? "page" : "false");
    });
  };

  const onChange = () => {
    const allowed = new Set(["overview", "incomes", "expenses", "add", "settings"]);
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
  addFrom(state.special?.loans);
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

function computeSpecialCarMonthly(year, month) {
  const items = [];
  let total = 0;
  for (const exp of state.expenses || []) {
    if (!isCarExpense(exp)) continue;
    const typeLabel = getCarTypeLabel(exp.carTypeKey);
    const name = String(exp.name || "").trim() || typeLabel;
    for (const p of exp.payments || []) {
      const pAmt = asNumber(p.amount);
      if (pAmt <= 0) continue;
      const dt = p.date ? new Date(p.date) : null;
      if (!dt || Number.isNaN(dt.getTime())) continue;
      if (dt.getFullYear() !== Number(year) || dt.getMonth() + 1 !== Number(month)) continue;
      total += pAmt;
      const dateStr = dt.toLocaleDateString("sv-SE");
      items.push({
        label: `${typeLabel} · ${name} (${dateStr})`,
        amount: pAmt,
        carTypeKey: exp.carTypeKey,
        expenseId: exp.id
      });
    }
  }
  return { total, items };
}

function computeSpecialHousingMonthly(year) {
  const config = state.special.home[String(year)] || {};
  const items = [
    { label: "Hyra", amount: asNumber(config.rent) },
    { label: "El", amount: asNumber(config.electricity) },
    { label: "Vatten", amount: asNumber(config.water) },
    { label: "Sophämtning", amount: asNumber(config.garbage) },
    { label: "Internet", amount: asNumber(config.internet) },
    { label: "Parkering", amount: asNumber(config.parking) }
  ];
  const total = items.reduce((s, it) => s + it.amount, 0);
  return { total, items };
}

function computeSpecialFoodMonthly() {
  // Mat hanteras nu via systemgenererade utgifter (foodGenerated) med planningDate.
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
    custodySchedule: normalizeCustodySchedule(cfg.custodySchedule || cfg.kidsSchedule),
    custodyPeriods: migrateCustodyPeriodsFromStored(cfg, refY),
    foodBudgetYear: refY,
    householdChanges: Array.isArray(cfg.householdChanges) ? cfg.householdChanges : [],
    deviations: Array.isArray(cfg.deviations) ? cfg.deviations : []
  };
}

/** Gemensam matinställning för appens tre år (special.foodShared). */
function getSharedFoodConfig() {
  let cfg = state.special?.foodShared?.config;
  if (!cfg || typeof cfg !== "object") {
    const cur = currentYearMonth().year;
    const legacy =
      state.special?.food?.[String(cur)]?.config ||
      state.special?.food?.[String(cur - 1)]?.config ||
      state.special?.food?.[String(cur + 1)]?.config;
    cfg = legacy && typeof legacy === "object" ? legacy : {};
  }
  return normalizeStoredFoodConfigObject(cfg);
}

function getFoodConfigForYear(_year) {
  return getSharedFoodConfig();
}

function normalizeCustodySchedule(input) {
  const cs = input && typeof input === "object" ? input : {};
  const legacy = input && typeof input === "object" && ("membersWhenPresent" in input || "periodEnd" in input);
  if (legacy) {
    return {
      type: "off",
      alternating: {
        startDate: "",
        ratioKey: "7-7",
        awayDays: 7,
        withDays: 7,
        absent: { children: 0, teens: 0 }
      },
      custom: []
    };
  }
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

function migrateCustodyPeriodsFromStored(cfg, foodYear) {
  if (Array.isArray(cfg?.custodyPeriods) && cfg.custodyPeriods.length > 0) {
    return cfg.custodyPeriods.map(normalizeCustodyPeriodEntry);
  }
  const cs = cfg?.custodySchedule;
  if (cs && cs.type === "alternating") {
    const alt = cs.alternating || {};
    if (alt.startDate) {
      return [normalizeCustodyPeriodEntry({
        startDate: alt.startDate,
        endDate: "",
        ratioKey: alt.ratioKey || "7-7",
        absent: { children: alt.absent?.children ?? 0, teens: alt.absent?.teens ?? 0 }
      })];
    }
  }
  return [];
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
    const { awayDays, withDays } = parseCustodyRatioKey(p.ratioKey);
    const cycle = awayDays + withDays;
    const span = diffCalendarDays(s, e) + 1;
    if (span < cycle) continue;
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
    const e = parseDateISO(ch?.endDate);
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
    const e = parseDateISO(dv?.endDate);
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
    const e = parseDateISO(ch?.endDate);
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
    const e = parseDateISO(dv?.endDate);
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

function computeSpecialChildrenMonthly(year) {
  const config = state.special.children[String(year)] || {};

  const parties = Math.max(0, asNumber(config.kidsPartiesPerYear)) * asNumber(config.kidsPartyUnitCost);
  const partiesMonthly = parties / 12;

  const items = [
    { label: "Kläder", amount: asNumber(config.kidsClothesPerMonth) },
    { label: "Busskort", amount: asNumber(config.kidsBusCardPerMonth) },
    { label: "Telefonabonnemang", amount: asNumber(config.kidsPhonePerMonth) },
    { label: "Aktiviteter", amount: asNumber(config.kidsActivitiesPerMonth) },
    { label: "Månadspeng", amount: asNumber(config.kidsPocketMoneyPerMonth) },
    { label: "Andra barns kalas", amount: partiesMonthly }
  ];

  const total = items.reduce((s, it) => s + it.amount, 0);
  return { total, items };
}

function normalizeLoanItem(rawLoan) {
  const cur = currentYearMonth();
  return {
    id: rawLoan?.id || uid(),
    name: String(rawLoan?.name || "").trim() || "Lån",
    bank: String(rawLoan?.bank || "").trim(),
    principal: asNumber(rawLoan?.principal),
    rate: asNumber(rawLoan?.rate),
    amortization: asNumber(rawLoan?.amortization),
    dueDay: Math.max(1, Math.min(31, Math.floor(asNumber(rawLoan?.dueDay) || 25))),
    startYear: Math.floor(asNumber(rawLoan?.startYear) || cur.year),
    startMonth: Math.max(1, Math.min(12, Math.floor(asNumber(rawLoan?.startMonth) || 1))),
    endYear: rawLoan?.endYear === null || rawLoan?.endYear === undefined || rawLoan?.endYear === "" ? null : Math.floor(asNumber(rawLoan.endYear)),
    endMonth: rawLoan?.endMonth === null || rawLoan?.endMonth === undefined || rawLoan?.endMonth === "" ? null : Math.max(1, Math.min(12, Math.floor(asNumber(rawLoan.endMonth))))
  };
}

function getAllLoans() {
  const root = state.special?.loans || {};
  const out = [];
  for (const v of Object.values(root)) {
    if (Array.isArray(v)) {
      for (const item of v) out.push(normalizeLoanItem(item));
      continue;
    }
    if (v && typeof v === "object") {
      // Legacy single-loan shape
      out.push(normalizeLoanItem({
        id: uid(),
        name: "Lån",
        bank: "",
        principal: v.principal,
        rate: v.rate,
        amortization: v.amortization,
        dueDay: 25
      }));
    }
  }
  const seen = new Set();
  return out.filter((loan) => {
    const key = String(loan.id || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function persistAllLoans(loans) {
  if (!state.special.loans) state.special.loans = {};
  state.special.loans = {
    [String(currentYearMonth().year)]: loans.map((l) => {
      const n = normalizeLoanItem(l);
      return {
        id: n.id,
        name: n.name,
        bank: n.bank,
        principal: n.principal,
        rate: n.rate,
        amortization: n.amortization,
        dueDay: n.dueDay,
        startYear: n.startYear,
        startMonth: n.startMonth,
        endYear: n.endYear,
        endMonth: n.endMonth
      };
    })
  };
}

function ymValue(y, m) {
  return Number(y) * 100 + Number(m);
}

function validateLoanDateRange(loan) {
  const sy = Math.floor(asNumber(loan.startYear));
  const sm = Math.floor(asNumber(loan.startMonth));
  if (!Number.isFinite(sy) || !Number.isFinite(sm) || sm < 1 || sm > 12) return "Startdatum är obligatoriskt.";
  const hasEnd = loan.endYear !== null && loan.endYear !== undefined && loan.endYear !== "";
  if (!hasEnd) return "";
  const ey = Math.floor(asNumber(loan.endYear));
  const em = Math.floor(asNumber(loan.endMonth));
  if (!Number.isFinite(ey) || !Number.isFinite(em) || em < 1 || em > 12) return "Ange både slutår och slutmånad eller lämna båda tomma.";
  const s = ymValue(sy, sm);
  const e = ymValue(ey, em);
  if (s === e) return "Startdatum och slutdatum kan inte vara samma månad.";
  if (e < s) return "Slutdatum måste vara efter startdatum.";
  return "";
}

function enumerateLoanMonths(loan) {
  const err = validateLoanDateRange(loan);
  if (err) return [];
  const startY = Math.floor(asNumber(loan.startYear));
  const startM = Math.floor(asNumber(loan.startMonth));
  const hasEnd = loan.endYear !== null && loan.endYear !== undefined && loan.endYear !== "";
  const from = ymValue(startY, startM);
  const to = hasEnd ? ymValue(loan.endYear, loan.endMonth) : ymValue(currentYearMonth().year + 1, 12);
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

function computeSpecialLoansMonthly(year, month) {
  const loans = getAllLoans();
  const items = loans
    .filter((loan) => enumerateLoanMonths(loan).some((x) => x.year === Number(year) && x.month === Number(month)))
    .map((loan) => ({ label: `${loan.name}${loan.bank ? ` (${loan.bank})` : ""}`, amount: getLoanTotalPayment(loan) }));
  const total = items.reduce((sum, it) => sum + asNumber(it.amount), 0);
  return { total, items };
}

function computeRecurringMonthlyItems(items) {
  return (items || []).map((it) => ({ id: it.id, label: it.name, amount: asNumber(it.amount) }));
}

function computeMonthOverview(year, month) {
  const y = String(year);
  const m = monthKey(month);

  const car = computeSpecialCarMonthly(year, month);
  const housing = computeSpecialHousingMonthly(year);
  const loans = computeSpecialLoansMonthly(year, month);
  // Mat hanteras via foodGenerated-utgifter (egen kategori), inte som "special"-post.
  const children = computeSpecialChildrenMonthly(year);

  const oneOffExpenses = (state.oneOff?.expenses?.[y]?.[m] || []).map((it) => ({
    id: it.id,
    label: it.name,
    amount: asNumber(it.amount)
  }));
  const oneOffIncomes = (state.oneOff?.incomes?.[y]?.[m] || []).map((it) => ({
    id: it.id,
    label: it.name,
    amount: asNumber(it.amount)
  }));

  const expensePaymentsAmount = (state.expenses || []).reduce((sum, exp) => {
    if (isCarExpense(exp)) return sum;
    const payments = Array.isArray(exp.payments) ? exp.payments : [];
    return (
      sum +
      payments.reduce((s, p) => {
        const amt = asNumber(p.amount);
        if (amt <= 0) return s;
        const dt = p.date ? new Date(p.date) : null;
        if (!dt || Number.isNaN(dt.getTime())) return s;
        const py = dt.getFullYear();
        const pm = dt.getMonth() + 1;
        if (py === year && pm === month) return s + amt;
        return s;
      }, 0)
    );
  }, 0);

  const foodGeneratedAmount = (state.expenses || []).reduce((sum, exp) => {
    if (!isMatLikeExpense(exp)) return sum;
    const payments = Array.isArray(exp.payments) ? exp.payments : [];
    return (
      sum +
      payments.reduce((s, p) => {
        const amt = asNumber(p.amount);
        if (amt <= 0) return s;
        const dt = p.date ? new Date(p.date) : null;
        if (!dt || Number.isNaN(dt.getTime())) return s;
        if (dt.getFullYear() === year && dt.getMonth() + 1 === month) return s + amt;
        return s;
      }, 0)
    );
  }, 0);

  const incomePaymentsAmount = (state.incomes || []).reduce((sum, inc) => {
    const payments = Array.isArray(inc.payments) ? inc.payments : [];
    return (
      sum +
      payments.reduce((s, p) => {
        const amt = asNumber(p.amount);
        if (amt <= 0) return s;
        const dt = p.date ? new Date(p.date) : null;
        if (!dt || Number.isNaN(dt.getTime())) return s;
        const py = dt.getFullYear();
        const pm = dt.getMonth() + 1;
        if (py === year && pm === month) return s + amt;
        return s;
      }, 0)
    );
  }, 0);

  const specialsAmount = car.total + housing.total + loans.total + children.total;
  const oneOffExpensesAmount = oneOffExpenses.reduce((s, it) => s + it.amount, 0);

  const incomeAmount = incomePaymentsAmount + oneOffIncomes.reduce((s, it) => s + it.amount, 0);
  const plannedExpensesAmount = expensePaymentsAmount + specialsAmount + oneOffExpensesAmount;
  const remaining = incomeAmount - plannedExpensesAmount;

  // Diagramsegment: återkommande + special + enstaka
  const segments = [
    { key: "recurringExpenses", label: "Utgifter", amount: Math.max(0, expensePaymentsAmount - foodGeneratedAmount), color: "#8b5cf6" },
    { key: "foodGenerated", label: "Mat", amount: foodGeneratedAmount, color: "#f97316" },
    { key: "car", label: "Bil", amount: car.total, color: "#3b82f6" },
    { key: "housing", label: "Hem", amount: housing.total, color: "#06b6d4" },
    { key: "loans", label: "Lån", amount: loans.total, color: "#6366f1" },
    { key: "children", label: "Barn", amount: children.total, color: "#22c55e" },
    { key: "oneOffExpenses", label: "Enstaka utgifter", amount: oneOffExpensesAmount, color: "#ef4444" }
  ].filter((s) => s.amount > 0);

  // Tabellen: bryt ner utgifter och intäkter
  const expensesRows = [];
  for (const exp of state.expenses || []) {
    if (isCarExpense(exp)) continue;
    const payments = Array.isArray(exp.payments) ? exp.payments : [];
    for (const p of payments) {
      const amt = asNumber(p.amount);
      if (amt <= 0) continue;
      const dt = p.date ? new Date(p.date) : null;
      if (!dt || Number.isNaN(dt.getTime())) continue;
      if (dt.getFullYear() !== year || dt.getMonth() + 1 !== month) continue;
      const group = exp?.foodGenerated ? "Mat" : "Utgifter";
      expensesRows.push({ group, label: `${exp.name || "Utgift"} (${dt.toLocaleDateString("sv-SE")})`, amount: amt });
    }
  }
  for (const it of car.items) expensesRows.push({ group: "Bil", label: it.label, amount: it.amount });
  for (const it of housing.items) expensesRows.push({ group: "Hem", label: it.label, amount: it.amount });
  for (const it of loans.items) expensesRows.push({ group: "Lån", label: it.label, amount: it.amount });
  for (const it of children.items) expensesRows.push({ group: "Barn", label: it.label, amount: it.amount });
  for (const it of oneOffExpenses) expensesRows.push({ group: "Enstaka utgifter", label: it.label, amount: it.amount });

  const incomesRows = [];
  for (const inc of state.incomes || []) {
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
        label: `${inc.name || "Intäkt"} (${dt.toLocaleDateString("sv-SE")})`,
        amount: amt
      });
    }
  }
  for (const it of oneOffIncomes) incomesRows.push({ group: "Enstaka intäkter", label: it.label, amount: it.amount });

  return { year, month, incomeAmount, plannedExpensesAmount, remaining, segments, expensesRows, incomesRows };
}

function drawExpenseChart(svgEl, overview) {
  // Rensar
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

  const W = 600;
  const H = 220;
  svgEl.setAttribute("width", String(W));
  svgEl.setAttribute("height", String(H));

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
  bg.setAttribute("fill", "rgba(148,163,184,0.25)");
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
  remBg.setAttribute("fill", "rgba(148,163,184,0.18)");
  svgEl.appendChild(remBg);

  const remAmount = Math.max(0, remaining);
  const remW = totalBarW * (remAmount / maxRef);
  const remRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  remRect.setAttribute("x", String(startX));
  remRect.setAttribute("y", String(barY2));
  remRect.setAttribute("width", String(remW));
  remRect.setAttribute("height", String(barH));
  remRect.setAttribute("rx", "12");
  remRect.setAttribute("fill", remaining >= 0 ? "#22c55e" : "#ef4444");
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
  document.getElementById("overviewRemaining").textContent = formatKr(overview.remaining);

  const callout = document.getElementById("remainingCallout");
  if (overview.remaining >= 0) {
    callout.textContent = `Bra! Du har ${formatKr(overview.remaining)} kvar för övriga utgifter.`;
    callout.style.borderColor = "rgba(34,197,94,0.35)";
  } else {
    callout.textContent = `Varning! Du är beräknad att gå över med ${formatKr(Math.abs(overview.remaining))}.`;
    callout.style.borderColor = "rgba(239,68,68,0.35)";
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
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function applyCarOverlayDateBounds() {
  const min = getFoodDateInputMinIso();
  const max = getFoodDateInputMaxIso();
  document.querySelectorAll('[data-expview="car"] input[type="date"]').forEach((inp) => {
    inp.min = min;
    inp.max = max;
  });
}

function updateCarEditorIntervalVisibility() {
  const interval = document.getElementById("carEditInterval")?.value || "once";
  const recurring = interval !== "once";
  const payDayRow = document.getElementById("carPaymentDayRow");
  const endRow = document.getElementById("carEndDateRow");
  const firstLbl = document.getElementById("carFirstDateLabel");
  if (payDayRow) payDayRow.hidden = !recurring;
  if (endRow) endRow.hidden = !recurring;
  if (firstLbl) firstLbl.textContent = recurring ? "Första betalningsdatum" : "Betalningsdatum";
}

function inferCarMetaFromExpense(exp) {
  const pts = (exp.payments || [])
    .filter((p) => asNumber(p.amount) > 0 && p.date)
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const first = pts[0];
  const second = pts[1];
  let payDay = exp.carPaymentDay;
  if (payDay == null || payDay === "") {
    const p2 = second?.date ? datePartsFromIso(second.date) : null;
    if (p2) payDay = p2.d;
  }
  if (payDay == null || payDay === "") {
    const p1 = first?.date ? datePartsFromIso(first.date) : null;
    payDay = p1?.d ?? 25;
  }
  payDay = Math.max(1, Math.min(31, Math.floor(asNumber(payDay)) || 25));
  const firstDate = exp.carFirstDate || first?.date || "";
  const amount = first ? asNumber(first.amount) : 0;
  const endDate = exp.carEndDate != null && exp.carEndDate !== undefined ? String(exp.carEndDate) : "";
  return { firstDate, payDay, amount, endDate };
}

function getCarExpenseGroupsForMonth(year, month) {
  const byType = new Map();
  for (const exp of state.expenses || []) {
    if (!isCarExpense(exp)) continue;
    let sum = 0;
    for (const p of exp.payments || []) {
      const dt = p.date ? new Date(p.date) : null;
      if (!dt || Number.isNaN(dt.getTime())) continue;
      if (dt.getFullYear() === year && dt.getMonth() + 1 === month) sum += asNumber(p.amount);
    }
    if (sum <= 0) continue;
    const key = exp.carTypeKey || "other";
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key).push({
      expenseId: exp.id,
      name: String(exp.name || "").trim() || getCarTypeLabel(key),
      amount: sum
    });
  }
  const groups = [];
  for (const t of CAR_EXPENSE_TYPES) {
    const items = byType.get(t.key);
    if (items && items.length) groups.push({ typeLabel: t.label, items });
    byType.delete(t.key);
  }
  for (const [key, items] of byType) groups.push({ typeLabel: getCarTypeLabel(key), items });
  const total = groups.reduce((s, g) => s + g.items.reduce((a, it) => a + it.amount, 0), 0);
  return { groups, total };
}

function renderCarExpenseListMount() {
  const mount = document.getElementById("carListMount");
  const totalEl = document.getElementById("carMonthTotal");
  const titleEl = document.getElementById("carListMonthTitle");
  if (!mount) return;

  const year = Number(ui.carListYear);
  const month = Number(ui.carListMonth);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return;

  if (titleEl) titleEl.textContent = `Utgifter ${monthName(month).toLowerCase()}`;
  const { groups, total } = getCarExpenseGroupsForMonth(year, month);
  mount.innerHTML = "";

  if (groups.length === 0) {
    mount.innerHTML = `<div class="car-list-empty">Inga bilutgifter denna månad.</div>`;
  } else {
    for (const g of groups) {
      const block = document.createElement("div");
      block.className = "car-type-block";
      for (const it of g.items) {
        const row = document.createElement("div");
        row.className = "car-expense-block";
        row.innerHTML = `
          <div class="car-expense-line1">
            <span class="car-expense-type">${escapeHtml(g.typeLabel)}</span>
            <span class="car-expense-amt">${escapeHtml(formatKr(it.amount))}</span>
          </div>
          <div class="car-expense-line2">
            <span class="car-expense-name">${escapeHtml(it.name)}</span>
            <button type="button" class="icon-btn car-edit-btn" data-car-edit-id="${escapeHtml(it.expenseId)}" aria-label="Redigera">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
        `;
        block.appendChild(row);
      }
      mount.appendChild(block);
    }
  }

  if (totalEl) {
    totalEl.textContent = total > 0 ? `Totalt denna månad: ${formatKr(total)}` : "";
  }

  mount.onclick = (e) => {
    const btn = e.target.closest("[data-car-edit-id]");
    if (!btn) return;
    const id = btn.getAttribute("data-car-edit-id");
    if (!id) return;
    ui.carEditingExpenseId = id;
    ui.carEditorOpen = true;
    renderCarPage();
  };
}

function renderCarPage() {
  const listYearSel = document.getElementById("carListYear");
  const listMonthSel = document.getElementById("carListMonth");
  const cur = currentYearMonth();
  const baseYear = ui.expensesYear || ui.overviewYear || cur.year;
  const appYears = getSelectableAppYears();
  if (ui.carListYear == null || !Number.isFinite(Number(ui.carListYear)) || !appYears.includes(Number(ui.carListYear))) {
    ui.carListYear = appYears.includes(baseYear) ? baseYear : appYears[1];
  }
  if (ui.carListMonth == null || !Number.isFinite(Number(ui.carListMonth)) || ui.carListMonth < 1 || ui.carListMonth > 12) {
    ui.carListMonth = cur.month;
  }

  if (listYearSel) {
    setYear3Options(listYearSel, ui.carListYear);
    listYearSel.onchange = () => {
      ui.carListYear = Number(listYearSel.value);
      renderCarExpenseListMount();
    };
  }
  if (listMonthSel) {
    setMonthOptions(listMonthSel, ui.carListMonth);
    listMonthSel.onchange = () => {
      ui.carListMonth = Number(listMonthSel.value);
      renderCarExpenseListMount();
    };
  }

  const editorCard = document.getElementById("carEditorCard");
  const editorTitle = document.getElementById("carEditorTitle");
  const typeSel = document.getElementById("carEditType");
  const nameInp = document.getElementById("carEditName");
  const payDayInp = document.getElementById("carEditPaymentDay");
  const intervalSel = document.getElementById("carEditInterval");
  const firstInp = document.getElementById("carEditFirstDate");
  const endInp = document.getElementById("carEditEndDate");
  const amtInp = document.getElementById("carEditAmount");
  const delBtn = document.getElementById("carDeleteBtn");
  const saveBtn = document.getElementById("carSaveBtn");
  const note = document.getElementById("carNote");

  if (typeSel && typeSel.options.length === 0) {
    for (const t of CAR_EXPENSE_TYPES) {
      const opt = document.createElement("option");
      opt.value = t.key;
      opt.textContent = t.label;
      typeSel.appendChild(opt);
    }
  }

  const editingId = ui.carEditingExpenseId;
  const editing = editingId ? (state.expenses || []).find((x) => x.id === editingId && isCarExpense(x)) : null;

  if (editorCard) editorCard.hidden = !ui.carEditorOpen;

  if (ui.carEditorOpen && typeSel && nameInp && payDayInp && intervalSel && firstInp && endInp && amtInp) {
    if (editorTitle) editorTitle.textContent = editing ? "Redigera bilutgift" : "Ny bilutgift";
    if (saveBtn) saveBtn.textContent = editing ? "Spara" : "Lägg till";
    if (delBtn) delBtn.hidden = !editing;

    if (editing) {
      typeSel.value = CAR_EXPENSE_TYPES.some((t) => t.key === editing.carTypeKey) ? editing.carTypeKey : CAR_EXPENSE_TYPES[0].key;
      nameInp.value = editing.name || getCarTypeLabel(editing.carTypeKey);
      intervalSel.value = ["once", "monthly", "quarterly", "yearly"].includes(editing.interval) ? editing.interval : "monthly";
      const inf = inferCarMetaFromExpense(editing);
      payDayInp.value = String(inf.payDay);
      firstInp.value = inf.firstDate ? String(inf.firstDate).slice(0, 10) : "";
      endInp.value = inf.endDate ? String(inf.endDate).slice(0, 10) : "";
      amtInp.value = inf.amount > 0 ? String(Math.round(inf.amount)) : "";
    } else {
      const defType = CAR_EXPENSE_TYPES[0];
      typeSel.value = defType.key;
      nameInp.value = defType.label;
      intervalSel.value = "once";
      payDayInp.value = "25";
      const y = Number(ui.carListYear) || baseYear;
      const m = Number(ui.carListMonth) || cur.month;
      const d = clampDay(y, m, 25);
      firstInp.value = `${y}-${pad2(m)}-${pad2(d)}`;
      endInp.value = "";
      amtInp.value = "";
    }
    updateCarEditorIntervalVisibility();
    if (note) note.textContent = "";
    applyCarOverlayDateBounds();
  }

  renderCarExpenseListMount();

  if (intervalSel && !intervalSel._carBound) {
    intervalSel._carBound = true;
    intervalSel.addEventListener("change", updateCarEditorIntervalVisibility);
  }
  if (typeSel && !typeSel._carBound) {
    typeSel._carBound = true;
    typeSel.addEventListener("change", () => {
      if (ui.carEditingExpenseId) return;
      const t = CAR_EXPENSE_TYPES.find((x) => x.key === typeSel.value);
      if (t && nameInp) nameInp.value = t.label;
    });
  }
}

function saveCarExpenseFromEditor() {
  const note = document.getElementById("carNote");
  const typeSel = document.getElementById("carEditType");
  const nameInp = document.getElementById("carEditName");
  const payDayInp = document.getElementById("carEditPaymentDay");
  const intervalSel = document.getElementById("carEditInterval");
  const firstInp = document.getElementById("carEditFirstDate");
  const endInp = document.getElementById("carEditEndDate");
  const amtInp = document.getElementById("carEditAmount");
  if (!typeSel || !nameInp || !intervalSel || !firstInp || !amtInp) return;

  const name = (nameInp.value || "").trim();
  if (!name) {
    if (note) note.textContent = "Ange namn på utgift.";
    return;
  }
  const carTypeKey = typeSel.value || CAR_EXPENSE_TYPES[0].key;
  const interval = intervalSel.value || "once";
  const firstDateISO = (firstInp.value || "").trim();
  const firstParts = datePartsFromIso(firstDateISO);
  if (!firstParts) {
    if (note) note.textContent = interval === "once" ? "Ange datum för betalning." : "Ange första betalningsdatum.";
    return;
  }
  if (!isAllowedYear(firstParts.y)) {
    if (note) note.textContent = "Datum måste ligga inom appens årsspann (föregående, nuvarande, nästa år).";
    return;
  }
  const paymentDay = Math.max(1, Math.min(31, Math.floor(asNumber(payDayInp?.value) || 25)));
  let endDateISO = (endInp?.value || "").trim();
  if (interval === "once") {
    endDateISO = "";
  } else if (endDateISO && !datePartsFromIso(endDateISO)) {
    if (note) note.textContent = "Ogiltigt slutdatum för betalning.";
    return;
  }
  const amount = asNumber(amtInp.value);
  if (amount <= 0) {
    if (note) note.textContent = "Ange belopp större än noll.";
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
    if (note)
      note.textContent =
        "Inga betalningar kunde skapas inom appens datumfönster. Kontrollera intervall, datum och eventuellt slutdatum.";
    return;
  }
  const base = {
    name,
    interval,
    payments,
    expenseCategory: "car",
    carTypeKey,
    carPaymentDay: interval === "once" ? firstParts.d : paymentDay,
    carFirstDate: firstDateISO,
    carEndDate: endDateISO
  };
  if (ui.carEditingExpenseId) {
    const idx = (state.expenses || []).findIndex((x) => x.id === ui.carEditingExpenseId);
    if (idx >= 0) state.expenses[idx] = { ...state.expenses[idx], ...base, id: state.expenses[idx].id };
  } else {
    state.expenses.push({ id: uid(), ...base });
  }
  saveState();
  if (note) note.textContent = "";
  ui.carEditorOpen = false;
  ui.carEditingExpenseId = null;
  renderCarPage();
  renderOverviewIfOnOverview();
  renderExpensesList();
}

function deleteCarExpenseFromEditor() {
  if (!ui.carEditingExpenseId) return;
  state.expenses = (state.expenses || []).filter((x) => x.id !== ui.carEditingExpenseId);
  saveState();
  ui.carEditorOpen = false;
  ui.carEditingExpenseId = null;
  renderCarPage();
  renderOverviewIfOnOverview();
  renderExpensesList();
}

function renderHomePage() {
  const year = ui.expensesYear;
  const config = state.special.home[String(year)] || {};
  document.getElementById("homeRent").value = asNumber(config.rent);
  document.getElementById("homeElectricity").value = asNumber(config.electricity);
  document.getElementById("homeWater").value = asNumber(config.water);
  document.getElementById("homeGarbage").value = asNumber(config.garbage);
  document.getElementById("homeInternet").value = asNumber(config.internet);
  document.getElementById("homeParking").value = asNumber(config.parking);
}

function renderFoodPage() {
  const foodNoteClear = document.getElementById("foodNote");
  if (foodNoteClear) foodNoteClear.textContent = "";

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
    custodyListTitle: document.getElementById("foodCustodyListTitle"),
    custodyListError: document.getElementById("foodCustodyListError"),
    custodyEditor: document.getElementById("foodCustodyEditor"),
    custodyEditorWeekCost: document.getElementById("foodCustodyEditorWeekCost"),
    custodyExampleBlock: document.getElementById("foodCustodyExampleBlock"),
    custodyExampleWeeks: document.getElementById("foodCustodyExampleWeeks"),
    kidsToggle: document.getElementById("foodKidsToggleBtn"),
    kidsSection: document.getElementById("foodKidsSection"),
    foodLevelHelp: document.getElementById("foodLevelHelp"),
    foodScopeHelp: document.getElementById("foodScopeHelp"),
    hhToggle: document.getElementById("foodHouseholdToggleBtn"),
    hhSection: document.getElementById("foodHouseholdChangesSection"),
    hhList: document.getElementById("foodHouseholdChangesList"),
    devToggle: document.getElementById("foodDeviationsToggleBtn"),
    devSection: document.getElementById("foodDeviationsSection"),
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
    if (st) st.classList.remove("input-invalid");
  };

  const renderCustodyEditor = () => {
    const editor = els.custodyEditor;
    if (!editor) return;
    const arr = ui.foodConfigDraft.custodyPeriods || [];
    const p = editingCustodyIndex >= 0 ? arr[editingCustodyIndex] : custodyEditorDraft;
    if (!p) {
      editor.hidden = true;
      return;
    }
    editor.hidden = false;
    document.getElementById("foodCustodyEditStart").value = p.startDate || "";
    document.getElementById("foodCustodyEditEnd").value = p.endDate || "";
    document.getElementById("foodCustodyEditRatio").value = p.ratioKey || "7-7";
    document.getElementById("foodCustodyEditChildrenInput").value = asNumber(p.absent?.children);
    document.getElementById("foodCustodyEditTeensInput").value = asNumber(p.absent?.teens);
    clearCustodyEditorFieldErrors();
  };

  const renderCustodyPeriodsList = (custodyAccept) => {
    const list = els.custodyList;
    const arr = ui.foodConfigDraft.custodyPeriods || [];
    if (els.custodyListTitle) els.custodyListTitle.hidden = arr.length === 0;
    if (els.custodyListError) {
      els.custodyListError.hidden = true;
      els.custodyListError.textContent = "";
    }
    if (!list) return;
    const sorted = arr.map((p, idx) => ({ p, idx })).sort(
      (a, b) => String(a.p.startDate || "").localeCompare(String(b.p.startDate || "")) || a.idx - b.idx
    );
    list.innerHTML = sorted.map(({ p, idx }) => {
      const shadow = custodyAccept.shadowedOrigIndices.has(idx);
      const endDisp = p.endDate && String(p.endDate).trim() ? p.endDate : "tills vidare";
      const range = `${escapeHtml(p.startDate || "-")} – ${escapeHtml(endDisp)}`;
      const clash = shadow ? ` <span style="color:var(--danger)">(överlapp — räknas ej)</span>` : "";
      const rowClass = shadow ? "summary-row food-custody-row-shadowed" : "summary-row";
      return `<div class="${rowClass}">
        <span>${range}${clash}</span>
        <strong><button class="icon-btn btn-icon" type="button" data-custody-edit="${idx}" aria-label="Redigera">✎</button> <button class="danger btn-icon" type="button" data-custody-del="${idx}" aria-label="Ta bort">X</button></strong>
      </div>`;
    }).join("");
    list.querySelectorAll("[data-custody-del]").forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.getAttribute("data-custody-del"));
        ui.foodConfigDraft.custodyPeriods.splice(i, 1);
        if (editingCustodyIndex === i) editingCustodyIndex = -1;
        else if (editingCustodyIndex > i) editingCustodyIndex -= 1;
        if (ui.foodConfigDraft.custodyPeriods.length === 0) delete ui.foodConfigDraft._custodyHhSnapGlobal;
        custodyEditorDraft = null;
        renderCustodyEditor();
        draw();
      };
    });
    list.querySelectorAll("[data-custody-edit]").forEach((btn) => {
      btn.onclick = () => {
        editingCustodyIndex = Number(btn.getAttribute("data-custody-edit"));
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
    setChipState("foodScopeGroceriesBtn", d.foodScope === "groceries");
    setChipState("foodScopeMixedBtn", d.foodScope === "mixed");
    setChipState("foodScopeAllBtn", d.foodScope === "all");

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
    const badRange = (p) => {
      const s = parseDateISO(p?.startDate);
      const e = parseDateISO(p?.endDate);
      return !s || !e || e.getTime() < s.getTime();
    };
    let canSave = true;
    if (!custodyOk) canSave = false;
    if (auto) {
      if ((d.householdChanges || []).some(badRange)) canSave = false;
      if ((d.deviations || []).some(badRange)) canSave = false;
    }
    if (saveBtn) saveBtn.disabled = !canSave;

    let saveBlockMsg = "";
    if (custodyAccept.shadowedOrigIndices.size > 0) {
      saveBlockMsg = "Växelvis boende: justera överlappande perioder innan du kan spara.";
    } else if (!custodyOk) {
      saveBlockMsg = "Växelvis: kontrollera periodernas datum och antal som är borta.";
    } else if (auto && (d.householdChanges || []).some(badRange)) {
      saveBlockMsg = "Ändrat hushåll: varje period behöver giltiga datum (till efter från).";
    } else if (auto && (d.deviations || []).some(badRange)) {
      saveBlockMsg = "Avvikande veckor: varje period behöver giltiga datum (till efter från).";
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
  document.getElementById("foodScopeGroceriesBtn").onclick = () => { ui.foodConfigDraft.foodScope = "groceries"; draw(); };
  document.getElementById("foodScopeMixedBtn").onclick = () => { ui.foodConfigDraft.foodScope = "mixed"; draw(); };
  document.getElementById("foodScopeAllBtn").onclick = () => { ui.foodConfigDraft.foodScope = "all"; draw(); };

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
    if (els.kidsSection && els.kidsSection.hidden) {
      els.kidsSection.hidden = false;
      if (els.kidsToggle) els.kidsToggle.textContent = "▴";
    }
    renderCustodyEditor();
    draw();
  };
  document.getElementById("foodCustodyEditCancelBtn").onclick = () => {
    editingCustodyIndex = -1;
    custodyEditorDraft = null;
    clearCustodyEditorFieldErrors();
    renderCustodyEditor();
    draw();
  };
  document.getElementById("foodCustodyClearEndBtn").onclick = () => {
    const e = document.getElementById("foodCustodyEditEnd");
    if (e) e.value = "";
    draw();
  };
  document.getElementById("foodCustodyEditStart").oninput = () => draw();
  document.getElementById("foodCustodyEditStart").onchange = () => draw();
  document.getElementById("foodCustodyEditEnd").oninput = () => draw();
  document.getElementById("foodCustodyEditEnd").onchange = () => draw();
  document.getElementById("foodCustodyEditRatio").onchange = () => draw();
  document.getElementById("foodCustodyEditChildrenMinusBtn").onclick = () => bumpCustodyEditorAbsent("children", -1);
  document.getElementById("foodCustodyEditChildrenPlusBtn").onclick = () => bumpCustodyEditorAbsent("children", +1);
  document.getElementById("foodCustodyEditTeensMinusBtn").onclick = () => bumpCustodyEditorAbsent("teens", -1);
  document.getElementById("foodCustodyEditTeensPlusBtn").onclick = () => bumpCustodyEditorAbsent("teens", +1);
  document.getElementById("foodCustodyEditChildrenInput").oninput = () => {
    writeCustodyEditorAbsent("children", document.getElementById("foodCustodyEditChildrenInput").value);
    draw();
  };
  document.getElementById("foodCustodyEditTeensInput").oninput = () => {
    writeCustodyEditorAbsent("teens", document.getElementById("foodCustodyEditTeensInput").value);
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
      return;
    }
    const endStr = next.endDate && String(next.endDate).trim();
    if (endStr) {
      const eDt = parseDateISO(endStr);
      if (!eDt || diffCalendarDays(s, eDt) < 1) {
        setCustodyFieldErr(document.getElementById("foodCustodyErrEnd"), "Slutdatum måste vara minst en kalenderdag efter start.");
        return;
      }
    }
    const baseChildren = Math.max(0, Math.floor(asNumber(ui.foodConfigDraft.household?.children)));
    const baseTeens = Math.max(0, Math.floor(asNumber(ui.foodConfigDraft.household?.teens)));
    if (next.absent.children > baseChildren || next.absent.teens > baseTeens) {
      setCustodyFieldErr(cErr, `Du kan inte ange fler än i grundhushållet (barn: ${baseChildren}, tonåringar: ${baseTeens}).`);
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
    if (tryAccept(trial).shadowedOrigIndices.size > 0) {
      setCustodyFieldErr(document.getElementById("foodCustodyErrEnd"), "Perioden överlappar en annan. Justera datumen.");
      return;
    }
    if (editingCustodyIndex >= 0) ui.foodConfigDraft.custodyPeriods[editingCustodyIndex] = next;
    else ui.foodConfigDraft.custodyPeriods.push(next);
    editingCustodyIndex = -1;
    custodyEditorDraft = null;
    renderCustodyEditor();
    draw();
  };
  const kidsToggle = els.kidsToggle;
  const kidsSection = els.kidsSection;
  if (kidsToggle && kidsSection) {
    kidsToggle.onclick = () => {
      kidsSection.hidden = !kidsSection.hidden;
      kidsToggle.textContent = kidsSection.hidden ? "▾" : "▴";
    };
  }
  // Household changes section
  const hhToggle = els.hhToggle;
  const hhSection = els.hhSection;
  if (hhToggle && hhSection) hhToggle.onclick = () => { hhSection.hidden = !hhSection.hidden; hhToggle.textContent = hhSection.hidden ? "▾" : "▴"; };
  let editingHouseholdChangeIndex = -1;
  let householdEditorDraft = null;
  const renderHouseholdChanges = () => {
    const list = els.hhList;
    const arr = ui.foodConfigDraft.householdChanges || [];
    const editor = document.getElementById("foodHouseholdEditor");
    const listTitleEl = document.getElementById("foodHhListTitle");
    if (listTitleEl) listTitleEl.hidden = arr.length === 0;
    if (!list || !editor) return;
    const sorted = arr
      .map((ch, idx) => ({ ch, idx }))
      .sort((a, b) => String(a.ch.startDate || "").localeCompare(String(b.ch.startDate || "")));
    list.innerHTML = sorted.map(({ ch, idx }) => {
      const range = `${escapeHtml(ch.startDate || "-")} - ${escapeHtml(ch.endDate || "-")}`;
      return `<div class="summary-row">
        <span>${range}</span>
        <strong><button class="icon-btn btn-icon" type="button" data-hh-edit="${idx}" aria-label="Redigera">✎</button> <button class="danger btn-icon" type="button" data-hh-del="${idx}" aria-label="Ta bort">X</button></strong>
      </div>`;
    }).join("");
    list.querySelectorAll("[data-hh-del]").forEach((btn) => btn.onclick = () => {
      const i = Number(btn.getAttribute("data-hh-del"));
      ui.foodConfigDraft.householdChanges.splice(i, 1);
      if (editingHouseholdChangeIndex === i) editingHouseholdChangeIndex = -1;
      if (editingHouseholdChangeIndex > i) editingHouseholdChangeIndex -= 1;
      renderHouseholdChanges();
      renderHouseholdEditor();
      draw();
    });
    list.querySelectorAll("[data-hh-edit]").forEach((btn) => btn.onclick = () => {
      editingHouseholdChangeIndex = Number(btn.getAttribute("data-hh-edit"));
      renderHouseholdEditor();
    });
  };
  const renderHouseholdEditor = () => {
    const editor = document.getElementById("foodHouseholdEditor");
    if (!editor) return;
    const arr = ui.foodConfigDraft.householdChanges || [];
    const ch = editingHouseholdChangeIndex >= 0 ? arr[editingHouseholdChangeIndex] : householdEditorDraft;
    if (!ch) {
      editor.hidden = true;
      return;
    }
    editor.hidden = false;
    document.getElementById("foodHhEditStart").value = ch.startDate || "";
    document.getElementById("foodHhEditEnd").value = ch.endDate || "";
    document.getElementById("foodHhEditAdults").value = asNumber(ch.household?.adults);
    document.getElementById("foodHhEditTeens").value = asNumber(ch.household?.teens);
    document.getElementById("foodHhEditChildren").value = asNumber(ch.household?.children);
  };
  const readHouseholdEditor = () => {
    const arr = ui.foodConfigDraft.householdChanges || [];
    const target = editingHouseholdChangeIndex >= 0 ? arr[editingHouseholdChangeIndex] : householdEditorDraft;
    if (!target) return null;
    const startDate = document.getElementById("foodHhEditStart").value || "";
    const endDate = document.getElementById("foodHhEditEnd").value || "";
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
    const next = readHouseholdEditor();
    if (!next) return;
    const s = parseDateISO(next.startDate);
    const e = parseDateISO(next.endDate);
    if (!s || !e) {
      if (hhErr) {
        hhErr.hidden = false;
        hhErr.textContent = "Ange både Från och Till.";
      }
      return;
    }
    if (e.getTime() < s.getTime()) {
      if (hhErr) {
        hhErr.hidden = false;
        hhErr.textContent = "Till måste vara samma eller efter Från.";
      }
      return;
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
    renderHouseholdChanges();
    renderHouseholdEditor();
    draw();
  };
  document.getElementById("foodHhEditCancelBtn").onclick = () => {
    editingHouseholdChangeIndex = -1;
    householdEditorDraft = null;
    renderHouseholdEditor();
  };
  document.getElementById("foodAddHouseholdChangeBtn").onclick = () => {
    ui.foodConfigDraft.householdChanges = ui.foodConfigDraft.householdChanges || [];
    householdEditorDraft = {
      startDate: "",
      endDate: "",
      household: { adults: ui.foodConfigDraft.household.adults, teens: ui.foodConfigDraft.household.teens, children: ui.foodConfigDraft.household.children }
    };
    editingHouseholdChangeIndex = -1;
    if (hhSection.hidden) hhToggle.onclick();
    renderHouseholdChanges();
    renderHouseholdEditor();
  };

  // Deviations section
  const devToggle = els.devToggle;
  const devSection = els.devSection;
  if (devToggle && devSection) devToggle.onclick = () => { devSection.hidden = !devSection.hidden; devToggle.textContent = devSection.hidden ? "▾" : "▴"; };
  let editingDeviationIndex = -1;
  let deviationEditorDraft = null;
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
    if (!dv) {
      editor.hidden = true;
      return;
    }
    editor.hidden = false;
    document.getElementById("foodDevEditStart").value = dv.startDate || "";
    document.getElementById("foodDevEditEnd").value = dv.endDate || "";
    document.getElementById("foodDevEditPreset").value = deviationPresetFromValue(dv.value);
  };
  const readDeviationEditor = () => {
    const arr = ui.foodConfigDraft.deviations || [];
    const target = editingDeviationIndex >= 0 ? arr[editingDeviationIndex] : deviationEditorDraft;
    if (!target) return null;
    const startDate = document.getElementById("foodDevEditStart").value || "";
    const endDate = document.getElementById("foodDevEditEnd").value || "";
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
    const listTitleEl = document.getElementById("foodDevListTitle");
    if (listTitleEl) listTitleEl.hidden = arr.length === 0;
    if (!list) return;
    const sorted = arr
      .map((dv, idx) => ({ dv, idx }))
      .sort((a, b) => String(a.dv.startDate || "").localeCompare(String(b.dv.startDate || "")));
    list.innerHTML = sorted.map(({ dv, idx }) => {
      const range = `${escapeHtml(dv.startDate || "-")} - ${escapeHtml(dv.endDate || "-")}`;
      return `<div class="summary-row">
        <span>${range}</span>
        <strong><button class="icon-btn btn-icon" type="button" data-dev-edit="${idx}" aria-label="Redigera">✎</button> <button class="danger btn-icon" type="button" data-dev-del="${idx}" aria-label="Ta bort">X</button></strong>
      </div>`;
    }).join("");
    list.querySelectorAll("[data-dev-del]").forEach((btn) => btn.onclick = () => {
      const i = Number(btn.getAttribute("data-dev-del"));
      ui.foodConfigDraft.deviations.splice(i, 1);
      if (editingDeviationIndex === i) editingDeviationIndex = -1;
      if (editingDeviationIndex > i) editingDeviationIndex -= 1;
      renderDeviations();
      renderDeviationEditor();
      draw();
    });
    list.querySelectorAll("[data-dev-edit]").forEach((btn) => btn.onclick = () => {
      editingDeviationIndex = Number(btn.getAttribute("data-dev-edit"));
      renderDeviationEditor();
    });
  };
  document.getElementById("foodDevEditSaveBtn").onclick = () => {
    const devErr = document.getElementById("foodDeviationsError");
    if (devErr) {
      devErr.hidden = true;
      devErr.textContent = "";
    }
    const next = readDeviationEditor();
    if (!next) return;
    const s = parseDateISO(next.startDate);
    const e = parseDateISO(next.endDate);
    if (!s || !e) {
      if (devErr) {
        devErr.hidden = false;
        devErr.textContent = "Ange både Från och Till.";
      }
      return;
    }
    if (e.getTime() < s.getTime()) {
      if (devErr) {
        devErr.hidden = false;
        devErr.textContent = "Till måste vara samma eller efter Från.";
      }
      return;
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
    renderDeviations();
    renderDeviationEditor();
    draw();
  };
  document.getElementById("foodDevEditCancelBtn").onclick = () => {
    editingDeviationIndex = -1;
    deviationEditorDraft = null;
    renderDeviationEditor();
  };
  document.getElementById("foodAddDeviationBtn").onclick = () => {
    ui.foodConfigDraft.deviations = ui.foodConfigDraft.deviations || [];
    deviationEditorDraft = { startDate: "", endDate: "", adjustmentType: "factor", value: 1.2 };
    editingDeviationIndex = -1;
    if (devSection.hidden) devToggle.onclick();
    renderDeviations();
    renderDeviationEditor();
  };

  renderCustodyEditor();
  renderHouseholdChanges();
  renderHouseholdEditor();
  renderDeviations();
  renderDeviationEditor();

  // Simple warnings (non-blocking)
  const weeklyWarn = () => {
    const w = computeFoodWeeklyCost(ui.foodConfigDraft);
    if (w > 20000) setWarn("Varning: ovanligt hög veckokostnad.");
  };
  const originalDraw = draw;
  const wrappedDraw = () => {
    originalDraw();
    weeklyWarn();
    applyFoodOverlayDateBounds();
  };
  // replace draw calls by wrappedDraw via function alias
  draw = wrappedDraw;
  draw();
}

function renderChildrenPage() {
  const year = ui.expensesYear;
  const config = state.special.children[String(year)] || {};
  document.getElementById("kidsClothesPerMonth").value = asNumber(config.kidsClothesPerMonth);
  document.getElementById("kidsActivitiesPerMonth").value = asNumber(config.kidsActivitiesPerMonth);
  document.getElementById("kidsPocketMoneyPerMonth").value = asNumber(config.kidsPocketMoneyPerMonth);
  document.getElementById("kidsPhonePerMonth").value = asNumber(config.kidsPhonePerMonth);
  document.getElementById("kidsBusCardPerMonth").value = asNumber(config.kidsBusCardPerMonth);
}

function renderSettingsPage() {
  // Settings inputs
  document.getElementById("backupIntervalDays").value = asNumber(state.settings.backupIntervalDays);
  document.getElementById("backupFilenamePattern").value = state.settings.backupFilenamePattern || "";
  const foodDay = document.getElementById("foodPlanningWeekday");
  if (foodDay) foodDay.value = String(state.settings.foodPlanningWeekday || 1);
}

function renderRecurringTables() {
  const expYear = ui.expensesYear;

  // recurring expenses
  const expBody = document.getElementById("recurringExpensesTableBody");
  if (!expBody) return;
  expBody.innerHTML = "";
  const expList = state.recurring?.expenses?.[String(expYear)] || [];
  if (expList.length === 0) {
    expBody.innerHTML = `<tr><td colspan="4" style="color: var(--muted);">Inga återkommande utgifter för valt år.</td></tr>`;
  } else {
    for (const it of expList) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(it.name)}</td><td>${escapeHtml(freqLabel(it.frequency))}</td><td class="right">${formatKr(it.amount)}</td><td><button class="danger" data-delete-rec-exp="${it.id}" type="button">Ta bort</button></td>`;
      expBody.appendChild(tr);
    }
  }

  // Bind delete handlers
  document.querySelectorAll("[data-delete-rec-exp]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-delete-rec-exp");
      const list = ensureYearArray(state.recurring.expenses, expYear);
      const idx = list.findIndex((x) => x.id === id);
      if (idx >= 0) list.splice(idx, 1);
      saveState();
      renderRecurringTables();
      renderOverviewIfOnOverview();
    });
  });
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
    case "add": {
      document.getElementById("headerSubtitle").textContent = "Snabbtillägg";
      break;
    }
    case "settings": {
      const themeModeSel = document.getElementById("themeMode");
      if (themeModeSel) themeModeSel.value = state.themeMode || "system";
      document.getElementById("themeMode") &&
        (document.getElementById("themeMode").onchange = () => {
        state.themeMode = themeModeSel.value;
        saveState();
        applyTheme();
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
      const dt = new Date(p.date);
      if (Number.isNaN(dt.getTime())) continue;
      years.add(String(dt.getFullYear()));
    }
  }
  for (const y of Object.keys(state.special?.loans || {})) {
    years.add(String(y));
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
    const name = inc.name || "Intäkt";
    for (const p of inc.payments || []) {
      const amt = asNumber(p.amount);
      if (amt <= 0) continue;
      const iso = p.date || "";
      const dt = iso ? new Date(iso) : null;
      if (!dt || Number.isNaN(dt.getTime())) continue;
      const y = dt.getFullYear();
      if (yearFilter !== "all" && String(y) !== String(yearFilter)) continue;
      const mo = dt.getMonth() + 1;
      if (monthFilter !== "all" && Number(monthFilter) !== mo) continue;
      rows.push({
        incomeId: inc.id,
        paymentId: p.id,
        name,
        isoDate: iso,
        date: dt,
        amount: amt
      });
    }
  }
  // Sort ascending so later dates are further down
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

  requireEl("openIncomeOverlayBtn").onclick = () => openIncomeOverlay(null);

  // Suggestions
  document.querySelectorAll("[data-income-suggest]").forEach((btn) => {
    btn.onclick = () => {
      document.getElementById("incomeNameInput").value = btn.getAttribute("data-income-suggest") || "";
    };
  });

  requireEl("incomeIntervalSelect").onchange = () => {
    // Only interval change resets rows
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
  requireEl("incomeModalTitle").textContent = editing ? "Redigera intäkt" : "Ny intäkt";
  requireEl("incomeEditorNote").textContent = "";
  requireEl("incomeDeleteBtn").hidden = !editing;

  const inc = editing ? (state.incomes || []).find((x) => x.id === incomeId) : null;
  requireEl("incomeNameInput").value = inc?.name || "";
  requireEl("incomeIntervalSelect").value = inc?.interval || "once";

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

  // Resolve focus target robustly: prefer payment ID if it exists, otherwise fallback to ISO date.
  if (ui.scrollToPaymentId) {
    const pid = String(ui.scrollToPaymentId);
    const hasIdMatch = ui.incomeEditorPayments.some((p) => String(p.id || "") === pid);
    if (hasIdMatch) ui.focusPaymentId = pid;
  }
  if (!ui.focusPaymentId && ui.scrollToPaymentDateISO) {
    ui.focusPaymentDateISO = String(ui.scrollToPaymentDateISO);
  }
  // Initialize defaults from existing data (if editing)
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

  // Apply to controls
  const defYear = requireEl("incomeDefaultYear");
  const defDay = requireEl("incomeDefaultDay");
  const defAmt = requireEl("incomeDefaultAmount");
  setYear3Options(defYear, ui.incomeDefaults.year);
  setDayOptions(defDay, ui.incomeDefaults.day);
  defAmt.value = asNumber(ui.incomeDefaults.amount);

  if (!editing) {
    resetIncomeEditorRowsForInterval();
  } else {
    renderIncomePaymentsEditorRows();
  }

  backdrop.hidden = false;
  modal.hidden = false;
  document.documentElement.classList.add("modal-open");
  document.body.classList.add("modal-open");

  // Scroll after modal is visible/rendered.
  if (ui.scrollToPaymentId) {
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
  const interval = document.getElementById("incomeIntervalSelect").value || "once";
  const count = paymentsCountForInterval(interval);

  if (!Array.isArray(ui.incomeEditorPayments)) ui.incomeEditorPayments = [];
  while (ui.incomeEditorPayments.length < count)
    ui.incomeEditorPayments.push({ id: uid(), year: "", month: "", day: "", amount: 0 });
  if (ui.incomeEditorPayments.length > count) ui.incomeEditorPayments = ui.incomeEditorPayments.slice(0, count);

  const body = document.getElementById("incomePaymentsEditorBody");
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
  const name = (document.getElementById("incomeNameInput").value || "").trim();
  const interval = document.getElementById("incomeIntervalSelect").value || "once";
  const note = document.getElementById("incomeEditorNote");

  if (!name) {
    note.textContent = "Ange namn på intäkt.";
    return;
  }

  const payments = (ui.incomeEditorPayments || []).map((p) => ({
    id: p.id || uid(),
    year: p.year,
    month: p.month,
    day: p.day,
    amount: asNumber(p.amount)
  }));

  // Validera: för rader med belopp > 0 måste år/månad/dag vara giltiga (ingen auto-korrigering)
  for (const p of payments) {
    if (asNumber(p.amount) <= 0) continue;
    const res = validateIncomePaymentParts(p);
    if (!res.ok) {
      note.textContent = res.message;
      return;
    }
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
  if (editing) {
    const idx = (state.incomes || []).findIndex((x) => x.id === ui.editIncomeId);
    if (idx >= 0) {
      state.incomes[idx] = { ...state.incomes[idx], name, interval, payments: storedPayments };
    }
  } else {
    state.incomes.push({ id: uid(), name, interval, payments: storedPayments });
  }

  saveState();
  closeIncomeOverlay();
  renderIncomesList();
  renderOverviewIfOnOverview();
}

function renderIncomesList() {
  const yearFilter = ui.incomeYearFilter || "all";
  const rows = buildIncomePaymentRowsForList(yearFilter);

  const body = document.getElementById("incomePaymentsTableBody");
  const note = document.getElementById("incomeListNote");
  body.innerHTML = "";

  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="4" style="color: var(--muted);">Inga utbetalningar för valt filter.</td></tr>`;
    note.textContent = "";
    return;
  }

  let prevMonthKey = null;
  let prevDataRow = null;
  for (const r of rows) {
    const monthKey = `${r.date.getFullYear()}-${pad2(r.date.getMonth() + 1)}`;
    if (!prevMonthKey || monthKey !== prevMonthKey) {
      if (prevDataRow) prevDataRow.classList.add("before-month-break");
      const monthRow = document.createElement("tr");
      monthRow.className = "month-label-row";
      monthRow.innerHTML = `<td colspan="4"><div class="month-divider"><span>${escapeHtml(monthName(
        r.date.getMonth() + 1
      ))}</span></div></td>`;
      body.appendChild(monthRow);
    }
    const tr = document.createElement("tr");
    const fullName = r.name;
    prevMonthKey = monthKey;
    prevDataRow = tr;

    tr.innerHTML = `
      <td>
        <button class="linklike truncate" type="button" data-show-income-name="${escapeHtml(fullName)}" title="${escapeHtml(
          fullName
        )}">${escapeHtml(fullName)}</button>
      </td>
      <td>
        <button class="linklike truncate" type="button"
          data-edit-income-date="${escapeHtml(r.incomeId)}"
          data-edit-income-payment="${escapeHtml(r.paymentId || "")}"
          data-edit-income-iso="${escapeHtml(r.isoDate || "")}"
          title="${escapeHtml(r.isoDate || "")}">
          ${escapeHtml(r.isoDate || r.date.toLocaleDateString("sv-SE"))}
        </button>
      </td>
      <td class="right">${formatKr(r.amount)}</td>
      <td class="right">
        <button
          class="secondary btn-icon"
          type="button"
          data-edit-income="${escapeHtml(r.incomeId)}"
          data-edit-income-payment="${escapeHtml(r.paymentId || "")}"
          data-edit-income-iso="${escapeHtml(r.isoDate || "")}"
          aria-label="Redigera"
        >✎</button>
      </td>
    `;
    body.appendChild(tr);
  }

  document.querySelectorAll("[data-show-income-name]").forEach((btn) => {
    btn.onclick = () => {
      // Mobile-friendly "hover/peek": temporary inline expand
      document.querySelectorAll("[data-show-income-name].peek").forEach((open) => open.classList.remove("peek"));
      btn.classList.add("peek");
      setTimeout(() => btn.classList.remove("peek"), 1800);
    };
  });

  document.querySelectorAll("[data-edit-income]").forEach((btn) => {
    btn.onclick = () => {
      const incomeId = btn.getAttribute("data-edit-income");
      const paymentId = btn.getAttribute("data-edit-income-payment");
      const iso = btn.getAttribute("data-edit-income-iso");
      openIncomeOverlay(incomeId, { scrollToPaymentId: paymentId, scrollToPaymentDateISO: iso });
    };
  });

  document.querySelectorAll("[data-edit-income-date]").forEach((btn) => {
    btn.onclick = () => {
      const incomeId = btn.getAttribute("data-edit-income-date");
      const paymentId = btn.getAttribute("data-edit-income-payment");
      const iso = btn.getAttribute("data-edit-income-iso");
      openIncomeOverlay(incomeId, { scrollToPaymentId: paymentId, scrollToPaymentDateISO: iso });
    };
  });
}

function expenseYearsForFilter() {
  const years = new Set();
  years.add("all");
  for (const exp of state.expenses || []) {
    for (const p of exp.payments || []) {
      if (!p?.date) continue;
      const dt = new Date(p.date);
      if (Number.isNaN(dt.getTime())) continue;
      years.add(String(dt.getFullYear()));
    }
  }
  for (const loan of getAllLoans()) {
    for (const ym of enumerateLoanMonths(loan)) years.add(String(ym.year));
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

function buildExpensePaymentRowsForList(yearFilter) {
  const rows = [];
  const monthFilter = ui.expenseMonthFilter || "all";
  for (const exp of state.expenses || []) {
    const name = exp.name || "Utgift";
    for (const p of exp.payments || []) {
      const amt = asNumber(p.amount);
      if (amt <= 0) continue;
      const iso = p.date || "";
      const dt = iso ? new Date(iso) : null;
      if (!dt || Number.isNaN(dt.getTime())) continue;
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
        foodYear: exp?.foodYear,
        foodWeekKey: exp?.foodWeekKey
      });
    }
  }
  for (const loan of getAllLoans()) {
    const total = getLoanTotalPayment(loan);
    if (total <= 0) continue;
    for (const ym of enumerateLoanMonths(loan)) {
      if (yearFilter !== "all" && String(ym.year) !== String(yearFilter)) continue;
      if (monthFilter !== "all" && Number(monthFilter) !== ym.month) continue;
      const dd = clampDay(ym.year, ym.month, Math.max(1, Math.min(31, asNumber(loan.dueDay) || 25)));
      const iso = `${ym.year}-${pad2(ym.month)}-${pad2(dd)}`;
      const dt = new Date(iso);
      if (Number.isNaN(dt.getTime())) continue;
      rows.push({
        expenseId: `loan:${loan.id}`,
        paymentId: `loan:${loan.id}:${ym.year}-${pad2(ym.month)}`,
        name: `Lån - ${loan.name || "Lån"}`,
        isoDate: iso,
        date: dt,
        amount: total,
        isLoanPayment: true,
        loanId: loan.id
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

  requireEl("openExpenseOverlayBtn").onclick = () => openExpenseOverlay(null);
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

function renderExpensesList() {
  const rows = buildExpensePaymentRowsForList(ui.expenseYearFilter || "all");
  const body = requireEl("expensePaymentsTableBody");
  body.innerHTML = "";
  const noteEl = requireEl("expenseListNote");
  noteEl.textContent = "";
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="4" style="color: var(--muted);">Inga utgifter för valt filter.</td></tr>`;
    return;
  }
  const total = rows.reduce((s, r) => s + asNumber(r.amount), 0);
  noteEl.textContent = `Totalt: ${formatKr(total)}`;
  let prevMonthKey = null;
  let prevDataRow = null;
  for (const r of rows) {
    const monthKey = `${r.date.getFullYear()}-${pad2(r.date.getMonth() + 1)}`;
    // Add month divider on first month and each month change
    if (!prevMonthKey || monthKey !== prevMonthKey) {
      if (prevDataRow) prevDataRow.classList.add("before-month-break");
      const monthRow = document.createElement("tr");
      monthRow.className = "month-label-row";
      monthRow.innerHTML = `<td colspan="4"><div class="month-divider"><span>${escapeHtml(monthName(
        r.date.getMonth() + 1
      ))} ${escapeHtml(String(r.date.getFullYear()))}</span></div></td>`;
      body.appendChild(monthRow);
    }
    const tr = document.createElement("tr");
    prevMonthKey = monthKey;
    prevDataRow = tr;
    tr.innerHTML = `
      <td><button class="linklike truncate" type="button" data-show-expense-name="${escapeHtml(r.name)}" title="${escapeHtml(r.name)}">${escapeHtml(
      r.name
    )}${r.isFoodPayment ? ` <span class="badge badge-food" aria-label="Systemgenererad">Mat</span>` : ""}</button></td>
      <td><button class="linklike truncate" type="button" ${r.isLoanPayment ? `data-edit-loan="${escapeHtml(r.loanId || "")}"` : `data-edit-expense-date="${escapeHtml(r.expenseId)}" data-edit-expense-payment="${escapeHtml(
      r.paymentId || ""
    )}" data-edit-expense-iso="${escapeHtml(r.isoDate || "")}"`} title="${escapeHtml(r.isoDate || "")}">${escapeHtml(r.isoDate || r.date.toLocaleDateString("sv-SE"))}</button></td>
      <td class="right">${formatKr(r.amount)}</td>
      <td class="right"><button class="secondary btn-icon" type="button" ${r.isLoanPayment ? `data-edit-loan="${escapeHtml(r.loanId || "")}"` : `data-edit-expense="${escapeHtml(r.expenseId)}" data-edit-expense-payment="${escapeHtml(
      r.paymentId || ""
    )}" data-edit-expense-iso="${escapeHtml(r.isoDate || "")}"`} aria-label="Redigera">✎</button></td>
    `;
    body.appendChild(tr);
  }
  document.querySelectorAll("[data-show-expense-name]").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("[data-show-expense-name].peek").forEach((open) => open.classList.remove("peek"));
      btn.classList.add("peek");
      setTimeout(() => btn.classList.remove("peek"), 1800);
    };
  });
  document.querySelectorAll("[data-edit-expense],[data-edit-expense-date]").forEach((btn) => {
    btn.onclick = () => {
      const expenseId = btn.getAttribute("data-edit-expense") || btn.getAttribute("data-edit-expense-date");
      const paymentId = btn.getAttribute("data-edit-expense-payment");
      const iso = btn.getAttribute("data-edit-expense-iso");
      const row = rows.find((r) => String(r.expenseId) === String(expenseId) && (!paymentId || String(r.paymentId) === String(paymentId)));
      if (row?.isFoodPayment) return openFoodOverlayForExpenseRow(row);
      openExpenseOverlay(expenseId, { scrollToPaymentId: paymentId, scrollToPaymentDateISO: iso });
    };
  });
  document.querySelectorAll("[data-edit-loan]").forEach((btn) => {
    btn.onclick = () => {
      openExpenseCategoryOverlay("loans");
      const loanId = btn.getAttribute("data-edit-loan");
      openLoanEditor(loanId);
    };
  });
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
  ui.editExpenseId = expenseId;
  ui.expenseScrollToPaymentId = opts?.scrollToPaymentId || null;
  ui.expenseScrollToPaymentDateISO = opts?.scrollToPaymentDateISO || null;
  ui.expenseFocusPaymentId = null;
  ui.expenseFocusPaymentDateISO = null;
  const modal = requireEl("expenseModal");
  const backdrop = requireEl("expenseModalBackdrop");
  const editing = Boolean(expenseId);
  modal.dataset.mode = editing ? "edit" : "create";
  requireEl("expenseModalTitle").textContent = editing ? "Redigera utgift" : "Ny utgift";
  requireEl("expenseEditorNote").textContent = "";
  requireEl("expenseDeleteBtn").hidden = !editing;
  const exp = editing ? (state.expenses || []).find((x) => x.id === expenseId) : null;
  if (isMatLikeExpense(exp)) {
    // Food is system-generated; redirect to Mat.
    closeExpenseOverlay();
    const p0 = exp?.payments?.[0];
    openFoodOverlayForExpenseRow({
      date: p0?.date ? new Date(p0.date) : null,
      foodYear: exp.foodYear != null && exp.foodYear !== "" ? Number(exp.foodYear) : undefined,
      foodWeekKey: exp.foodWeekKey
    });
    return;
  }
  if (isCarExpense(exp)) {
    closeExpenseOverlay();
    ui.carEditingExpenseId = expenseId;
    ui.carEditorOpen = true;
    const p0 = exp?.payments?.[0];
    if (p0?.date) {
      const d = new Date(p0.date);
      if (!Number.isNaN(d.getTime())) {
        ui.carListYear = d.getFullYear();
        ui.carListMonth = d.getMonth() + 1;
      }
    }
    openExpenseCategoryOverlay("car");
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

  if (!editing) resetExpenseEditorRowsForInterval();
  else renderExpensePaymentsEditorRows();

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
  const name = (requireEl("expenseNameInput").value || "").trim();
  const interval = requireEl("expenseIntervalSelect").value || "once";
  const note = requireEl("expenseEditorNote");
  if (!name) {
    note.textContent = "Ange namn på utgift.";
    return;
  }
  const payments = (ui.expenseEditorPayments || []).map((p) => ({ id: p.id || uid(), year: p.year, month: p.month, day: p.day, amount: asNumber(p.amount) }));
  for (const p of payments) {
    if (asNumber(p.amount) <= 0) continue;
    const res = validateIncomePaymentParts(p);
    if (!res.ok) {
      note.textContent = res.message;
      return;
    }
  }
  const stored = payments.map((p) => {
    const y = parseIntOrNull(p.year);
    const m = parseIntOrNull(p.month);
    const d = parseIntOrNull(p.day);
    const amt = asNumber(p.amount);
    const valid = y !== null && m !== null && d !== null && isAllowedYear(y) && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
    return { id: p.id, date: valid ? `${y}-${pad2(m)}-${pad2(d)}` : "", amount: amt };
  });
  if (ui.editExpenseId) {
    const idx = (state.expenses || []).findIndex((x) => x.id === ui.editExpenseId);
    if (idx >= 0) state.expenses[idx] = { ...state.expenses[idx], name, interval, payments: stored };
  } else {
    state.expenses.push({ id: uid(), name, interval, payments: stored });
  }
  saveState();
  closeExpenseOverlay();
  renderExpensesList();
  renderOverviewIfOnOverview();
}

function renderExpensesPage() {
  document.getElementById("headerSubtitle").textContent = "Utgifter";
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
    btn.onclick = () => closeExpenseCategoryOverlay();
  });

  renderExpensesSummaryPage();
}

function openExpenseCategoryOverlay(key) {
  const map = { home: renderHomePage, loans: renderLoansPage, car: renderCarPage, food: renderFoodPage, children: renderChildrenPage, savings: null };
  if (map[key]) map[key]();
  const target = document.querySelector(`[data-expview="${key}"]`);
  if (!target) return;
  target.hidden = false;
  document.documentElement.classList.add("modal-open");
  document.body.classList.add("modal-open");
}

function closeExpenseCategoryOverlay() {
  document.querySelectorAll(".exp-overlay").forEach((el) => (el.hidden = true));
  closeLoanEditor();
  hideConfirmDeleteLoanModal();
  ui.carEditorOpen = false;
  ui.carEditingExpenseId = null;
  document.documentElement.classList.remove("modal-open");
  document.body.classList.remove("modal-open");
}

function renderLoansPage() {
  const body = document.getElementById("loansTableBody");
  if (!body) return;

  const splitKr = (amount) => {
    const formatted = formatKr(amount);
    // Intl SEK returns something like: "200 000 kr" (with potential NBSPs)
    const m = String(formatted).match(/^(.*?)[\s\u00A0]*kr$/i);
    const num = (m && m[1] ? m[1] : formatted).trim();
    return { num, currency: "kr" };
  };

  const endKey = (loan) => (loan.endYear && loan.endMonth ? ymValue(loan.endYear, loan.endMonth) : null);
  const loans = getAllLoans().slice().sort((a, b) => {
    const byExactName = (a.name || "").localeCompare(b.name || "", "sv");
    if (byExactName !== 0) return byExactName;
    const ae = endKey(a);
    const be = endKey(b);
    if (ae === null && be === null) return 0;
    if (ae === null) return 1; // no end date last
    if (be === null) return -1;
    return ae - be; // later end date lower in list
  });
  body.innerHTML = "";
  if (loans.length === 0) {
    body.innerHTML = `<tr><td colspan="4" style="color: var(--muted);">Inga lån ännu.</td></tr>`;
  } else {
    for (const loan of loans) {
      const displayName = loan.name || "Lån";
      const displayBank = loan.bank || "";
      const total = splitKr(getLoanTotalPayment(loan));
      const hasEnd = Boolean(loan.endYear && loan.endMonth);
      const lastDay = hasEnd
        ? clampDay(loan.endYear, loan.endMonth, Math.max(1, Math.min(31, asNumber(loan.dueDay) || 25)))
        : null;
      const lastPaymentDate = hasEnd ? `${loan.endYear}-${pad2(loan.endMonth)}-${pad2(lastDay)}` : "";
      const tr = document.createElement("tr");
      tr.className = "loan-item-row";
      tr.innerHTML = `
        <td colspan="4">
          <div class="loan-item-grid">
            <div class="loan-item-name truncate" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</div>
            <div class="loan-item-cost">${escapeHtml(`${total.num}${total.currency}`)}</div>
            <button class="secondary btn-icon loan-item-edit" type="button" data-loan-edit="${escapeHtml(loan.id)}" aria-label="Redigera">✎</button>

            <div class="loan-item-bank truncate" title="${escapeHtml(displayBank)}">${escapeHtml(displayBank)}</div>
            ${hasEnd ? `<div class="loan-item-last">Sista betalning: ${escapeHtml(lastPaymentDate)}</div>` : `<div class="loan-item-last loan-item-last-empty"></div>`}
          </div>
        </td>
      `;
      body.appendChild(tr);
    }
  }
  body.querySelectorAll("[data-loan-edit]").forEach((btn) => {
    btn.onclick = () => openLoanEditor(btn.getAttribute("data-loan-edit"));
  });

  const editor = document.getElementById("loanEditorSection");
  if (editor) editor.hidden = !ui.loanEditorOpen;
  updateLoanDerivedFields();
}

function updateLoanDerivedFields() {
  const draft = {
    principal: asNumber(document.getElementById("loanPrincipal")?.value),
    rate: asNumber(document.getElementById("loanRate")?.value),
    amortization: asNumber(document.getElementById("loanAmortization")?.value)
  };
  const interest = getLoanInterestAmount(draft);
  const total = interest + asNumber(draft.amortization);
  const interestEl = document.getElementById("loanInterestAmount");
  const totalEl = document.getElementById("loanTotalPayment");
  if (interestEl) interestEl.textContent = `Räntebelopp: ${formatKr(interest)}`;
  if (totalEl) totalEl.textContent = `Månadskostnad: ${formatKr(total)}`;
}

function setLoanMonthNumberOptions(selectEl, selectedMonth, includeEmpty = false) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  if (includeEmpty) {
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "-";
    selectEl.appendChild(empty);
  }
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement("option");
    opt.value = String(m);
    opt.textContent = pad2(m);
    if (Number(selectedMonth) === m) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function setLoanEndYearOptions(selectEl, selectedYear) {
  if (!selectEl) return;
  const cur = currentYearMonth().year;
  const years = [cur - 1, cur, cur + 1];
  selectEl.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Tillsvidare";
  selectEl.appendChild(empty);
  for (const y of years) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = String(y);
    if (Number(selectedYear) === y) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function getLoanDraftFromInputs() {
  const endYearRaw = document.getElementById("loanEndYear")?.value || "";
  const endMonthRaw = document.getElementById("loanEndMonth")?.value || "";
  return {
    id: ui.editLoanId || uid(),
    name: String(document.getElementById("loanNameInput")?.value || "").trim(),
    bank: String(document.getElementById("loanBankInput")?.value || "").trim(),
    principal: asNumber(document.getElementById("loanPrincipal")?.value),
    rate: asNumber(document.getElementById("loanRate")?.value),
    amortization: asNumber(document.getElementById("loanAmortization")?.value),
    dueDay: Math.max(1, Math.min(31, Math.floor(asNumber(document.getElementById("loanDueDay")?.value) || 25))),
    startYear: Number(document.getElementById("loanStartYear")?.value || 0),
    startMonth: Number(document.getElementById("loanStartMonth")?.value || 0),
    endYear: endYearRaw === "" ? null : Number(endYearRaw),
    endMonth: endYearRaw === "" || endMonthRaw === "" ? null : Number(endMonthRaw)
  };
}

function nextYearMonth(year, month) {
  let y = Number(year);
  let m = Number(month) + 1;
  if (m > 12) {
    y += 1;
    m = 1;
  }
  return { year: y, month: m };
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

function renderLoanCopyNotice() {
  const el = document.getElementById("loanCopyNotice");
  if (!el) return;
  if (!ui.loanCopySourceName) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = `Kopia av befintligt lån - ${ui.loanCopySourceName} - Spara det nya lånet genom att klicka på Spara knappen`;
}

function openLoanEditor(loanId = null) {
  const cur = currentYearMonth();
  const existing = loanId ? getAllLoans().find((x) => x.id === loanId) : null;
  ui.editLoanId = existing?.id || null;
  ui.loanCopySourceName = null;
  ui.loanEditorOpen = true;
  const editor = document.getElementById("loanEditorSection");
  if (editor) editor.hidden = false;
  const actions = document.querySelector(".loan-editor-actions");
  if (actions) actions.dataset.mode = existing ? "edit" : "create";
  document.getElementById("loanNameInput").value = existing?.name || "";
  document.getElementById("loanBankInput").value = existing?.bank || "";
  document.getElementById("loanPrincipal").value = asNumber(existing?.principal);
  document.getElementById("loanRate").value = asNumber(existing?.rate).toFixed(3);
  document.getElementById("loanAmortization").value = asNumber(existing?.amortization);
  document.getElementById("loanDueDay").value = Math.max(1, Math.min(31, asNumber(existing?.dueDay) || 25));
  setYear3Options(document.getElementById("loanStartYear"), existing?.startYear || cur.year);
  setLoanMonthNumberOptions(document.getElementById("loanStartMonth"), existing?.startMonth || 1, false);
  setLoanEndYearOptions(document.getElementById("loanEndYear"), existing?.endYear || "");
  setLoanMonthNumberOptions(document.getElementById("loanEndMonth"), existing?.endMonth || "", true);
  const hasEnd = Boolean(existing?.endYear && existing?.endMonth);
  if (!hasEnd) {
    document.getElementById("loanEndYear").value = "";
    document.getElementById("loanEndMonth").value = "";
  }
  document.getElementById("loanEndMonth").disabled = !document.getElementById("loanEndYear").value;
  const deleteBtn = document.getElementById("loanDeleteBtn");
  const copyBtn = document.getElementById("loanCopyBtn");
  if (deleteBtn) deleteBtn.hidden = !existing;
  if (copyBtn) copyBtn.hidden = !existing;
  document.getElementById("loanDateError").hidden = true;
  document.getElementById("loanDateError").textContent = "";
  renderLoanCopyNotice();
  renderLoanDateInlineError();
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
  const actions = document.querySelector(".loan-editor-actions");
  if (actions) actions.dataset.mode = "create";
  document.getElementById("loanNameInput").value = "";
  document.getElementById("loanBankInput").value = "";
  document.getElementById("loanPrincipal").value = "";
  document.getElementById("loanRate").value = "";
  document.getElementById("loanAmortization").value = "";
  document.getElementById("loanDueDay").value = "25";
  setYear3Options(document.getElementById("loanStartYear"), currentYearMonth().year);
  setLoanMonthNumberOptions(document.getElementById("loanStartMonth"), 1, false);
  setLoanEndYearOptions(document.getElementById("loanEndYear"), "");
  setLoanMonthNumberOptions(document.getElementById("loanEndMonth"), "", true);
  document.getElementById("loanEndMonth").disabled = true;
  const deleteBtn = document.getElementById("loanDeleteBtn");
  const copyBtn = document.getElementById("loanCopyBtn");
  if (deleteBtn) deleteBtn.hidden = true;
  if (copyBtn) copyBtn.hidden = true;
  document.getElementById("loanDateError").hidden = true;
  document.getElementById("loanDateError").textContent = "";
  ui.loanCopySourceName = null;
  renderLoanCopyNotice();
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
  const carAddBtn = document.getElementById("carAddBtn");
  if (carAddBtn) {
    carAddBtn.addEventListener("click", () => {
      ui.carEditingExpenseId = null;
      ui.carEditorOpen = true;
      renderCarPage();
      const editorCard = document.getElementById("carEditorCard");
      if (editorCard) editorCard.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  const carSaveBtn = document.getElementById("carSaveBtn");
  if (carSaveBtn) carSaveBtn.addEventListener("click", () => saveCarExpenseFromEditor());
  const carDeleteBtn = document.getElementById("carDeleteBtn");
  if (carDeleteBtn) carDeleteBtn.addEventListener("click", () => deleteCarExpenseFromEditor());
  const carCancelEditorBtn = document.getElementById("carCancelEditorBtn");
  if (carCancelEditorBtn) {
    carCancelEditorBtn.addEventListener("click", () => {
      ui.carEditorOpen = false;
      ui.carEditingExpenseId = null;
      const note = document.getElementById("carNote");
      if (note) note.textContent = "";
      renderCarPage();
    });
  }

  // HOME
  document.getElementById("homeSaveBtn").addEventListener("click", () => {
    const year = ui.expensesYear || currentYearMonth().year;
    state.special.home[String(year)] = {
      rent: asNumber(document.getElementById("homeRent").value),
      electricity: asNumber(document.getElementById("homeElectricity").value),
      water: asNumber(document.getElementById("homeWater").value),
      garbage: asNumber(document.getElementById("homeGarbage").value),
      internet: asNumber(document.getElementById("homeInternet").value),
      parking: asNumber(document.getElementById("homeParking").value)
    };
    saveState();
    document.getElementById("homeNote").textContent = "Hemkostnader sparade.";
    renderOverviewIfOnOverview();
    renderHomePage();
    closeExpenseCategoryOverlay();
  });

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
      document.getElementById("foodNote").textContent = "Lägg till minst 1 person i hushållet eller välj manuell inmatning.";
      return;
    }
    // basic date validation for household changes / deviations
    const badRange = (p) => {
      const s = parseDateISO(p?.startDate);
      const e = parseDateISO(p?.endDate);
      return !s || !e || e.getTime() < s.getTime();
    };
    if ((cfg.householdChanges || []).some(badRange)) {
      document.getElementById("foodNote").textContent = "Ändrat hushåll: kontrollera datum (till måste vara efter från).";
      return;
    }
    if ((cfg.deviations || []).some(badRange)) {
      document.getElementById("foodNote").textContent = "Avvikande veckor: kontrollera datum (till måste vara efter från).";
      return;
    }
    const custodyForSave = cfg.custodyPeriods || [];
    const custodyAccSave = buildCustodyPeriodAcceptance(custodyForSave, 0);
    if (custodyAccSave.shadowedOrigIndices.size > 0) {
      document.getElementById("foodNote").textContent = "Växelvis boende: justera överlappande perioder innan du sparar.";
      const ks = document.getElementById("foodKidsSection");
      const kt = document.getElementById("foodKidsToggleBtn");
      if (ks && ks.hidden) {
        ks.hidden = false;
        if (kt) kt.textContent = "▴";
      }
      return;
    }
    const baseChildren = Math.max(0, Math.floor(asNumber(cfg.household?.children)));
    const baseTeens = Math.max(0, Math.floor(asNumber(cfg.household?.teens)));
    for (const p of custodyForSave) {
      const n = normalizeCustodyPeriodEntry(p);
      if (!n.startDate || !String(n.startDate).trim()) continue;
      if (!custodyPeriodEndDateValid(n)) {
        document.getElementById("foodNote").textContent = "Växelvis: slutdatum måste vara minst en dag efter start, eller lämna slut tomt.";
        return;
      }
      if (n.absent.children > baseChildren || n.absent.teens > baseTeens) {
        document.getElementById("foodNote").textContent = "Växelvis: för många barn/tonåringar markerade som borta.";
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
      state.expenses.push({
        id,
        name: `Mat v.${wk.weekNumber}`,
        interval: "once",
        foodGenerated: true,
        foodYear: Number(wk.expenseFoodYear),
        foodWeekKey: `${wk.isoYear}-W${pad2(wk.weekNumber)}`,
        foodPlanningDate: wk.planningDate,
        foodLabels: wk.labels,
        payments: [{ id: uid(), date: wk.planningDate, amount: wk.amount }]
      });
    }

    setSharedFoodModel(cfg, weeks);
    saveState();
    const foodNoteOk = document.getElementById("foodNote");
    if (foodNoteOk) foodNoteOk.textContent = "";
    renderOverviewIfOnOverview();
    renderExpensesList();
    renderFoodPage();
    closeExpenseCategoryOverlay();
  });

  // CHILDREN
  document.getElementById("kidsSaveBtn").addEventListener("click", () => {
    const year = ui.expensesYear || currentYearMonth().year;
    state.special.children[String(year)] = {
      kidsClothesPerMonth: asNumber(document.getElementById("kidsClothesPerMonth").value),
      kidsActivitiesPerMonth: asNumber(document.getElementById("kidsActivitiesPerMonth").value),
      kidsPocketMoneyPerMonth: asNumber(document.getElementById("kidsPocketMoneyPerMonth").value),
      kidsPhonePerMonth: asNumber(document.getElementById("kidsPhonePerMonth").value),
      kidsBusCardPerMonth: asNumber(document.getElementById("kidsBusCardPerMonth").value)
    };
    saveState();
    document.getElementById("kidsNote").textContent = "Barnkostnader sparade.";
    renderOverviewIfOnOverview();
    renderChildrenPage();
    closeExpenseCategoryOverlay();
  });

  // LOANS
  document.getElementById("loanAddNewBtn").addEventListener("click", () => openLoanEditor(null));
  document.getElementById("loanDeleteBtn").addEventListener("click", () => {
    if (!ui.editLoanId) return;
    showConfirmDeleteLoanModal();
  });
  document.getElementById("loanCopyBtn").addEventListener("click", () => {
    if (!ui.editLoanId) return;
    const source = getAllLoans().find((x) => x.id === ui.editLoanId);
    if (!source) return;
    const draft = normalizeLoanItem(source);
    draft.id = uid();
    if (draft.endYear && draft.endMonth) {
      const nm = nextYearMonth(draft.endYear, draft.endMonth);
      draft.startYear = nm.year;
      draft.startMonth = nm.month;
      draft.endYear = null;
      draft.endMonth = null;
    }
    ui.editLoanId = null;
    ui.loanCopySourceName = source.name || "Lån";
    document.getElementById("loanNameInput").value = draft.name;
    document.getElementById("loanBankInput").value = draft.bank;
    document.getElementById("loanPrincipal").value = asNumber(draft.principal);
    document.getElementById("loanRate").value = asNumber(draft.rate).toFixed(3);
    document.getElementById("loanAmortization").value = asNumber(draft.amortization);
    document.getElementById("loanDueDay").value = Math.max(1, Math.min(31, asNumber(draft.dueDay) || 25));
    setYear3Options(document.getElementById("loanStartYear"), draft.startYear);
    setLoanMonthNumberOptions(document.getElementById("loanStartMonth"), draft.startMonth, false);
    setLoanEndYearOptions(document.getElementById("loanEndYear"), draft.endYear || "");
    setLoanMonthNumberOptions(document.getElementById("loanEndMonth"), draft.endMonth || "", true);
    if (!draft.endYear || !draft.endMonth) {
      document.getElementById("loanEndYear").value = "";
      document.getElementById("loanEndMonth").value = "";
    }
    document.getElementById("loanEndMonth").disabled = !document.getElementById("loanEndYear").value;
    document.getElementById("loanDeleteBtn").hidden = true;
    document.getElementById("loanCopyBtn").hidden = true;
    renderLoanCopyNotice();
    renderLoanDateInlineError();
    updateLoanDerivedFields();
    requestAnimationFrame(() => {
      const overlay = document.querySelector('[data-expview="loans"]');
      if (overlay && typeof overlay.scrollTo === "function") overlay.scrollTo({ top: 0, behavior: "smooth" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    });
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
  ["loanStartYear", "loanStartMonth", "loanEndYear", "loanEndMonth"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      if (id === "loanEndYear") {
        const endYear = document.getElementById("loanEndYear").value;
        const endMonth = document.getElementById("loanEndMonth");
        endMonth.disabled = !endYear;
        if (!endYear) endMonth.value = "";
      }
      renderLoanDateInlineError();
    });
  });
  document.getElementById("loanSaveBtn").addEventListener("click", () => {
    const loans = getAllLoans();
    const draft = getLoanDraftFromInputs();
    if (!draft.name) {
      document.getElementById("loanNote").textContent = "Ange namn på lån.";
      return;
    }
    if (!renderLoanDateInlineError()) return;
    const idx = loans.findIndex((x) => x.id === draft.id);
    if (idx >= 0) loans[idx] = draft;
    else loans.push(draft);
    persistAllLoans(loans);
    saveState();
    ui.loanCopySourceName = null;
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

