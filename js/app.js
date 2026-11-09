// =========================================================
//  Flunora — logica dell'app
// =========================================================
const APP_VERSION = "0.2.2";

const sb = window.supabase.createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_KEY
);

// ---------- stato ----------
const state = {
  user: null,
  categories: [],
  page: "dashboard",
  month: firstOfMonth(new Date()),   // mese mostrato in "Mesi"
  year: new Date().getFullYear(),    // anno mostrato in "Dashboard"
  transactions: [],                  // movimenti del mese mostrato
  editing: null,                     // movimento in modifica (null = nuovo)
  kind: "uscita",                    // tipo scelto nel pannello
  categoryId: null,                  // categoria scelta nel pannello
  lastCategory: {},                  // ultima categoria usata per ogni tipo
  selecting: false,                  // modalità "Seleziona" attiva
  selected: new Set(),               // id dei movimenti selezionati
  selectedMonth: null,
  sections: [],                      // sezioni della barra: [{ id, on }] nell'ordine scelto
  settingsSynced: false,
  settingsData: {},                  // impostazioni sincronizzate (sezioni, budget_cents, ...)
  filterCat: null,                   // categoria scelta nel riquadro Categorie
  search: "",                        // testo cercato tra i movimenti
  budgetMonth: null,                 // budget solo per il mese mostrato (null = usa il fisso)
  budgetTableMissing: false,
  budgetEdit: null,                  // pannello budget aperto
};

// ---------- utilità ----------
const $ = (id) => document.getElementById(id);
let euro;
try { euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }); }
catch { euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }); }
const fmt = (cents) => euro.format(cents / 100);
const signed = (cents) => (cents > 0 ? "+ " : cents < 0 ? "− " : "") + fmt(Math.abs(cents));
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const INIZIALI = ["G", "F", "M", "A", "M", "G", "L", "A", "S", "O", "N", "D"];

function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function isoDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const monthKey = (d) => isoDate(d).slice(0, 7); // "2026-11"

// "12,50" / "12.50" / "1.250,00" -> 1250 centesimi; null se non valido
function parseAmount(text) {
  let s = String(text).trim().replace(/\s|€/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // "1.500" = millecinquecento
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return null;
  return Math.round(n * 100);
}

function setMsg(el, text, isError = false) {
  el.textContent = text || "";
  el.classList.toggle("error", isError);
}

// Avviso breve; con `action` mostra un pulsante (es. "Annulla") e resta visibile più a lungo
let toastTimer, toastAction = null;
function toast(text, action = null) {
  const t = $("toast");
  $("toast-text").textContent = text;
  const btn = $("toast-action");
  toastAction = action;
  btn.hidden = !action;
  if (action) btn.textContent = action.label;
  t.classList.toggle("has-action", !!action);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 5000 : 2200);
}
function hideToast() {
  $("toast").classList.remove("show", "has-action");
  toastAction = null;
}
$("toast-action").addEventListener("click", () => {
  const a = toastAction;
  hideToast();
  a?.onClick();
});

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// =========================================================
//  AUTENTICAZIONE
// =========================================================
let sessionChecked = false;

async function init() {
  $("set-version").textContent = APP_VERSION;
  const { data } = await sb.auth.getSession();
  handleSession(data.session);
  sb.auth.onAuthStateChange((_e, session) => handleSession(session));
}

function handleSession(session) {
  const user = session?.user ?? null;
  if (sessionChecked && user?.id === state.user?.id) return;
  sessionChecked = true;
  state.user = user;
  $("view-login").hidden = !!user;
  $("view-app").hidden = !user;
  if (user) startApp();
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("login-msg");
  setMsg(msg, "Accesso in corso…");
  const { error } = await sb.auth.signInWithPassword({
    email: $("login-email").value.trim(),
    password: $("login-password").value,
  });
  setMsg(msg, error ? traduciErrore(error.message) : "", !!error);
});

$("btn-signup").addEventListener("click", async () => {
  const msg = $("login-msg");
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  if (!email || password.length < 6) {
    setMsg(msg, "Inserisci email e una password di almeno 6 caratteri.", true);
    return;
  }
  setMsg(msg, "Registrazione in corso…");
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) setMsg(msg, traduciErrore(error.message), true);
  else if (!data.session) setMsg(msg, "Account creato: conferma l'email e poi accedi.");
  else setMsg(msg, "");
});

$("btn-logout").addEventListener("click", async () => {
  if (confirm("Vuoi uscire da Flunora?")) await sb.auth.signOut();
});

function traduciErrore(m) {
  if (/invalid login credentials/i.test(m)) return "Email o password errate.";
  if (/email not confirmed/i.test(m)) return "Devi prima confermare l'email.";
  if (/already registered/i.test(m)) return "Questa email è già registrata: usa Accedi.";
  if (/signups not allowed/i.test(m)) return "Le nuove registrazioni sono disattivate.";
  if (/failed to fetch|network/i.test(m)) return "Nessuna connessione. Riprova.";
  return m;
}

// =========================================================
//  AVVIO E NAVIGAZIONE
// =========================================================
async function startApp() {
  $("set-email").textContent = state.user.email || "";
  await Promise.all([loadCategories(), loadSettings()]);
  renderTabbar();
  route();
}

async function loadCategories() {
  const { data, error } = await sb.from("categories").select("*").order("kind").order("sort_order");
  if (error) { toast("Errore categorie: " + error.message); return; }
  state.categories = data;
  fillFilterSelect();
}
const catById = (id) => state.categories.find((c) => c.id === id);

// quadratino colorato con l'icona della categoria (size: "", "sm", "lg")
function catIcon(c, size = "") {
  const s = el("span", "cat-ico" + (size ? " " + size : ""));
  s.style.setProperty("--c", c?.color || "#8e8e93");
  s.innerHTML = iconSvg(c?.icon || "tag");
  return s;
}

// Indirizzi: #dashboard  #mesi  #mesi/2026-11  #abbonamenti  #auto
// Senza indirizzo valido si apre la prima sezione attiva nella barra.
function route() {
  if (!state.user) return;
  const [page, arg] = location.hash.slice(1).split("/");
  const p = SECTIONS[page] ? page : firstSection();
  if (p === "mesi" && /^\d{4}-\d{2}$/.test(arg || "")) {
    const [y, m] = arg.split("-").map(Number);
    state.month = new Date(y, m - 1, 1);
  }
  state.page = p;
  setSelecting(false);
  for (const id of Object.keys(SECTIONS)) $("page-" + id).hidden = id !== p;
  document.querySelectorAll("#tab-pill .tab").forEach((t) => t.classList.toggle("active", t.dataset.page === p));
  window.scrollTo(0, 0);
  if (p === "dashboard") loadDashboard();
  if (p === "mesi") loadMonth();
}
window.addEventListener("hashchange", route);

const goToMonth = (d) => { location.hash = "mesi/" + monthKey(d); };

// =========================================================
//  DASHBOARD (un anno alla volta)
// =========================================================
$("year-prev").addEventListener("click", () => { state.year--; loadDashboard(); });
$("year-next").addEventListener("click", () => { state.year++; loadDashboard(); });

async function loadDashboard() {
  const y = state.year;
  $("year-label").textContent = y;
  document.querySelectorAll("#page-dashboard .y").forEach((s) => (s.textContent = y));

  const { data, error } = await sb
    .from("monthly_totals")
    .select("*")
    .gte("month", `${y}-01-01`)
    .lt("month", `${y + 1}-01-01`);
  if (error) { toast("Errore dashboard: " + error.message); return; }
  if (y !== state.year) return; // l'utente ha già cambiato anno

  const months = Array.from({ length: 12 }, () => ({ e: 0, u: 0, i: 0, has: false }));
  for (const r of data) {
    const m = Number(String(r.month).slice(5, 7)) - 1;
    months[m] = { e: Number(r.entrate_cents), u: Number(r.uscite_cents), i: Number(r.investimenti_cents), has: true };
  }
  renderDashboard(months);
}

