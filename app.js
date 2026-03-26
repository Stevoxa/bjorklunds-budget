/* Björklunds - Budget (SPA/PWA)
   All data sparas lokalt i webstorage (localStorage). */

const STORAGE_KEY = "bjorklunds_budget_v1";

const WEEKS_PER_MONTH = 4.33;
const nowMs = () => Date.now();
const pad2 = (n) => String(n).padStart(2, "0");

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

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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
      incomes: { [String(currentYear)]: [] },
      expenses: { [String(currentYear)]: [] }
    },
    oneOff: {
      incomes: {},
      expenses: {}
    },
    special: {
      car: {},
      housing: {},
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
  normalized.recurring.incomes = normalized.recurring.incomes || base.recurring.incomes;
  normalized.recurring.expenses = normalized.recurring.expenses || base.recurring.expenses;

  normalized.oneOff = normalized.oneOff || base.oneOff;
  normalized.oneOff.incomes = normalized.oneOff.incomes || {};
  normalized.oneOff.expenses = normalized.oneOff.expenses || {};

  normalized.special = normalized.special || base.special;
  normalized.special.car = normalized.special.car || {};
  normalized.special.housing = normalized.special.housing || {};
  normalized.special.food = normalized.special.food || {};
  normalized.special.children = normalized.special.children || {};

  return normalized;
}

let state = null;
const ui = {
  activeRoute: "overview",
  // Översikt
  overviewYear: null,
  overviewMonth: null,
  // Poster
  postsYear: null,
  postsMonth: null
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
    document.querySelectorAll(".app-nav a").forEach((a) => {
      a.setAttribute("aria-current", a.getAttribute("data-navlink") === name ? "page" : "false");
    });
  };

  const onChange = () => {
    const allowed = new Set(["overview", "car", "housing", "food", "children", "posts", "settings"]);
    let route = routeFromHash();
    if (!allowed.has(route)) route = "overview";
    view(route);
    renderRoute(route);
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
  addFrom(state.recurring?.incomes);
  addFrom(state.recurring?.expenses);
  addFrom(state.special?.car);
  addFrom(state.special?.housing);
  addFrom(state.special?.children);
  addFrom(state.special?.food);
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
  const config = state.special.housing[String(year)] || {};
  const items = [
    { label: "Hyra", amount: asNumber(config.rent) },
    { label: "El/värme", amount: asNumber(config.energy) },
    { label: "Hemförsäkring", amount: asNumber(config.insurance) },
    { label: "Internet/TV", amount: asNumber(config.internet) },
    { label: "Övrigt boende", amount: asNumber(config.other) }
  ];
  const total = items.reduce((s, it) => s + it.amount, 0);
  return { total, items };
}

function computeSpecialFoodMonthly(year, month) {
  const foodYear = state.special.food[String(year)] || {};
  const config = foodYear[monthKey(month)] || {};

  const dinners = weeksToMonthlyCount(config.dinnersPerWeek);
  const breakfasts = weeksToMonthlyCount(config.breakfastsPerWeek);
  const lunchHome = weeksToMonthlyCount(config.lunchHomePerWeek);
  const lunchWork = weeksToMonthlyCount(config.lunchWorkPerWeek);

  const items = [
    { label: `Middagar hemma (${dinners} st)`, amount: dinners * asNumber(config.dinnerUnitCost) },
    { label: `Frukostar hemma (${breakfasts} st)`, amount: breakfasts * asNumber(config.breakfastUnitCost) },
    { label: `Lunch hemma (${lunchHome} st)`, amount: lunchHome * asNumber(config.lunchHomeUnitCost) },
    { label: `Köpta luncher (${lunchWork} st)`, amount: lunchWork * asNumber(config.lunchWorkUnitCost) }
  ];
  const total = items.reduce((s, it) => s + it.amount, 0);
  return { total, items, counts: { dinners, breakfasts, lunchHome, lunchWork } };
}

