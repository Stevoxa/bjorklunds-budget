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
  const n = Number(value) || 0;
  return new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n);
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
      lastBackupPromptAt: 0
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

  migrateLegacyIncomes(normalized);
  ensureIncomeIds(normalized);
  cleanupIncomeGarbage(normalized);
  migrateLegacyExpenses(normalized);
  ensureExpenseIds(normalized);
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
    return {
      id: expenseId,
      name: String(exp?.name || "").trim(),
      interval: exp?.interval || "once",
      payments: normalizedPayments
    };
  });
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
  expenseMonthFilter: "all"
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

function computeSpecialCarMonthly(year) {
  const config = state.special.car[String(year)] || {};
  const items = [
    { label: "Försäkring", amount: asNumber(config.insurance) },
    { label: "Drivmedel", amount: asNumber(config.fuel) },
    { label: "Parkering", amount: asNumber(config.parking) },
    { label: "Leasing/kontrakt", amount: asNumber(config.leasing) }
  ];
  const total = items.reduce((s, it) => s + it.amount, 0);
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

function computeSpecialFoodMonthly(year, month) {
  const items = [
    { label: "Frukost hemma", amount: asNumber(state.special.food?.[String(year)]?.[monthKey(month)]?.breakfastMonthly) },
    { label: "Lunch hemma", amount: asNumber(state.special.food?.[String(year)]?.[monthKey(month)]?.lunchHomeMonthly) },
    { label: "Middag hemma", amount: asNumber(state.special.food?.[String(year)]?.[monthKey(month)]?.dinnerMonthly) },
    { label: "Lunch på jobbet", amount: asNumber(state.special.food?.[String(year)]?.[monthKey(month)]?.lunchWorkMonthly) },
    { label: "Snabbmat", amount: asNumber(state.special.food?.[String(year)]?.[monthKey(month)]?.fastFoodMonthly) }
  ];
  const total = items.reduce((s, it) => s + it.amount, 0);
  return { total, items };
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

function computeRecurringMonthlyItems(items) {
  return (items || []).map((it) => ({ id: it.id, label: it.name, amount: asNumber(it.amount) }));
}

function computeMonthOverview(year, month) {
  const y = String(year);
  const m = monthKey(month);

  const car = computeSpecialCarMonthly(year);
  const housing = computeSpecialHousingMonthly(year);
  const food = computeSpecialFoodMonthly(year, month);
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

  const specialsAmount = car.total + housing.total + food.total + children.total;
  const oneOffExpensesAmount = oneOffExpenses.reduce((s, it) => s + it.amount, 0);

  const incomeAmount = incomePaymentsAmount + oneOffIncomes.reduce((s, it) => s + it.amount, 0);
  const plannedExpensesAmount = expensePaymentsAmount + specialsAmount + oneOffExpensesAmount;
  const remaining = incomeAmount - plannedExpensesAmount;

  // Diagramsegment: återkommande + special + enstaka
  const segments = [
    { key: "recurringExpenses", label: "Utgifter", amount: expensePaymentsAmount, color: "#8b5cf6" },
    { key: "car", label: "Bil", amount: car.total, color: "#3b82f6" },
    { key: "housing", label: "Hem", amount: housing.total, color: "#06b6d4" },
    { key: "food", label: "Mat", amount: food.total, color: "#f59e0b" },
    { key: "children", label: "Barn", amount: children.total, color: "#22c55e" },
    { key: "oneOffExpenses", label: "Enstaka utgifter", amount: oneOffExpensesAmount, color: "#ef4444" }
  ].filter((s) => s.amount > 0);

  // Tabellen: bryt ner utgifter och intäkter
  const expensesRows = [];
  for (const exp of state.expenses || []) {
    const payments = Array.isArray(exp.payments) ? exp.payments : [];
    for (const p of payments) {
      const amt = asNumber(p.amount);
      if (amt <= 0) continue;
      const dt = p.date ? new Date(p.date) : null;
      if (!dt || Number.isNaN(dt.getTime())) continue;
      if (dt.getFullYear() !== year || dt.getMonth() + 1 !== month) continue;
      expensesRows.push({ group: "Utgifter", label: `${exp.name || "Utgift"} (${dt.toLocaleDateString("sv-SE")})`, amount: amt });
    }
  }
  for (const it of car.items) expensesRows.push({ group: "Bil", label: it.label, amount: it.amount });
  for (const it of housing.items) expensesRows.push({ group: "Hem", label: it.label, amount: it.amount });
  for (const it of food.items) expensesRows.push({ group: "Mat", label: it.label, amount: it.amount });
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

function renderCarPage() {
  const year = ui.expensesYear;
  const config = state.special.car[String(year)] || {};
  document.getElementById("carOwnership").value = config.ownership || "owned";
  document.getElementById("carInsurance").value = asNumber(config.insurance);
  document.getElementById("carFuel").value = asNumber(config.fuel);
  document.getElementById("carParking").value = asNumber(config.parking);
  document.getElementById("carLeasing").value = asNumber(config.leasing);

  const leased = (config.ownership || "owned") === "leased";
  const leasingField = document.getElementById("carLeasingField");
  if (leasingField) leasingField.hidden = !leased;
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
  const year = ui.expensesYear || ui.overviewYear;
  const monthSel = document.getElementById("expensesFoodMonth");
  const month = Number(monthSel?.value || ui.overviewMonth || currentYearMonth().month);
  ui.expensesFoodMonth = month;
  const foodYear = state.special.food[String(year)] || {};
  const config = foodYear[monthKey(month)] || {};
  document.getElementById("foodBreakfastMonthly").value = asNumber(config.breakfastMonthly);
  document.getElementById("foodLunchHomeMonthly").value = asNumber(config.lunchHomeMonthly);
  document.getElementById("foodDinnerMonthly").value = asNumber(config.dinnerMonthly);
  document.getElementById("foodLunchWorkMonthly").value = asNumber(config.lunchWorkMonthly);
  document.getElementById("foodFastFoodMonthly").value = asNumber(config.fastFoodMonthly);
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
      const monthSel = document.getElementById("expensesFoodMonth");
      if (monthSel) setMonthOptions(monthSel, ui.expensesFoodMonth || ui.overviewMonth || currentYearMonth().month);
      bindExpensesSubnav();
      renderExpensesSubViews();
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
  for (const r of rows) {
    const tr = document.createElement("tr");
    const fullName = r.name;
    const monthKey = `${r.date.getFullYear()}-${pad2(r.date.getMonth() + 1)}`;
    if (prevMonthKey && monthKey !== prevMonthKey) tr.classList.add("month-break");
    prevMonthKey = monthKey;

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
      rows.push({ expenseId: exp.id, paymentId: p.id, name, isoDate: iso, date: dt, amount: amt });
    }
  }
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return rows;
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
  requireEl("expenseListNote").textContent = "";
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="4" style="color: var(--muted);">Inga utgifter för valt filter.</td></tr>`;
    return;
  }
  let prevMonthKey = null;
  for (const r of rows) {
    const monthKey = `${r.date.getFullYear()}-${pad2(r.date.getMonth() + 1)}`;
    if (monthKey !== prevMonthKey) {
      const monthRow = document.createElement("tr");
      monthRow.className = "month-label-row";
      monthRow.innerHTML = `<td colspan="4"><div class="month-divider"><span>${escapeHtml(monthName(
        r.date.getMonth() + 1
      ))}</span></div></td>`;
      body.appendChild(monthRow);
    }
    const tr = document.createElement("tr");
    if (prevMonthKey && monthKey !== prevMonthKey) tr.classList.add("month-break");
    prevMonthKey = monthKey;
    tr.innerHTML = `
      <td><button class="linklike truncate" type="button" data-show-expense-name="${escapeHtml(r.name)}" title="${escapeHtml(r.name)}">${escapeHtml(
      r.name
    )}</button></td>
      <td><button class="linklike truncate" type="button" data-edit-expense-date="${escapeHtml(r.expenseId)}" data-edit-expense-payment="${escapeHtml(
      r.paymentId || ""
    )}" data-edit-expense-iso="${escapeHtml(r.isoDate || "")}" title="${escapeHtml(r.isoDate || "")}">${escapeHtml(r.isoDate || r.date.toLocaleDateString("sv-SE"))}</button></td>
      <td class="right">${formatKr(r.amount)}</td>
      <td class="right"><button class="secondary btn-icon" type="button" data-edit-expense="${escapeHtml(r.expenseId)}" data-edit-expense-payment="${escapeHtml(
      r.paymentId || ""
    )}" data-edit-expense-iso="${escapeHtml(r.isoDate || "")}" aria-label="Redigera">✎</button></td>
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
      openExpenseOverlay(expenseId, { scrollToPaymentId: paymentId, scrollToPaymentDateISO: iso });
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