function renderDashboard(months) {
  const tot = months.reduce((a, m) => ({ e: a.e + m.e, u: a.u + m.u, i: a.i + m.i }), { e: 0, u: 0, i: 0 });
  const saldo = tot.e - tot.u - tot.i;
  const active = months.filter((m) => m.has).length;

  $("d-entrate").textContent = fmt(tot.e);
  $("d-uscite").textContent = fmt(tot.u);
  $("d-invest").textContent = fmt(tot.i);
  $("d-saldo").textContent = signed(saldo);
  $("d-saldo").classList.toggle("neg", saldo < 0);
  $("d-media").textContent = active ? `media ${fmt(Math.round(tot.u / active))}/mese` : "";

  renderYearChart(months);

  // elenco dei mesi con movimenti, dal più recente
  const ul = $("month-list");
  ul.replaceChildren();
  for (let m = 11; m >= 0; m--) {
    const mm = months[m];
    if (!mm.has) continue;
    const s = mm.e - mm.u - mm.i;
    const li = el("li", "tap");
    const grow = el("div", "grow");
    grow.append(
      el("div", "title month-name", MESI[m]),
      el("div", "sub", `Entrate ${fmt(mm.e)} · Uscite ${fmt(mm.u)}`)
    );
    const amt = el("span", "amt" + (s < 0 ? " neg" : ""), signed(s));
    li.append(grow, amt, el("span", "chev", "›"));
    li.addEventListener("click", () => goToMonth(new Date(state.year, m, 1)));
    ul.append(li);
  }
  ul.hidden = active === 0;
  $("year-empty").hidden = active > 0;
}