function computeSpecialChildrenMonthly(year) {
  const config = state.special.children[String(year)] || {};

  const parties = Math.max(0, asNumber(config.kidsPartiesPerYear)) * asNumber(config.kidsPartyUnitCost);
  const partiesMonthly = parties / 12;

  const items = [
    { label: "Andra barns kalas", amount: partiesMonthly },
    { label: "Aktiviteter", amount: asNumber(config.kidsActivitiesPerMonth) },
    { label: "Månadspeng", amount: asNumber(config.kidsPocketMoneyPerMonth) },
    { label: "Telefonabonnemang", amount: asNumber(config.kidsPhonePerMonth) },
    { label: "Försäkring", amount: asNumber(config.kidsInsurancePerMonth) },
    { label: "Busskort", amount: asNumber(config.kidsBusCardPerMonth) },
    { label: "Julklappar", amount: asNumber(config.kidsChristmasPerYear) / 12 },
    { label: "Födelsedagspresenter", amount: asNumber(config.kidsBirthdaysPerYear) / 12 }
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

  const recurringExpenses = state.recurring?.expenses?.[y] || [];
  const recurringIncomes = state.recurring?.incomes?.[y] || [];

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

  const recurringExpensesAmount = recurringExpenses.reduce((s, it) => s + asNumber(it.amount), 0);
  const recurringIncomesAmount = recurringIncomes.reduce((s, it) => s + asNumber(it.amount), 0);

  const specialsAmount = car.total + housing.total + food.total + children.total;
  const oneOffExpensesAmount = oneOffExpenses.reduce((s, it) => s + it.amount, 0);

  const incomeAmount = recurringIncomesAmount + oneOffIncomes.reduce((s, it) => s + it.amount, 0);
  const plannedExpensesAmount = recurringExpensesAmount + specialsAmount + oneOffExpensesAmount;
  const remaining = incomeAmount - plannedExpensesAmount;

  // Diagramsegment: återkommande + special + enstaka
  const segments = [
    { key: "recurringExpenses", label: "Återkommande utgifter", amount: recurringExpensesAmount, color: "#8b5cf6" },
    { key: "car", label: "Bil", amount: car.total, color: "#3b82f6" },
    { key: "housing", label: "Boende", amount: housing.total, color: "#06b6d4" },
    { key: "food", label: "Mat", amount: food.total, color: "#f59e0b" },
    { key: "children", label: "Barn", amount: children.total, color: "#22c55e" },
    { key: "oneOffExpenses", label: "Enstaka utgifter", amount: oneOffExpensesAmount, color: "#ef4444" }
  ].filter((s) => s.amount > 0);

  // Tabellen: bryt ner utgifter och intäkter
  const expensesRows = [];
  for (const it of recurringExpenses) {
    expensesRows.push({ group: "Återkommande utgifter", label: it.name, amount: asNumber(it.amount) });
  }
  for (const it of car.items) expensesRows.push({ group: "Bil", label: it.label, amount: it.amount });
  for (const it of housing.items) expensesRows.push({ group: "Boende", label: it.label, amount: it.amount });
  for (const it of food.items) expensesRows.push({ group: "Mat", label: it.label, amount: it.amount });
  for (const it of children.items) expensesRows.push({ group: "Barn", label: it.label, amount: it.amount });
  for (const it of oneOffExpenses) expensesRows.push({ group: "Enstaka utgifter", label: it.label, amount: it.amount });

  const incomesRows = [];
  for (const it of recurringIncomes) incomesRows.push({ group: "Återkommande intäkter", label: it.name, amount: asNumber(it.amount) });
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
  const year = Number(document.getElementById("carYear").value);
  ui.carYear = year;

  const config = state.special.car[String(year)] || {};
  document.getElementById("carInsurance").value = asNumber(config.insurance);
  document.getElementById("carFuel").value = asNumber(config.fuel);
  document.getElementById("carParking").value = asNumber(config.parking);
  document.getElementById("carLeasing").value = asNumber(config.leasing);
}

function renderHousingPage() {
  const year = Number(document.getElementById("housingYear").value);
  ui.housingYear = year;

  const config = state.special.housing[String(year)] || {};
  document.getElementById("housingRent").value = asNumber(config.rent);
  document.getElementById("housingEnergy").value = asNumber(config.energy);
  document.getElementById("housingInsurance").value = asNumber(config.insurance);
  document.getElementById("housingInternet").value = asNumber(config.internet);
  document.getElementById("housingOther").value = asNumber(config.other);
}

function renderFoodPage() {
  const year = Number(document.getElementById("foodYear").value);
  const month = Number(document.getElementById("foodMonth").value);
  ui.foodYear = year;
  ui.foodMonth = month;

  const foodYear = state.special.food[String(year)] || {};
  const config = foodYear[monthKey(month)] || {};

  document.getElementById("foodDinnersPerWeek").value = asNumber(config.dinnersPerWeek);
  document.getElementById("foodBreakfastsPerWeek").value = asNumber(config.breakfastsPerWeek);
  document.getElementById("foodLunchHomePerWeek").value = asNumber(config.lunchHomePerWeek);
  document.getElementById("foodLunchWorkPerWeek").value = asNumber(config.lunchWorkPerWeek);

  document.getElementById("foodDinnerUnitCost").value = asNumber(config.dinnerUnitCost);
  document.getElementById("foodBreakfastUnitCost").value = asNumber(config.breakfastUnitCost);
  document.getElementById("foodLunchHomeUnitCost").value = asNumber(config.lunchHomeUnitCost);
  document.getElementById("foodLunchWorkUnitCost").value = asNumber(config.lunchWorkUnitCost);

  updateFoodHelpText();
}

function updateFoodHelpText() {
  const dinners = weeksToMonthlyCount(document.getElementById("foodDinnersPerWeek").value);
  const breakfasts = weeksToMonthlyCount(document.getElementById("foodBreakfastsPerWeek").value);
  const lunchHome = weeksToMonthlyCount(document.getElementById("foodLunchHomePerWeek").value);
  const lunchWork = weeksToMonthlyCount(document.getElementById("foodLunchWorkPerWeek").value);

  document.getElementById("foodDinnersPerMonthHelp").textContent = `Månad: ${dinners} st`;
  document.getElementById("foodBreakfastsPerMonthHelp").textContent = `Månad: ${breakfasts} st`;
  document.getElementById("foodLunchHomePerMonthHelp").textContent = `Månad: ${lunchHome} st`;
  document.getElementById("foodLunchWorkPerMonthHelp").textContent = `Månad: ${lunchWork} st`;
}

function renderChildrenPage() {
  const year = Number(document.getElementById("childrenYear").value);
  ui.childrenYear = year;
  const config = state.special.children[String(year)] || {};

  document.getElementById("kidsPartiesPerYear").value = asNumber(config.kidsPartiesPerYear);
  document.getElementById("kidsPartyUnitCost").value = asNumber(config.kidsPartyUnitCost);
  document.getElementById("kidsActivitiesPerMonth").value = asNumber(config.kidsActivitiesPerMonth);
  document.getElementById("kidsPocketMoneyPerMonth").value = asNumber(config.kidsPocketMoneyPerMonth);
  document.getElementById("kidsPhonePerMonth").value = asNumber(config.kidsPhonePerMonth);
  document.getElementById("kidsInsurancePerMonth").value = asNumber(config.kidsInsurancePerMonth);
  document.getElementById("kidsBusCardPerMonth").value = asNumber(config.kidsBusCardPerMonth);
  document.getElementById("kidsChristmasPerYear").value = asNumber(config.kidsChristmasPerYear);
  document.getElementById("kidsBirthdaysPerYear").value = asNumber(config.kidsBirthdaysPerYear);
}

function renderPostsPage() {
  const year = Number(document.getElementById("postsYear").value);
  const month = Number(document.getElementById("postsMonth").value);
  ui.postsYear = year;
  ui.postsMonth = month;

  const y = String(year);
  const m = monthKey(month);

  const expenseList = (state.oneOff.expenses?.[y]?.[m] || []).slice();
  const incomeList = (state.oneOff.incomes?.[y]?.[m] || []).slice();

  const expBody = document.getElementById("expensePostsTableBody");
  expBody.innerHTML = "";
  if (expenseList.length === 0) {
    expBody.innerHTML = `<tr><td colspan="3" style="color: var(--muted);">Inga enstaka utgifter för vald månad.</td></tr>`;
  } else {
    for (const it of expenseList) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(it.name)}</td><td class="right">${formatKr(it.amount)}</td><td><button class="danger" data-delete-exp-post="${it.id}" type="button">Ta bort</button></td>`;
      expBody.appendChild(tr);
    }
  }

  const incBody = document.getElementById("incomePostsTableBody");
  incBody.innerHTML = "";
  if (incomeList.length === 0) {
    incBody.innerHTML = `<tr><td colspan="3" style="color: var(--muted);">Inga enstaka intäkter för vald månad.</td></tr>`;
  } else {
    for (const it of incomeList) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(it.name)}</td><td class="right">${formatKr(it.amount)}</td><td><button class="danger" data-delete-income-post="${it.id}" type="button">Ta bort</button></td>`;
      incBody.appendChild(tr);
    }
  }

  bindPostsDeleteHandlers();
}