function bindExpensesSubnav() {
  document.querySelectorAll("[data-exp-tab]").forEach((btn) => {
    btn.onclick = () => {
      ui.expensesTab = btn.getAttribute("data-exp-tab") || "summary";
      renderExpensesSubViews();
    };
  });
}

function renderExpensesSubViews() {
  // Toggle tab button selected state
  document.querySelectorAll("[data-exp-tab]").forEach((btn) => {
    const k = btn.getAttribute("data-exp-tab");
    btn.setAttribute("aria-selected", k === ui.expensesTab ? "true" : "false");
  });

  // Toggle content
  document.querySelectorAll("[data-expview]").forEach((el) => {
    const k = el.getAttribute("data-expview");
    const active = k === ui.expensesTab;
    el.hidden = !active;
  });

  // Render specific subviews when active (pre-fill)
  if (ui.expensesTab === "summary") renderExpensesSummaryPage();
  if (ui.expensesTab === "home") renderHomePage();
  if (ui.expensesTab === "car") renderCarPage();
  if (ui.expensesTab === "food") renderFoodPage();
  if (ui.expensesTab === "children") renderChildrenPage();
  if (ui.expensesTab === "loans") renderLoansPage();
}

function renderLoansPage() {
  const year = ui.expensesYear;
  const config = state.special.loans[String(year)] || {};
  document.getElementById("loanPrincipal").value = asNumber(config.principal);
  document.getElementById("loanRate").value = asNumber(config.rate);
  document.getElementById("loanAmortization").value = asNumber(config.amortization);
}