function renderYearChart(months) {
  const NS = "http://www.w3.org/2000/svg";
  const W = 336, H = 168, base = 140, top = 12, gw = W / 12, bw = Math.min(10, gw / 2 - 2);
  const max = Math.max(1, ...months.map((m) => Math.max(m.e, m.u)));
  const now = new Date();

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Entrate e uscite per mese, ${state.year}`);

  const line = document.createElementNS(NS, "line");
  line.setAttribute("x1", 0); line.setAttribute("x2", W);
  line.setAttribute("y1", base + 0.5); line.setAttribute("y2", base + 0.5);
  line.setAttribute("class", "base");
  svg.append(line);

  months.forEach((m, i) => {
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "month");
    const cx = gw * i + gw / 2;

    const hit = document.createElementNS(NS, "rect");
    hit.setAttribute("x", gw * i); hit.setAttribute("y", 0);
    hit.setAttribute("width", gw); hit.setAttribute("height", H);
    hit.setAttribute("rx", 6); hit.setAttribute("class", "hit");
    g.append(hit);

    for (const [val, cls, x] of [[m.e, "bar-in", cx - bw - 1], [m.u, "bar-out", cx + 1]]) {
      if (!val) continue;
      const h = Math.max(2, (val / max) * (base - top));
      const r = document.createElementNS(NS, "rect");
      r.setAttribute("x", x); r.setAttribute("y", base - h);
      r.setAttribute("width", bw); r.setAttribute("height", h);
      r.setAttribute("rx", 2.5); r.setAttribute("class", cls);
      g.append(r);
    }

    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", cx); t.setAttribute("y", H - 8);
    t.setAttribute("text-anchor", "middle");
    const isNow = state.year === now.getFullYear() && i === now.getMonth();
    t.setAttribute("class", "lbl" + (isNow ? " now" : ""));
    t.textContent = INIZIALI[i];
    g.append(t);

    const title = document.createElementNS(NS, "title");
    title.textContent = `${MESI[i]}: entrate ${fmt(m.e)}, uscite ${fmt(m.u)}`;
    g.append(title);

    g.addEventListener("click", () => goToMonth(new Date(state.year, i, 1)));
    svg.append(g);
  });

  $("year-chart").replaceChildren(svg);
}

// =========================================================
//  MESI
// =========================================================
$("month-prev").addEventListener("click", () => goToMonth(addMonths(state.month, -1)));
$("month-next").addEventListener("click", () => goToMonth(addMonths(state.month, 1)));
$("btn-search").addEventListener("click", () => {
  $("search-bar").hidden = false;
  $("search-input").focus();
});
$("search-close").addEventListener("click", () => { clearSearch(); renderList(); });
$("search-input").addEventListener("input", () => { state.search = $("search-input").value.trim(); renderList(); });
$("filter-chip").addEventListener("click", () => setFilter(null));
$("budget-link").addEventListener("click", () => openBudgetSheet({ month: state.month }));

function clearSearch() {
  state.search = "";
  $("search-input").value = "";
  $("search-bar").hidden = true;
}

async function loadMonth() {
  const shown = state.month.getTime();
  if (state.selectedMonth !== shown) {
    setSelecting(false);
    state.selectedMonth = shown;
    state.filterCat = null;
    clearSearch();
  }
  $("month-label").textContent = `${MESI[state.month.getMonth()]} ${state.month.getFullYear()}`;
  const [txRes, bRes] = await Promise.all([
    sb.from("transactions").select("*")
      .gte("date", isoDate(state.month)).lt("date", isoDate(addMonths(state.month, 1)))
      .order("date", { ascending: false }).order("created_at", { ascending: false }),
    sb.from("budgets").select("amount_cents").eq("month", isoDate(state.month)).maybeSingle(),
  ]);
  if (txRes.error) { toast("Errore movimenti: " + txRes.error.message); return; }
  if (shown !== state.month.getTime()) return; // mese cambiato nel frattempo
  state.transactions = txRes.data;
  state.budgetMonth = bRes.error ? null : (bRes.data?.amount_cents ?? null);
  state.budgetTableMissing = !!bRes.error;
  renderKpis();
  renderDonut();
  renderList();
}

function monthTotals(list = state.transactions) {
  const t = { entrata: 0, uscita: 0, investimento: 0 };
  for (const tx of list) t[tx.kind] += tx.amount_cents;
  return t;
}

// budget del mese mostrato: quello solo per il mese, altrimenti il fisso
const defaultBudget = () => state.settingsData?.budget_cents || null;
const currentBudget = () => state.budgetMonth ?? defaultBudget();

// stato del mese rispetto a oggi: -1 passato, 0 corrente, 1 futuro
function monthStatus(d) {
  const now = firstOfMonth(new Date()).getTime(), t = d.getTime();
  return t < now ? -1 : t > now ? 1 : 0;
}

// carta "Ti restano"
function renderKpis() {
  const t = monthTotals();
  const budget = currentBudget();
  const status = monthStatus(state.month);
  const mese = MESI[state.month.getMonth()];

  $("kpi-entrate").textContent = fmt(t.entrata);
  $("kpi-uscite").textContent = fmt(t.uscita);
  $("kpi-invest").textContent = fmt(t.investimento);

  let base, pctText, rest;
  if (budget) {
    rest = budget - t.uscita;                       // gli investimenti non sono spese
    base = budget;
    pctText = `Speso il ${Math.round((t.uscita / budget) * 100)}% del budget`;
  } else if (t.entrata) {
    rest = t.entrata - t.uscita - t.investimento;   // soldi davvero ancora disponibili
    base = t.entrata;
    pctText = `Speso il ${Math.round((t.uscita / t.entrata) * 100)}% delle entrate`;
  } else {
    rest = null;
  }

  const over = rest !== null && rest < 0;
  let label;
  if (rest === null) label = "Spese del mese";
  else if (over) label = budget ? "Oltre il budget di" : "Hai speso più delle entrate di";
  else label = status < 0 ? `Ti sono rimasti a ${mese}` : status > 0 ? `Disponibili a ${mese}` : "Ti restano questo mese";

  $("hero").classList.toggle("over", over);
  $("hero-label").textContent = label;
  $("hero-amount").textContent = rest === null ? fmt(t.uscita) : fmt(Math.abs(rest));
  $("hero-bar").hidden = rest === null;
  $("hero-fill").style.width = rest === null ? "0" : Math.min(100, Math.round((t.uscita / base) * 100)) + "%";
  $("hero-pct").textContent = rest === null ? "Imposta un budget per sapere quanto ti resta" : pctText;

  if (status === 0) {
    const today = new Date();
    const left = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate();
    $("hero-days").textContent = left === 0 ? "Ultimo giorno del mese" : left === 1 ? "1 giorno alla fine" : `${left} giorni alla fine`;
  } else {
    $("hero-days").textContent = status < 0 ? "Mese concluso" : "Mese futuro";
  }

  if (budget) {
    $("budget-link-label").textContent = state.budgetMonth ? `Budget solo per ${mese}` : `Budget di ${mese}`;
    $("budget-link-value").textContent = fmt(budget) + " ›";
  } else {
    $("budget-link-label").textContent = "Imposta un budget";
    $("budget-link-value").textContent = "›";
  }
}

// riquadro Categorie: barra unica divisa per categoria, tocco per filtrare
function renderDonut() {
  const byCat = new Map();
  for (const tx of state.transactions) {
    if (tx.kind === "uscita") byCat.set(tx.category_id, (byCat.get(tx.category_id) || 0) + tx.amount_cents);
  }
  const total = [...byCat.values()].reduce((a, b) => a + b, 0);
  const items = [...byCat].map(([id, cents]) => ({ id, cat: catById(id), cents })).sort((a, b) => b.cents - a.cents);
  if (state.filterCat && !byCat.has(state.filterCat) && catById(state.filterCat)?.kind === "uscita") state.filterCat = null;

  $("cat-total").textContent = total ? fmt(total) : "";
  $("cat-empty").hidden = total > 0;
  const stack = $("cat-stack"), leg = $("cat-legend");
  stack.hidden = leg.hidden = total === 0;
  stack.classList.toggle("filtering", !!state.filterCat);
  leg.classList.toggle("filtering", !!state.filterCat);

  stack.replaceChildren(...items.map((it) => {
    const s = el("span", it.id === state.filterCat ? "on" : "");
    s.style.flex = String(it.cents);
    s.style.background = it.cat?.color || "#8e8e93";
    return s;
  }));
  leg.replaceChildren(...items.map((it) => {
    const b = el("button", it.id === state.filterCat ? "on" : "");
    b.type = "button";
    b.setAttribute("aria-pressed", it.id === state.filterCat ? "true" : "false");
    b.title = fmt(it.cents);
    b.append(catIcon(it.cat, "sm"), el("span", "name", it.cat?.name || "?"),
      el("b", null, Math.max(1, Math.round((it.cents / total) * 100)) + "%"));
    b.addEventListener("click", () => setFilter(state.filterCat === it.id ? null : it.id));
    return b;
  }));
}

function setFilter(id) {
  state.filterCat = id;
  closeOpenRow();
  renderDonut();
  renderList();
}

// non serve più (filtro dal riquadro Categorie); resta per compatibilità
function fillFilterSelect() {}

function visibleRows() {
  const q = (state.search || "").toLowerCase();
  return state.transactions.filter((t) => {
    if (state.filterCat && t.category_id !== state.filterCat) return false;
    if (!q) return true;
    const cat = catById(t.category_id);
    return [t.description, cat?.name, fmt(t.amount_cents), (t.amount_cents / 100).toFixed(2).replace(".", ",")]
      .some((v) => v && String(v).toLowerCase().includes(q));
  });
}

function dayLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d), today = new Date();
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const short = dt.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
  if (same(dt, today)) return `Oggi · ${short}`;
  if (same(dt, yest)) return `Ieri · ${short}`;
  return dt.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

function renderList() {
  const box = $("tx-list");
  box.replaceChildren();
  openRow = null;
  const rows = visibleRows();
  box.hidden = rows.length === 0;
  const filtered = !!(state.filterCat || state.search);
  $("tx-empty").hidden = rows.length > 0;
  $("tx-empty").innerHTML = filtered
    ? "Nessun movimento trovato."
    : "Nessun movimento in questo mese.<br>Tocca + per aggiungerne uno.";
  $("btn-select").hidden = rows.length === 0 && !state.selecting;
  $("swipe-hint").hidden = rows.length === 0 || state.selecting || hintSeen();

  // pulsante "filtro attivo"
  const chip = $("filter-chip");
  const fc = state.filterCat && catById(state.filterCat);
  chip.hidden = !fc;
  if (fc) chip.replaceChildren(catIcon(fc, "sm"), document.createTextNode(fc.name), el("span", "x", "✕"));

  // gruppi per giorno (le righe arrivano già dalla più recente)
  const groups = [];
  for (const tx of rows) {
    if (!groups.length || groups.at(-1).date !== tx.date) groups.push({ date: tx.date, items: [] });
    groups.at(-1).items.push(tx);
  }

  for (const g of groups) {
    const spese = g.items.filter((t) => t.kind === "uscita").reduce((a, t) => a + t.amount_cents, 0);
    const day = el("section", "day");
    const head = el("div", "day-head");
    head.append(el("span", "d", dayLabel(g.date)), el("span", "t", spese ? "− " + fmt(spese) : ""));
    const ul = el("ul", "card list");

    for (const tx of g.items) {
      const cat = catById(tx.category_id);
      const li = el("li", "swipe" + (state.selected.has(tx.id) ? " selected" : ""));
      li.dataset.id = tx.id;

      // pulsante rosso, scoperto dallo scorrimento
      const del = el("button", "swipe-delete");
      del.type = "button";
      del.setAttribute("aria-label", "Elimina movimento");
      del.append(el("span", null, "Elimina"));
      del.addEventListener("click", (e) => { e.stopPropagation(); deleteTransactions([tx]); });

      const content = el("div", "row-content");
      const check = el("span", "check");
      check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      const grow = el("div", "grow");
      const tipo = { entrata: "Entrata", uscita: "", investimento: "Investimento" }[tx.kind];
      grow.append(
        el("div", "title", tx.description || cat?.name || "Movimento"),
        el("div", "sub", [tipo, cat?.name].filter(Boolean).join(" · "))
      );
      const amt = el("span", "amt" + (tx.kind === "entrata" ? " in" : ""),
        (tx.kind === "entrata" ? "+ " : "− ") + fmt(tx.amount_cents));
      content.append(check, catIcon(cat), grow, amt);

      li.append(del, content);
      attachSwipe(li, content, tx);
      ul.append(li);
    }
    day.append(head, ul);
    box.append(day);
  }
}

// =========================================================
//  ELIMINAZIONE (0.1.1): scorrimento, selezione multipla, annulla
// =========================================================
const OPEN_X = -88;          // larghezza del pulsante "Elimina" scoperto
let openRow = null;          // riga attualmente aperta

const hintSeen = () => { try { return localStorage.getItem("flunora.swipeHint") === "1"; } catch { return false; } };
const markHintSeen = () => { try { localStorage.setItem("flunora.swipeHint", "1"); } catch {} $("swipe-hint").hidden = true; };

function setRowX(li, x) { li.querySelector(".row-content").style.transform = x ? `translateX(${x}px)` : ""; }
function closeOpenRow() { if (openRow) { setRowX(openRow, 0); openRow = null; } }

function attachSwipe(li, content, tx) {
  let startX = 0, startY = 0, x = 0, base = 0, mode = null, moved = false;

  content.addEventListener("pointerdown", (e) => {
    if (state.selecting || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (openRow && openRow !== li) closeOpenRow();
    startX = e.clientX; startY = e.clientY;
    base = openRow === li ? OPEN_X : 0;
    x = base; mode = "pending"; moved = false;
  });

  content.addEventListener("pointermove", (e) => {
    if (!mode) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (mode === "pending") {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        mode = "swipe"; moved = true;
        li.classList.add("dragging");
        try { content.setPointerCapture(e.pointerId); } catch {}
      } else if (Math.abs(dy) > 8) { mode = null; return; }
    }
    if (mode === "swipe") {
      x = Math.min(0, base + dx);
      if (x < -li.offsetWidth) x = -li.offsetWidth;
      setRowX(li, x);
    }
  });

  const end = () => {
    if (mode !== "swipe") { mode = null; return; }
    mode = null;
    li.classList.remove("dragging");
    if (x < -li.offsetWidth * 0.6) {            // scorrimento lungo: elimina subito
      setRowX(li, -li.offsetWidth);
      openRow = null;
      deleteTransactions([tx]);
    } else if (x < OPEN_X / 2) {                // a metà: resta aperta sul pulsante
      setRowX(li, OPEN_X); openRow = li;
      markHintSeen();
    } else {
      setRowX(li, 0); if (openRow === li) openRow = null;
    }
  };
  content.addEventListener("pointerup", end);
  content.addEventListener("pointercancel", end);

  content.addEventListener("click", () => {
    if (moved) { moved = false; return; }       // era uno scorrimento, non un tocco
    if (state.selecting) return toggleSelected(li, tx);
    if (openRow) return closeOpenRow();
    openSheet(tx);
  });
}

// chiude la riga aperta toccando altrove
document.addEventListener("pointerdown", (e) => {
  if (openRow && !openRow.contains(e.target)) closeOpenRow();
}, true);

// ---------- modalità Seleziona ----------
$("btn-select").addEventListener("click", () => setSelecting(!state.selecting));

function setSelecting(on) {
  state.selecting = on;
  state.selected.clear();
  closeOpenRow();
  $("tx-list").classList.toggle("selecting", on);
  $("btn-select").textContent = on ? "Fine" : "Seleziona";
  $("select-bar").hidden = !on;
  $("tabbar").hidden = on;
  document.querySelectorAll("#tx-list .swipe.selected").forEach((li) => li.classList.remove("selected"));
  if (state.page === "mesi") $("swipe-hint").hidden = on || hintSeen() || visibleRows().length === 0;
  updateSelectBar();
}

function toggleSelected(li, tx) {
  if (state.selected.has(tx.id)) state.selected.delete(tx.id);
  else state.selected.add(tx.id);
  li.classList.toggle("selected", state.selected.has(tx.id));
  updateSelectBar();
}

function updateSelectBar() {
  const n = state.selected.size;
  $("select-count").textContent = n === 0 ? "Nessun movimento selezionato"
    : n === 1 ? "1 movimento selezionato" : `${n} movimenti selezionati`;
  const btn = $("btn-delete-selected");
  btn.disabled = n === 0;
  btn.textContent = n ? `Elimina (${n})` : "Elimina";
}

$("btn-delete-selected").addEventListener("click", async () => {
  const txs = state.transactions.filter((t) => state.selected.has(t.id));
  if (!txs.length) return;
  if (txs.length > 1 && !confirm(`Eliminare ${txs.length} movimenti?`)) return;
  const ok = await deleteTransactions(txs);
  if (ok) setSelecting(false);
});

// ---------- eliminazione con "Annulla" ----------
async function deleteTransactions(txs) {
  const ids = txs.map((t) => t.id);
  const { error } = await sb.from("transactions").delete().in("id", ids);
  if (error) {
    toast("Eliminazione non riuscita: " + traduciErrore(error.message));
    renderList();
    return false;
  }
  state.transactions = state.transactions.filter((t) => !ids.includes(t.id));
  renderKpis(); renderDonut(); renderList();

  const copies = txs.map((t) => ({ ...t })); // copia completa, per poterli ripristinare
  toast(txs.length === 1 ? "Movimento eliminato" : `${txs.length} movimenti eliminati`, {
    label: "Annulla",
    onClick: async () => {
      const { error: e2 } = await sb.from("transactions").insert(copies);
      if (e2) { toast("Ripristino non riuscito: " + traduciErrore(e2.message)); return; }
      toast(copies.length === 1 ? "Movimento ripristinato" : "Movimenti ripristinati");
      if (state.page === "mesi") loadMonth(); else if (state.page === "dashboard") loadDashboard();
    },
  });
  return true;
}

// =========================================================
//  PANNELLO DAL BASSO: nuovo / modifica movimento
// =========================================================
$("btn-add").addEventListener("click", () => openSheet(null));
$("sheet-cancel").addEventListener("click", closeSheet);
$("sheet-backdrop").addEventListener("click", closeSheet);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

$("kind-seg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-kind]");
  if (b) setKind(b.dataset.kind);
});

function setKind(kind) {
  state.kind = kind;
  document.querySelectorAll("#kind-seg button").forEach((b) => b.classList.toggle("on", b.dataset.kind === kind));
  const cats = chipCategories(kind);
  if (!cats.some((c) => c.id === state.categoryId)) {
    const last = state.lastCategory[kind];
    state.categoryId = cats.some((c) => c.id === last) ? last : cats[0]?.id || null;
  }
  renderChips();
}

// categorie selezionabili: quelle attive, più quella del movimento in modifica se archiviata
function chipCategories(kind) {
  return state.categories.filter((c) => c.kind === kind &&
    (!c.archived || c.id === state.editing?.category_id));
}

function renderChips() {
  const box = $("cat-chips");
  box.replaceChildren();
  for (const c of chipCategories(state.kind)) {
    const b = el("button", "chip" + (c.id === state.categoryId ? " on" : ""));
    b.type = "button";
    b.style.setProperty("--chip-c", c.color);
    b.append(catIcon(c, "sm"), document.createTextNode(c.name));
    b.addEventListener("click", () => { state.categoryId = c.id; renderChips(); });
    box.append(b);
  }
  // crea una categoria senza lasciare il pannello
  const add = el("button", "chip new", "+ Nuova");
  add.type = "button";
  add.addEventListener("click", () => openCatEditor(null, state.kind, true));
  box.append(add);
}

// data proposta: oggi se si guarda il mese corrente, altrimenti il 1° del mese mostrato
function defaultDate() {
  const today = new Date();
  if (state.page !== "mesi" || monthKey(state.month) === monthKey(today)) return isoDate(today);
  return isoDate(state.month);
}

function openSheet(tx) {
  state.editing = tx;
  setMsg($("sheet-msg"), "");
  $("sheet-title").textContent = tx ? "Modifica movimento" : "Nuovo movimento";
  $("sheet-delete").hidden = !tx;
  if (tx) {
    state.categoryId = tx.category_id;
    setKind(tx.kind);
    $("f-amount").value = (tx.amount_cents / 100).toFixed(2).replace(".", ",");
    $("f-date").value = tx.date;
    $("f-desc").value = tx.description || "";
  } else {
    setKind(state.kind || "uscita");
    $("f-amount").value = "";
    $("f-date").value = defaultDate();
    $("f-desc").value = "";
  }
  $("sheet").classList.add("open");
  $("sheet").setAttribute("aria-hidden", "false");
  $("sheet-backdrop").classList.add("open");
  $("sheet").scrollTop = 0;
  // 0.2.1: niente cursore automatico, la tastiera si apre solo toccando un campo
}

function closeSheet() {
  $("sheet").classList.remove("open");
  $("sheet").setAttribute("aria-hidden", "true");
  $("sheet-backdrop").classList.remove("open");
  document.activeElement?.blur();
  state.editing = null;
}

$("sheet").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("sheet-msg");
  const amount = parseAmount($("f-amount").value);
  if (amount === null) { setMsg(msg, "Inserisci un importo valido, es. 12,50.", true); $("f-amount").focus(); return; }
  if (!state.categoryId) { setMsg(msg, "Scegli una categoria.", true); return; }
  if (!$("f-date").value) { setMsg(msg, "Scegli una data.", true); return; }

  const row = {
    amount_cents: amount,
    kind: state.kind,
    category_id: state.categoryId,
    date: $("f-date").value,
    description: $("f-desc").value.trim() || null,
  };
  const save = $("sheet-save");
  save.disabled = true;
  const wasEdit = !!state.editing;
  const { error } = wasEdit
    ? await sb.from("transactions").update(row).eq("id", state.editing.id)
    : await sb.from("transactions").insert(row);
  save.disabled = false;
  if (error) { setMsg(msg, "Errore nel salvataggio: " + traduciErrore(error.message), true); return; }

  state.lastCategory[row.kind] = row.category_id;
  closeSheet();
  toast(wasEdit ? "Movimento aggiornato" : "Movimento salvato");
  refreshAfterChange(row.date);
  // 0.2.2: dopo lo stipendio, se quel mese non ha un budget, lo chiede
  if (!wasEdit && row.kind === "entrata" && /stipendio/i.test(catById(row.category_id)?.name || "")) {
    askBudgetAfterSalary(row);
  }
});

$("sheet-delete").addEventListener("click", async () => {
  const tx = state.editing;
  if (!tx) return;
  closeSheet();
  if (state.page === "mesi") await deleteTransactions([tx]);
});

// dopo un salvataggio aggiorna la pagina aperta (in "Mesi" si sposta sul mese del movimento)
function refreshAfterChange(dateStr) {
  const [y, m] = dateStr.split("-").map(Number);
  if (state.page === "mesi") {
    const target = new Date(y, m - 1, 1);
    if (target.getTime() !== state.month.getTime()) return goToMonth(target);
    return loadMonth();
  }
  if (state.page === "dashboard") loadDashboard();
}

// =========================================================
//  SEZIONI DELLA BARRA (0.1.2)
// =========================================================
const MAX_TABS = 4;
const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" class="fill"><rect x="4" y="12" width="4" height="8" rx="1"/><rect x="10" y="6" width="4" height="14" rx="1"/><rect x="16" y="9" width="4" height="11" rx="1"/></svg>',
  mesi: '<svg viewBox="0 0 24 24" class="stroke"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  abbonamenti: '<svg viewBox="0 0 24 24" class="stroke"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg>',
  auto: '<svg viewBox="0 0 24 24" class="stroke"><path d="M5 16V11l2-4.5h10L19 11v5"/><path d="M3.5 16h17M5 11h14"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/></svg>',
};
const SECTIONS = {
  dashboard:   { name: "Dashboard",   color: "#007aff" },
  mesi:        { name: "Mesi",        color: "#34c759" },
  abbonamenti: { name: "Abbonamenti", color: "#ff2d55", placeholder: true },
  auto:        { name: "Auto",        color: "#ff9500", placeholder: true },
};
const DEFAULT_SECTIONS = [
  { id: "dashboard", on: true }, { id: "mesi", on: true },
  { id: "abbonamenti", on: false }, { id: "auto", on: false },
];
const LS_SECTIONS = "flunora.sections", LS_THEME = "flunora.theme";
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// Tiene solo sezioni note, senza doppioni, e aggiunge in fondo quelle nuove
function normalizeSections(list) {
  const seen = new Set(), out = [];
  for (const s of Array.isArray(list) ? list : []) {
    if (SECTIONS[s?.id] && !seen.has(s.id)) { seen.add(s.id); out.push({ id: s.id, on: !!s.on }); }
  }
  for (const d of DEFAULT_SECTIONS) if (!seen.has(d.id)) out.push({ ...d, on: false });
  let n = 0;
  for (const s of out) if (s.on && ++n > MAX_TABS) s.on = false;
  if (n === 0) out[0].on = true;
  return out;
}

const firstSection = () => state.sections.find((s) => s.on)?.id || "dashboard";

const LS_SETTINGS = "flunora.settings";

async function loadSettings() {
  // prima la copia sul dispositivo (avvio veloce), poi quella su Supabase
  let local = null, localData = null;
  try { local = JSON.parse(lsGet(LS_SECTIONS)); } catch {}
  try { localData = JSON.parse(lsGet(LS_SETTINGS)); } catch {}
  state.sections = normalizeSections(local || DEFAULT_SECTIONS);
  state.settingsData = localData && typeof localData === "object" ? localData : {};
  const { data, error } = await sb.from("user_settings").select("data").maybeSingle();
  if (error) {
    state.settingsSynced = false;
    if (/user_settings|relation|schema cache|PGRST205|42P01/i.test(error.message + (error.code || ""))) {
      toast("Esegui lo script 0.1.2 in Supabase per sincronizzare le sezioni");
    }
    return;
  }
  state.settingsSynced = true;
  if (data?.data) {
    state.settingsData = { ...data.data };
    lsSet(LS_SETTINGS, JSON.stringify(state.settingsData));
  }
  if (data?.data?.sections) {
    state.sections = normalizeSections(data.data.sections);
    lsSet(LS_SECTIONS, JSON.stringify(state.sections));
  }
}

// Salva tutte le impostazioni sincronizzate (sezioni, budget fisso, ...) in un colpo solo
let saveTimer;
function saveSettingsData(message = "Impostazioni salvate solo su questo dispositivo") {
  state.settingsData = { ...state.settingsData, sections: state.sections };
  lsSet(LS_SETTINGS, JSON.stringify(state.settingsData));
  lsSet(LS_SECTIONS, JSON.stringify(state.sections));
  clearTimeout(saveTimer);
  return new Promise((resolve) => {
    saveTimer = setTimeout(async () => {
      const { error } = await sb.from("user_settings").upsert({
        user_id: state.user.id,
        data: state.settingsData,
        updated_at: new Date().toISOString(),
      });
      if (error) toast(message);
      resolve(!error);
    }, 300);
  });
}
const saveSections = () => saveSettingsData("Sezioni salvate solo su questo dispositivo");

function renderTabbar() {
  const pill = $("tab-pill");
  pill.replaceChildren();
  const on = state.sections.filter((s) => s.on);
  pill.style.setProperty("--n", on.length);
  for (const s of on) {
    const a = el("a", "tab");
    a.href = "#" + s.id;
    a.dataset.page = s.id;
    a.innerHTML = ICONS[s.id];
    a.append(el("span", null, SECTIONS[s.id].name));
    if (s.id === state.page) a.classList.add("active");
    pill.append(a);
  }
}

// =========================================================
//  TEMA (per dispositivo)
// =========================================================
function applyTheme(theme) {
  const t = ["light", "dark"].includes(theme) ? theme : "auto";
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  // colore della barra di stato su iPhone
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    if (!m.dataset.orig) m.dataset.orig = m.content;
    m.content = t === "auto" ? m.dataset.orig : t === "dark" ? "#000000" : "#f2f2f7";
  });
  document.querySelectorAll("#theme-seg button").forEach((b) => b.classList.toggle("on", b.dataset.theme === t));
  return t;
}
applyTheme(lsGet(LS_THEME));

$("theme-seg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-theme]");
  if (!b) return;
  lsSet(LS_THEME, applyTheme(b.dataset.theme));
});

// =========================================================
//  PANNELLO IMPOSTAZIONI
// =========================================================
$("btn-settings").addEventListener("click", openSettings);
$("settings-done").addEventListener("click", closeSettings);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("settings").classList.contains("open")) closeSettings(); });

function openSettings() {
  setSelecting(false);
  renderSectionsList();
  $("set-budget").textContent = defaultBudget() ? fmt(defaultBudget()) : "Non impostato";
  $("settings").scrollTop = 0;
  $("settings").classList.add("open");
  $("settings").setAttribute("aria-hidden", "false");
}
function closeSettings() {
  $("settings").classList.remove("open");
  $("settings").setAttribute("aria-hidden", "true");
  // se la sezione aperta è stata tolta dalla barra, passa alla prima attiva
  const current = state.sections.find((s) => s.id === state.page);
  if (!current?.on) location.hash = firstSection();
}

document.querySelectorAll(".settings li.soon").forEach((li) => {
  li.addEventListener("click", () => toast(`Arriva con la versione ${li.dataset.ver}`));
});

function renderSectionsList() {
  const ul = $("sections-list");
  ul.replaceChildren();
  for (const s of state.sections) {
    const info = SECTIONS[s.id];
    const li = el("li");
    li.dataset.id = s.id;

    const ico = el("span", "ico");
    ico.style.setProperty("--c", info.color);
    ico.innerHTML = ICONS[s.id];

    const label = el("span", "label");
    label.append(el("span", null, info.name));
    if (info.placeholder) label.append(el("small", null, "Segnaposto · in arrivo"));

    const sw = el("label", "switch");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = s.on;
    input.setAttribute("aria-label", `Mostra ${info.name} nella barra`);
    input.addEventListener("change", () => toggleSection(s.id, input));
    sw.append(input, el("span"));

    const handle = el("span", "handle");
    handle.setAttribute("aria-label", `Sposta ${info.name}`);
    handle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 8h14M5 12h14M5 16h14"/></svg>';
    attachSort(li, handle, (order) => {
      const changed = order.join() !== state.sections.map((x) => x.id).join();
      state.sections.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      if (changed) { renderTabbar(); saveSections(); }
    });

    li.append(ico, label, sw, handle);
    ul.append(li);
  }
}

function toggleSection(id, input) {
  const s = state.sections.find((x) => x.id === id);
  const active = state.sections.filter((x) => x.on).length;
  if (input.checked && active >= MAX_TABS) {
    input.checked = false;
    return toast(`Al massimo ${MAX_TABS} sezioni nella barra`);
  }
  if (!input.checked && active <= 1) {
    input.checked = true;
    return toast("Serve almeno una sezione nella barra");
  }
  s.on = input.checked;
  renderTabbar();
  saveSections();
}

// Trascinamento con la maniglia ≡: la riga segue il dito e cambia posto.
// Al rilascio chiama onDrop con il nuovo ordine degli id.
function attachSort(li, handle, onDrop) {
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const ul = li.parentElement;
    const pid = e.pointerId;
    li.classList.add("dragging");

    // gli eventi si ascoltano sulla pagina: spostando la riga nel DOM la maniglia perderebbe il dito
    const move = (ev) => {
      if (ev.pointerId !== pid) return;
      ev.preventDefault();
      const others = [...ul.children].filter((x) => x !== li);
      let before = null;
      for (const o of others) {
        const r = o.getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { before = o; break; }
      }
      if (before !== li.nextElementSibling && !(before === null && li === ul.lastElementChild)) {
        ul.insertBefore(li, before);
      }
    };
    const up = (ev) => {
      if (ev.pointerId !== pid) return;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      li.classList.remove("dragging");
      onDrop([...ul.children].map((x) => x.dataset.id));
    };
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  });
  // il tocco sulla maniglia non apre la riga
  handle.addEventListener("click", (e) => e.stopPropagation());
}

// =========================================================
//  MENU DI SCELTA (stile iOS)
// =========================================================
function actionSheet({ title = "", message = "", actions = [] }) {
  $("action-title").textContent = title;
  $("action-msg").textContent = message;
  const list = $("action-list");
  list.replaceChildren();
  for (const a of actions) {
    const b = el("button", "opt" + (a.danger ? " danger" : ""));
    b.type = "button";
    if (a.category) b.append(catIcon(a.category, "sm"));
    b.append(document.createTextNode(a.label));
    b.addEventListener("click", () => { closeActionSheet(); a.onClick(); });
    list.append(b);
  }
  $("action-sheet").classList.add("open");
  $("action-sheet").setAttribute("aria-hidden", "false");
  $("action-backdrop").classList.add("open");
}
function closeActionSheet() {
  $("action-sheet").classList.remove("open");
  $("action-sheet").setAttribute("aria-hidden", "true");
  $("action-backdrop").classList.remove("open");
}
$("action-cancel").addEventListener("click", closeActionSheet);
$("action-backdrop").addEventListener("click", closeActionSheet);

// =========================================================
//  CATEGORIE (0.2.0)
// =========================================================
const KIND_ONE = { uscita: "Uscita", entrata: "Entrata", investimento: "Investimento" };
state.catKind = "uscita";
state.catStats = new Map();
state.statsMissing = false;
state.showArchived = false;
state.catEdit = null;

// errore dovuto allo script 0.2.0 non ancora eseguito su Supabase?
const needsMigration = (err) =>
  /icon|archived|category_stats|delete_category|reorder_categories|schema cache|does not exist|PGRST20|42703|42P01|42883/i
    .test(`${err?.message} ${err?.code}`);
function dbError(prefix, err) {
  toast(needsMigration(err) ? "Esegui lo script 0.2.0 in Supabase" : prefix + traduciErrore(err.message));
}

function sortCategories() {
  state.categories.sort((a, b) => a.kind.localeCompare(b.kind) || (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

// aggiorna tutto ciò che mostra le categorie
function afterCategoriesChanged() {
  sortCategories();
  fillFilterSelect();
  if ($("categories").classList.contains("open")) renderCatPage();
  if ($("sheet").classList.contains("open")) renderChips();
  if (state.page === "mesi") { renderDonut(); renderList(); }
}

// ---------- pagina Categorie ----------
$("open-categories").addEventListener("click", openCategories);
$("categories-back").addEventListener("click", closeCategories);
$("cat-new").addEventListener("click", () => openCatEditor(null, state.catKind));
$("cat-archived-toggle").addEventListener("click", () => { state.showArchived = !state.showArchived; renderCatPage(); });
$("cat-kind-seg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-kind]");
  if (!b) return;
  state.catKind = b.dataset.kind;
  state.showArchived = false;
  renderCatPage();
});

async function openCategories() {
  state.showArchived = false;
  renderCatPage();
  $("categories").scrollTop = 0;
  $("categories").classList.add("open");
  $("categories").setAttribute("aria-hidden", "false");
  await loadCatStats();
  renderCatPage();
}
function closeCategories() {
  $("categories").classList.remove("open");
  $("categories").setAttribute("aria-hidden", "true");
}

async function loadCatStats() {
  const { data, error } = await sb.from("category_stats").select("category_id, n, total_cents");
  state.catStats = new Map();
  state.statsMissing = !!error;
  if (error) return;
  for (const r of data) state.catStats.set(r.category_id, { n: Number(r.n), total: Number(r.total_cents) });
}

function statsText(c) {
  if (state.statsMissing) return "";
  const s = state.catStats.get(c.id);
  if (!s) return "Nessun movimento quest'anno";
  return `${s.n} ${s.n === 1 ? "movimento" : "movimenti"} · ${fmt(s.total)}`;
}

function catRow(c, sortable) {
  const li = el("li");
  li.dataset.id = c.id;
  const label = el("span", "label");
  label.append(el("span", null, c.name));
  const st = statsText(c);
  if (st || c.archived) label.append(el("small", null, c.archived ? ["Archiviata", st].filter(Boolean).join(" · ") : st));
  li.append(catIcon(c), label);
  if (sortable) {
    const handle = el("span", "handle");
    handle.setAttribute("aria-label", `Sposta ${c.name}`);
    handle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 8h14M5 12h14M5 16h14"/></svg>';
    attachSort(li, handle, saveCatOrder);
    li.append(handle);
  } else {
    li.append(el("span", "chev", "›"));
  }
  li.addEventListener("click", () => openCatEditor(c));
  return li;
}

function renderCatPage() {
  document.querySelectorAll("#cat-kind-seg button").forEach((b) => b.classList.toggle("on", b.dataset.kind === state.catKind));
  const all = state.categories.filter((c) => c.kind === state.catKind);
  const active = all.filter((c) => !c.archived), archived = all.filter((c) => c.archived);

  const ul = $("cat-list");
  ul.replaceChildren(...active.map((c) => catRow(c, true)));
  ul.hidden = active.length === 0;

  $("cat-archived-count").textContent = archived.length ? archived.length : "Nessuna";
  $("cat-archived-chev").style.transform = state.showArchived && archived.length ? "rotate(90deg)" : "";
  const arch = $("cat-archived");
  arch.replaceChildren(...archived.map((c) => catRow(c, false)));
  arch.hidden = !state.showArchived || archived.length === 0;
}

async function saveCatOrder(order) {
  const kindIds = state.categories.filter((c) => c.kind === state.catKind && !c.archived).map((c) => c.id);
  if (order.join() === kindIds.join()) return;
  order.forEach((id, i) => { const c = catById(id); if (c) c.sort_order = i + 1; });
  afterCategoriesChanged();
  const { error } = await sb.rpc("reorder_categories", { ids: order });
  if (error) dbError("Ordine non salvato: ", error);
}

// ---------- editor categoria ----------
$("cat-cancel").addEventListener("click", closeCatEditor);
$("cat-backdrop").addEventListener("click", closeCatEditor);
$("cat-name").addEventListener("input", renderCatPreview);
$("cat-edit-kind").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-kind]");
  if (!b || !state.catEdit) return;
  state.catEdit.kind = b.dataset.kind;
  renderCatEditor();
});

function openCatEditor(c, kind, fromMovement = false) {
  state.catEdit = {
    c, fromMovement,
    kind: c?.kind || kind || "uscita",
    icon: c?.icon || "tag",
    color: c?.color || CATEGORY_COLORS[6],
  };
  $("cat-title").textContent = c ? "Modifica categoria" : "Nuova categoria";
  $("cat-name").value = c?.name || "";
  $("cat-edit-kind").hidden = !!c;
  $("cat-kind-fixed").hidden = !c;
  $("cat-kind-fixed").textContent = c ? `Tipo: ${KIND_ONE[c.kind]} (non modificabile)` : "";
  $("cat-actions").hidden = !c;
  $("cat-archive").textContent = c?.archived ? "Ripristina categoria" : "Archivia categoria";
  setMsg($("cat-msg"), "");
  renderCatEditor();
  $("cat-sheet").scrollTop = 0;
  $("cat-sheet").classList.add("open");
  $("cat-sheet").setAttribute("aria-hidden", "false");
  $("cat-backdrop").classList.add("open");
  // 0.2.1: niente cursore automatico, la tastiera si apre solo toccando il nome
}

function closeCatEditor() {
  $("cat-sheet").classList.remove("open");
  $("cat-sheet").setAttribute("aria-hidden", "true");
  $("cat-backdrop").classList.remove("open");
  if ($("cat-sheet").contains(document.activeElement)) document.activeElement.blur();
  state.catEdit = null;
}

function renderCatPreview() {
  const e = state.catEdit;
  if (!e) return;
  $("cat-preview").replaceChildren(
    catIcon({ color: e.color, icon: e.icon }, "lg"),
    el("span", "name", $("cat-name").value.trim() || "Nome della categoria")
  );
}

function renderCatEditor() {
  const e = state.catEdit;
  document.querySelectorAll("#cat-edit-kind button").forEach((b) => b.classList.toggle("on", b.dataset.kind === e.kind));
  renderCatPreview();

  const grid = $("cat-icons");
  grid.replaceChildren();
  for (const [key, ic] of Object.entries(CATEGORY_ICONS)) {
    const b = el("button", key === e.icon ? "on" : "");
    b.type = "button";
    b.style.setProperty("--c", e.color);
    b.innerHTML = iconSvg(key);
    b.setAttribute("aria-label", ic.label);
    b.title = ic.label;
    b.addEventListener("click", () => { e.icon = key; renderCatEditor(); });
    grid.append(b);
  }

  const row = $("cat-colors");
  row.replaceChildren();
  const colors = CATEGORY_COLORS.includes(e.color) ? CATEGORY_COLORS : [e.color, ...CATEGORY_COLORS];
  for (const col of colors) {
    const b = el("button", col === e.color ? "on" : "");
    b.type = "button";
    b.style.setProperty("--c", col);
    b.setAttribute("aria-label", "Colore " + col);
    b.addEventListener("click", () => { e.color = col; renderCatEditor(); });
    row.append(b);
  }
}

$("cat-sheet").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const e = state.catEdit;
  if (!e) return;
  const msg = $("cat-msg");
  const name = $("cat-name").value.trim().replace(/\s+/g, " ");
  if (!name) { setMsg(msg, "Scrivi un nome per la categoria.", true); $("cat-name").focus(); return; }
  const dup = state.categories.find((c) => c.kind === e.kind && c.id !== e.c?.id && c.name.toLowerCase() === name.toLowerCase());
  if (dup) {
    setMsg(msg, dup.archived
      ? "C'è già una categoria archiviata con questo nome: puoi ripristinarla da Archiviate."
      : "Esiste già una categoria con questo nome.", true);
    return;
  }

  const btn = $("cat-save");
  btn.disabled = true;
  let res;
  if (e.c) {
    res = await sb.from("categories").update({ name, icon: e.icon, color: e.color }).eq("id", e.c.id);
  } else {
    const maxOrder = Math.max(0, ...state.categories.filter((c) => c.kind === e.kind).map((c) => c.sort_order || 0));
    res = await sb.from("categories")
      .insert({ name, kind: e.kind, icon: e.icon, color: e.color, sort_order: maxOrder + 1 })
      .select().single();
  }
  btn.disabled = false;
  if (res.error) {
    if (/duplicate|unique/i.test(res.error.message)) setMsg(msg, "Esiste già una categoria con questo nome.", true);
    else if (needsMigration(res.error)) setMsg(msg, "Esegui prima lo script 0.2.0 in Supabase.", true);
    else setMsg(msg, "Errore: " + traduciErrore(res.error.message), true);
    return;
  }

  const created = e.c ? null : res.data;
  closeCatEditor();
  await loadCategories();
  if (created && e.fromMovement) {
    state.categoryId = created.id;
    state.lastCategory[created.kind] = created.id;
  }
  afterCategoriesChanged();
  toast(e.c ? "Categoria aggiornata" : "Categoria creata");
});

// ---------- archivia / ripristina ----------
const activeOfKind = (kind, exceptId) => state.categories.filter((c) => c.kind === kind && !c.archived && c.id !== exceptId);

$("cat-archive").addEventListener("click", () => {
  const c = state.catEdit?.c;
  if (c) setArchived(c, !c.archived);
});

async function setArchived(c, archived) {
  if (archived && activeOfKind(c.kind, c.id).length === 0) {
    return toast("Serve almeno una categoria attiva per ogni tipo");
  }
  const { error } = await sb.from("categories").update({ archived }).eq("id", c.id);
  if (error) return dbError("Errore: ", error);
  closeCatEditor();
  await loadCategories();
  afterCategoriesChanged();
  toast(archived ? `"${c.name}" archiviata` : `"${c.name}" ripristinata`);
}

// ---------- elimina ----------
$("cat-delete").addEventListener("click", async () => {
  const c = state.catEdit?.c;
  if (!c) return;
  const others = activeOfKind(c.kind, c.id);
  const { count, error } = await sb.from("transactions")
    .select("id", { count: "exact", head: true }).eq("category_id", c.id);
  if (error) return dbError("Errore: ", error);

  if (!count) {
    if (!c.archived && others.length === 0) return toast("Serve almeno una categoria attiva per ogni tipo");
    return actionSheet({
      title: `Eliminare "${c.name}"?`,
      message: "Non ha movimenti.",
      actions: [{ label: "Elimina categoria", danger: true, onClick: () => deleteCategory(c, null) }],
    });
  }

  const actions = [];
  if (others.length) actions.push({ label: "Sposta i movimenti ed elimina…", onClick: () => chooseTarget(c, others, count) });
  if (!c.archived && others.length) actions.push({ label: "Archivia invece", onClick: () => setArchived(c, true) });
  if (!actions.length) return toast("Crea prima un'altra categoria dello stesso tipo");
  actionSheet({
    title: `"${c.name}" ha ${count} ${count === 1 ? "movimento" : "movimenti"}`,
    message: "Puoi spostarli in un'altra categoria e poi eliminarla, oppure archiviarla e tenere lo storico com'è.",
    actions,
  });
});

function chooseTarget(c, others, count) {
  actionSheet({
    title: `Sposta ${count} ${count === 1 ? "movimento" : "movimenti"} in…`,
    message: `Poi "${c.name}" verrà eliminata.`,
    actions: others.map((o) => ({ label: o.name, category: o, onClick: () => deleteCategory(c, o) })),
  });
}

async function deleteCategory(c, target) {
  const { error } = await sb.rpc("delete_category", { cat: c.id, move_to: target?.id ?? null });
  if (error) return dbError("Eliminazione non riuscita: ", error);
  closeCatEditor();
  await Promise.all([loadCategories(), loadCatStats()]);
  afterCategoriesChanged();
  if (state.page === "mesi") loadMonth();
  toast(target ? `Eliminata · movimenti spostati in ${target.name}` : "Categoria eliminata");
}

// =========================================================
//  BUDGET (0.2.2)
//  Budget fisso nelle impostazioni sincronizzate; budget del singolo mese nella tabella "budgets".
// =========================================================
$("open-budget").addEventListener("click", () => openBudgetSheet({ month: firstOfMonth(new Date()), scope: "all" }));
$("budget-cancel").addEventListener("click", closeBudgetSheet);
$("budget-backdrop").addEventListener("click", closeBudgetSheet);
$("budget-scope").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-scope]");
  if (b && state.budgetEdit) { state.budgetEdit.scope = b.dataset.scope; renderBudgetSheet(); }
});

const roundTo10 = (cents) => Math.max(1000, Math.round(cents / 1000) * 1000);
const meseNome = (d) => MESI[d.getMonth()];

// budget scelto solo per un mese (null se non c'è o se la tabella manca)
async function monthBudget(month) {
  const { data, error } = await sb.from("budgets").select("amount_cents").eq("month", isoDate(month)).maybeSingle();
  return error ? null : (data?.amount_cents ?? null);
}

async function askBudgetAfterSalary(row) {
  const [y, m] = row.date.split("-").map(Number);
  const month = new Date(y, m - 1, 1);
  if (defaultBudget() || await monthBudget(month)) return;   // c'è già un budget per quel mese
  openBudgetSheet({
    month, scope: "all", salary: row.amount_cents,
    intro: `Hai registrato lo stipendio. Quanto vuoi spendere a ${meseNome(month)}?`,
  });
}

async function openBudgetSheet({ month, scope, salary = null, intro = "" }) {
  const override = month.getTime() === state.month.getTime() ? state.budgetMonth : await monthBudget(month);
  const prev = addMonths(month, -1);
  const prevBudget = (await monthBudget(prev)) ?? defaultBudget();
  state.budgetEdit = { month, override, salary, prevBudget, scope: scope || (override ? "month" : "all") };

  const current = override ?? defaultBudget();
  $("budget-amount").value = current ? (current / 100).toFixed(2).replace(".", ",") : "";
  $("budget-intro").textContent = intro;
  $("budget-scope-month").textContent = `Solo ${meseNome(month)}`;
  setMsg($("budget-msg"), "");
  renderBudgetSheet();
  $("budget-sheet").scrollTop = 0;
  $("budget-sheet").classList.add("open");
  $("budget-sheet").setAttribute("aria-hidden", "false");
  $("budget-backdrop").classList.add("open");
}

function closeBudgetSheet() {
  $("budget-sheet").classList.remove("open");
  $("budget-sheet").setAttribute("aria-hidden", "true");
  $("budget-backdrop").classList.remove("open");
  if ($("budget-sheet").contains(document.activeElement)) document.activeElement.blur();
  state.budgetEdit = null;
}

function renderBudgetSheet() {
  const e = state.budgetEdit;
  const mese = meseNome(e.month);
  document.querySelectorAll("#budget-scope button").forEach((b) => b.classList.toggle("on", b.dataset.scope === e.scope));
  $("budget-note").textContent = e.scope === "all"
    ? "Vale per ogni mese, tranne quelli con un budget scelto apposta."
    : `Solo per ${mese} ${e.month.getFullYear()}; gli altri mesi usano il budget fisso.`;

  // proposte rapide (senza doppioni)
  const proposals = [];
  const add = (label, cents) => { if (cents && !proposals.some((p) => p.cents === cents)) proposals.push({ label, cents }); };
  if (e.salary) add("70% dello stipendio", roundTo10(e.salary * 0.7));
  if (e.prevBudget) add("Come il mese prima", e.prevBudget);
  if (defaultBudget() && e.scope === "month") add("Budget fisso", defaultBudget());
  if (!e.salary && month0Income(e.month)) add("70% delle entrate", roundTo10(month0Income(e.month) * 0.7));
  const box = $("budget-quick");
  box.replaceChildren(...proposals.map((p) => {
    const b = el("button", "chip");
    b.type = "button";
    b.append(document.createTextNode(fmt(p.cents) + " "), el("small", null, p.label));
    b.addEventListener("click", () => { $("budget-amount").value = (p.cents / 100).toFixed(2).replace(".", ","); });
    return b;
  }));
  box.hidden = proposals.length === 0;

  $("budget-clear-month").hidden = !e.override;
  $("budget-clear-month").textContent = defaultBudget() ? `Usa il budget fisso per ${mese}` : `Rimuovi il budget di ${mese}`;
  $("budget-remove").hidden = !defaultBudget();
  $("budget-actions").hidden = $("budget-clear-month").hidden && $("budget-remove").hidden;
}

// entrate del mese, se è quello mostrato in pagina
function month0Income(month) {
  return month.getTime() === state.month.getTime() ? monthTotals().entrata : 0;
}

async function afterBudgetChange(text) {
  closeBudgetSheet();
  toast(text);
  if (state.page === "mesi") await loadMonth();
  $("set-budget").textContent = defaultBudget() ? fmt(defaultBudget()) : "Non impostato";
}

$("budget-sheet").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const e = state.budgetEdit;
  if (!e) return;
  const msg = $("budget-msg");
  const amount = parseAmount($("budget-amount").value);
  if (amount === null) { setMsg(msg, "Inserisci un importo valido, es. 1.500.", true); $("budget-amount").focus(); return; }
  const btn = $("budget-save");
  btn.disabled = true;

  if (e.scope === "all") {
    state.settingsData.budget_cents = amount;
    const ok = await saveSettingsData("Budget salvato solo su questo dispositivo");
    // il mese da cui lo imposti segue il nuovo budget fisso
    if (e.override) await sb.from("budgets").delete().eq("month", isoDate(e.month));
    btn.disabled = false;
    await afterBudgetChange(ok ? "Budget fisso salvato" : "Budget salvato su questo dispositivo");
  } else {
    const { error } = await sb.from("budgets").upsert(
      { user_id: state.user.id, month: isoDate(e.month), amount_cents: amount, updated_at: new Date().toISOString() },
      { onConflict: "user_id,month" });
    btn.disabled = false;
    if (error) {
      setMsg(msg, /budgets|schema cache|PGRST20|42P01/i.test(`${error.message} ${error.code}`)
        ? "Esegui prima lo script 0.2.2 in Supabase." : "Errore: " + traduciErrore(error.message), true);
      return;
    }
    await afterBudgetChange(`Budget di ${meseNome(e.month)} salvato`);
  }
});

$("budget-clear-month").addEventListener("click", async () => {
  const e = state.budgetEdit;
  if (!e) return;
  const { error } = await sb.from("budgets").delete().eq("month", isoDate(e.month));
  if (error) return setMsg($("budget-msg"), "Errore: " + traduciErrore(error.message), true);
  await afterBudgetChange(defaultBudget() ? `${meseNome(e.month)} usa il budget fisso` : "Budget rimosso");
});

$("budget-remove").addEventListener("click", () => {
  actionSheet({
    title: "Rimuovere il budget fisso?",
    message: "I mesi senza un budget proprio mostreranno quanto resta delle entrate.",
    actions: [{ label: "Rimuovi budget fisso", danger: true, onClick: async () => {
      delete state.settingsData.budget_cents;
      await saveSettingsData();
      await afterBudgetChange("Budget fisso rimosso");
    } }],
  });
});

init();