function bindPostsDeleteHandlers() {
  document.querySelectorAll("[data-delete-exp-post]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-delete-exp-post");
      const year = ui.postsYear;
      const month = ui.postsMonth;
      const list = ensureOneOffList(state.oneOff.expenses, year, month);
      const idx = list.findIndex((x) => x.id === id);
      if (idx >= 0) list.splice(idx, 1);
      saveState();
      renderPostsPage();
      renderOverviewIfOnOverview();
    });
  });

  document.querySelectorAll("[data-delete-income-post]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-delete-income-post");
      const year = ui.postsYear;
      const month = ui.postsMonth;
      const list = ensureOneOffList(state.oneOff.incomes, year, month);
      const idx = list.findIndex((x) => x.id === id);
      if (idx >= 0) list.splice(idx, 1);
      saveState();
      renderPostsPage();
      renderOverviewIfOnOverview();
    });
  });
}

function renderSettingsPage() {
  const years = getAvailableYears();
  const curYear = currentYearMonth().year;
  const expensesYearSel = document.getElementById("settingsExpensesYear");
  const incomesYearSel = document.getElementById("settingsIncomesYear");
  setSelectOptions(expensesYearSel, years, curYear);
  setSelectOptions(incomesYearSel, years, curYear);

  // If there were already selected values (from prior render), keep them
  // (we don't store persistent selection, but this reduces jank)
  // eslint-disable-next-line no-unused-vars
  const selectedExp = Number(expensesYearSel.value);
  const selectedInc = Number(incomesYearSel.value);

  renderRecurringTables();
}