function initActions() {
  // CAR
  document.getElementById("carOwnership").onchange = () => {
    const leased = document.getElementById("carOwnership").value === "leased";
    const leasingField = document.getElementById("carLeasingField");
    if (leasingField) leasingField.hidden = !leased;
  };

  document.getElementById("carSaveBtn").addEventListener("click", () => {
    const year = ui.expensesYear || currentYearMonth().year;
    state.special.car[String(year)] = {
      ownership: document.getElementById("carOwnership").value || "owned",
      insurance: asNumber(document.getElementById("carInsurance").value),
      fuel: asNumber(document.getElementById("carFuel").value),
      parking: asNumber(document.getElementById("carParking").value),
      leasing: asNumber(document.getElementById("carLeasing").value)
    };
    saveState();
    const note = document.getElementById("carNote");
    note.textContent = "Bil-kostnader sparade.";
    renderOverviewIfOnOverview();
    renderCarPage();
  });

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
  });

  // FOOD
  document.getElementById("foodSaveBtn").addEventListener("click", () => {
    const year = ui.expensesYear || ui.overviewYear || currentYearMonth().year;
    const month = ui.expensesFoodMonth || ui.overviewMonth || currentYearMonth().month;
    const mK = monthKey(Number(month));
    if (!state.special.food[String(year)]) state.special.food[String(year)] = {};
    state.special.food[String(year)][mK] = {
      breakfastMonthly: asNumber(document.getElementById("foodBreakfastMonthly").value),
      lunchHomeMonthly: asNumber(document.getElementById("foodLunchHomeMonthly").value),
      dinnerMonthly: asNumber(document.getElementById("foodDinnerMonthly").value),
      lunchWorkMonthly: asNumber(document.getElementById("foodLunchWorkMonthly").value),
      fastFoodMonthly: asNumber(document.getElementById("foodFastFoodMonthly").value)
    };

    saveState();
    document.getElementById("foodNote").textContent = `Matkostnader sparade för ${monthName(Number(month))} ${year}.`;
    renderOverviewIfOnOverview();
    renderFoodPage();
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
  });

  // LOANS
  document.getElementById("loanSaveBtn").addEventListener("click", () => {
    const year = ui.expensesYear || currentYearMonth().year;
    state.special.loans[String(year)] = {
      principal: asNumber(document.getElementById("loanPrincipal").value),
      rate: asNumber(document.getElementById("loanRate").value),
      amortization: asNumber(document.getElementById("loanAmortization").value)
    };
    saveState();
    document.getElementById("loanNote").textContent = "Låneuppgifter sparade.";
    renderOverviewIfOnOverview();
    renderLoansPage();
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