function renderRecurringTables() {
  const expYear = Number(document.getElementById("settingsExpensesYear").value);
  const incYear = Number(document.getElementById("settingsIncomesYear").value);

  // Settings inputs
  document.getElementById("backupIntervalDays").value = asNumber(state.settings.backupIntervalDays);
  document.getElementById("backupFilenamePattern").value = state.settings.backupFilenamePattern || "";

  // recurring expenses
  const expBody = document.getElementById("recurringExpensesTableBody");
  expBody.innerHTML = "";
  const expList = state.recurring?.expenses?.[String(expYear)] || [];
  if (expList.length === 0) {
    expBody.innerHTML = `<tr><td colspan="3" style="color: var(--muted);">Inga återkommande utgifter för valt år.</td></tr>`;
  } else {
    for (const it of expList) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(it.name)}</td><td class="right">${formatKr(it.amount)}</td><td><button class="danger" data-delete-rec-exp="${it.id}" type="button">Ta bort</button></td>`;
      expBody.appendChild(tr);
    }
  }

  // recurring incomes
  const incBody = document.getElementById("recurringIncomesTableBody");
  incBody.innerHTML = "";
  const incList = state.recurring?.incomes?.[String(incYear)] || [];
  if (incList.length === 0) {
    incBody.innerHTML = `<tr><td colspan="3" style="color: var(--muted);">Inga återkommande intäkter för valt år.</td></tr>`;
  } else {
    for (const it of incList) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(it.name)}</td><td class="right">${formatKr(it.amount)}</td><td><button class="danger" data-delete-rec-inc="${it.id}" type="button">Ta bort</button></td>`;
      incBody.appendChild(tr);
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

  document.querySelectorAll("[data-delete-rec-inc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-delete-rec-inc");
      const list = ensureYearArray(state.recurring.incomes, incYear);
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
    case "car": {
      const years = getAvailableYears();
      const yearSel = document.getElementById("carYear");
      const baseYear = years.includes(ui.overviewYear) ? ui.overviewYear : currentYearMonth().year;
      setSelectOptions(yearSel, years, baseYear);
      yearSel.onchange = renderCarPage;
      renderCarPage();
      break;
    }
    case "housing": {
      const years = getAvailableYears();
      const yearSel = document.getElementById("housingYear");
      const baseYear = years.includes(ui.overviewYear) ? ui.overviewYear : currentYearMonth().year;
      setSelectOptions(yearSel, years, baseYear);
      yearSel.onchange = renderHousingPage;
      renderHousingPage();
      break;
    }
    case "food": {
      const years = getAvailableYears();
      const yearSel = document.getElementById("foodYear");
      const monthSel = document.getElementById("foodMonth");
      const baseYear = years.includes(ui.overviewYear) ? ui.overviewYear : currentYearMonth().year;
      setSelectOptions(yearSel, years, baseYear);
      setMonthOptions(monthSel, ui.overviewMonth || currentYearMonth().month);
      yearSel.onchange = renderFoodPage;
      monthSel.onchange = renderFoodPage;
      // Live-uppdatering av "hjälptext"
      ["foodDinnersPerWeek", "foodBreakfastsPerWeek", "foodLunchHomePerWeek", "foodLunchWorkPerWeek"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.oninput = updateFoodHelpText;
      });
      renderFoodPage();
      break;
    }
    case "children": {
      const years = getAvailableYears();
      const yearSel = document.getElementById("childrenYear");
      const baseYear = years.includes(ui.overviewYear) ? ui.overviewYear : currentYearMonth().year;
      setSelectOptions(yearSel, years, baseYear);
      yearSel.onchange = renderChildrenPage;
      renderChildrenPage();
      break;
    }
    case "posts": {
      const years = getAvailableYears();
      const yearSel = document.getElementById("postsYear");
      const monthSel = document.getElementById("postsMonth");
      const baseYear = years.includes(ui.overviewYear) ? ui.overviewYear : currentYearMonth().year;
      setSelectOptions(yearSel, years, baseYear);
      setMonthOptions(monthSel, ui.overviewMonth || currentYearMonth().month);
      yearSel.onchange = renderPostsPage;
      monthSel.onchange = renderPostsPage;
      renderPostsPage();
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
      renderRecurringTables();
      break;
    }
    default:
      renderOverview();
  }
}

function renderOverviewIfOnOverview() {
  if (ui.activeRoute === "overview") renderOverview();
}

function initActions() {
  // CAR
  document.getElementById("carSaveBtn").addEventListener("click", () => {
    const year = Number(document.getElementById("carYear").value);
    state.special.car[String(year)] = {
      insurance: asNumber(document.getElementById("carInsurance").value),
      fuel: asNumber(document.getElementById("carFuel").value),
      parking: asNumber(document.getElementById("carParking").value),
      leasing: asNumber(document.getElementById("carLeasing").value)
    };
    saveState();
    const note = document.getElementById("carNote");
    note.textContent = "Bil-kostnader uppdaterade och räknade in i din budget för detta år.";
    renderOverviewIfOnOverview();
    // eslint-disable-next-line no-unused-vars
    renderCarPage();
  });

  // HOUSING
  document.getElementById("housingSaveBtn").addEventListener("click", () => {
    const year = Number(document.getElementById("housingYear").value);
    state.special.housing[String(year)] = {
      rent: asNumber(document.getElementById("housingRent").value),
      energy: asNumber(document.getElementById("housingEnergy").value),
      insurance: asNumber(document.getElementById("housingInsurance").value),
      internet: asNumber(document.getElementById("housingInternet").value),
      other: asNumber(document.getElementById("housingOther").value)
    };
    saveState();
    document.getElementById("housingNote").textContent = "Boende-kostnader uppdaterade och räknade in i din budget för detta år.";
    renderOverviewIfOnOverview();
    renderHousingPage();
  });

  // FOOD
  document.getElementById("foodSaveBtn").addEventListener("click", () => {
    const year = Number(document.getElementById("foodYear").value);
    const month = Number(document.getElementById("foodMonth").value);
    const mK = monthKey(month);
    if (!state.special.food[String(year)]) state.special.food[String(year)] = {};
    state.special.food[String(year)][mK] = {
      dinnersPerWeek: asNumber(document.getElementById("foodDinnersPerWeek").value),
      breakfastsPerWeek: asNumber(document.getElementById("foodBreakfastsPerWeek").value),
      lunchHomePerWeek: asNumber(document.getElementById("foodLunchHomePerWeek").value),
      lunchWorkPerWeek: asNumber(document.getElementById("foodLunchWorkPerWeek").value),
      dinnerUnitCost: asNumber(document.getElementById("foodDinnerUnitCost").value),
      breakfastUnitCost: asNumber(document.getElementById("foodBreakfastUnitCost").value),
      lunchHomeUnitCost: asNumber(document.getElementById("foodLunchHomeUnitCost").value),
      lunchWorkUnitCost: asNumber(document.getElementById("foodLunchWorkUnitCost").value)
    };

    saveState();
    document.getElementById("foodNote").textContent = `Mat-budget uppdaterad för ${monthName(month)} ${year}.`;
    renderOverviewIfOnOverview();
    renderFoodPage();
  });

  // CHILDREN
  document.getElementById("kidsSaveBtn").addEventListener("click", () => {
    const year = Number(document.getElementById("childrenYear").value);
    state.special.children[String(year)] = {
      kidsPartiesPerYear: asNumber(document.getElementById("kidsPartiesPerYear").value),
      kidsPartyUnitCost: asNumber(document.getElementById("kidsPartyUnitCost").value),
      kidsActivitiesPerMonth: asNumber(document.getElementById("kidsActivitiesPerMonth").value),
      kidsPocketMoneyPerMonth: asNumber(document.getElementById("kidsPocketMoneyPerMonth").value),
      kidsPhonePerMonth: asNumber(document.getElementById("kidsPhonePerMonth").value),
      kidsInsurancePerMonth: asNumber(document.getElementById("kidsInsurancePerMonth").value),
      kidsBusCardPerMonth: asNumber(document.getElementById("kidsBusCardPerMonth").value),
      kidsChristmasPerYear: asNumber(document.getElementById("kidsChristmasPerYear").value),
      kidsBirthdaysPerYear: asNumber(document.getElementById("kidsBirthdaysPerYear").value)
    };
    saveState();
    document.getElementById("kidsNote").textContent = "Barnkostnader uppdaterade och räknade in i din budget för detta år.";
    renderOverviewIfOnOverview();
    renderChildrenPage();
  });

  // POSTS - add expense
  document.getElementById("addExpensePostBtn").addEventListener("click", () => {
    const year = Number(document.getElementById("postsYear").value);
    const month = Number(document.getElementById("postsMonth").value);
    const name = (document.getElementById("postExpenseName").value || "").trim();
    const amount = asNumber(document.getElementById("postExpenseAmount").value);
    const note = document.getElementById("expensePostsNote");
    if (!name || amount <= 0) {
      note.textContent = "Ange ett namn och ett belopp > 0.";
      return;
    }
    const list = ensureOneOffList(state.oneOff.expenses, year, month);
    list.push({ id: uid(), name, amount });
    saveState();
    document.getElementById("postExpenseName").value = "";
    document.getElementById("postExpenseAmount").value = "";
    note.textContent = "Utgift tillagd.";
    renderPostsPage();
    renderOverviewIfOnOverview();
  });

  // POSTS - add income
  document.getElementById("addIncomePostBtn").addEventListener("click", () => {
    const year = Number(document.getElementById("postsYear").value);
    const month = Number(document.getElementById("postsMonth").value);
    const name = (document.getElementById("postIncomeName").value || "").trim();
    const amount = asNumber(document.getElementById("postIncomeAmount").value);
    const note = document.getElementById("incomePostsNote");
    if (!name || amount <= 0) {
      note.textContent = "Ange ett namn och ett belopp > 0.";
      return;
    }
    const list = ensureOneOffList(state.oneOff.incomes, year, month);
    list.push({ id: uid(), name, amount });
    saveState();
    document.getElementById("postIncomeName").value = "";
    document.getElementById("postIncomeAmount").value = "";
    note.textContent = "Intäkt tillagd.";
    renderPostsPage();
    renderOverviewIfOnOverview();
  });

  // SETTINGS - add recurring expense
  document.getElementById("addRecurringExpenseBtn").addEventListener("click", () => {
    const year = Number(document.getElementById("settingsExpensesYear").value);
    const name = (document.getElementById("recurringExpenseName").value || "").trim();
    const amount = asNumber(document.getElementById("recurringExpenseAmount").value);
    const note = document.getElementById("recurringExpensesNote");
    if (!name || amount <= 0) {
      note.textContent = "Ange ett namn och ett belopp > 0.";
      return;
    }
    const list = ensureYearArray(state.recurring.expenses, year);
    list.push({ id: uid(), name, amount });
    saveState();
    document.getElementById("recurringExpenseName").value = "";
    document.getElementById("recurringExpenseAmount").value = "";
    note.textContent = "Återkommande utgift tillagd.";
    renderRecurringTables();
    renderOverviewIfOnOverview();
  });

  // SETTINGS - add recurring income
  document.getElementById("addRecurringIncomeBtn").addEventListener("click", () => {
    const year = Number(document.getElementById("settingsIncomesYear").value);
    const name = (document.getElementById("recurringIncomeName").value || "").trim();
    const amount = asNumber(document.getElementById("recurringIncomeAmount").value);
    const note = document.getElementById("recurringIncomesNote");
    if (!name || amount <= 0) {
      note.textContent = "Ange ett namn och ett belopp > 0.";
      return;
    }
    const list = ensureYearArray(state.recurring.incomes, year);
    list.push({ id: uid(), name, amount });
    saveState();
    document.getElementById("recurringIncomeName").value = "";
    document.getElementById("recurringIncomeAmount").value = "";
    note.textContent = "Återkommande intäkt tillagd.";
    renderRecurringTables();
    renderOverviewIfOnOverview();
  });

  document.getElementById("settingsExpensesYear").addEventListener("change", renderRecurringTables);
  document.getElementById("settingsIncomesYear").addEventListener("change", renderRecurringTables);

  document.getElementById("saveSettingsBtn").addEventListener("click", () => {
    state.settings.backupIntervalDays = Math.max(1, Math.floor(asNumber(document.getElementById("backupIntervalDays").value)));
    const pat = document.getElementById("backupFilenamePattern").value || "";
    state.settings.backupFilenamePattern = pat.trim();
    saveState();
    renderRecurringTables();
    document.getElementById("recurringExpensesNote").textContent = "Inställningar sparade.";
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
  }
  function hideModal() {
    backdrop.hidden = true;
    modal.hidden = true;
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
  state = loadState();
  applyTheme();
  initRouting();
  initActions();
  registerServiceWorker();
}

// Start app
initRoot();

