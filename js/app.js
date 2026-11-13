// =========================================================
//  Flunora — logica dell'app
// =========================================================
const APP_VERSION = "0.6.0";

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
  slideDir: null,                    // 0.3.1: direzione dell'animazione al cambio mese
  animateNext: false,                // 0.3.1: anima il prossimo disegno di grafici ed elenco
  balance: null,                     // 0.3.2: saldo totale calcolato (centesimi)
  freezeBar: false,                  // 0.3.1: barra ferma mentre una riga eliminata si richiude
  prevIds: null,                     // 0.3.1: movimenti prima di un salvataggio (per evidenziare il nuovo)
  restore: null,                     // ripristino in preparazione { obj, mode }
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
  if (lockCfg()) { $("lock").hidden = false; document.body.classList.add("is-locked"); } // IMPR-004: niente dati visibili prima di Face ID
  const { data } = await sb.auth.getSession();
  handleSession(data.session);
  sb.auth.onAuthStateChange((_e, session) => handleSession(session));
}

function handleSession(session) {
  const user = session?.user ?? null;
  if (sessionChecked && user?.id === state.user?.id) return;
  sessionChecked = true;
  state.user = user;
  if (!user) hideLock();
  else if (lockCfg()) showLock(); // IMPR-004: all'apertura chiede Face ID
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
  if (confirm("Vuoi uscire da Flunora?")) { lockOff(); await sb.auth.signOut(); }
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
  runRecurring(); // 0.6.0: aggiunge i movimenti periodici arrivati a scadenza
  maybeShowWhatsNew();
  maybeAutoCopy();
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
  const prevPage = state.page;
  state.page = p;
  setSelecting(false);
  for (const id of Object.keys(SECTIONS)) $("page-" + id).hidden = id !== p;
  document.querySelectorAll("#tab-pill .tab").forEach((t) => t.classList.toggle("active", t.dataset.page === p));
  moveLens(true);
  renderMoreButton();
  // 0.3.1: nuova sezione = dissolvenza; stesso Mesi con un altro mese = scivola nella direzione della freccia
  const pageEl = $("page-" + p);
  const anim = prevPage !== p ? "enter" : state.slideDir ? `from-${state.slideDir}` : "";
  state.slideDir = null;
  if (anim) playClass(pageEl, anim, 420);
  state.animateNext = true;
  window.scrollTo(0, 0);
  if (p === "dashboard") loadDashboard();
  if (p === "mesi") loadMonth();
  if (p === "anticipi") loadAdvances();
  if (p === "desideri") loadWishes();
}
window.addEventListener("hashchange", route);

const goToMonth = (d) => {
  state.slideDir = d.getTime() > state.month.getTime() ? "right" : d.getTime() < state.month.getTime() ? "left" : null;
  location.hash = "mesi/" + monthKey(d);
};

// =========================================================
//  DASHBOARD (un anno alla volta)
// =========================================================
$("year-prev").addEventListener("click", () => { state.year--; playClass($("page-dashboard"), "from-left", 420); state.animateNext = true; loadDashboard(); });
$("year-next").addEventListener("click", () => { state.year++; playClass($("page-dashboard"), "from-right", 420); state.animateNext = true; loadDashboard(); });

async function loadDashboard() {
  loadBalance();   // saldo totale (0.2.4), indipendente dall'anno mostrato
  renderBackupBanner();   // promemoria backup (0.3.0)
  renderLeftoverBanner(); // avanzo del mese (0.5.1)
  renderRecap();          // recap del mese passato (0.6.0)
  renderUpcoming();       // periodici in arrivo (0.6.0)
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
  state.animateNext = false;

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

  const box = $("year-chart");
  box.classList.toggle("animate", !!state.animateNext);
  svg.querySelectorAll(".bar-in, .bar-out").forEach((r, k) => r.style.setProperty("--i", Math.floor(k / 2)));
  box.replaceChildren(svg);
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
  const [txRes, bRes, hRes] = await Promise.all([
    sb.from("transactions").select("*")
      .gte("date", isoDate(state.month)).lt("date", isoDate(addMonths(state.month, 1)))
      .order("date", { ascending: false }).order("created_at", { ascending: false }),
    sb.from("budgets").select("amount_cents").eq("month", isoDate(state.month)).maybeSingle(),
    // 0.4.2: spese dei 3 mesi precedenti, per il confronto con il solito
    sb.from("transactions").select("category_id,amount_cents,date").eq("kind", "uscita")
      .gte("date", isoDate(addMonths(state.month, -USUAL_MONTHS))).lt("date", isoDate(state.month)),
  ]);
  if (txRes.error) { toast("Errore movimenti: " + txRes.error.message); return; }
  if (shown !== state.month.getTime()) return; // mese cambiato nel frattempo
  state.history = hRes.error ? [] : hRes.data || [];
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
  countTo($("hero-amount"), rest === null ? t.uscita : Math.abs(rest), fmt);
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

  // 0.3.3: categorie di spesa con un budget (anche senza spese nel mese)
  const budgeted = state.categories.filter((c) => c.kind === "uscita" && c.budget_cents > 0 && (!c.archived || byCat.has(c.id)));
  const useBudgets = budgeted.length > 0;
  renderCatBudLink();

  $("cat-total").textContent = total ? fmt(total) : "";
  $("cat-empty").hidden = total > 0;
  const stack = $("cat-stack"), leg = $("cat-legend"), dots = $("cat-dots");
  stack.hidden = total === 0;
  dots.hidden = total === 0;
  stack.classList.toggle("filtering", !!state.filterCat);
  dots.classList.toggle("filtering", !!state.filterCat);
  leg.classList.toggle("filtering", !!state.filterCat);
  if (state.animateNext) playClass(stack, "animate", 650);
  applyCatDetails();

  stack.replaceChildren(...items.map((it) => {
    const s = el("span", it.id === state.filterCat ? "on" : "");
    s.style.flex = String(it.cents);
    s.style.background = it.cat?.color || "#8e8e93";
    return s;
  }));

  // 0.4.1: legenda compatta sotto la barra (colore, nome, percentuale); un tocco filtra
  const pct = (cents) => Math.max(1, Math.round((cents / total) * 100)) + "%";
  dots.replaceChildren(...items.map((it) => {
    const b = el("button", it.id === state.filterCat ? "on" : "");
    b.type = "button";
    b.setAttribute("aria-pressed", it.id === state.filterCat ? "true" : "false");
    b.setAttribute("aria-label", `${it.cat?.name || "?"}: ${fmt(it.cents)}, ${pct(it.cents)}`);
    const dot = el("i");
    dot.style.background = it.cat?.color || "#8e8e93";
    b.append(dot, el("span", "nm", it.cat?.name || "?"), el("span", "p", pct(it.cents)));
    b.addEventListener("click", () => setFilter(state.filterCat === it.id ? null : it.id));
    return b;
  }));

  // dettagli: prima le categorie con un budget, poi le altre con importo e percentuale
  const withB = useBudgets ? budgeted.map((c) => ({ id: c.id, cat: c, cents: byCat.get(c.id) || 0 }))
    .sort((a, b) => b.cents / b.cat.budget_cents - a.cents / a.cat.budget_cents || b.cents - a.cents) : [];
  const noB = items.filter((it) => !(it.cat?.budget_cents > 0));
  leg.hidden = withB.length + noB.length === 0;
  const usual = usualByCategory();
  leg.replaceChildren(...withB.map((it) => budgetRow(it, 0, usual)), ...noB.map((it) => budgetRow(it, total, usual)));
  // 0.4.2: spiegazione del confronto, solo se c'è almeno una freccia
  const note = $("cat-usual-note");
  note.hidden = !leg.querySelector(".cmp");
  if (usual) {
    const n = usual.months === 1 ? "del mese precedente" : `dei ${usual.months} mesi precedenti`;
    note.textContent = `Il solito: media ${n}` + (usual.partial ? ", fino allo stesso giorno del mese" : "");
  }
}

// 0.4.1: carta Categorie con i dettagli aperti o chiusi (scelta salvata sul dispositivo)
let catDetailsMem = null; // se il dispositivo non salva, la scelta vale finché l'app resta aperta
const catDetailsOpen = () => {
  if (catDetailsMem !== null) return catDetailsMem;
  try { return localStorage.getItem("flunora.catDetails") === "1"; } catch { return false; }
};
function applyCatDetails() {
  const open = catDetailsOpen();
  $("cat-details").hidden = !open;
  $("cat-toggle").setAttribute("aria-expanded", open ? "true" : "false");
  $("cat-toggle").classList.toggle("open", open);
  $("cat-toggle").firstElementChild.textContent = open ? "Nascondi" : "Dettagli";
}
$("cat-toggle").addEventListener("click", () => {
  catDetailsMem = !catDetailsOpen();
  try { localStorage.setItem("flunora.catDetails", catDetailsMem ? "1" : "0"); } catch {}
  applyCatDetails();
  if (catDetailsOpen()) playClass($("cat-details"), "enter", 400);
});

// 0.4.2: "il solito" = media delle spese per categoria nei 3 mesi precedenti.
// Nel mese in corso si confronta fino allo stesso giorno del mese, così all'inizio
// del mese non sembra sempre di spendere meno. Contano solo i mesi con almeno una spesa.
const USUAL_MONTHS = 3;
function usualByCategory() {
  const status = monthStatus(state.month);
  if (status > 0 || !state.history?.length) return null;
  const cutoff = status === 0 ? new Date().getDate() : 31;
  const months = new Set(), sums = new Map();
  for (const t of state.history) {
    months.add(t.date.slice(0, 7));
    if (Number(t.date.slice(8, 10)) > cutoff) continue;
    sums.set(t.category_id, (sums.get(t.category_id) || 0) + t.amount_cents);
  }
  if (!months.size) return null;
  const avg = new Map();
  for (const [id, cents] of sums) avg.set(id, cents / months.size);
  return { avg, months: months.size, partial: status === 0 };
}

// freccia rispetto al solito, solo se la differenza conta (almeno 10% e 5 €)
function usualCompare(it, usual) {
  if (!usual) return null;
  const avg = usual.avg.get(it.id) || 0;
  if (avg < 100) return null;
  const diff = it.cents - avg;
  if (Math.abs(diff) < Math.max(avg * 0.1, 500)) return null;
  const pct = Math.round((Math.abs(diff) / avg) * 100);
  const up = diff > 0;
  const s = el("span", "cmp " + (up ? "up" : "down"));
  s.append(el("span", "sep", "· "), `${up ? "↑" : "↓"} ${pct}% sul solito`);
  s.dataset.label = `${up ? "più" : "meno"} del solito del ${pct}%`;
  return s;
}

// una riga della carta Categorie con il budget (o, senza budget, importo e percentuale)
function budgetRow(it, total = 0, usual = null) {
  const bud = it.cat?.budget_cents > 0 ? it.cat.budget_cents : 0;
  const k = bud ? it.cents / bud : 0;
  const level = !bud ? "nob" : k > 1 ? "over" : k >= 0.8 ? "warn" : "ok";
  const b = el("button", `brow ${level}` + (it.id === state.filterCat ? " on" : ""));
  b.type = "button";
  b.setAttribute("aria-pressed", it.id === state.filterCat ? "true" : "false");
  const val = el("span", "val");
  val.append(el("b", null, fmt(it.cents)));
  if (bud) val.append(document.createTextNode(" di " + fmt(bud)));
  else val.append(document.createTextNode(" · " + Math.max(1, Math.round((it.cents / (total || 1)) * 100)) + "%"));
  b.append(catIcon(it.cat, "sm"), el("span", "nm", it.cat?.name || "?"), val);
  if (bud) {
    const bar = el("span", "bar"), fill = el("i");
    fill.style.width = Math.min(100, k * 100) + "%";
    bar.append(fill);
    const st = k > 1 ? "Oltre di " + fmt(it.cents - bud)
      : k === 1 ? "Budget esaurito"
      : k >= 0.8 ? "Quasi finito · restano " + fmt(bud - it.cents)
      : "Restano " + fmt(bud - it.cents);
    const stEl = el("span", "st", st);
    const cmp = usualCompare(it, usual);
    if (cmp) stEl.append(" ", cmp);
    b.append(bar, stEl);
    b.setAttribute("aria-label", `${it.cat.name}: ${fmt(it.cents)} di ${fmt(bud)}. ${st}` + (cmp ? `. ${cmp.dataset.label}` : ""));
  } else {
    const stEl = el("span", "st", "Nessun budget");
    const cmp = usualCompare(it, usual);
    if (cmp) stEl.append(" ", cmp);
    b.append(stEl);
  }
  b.addEventListener("click", () => setFilter(state.filterCat === it.id ? null : it.id));
  return b;
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

  box.classList.toggle("animate", !!state.animateNext);
  state.animateNext = false;
  const prevIds = state.prevIds;
  state.prevIds = null;
  // gruppi per giorno (le righe arrivano già dalla più recente)
  const groups = [];
  for (const tx of rows) {
    if (!groups.length || groups.at(-1).date !== tx.date) groups.push({ date: tx.date, items: [] });
    groups.at(-1).items.push(tx);
  }

  for (const g of groups) {
    const spese = g.items.filter((t) => t.kind === "uscita").reduce((a, t) => a + t.amount_cents, 0);
    const day = el("section", "day");
    day.style.setProperty("--i", Math.min(groups.indexOf(g), 8));
    const head = el("div", "day-head");
    head.append(el("span", "d", dayLabel(g.date)), el("span", "t", spese ? "− " + fmt(spese) : ""));
    const ul = el("ul", "card list");

    for (const tx of g.items) {
      const cat = catById(tx.category_id);
      const li = el("li", "swipe" + (state.selected.has(tx.id) ? " selected" : ""));
      li.dataset.id = tx.id;
      if (prevIds && !prevIds.has(tx.id)) li.classList.add("just-added");

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
        el("div", "sub", [tipo, cat?.name, tx.recurring_id ? "↻ periodico" : ""].filter(Boolean).join(" · "))
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
  // l'animazione parte subito, mentre il server elimina: niente attesa a riga ferma
  const [{ error }] = await Promise.all([
    sb.from("transactions").delete().in("id", ids),
    collapseRows(ids),
  ]);
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
$("sheet-cancel").addEventListener("click", () => showBar());
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
  renderFreq();
  renderAdvFields();
  syncRepRow();
}

// categorie selezionabili: quelle attive, più quella del movimento in modifica se archiviata
function chipCategories(kind) {
  if (kind === "anticipo") kind = "uscita"; // 0.4.5: categoria della propria parte
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
  $("sheet-foot").hidden = !tx; // 0.5.1: Duplica ed Elimina solo in modifica
  // 0.6.0: "Ripeti" solo per i movimenti nuovi; il pannello torna quello normale
  state.editingRec = null;
  $("sheet-dup").hidden = false;
  $("sheet-pause").hidden = true;
  $("sheet-delete").textContent = "Elimina";
  $("f-repeat").value = "";
  $("f-repeat").querySelector('option[value=""]').disabled = false;
  $("sheet").classList.remove("top"); $("sheet-backdrop").classList.remove("top");
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
  $("freq-row").scrollLeft = 0;
  if (!tx) loadFreq();
  // 0.4.5: "Anticipo" solo per i movimenti nuovi e con la sezione Anticipi attiva
  $("kind-anticipo").hidden = !!tx || !state.sections.some((x) => x.id === "anticipi" && x.on);
  if ($("kind-anticipo").hidden && state.kind === "anticipo") setKind("uscita");
  // IMPR-001 (0.4.6): dalla sezione Anticipi il pannello parte già da "Anticipo";
  // dalle altre pagine un anticipo non resta scelto
  if (!tx && !$("kind-anticipo").hidden) {
    if (state.page === "anticipi") setKind("anticipo");
    else if (state.kind === "anticipo") setKind("uscita");
  }
  resetAdvFields();
  syncRepRow();
  // 0.2.1: niente cursore automatico, la tastiera si apre solo toccando un campo
}

function closeSheet() {
  state.wishBuying = null;
  state.dupOf = null;
  state.editingRec = null;
  $("sheet").classList.remove("open");
  $("sheet").setAttribute("aria-hidden", "true");
  $("sheet-backdrop").classList.remove("open");
  document.activeElement?.blur();
  state.editing = null;
}

// =========================================================
// 0.4.3 — FREQUENTI: scorciatoie nel pannello + per le spese che ripeti
// Una scorciatoia = stessa descrizione e categoria registrata almeno 3 volte
// negli ultimi 90 giorni. Gli importati contano solo se la descrizione è breve
// (cioè rinominata): quelle lunghe della banca non diventano scorciatoie.
// =========================================================
const FREQ_DAYS = 90, FREQ_MIN = 3, FREQ_MAX = 6, FREQ_IMPORT_MAXLEN = 25;
let freqHiddenMem = null;
function freqHidden() {
  if (freqHiddenMem) return freqHiddenMem;
  try { freqHiddenMem = new Set(JSON.parse(localStorage.getItem("flunora.freqHidden") || "[]")); }
  catch { freqHiddenMem = new Set(); }
  return freqHiddenMem;
}
function saveFreqHidden() {
  try { localStorage.setItem("flunora.freqHidden", JSON.stringify([...freqHidden()])); } catch {}
}

async function loadFreq() {
  renderFreq(); // subito con i dati già letti, poi aggiornati
  const from = new Date(); from.setDate(from.getDate() - FREQ_DAYS);
  const { data, error } = await sb.from("transactions")
    .select("kind,category_id,amount_cents,description,import_key,date").gte("date", isoDate(from));
  if (error) return; // senza scorciatoie il pannello funziona come prima
  state.freqData = data || [];
  if ($("sheet").classList.contains("open")) renderFreq();
}

function freqItems(kind) {
  const hidden = freqHidden(), groups = new Map();
  for (const t of state.freqData || []) {
    if (t.kind !== kind) continue;
    const cat = catById(t.category_id);
    if (!cat || cat.archived) continue;
    const desc = (t.description || "").trim();
    if (t.import_key && desc.length > FREQ_IMPORT_MAXLEN) continue;
    const key = `${kind}|${cat.id}|${desc.toLowerCase()}`;
    let g = groups.get(key);
    if (!g) groups.set(key, g = { key, cat, desc, n: 0, amounts: new Set(), last: "" });
    g.n++;
    g.amounts.add(t.amount_cents);
    if (t.date > g.last) g.last = t.date;
  }
  return [...groups.values()]
    .filter((g) => g.n >= FREQ_MIN && !hidden.has(g.key))
    .sort((a, b) => b.n - a.n || b.last.localeCompare(a.last))
    .slice(0, FREQ_MAX)
    .map((g) => ({ ...g, amount: g.amounts.size === 1 ? [...g.amounts][0] : null }));
}

function renderFreq() {
  const box = $("freq-box"), row = $("freq-row");
  const items = state.editing || state.wishBuying || state.dupOf ? [] : freqItems(state.kind);
  box.hidden = items.length === 0;
  row.replaceChildren(...items.map((it) => {
    const b = el("button", "freq-chip");
    b.type = "button";
    const label = it.desc || it.cat.name;
    b.append(catIcon(it.cat, "sm"), el("span", "nm", label),
      el("span", "am", it.amount != null ? fmt(it.amount) : "importo?"));
    b.setAttribute("aria-label", `${label}, ${it.cat.name}` + (it.amount != null ? `, ${fmt(it.amount)}` : "") +
      ". Tieni premuto per rimuoverla");
    let timer = null, fired = false, x0 = 0, y0 = 0;
    const cancel = () => { clearTimeout(timer); timer = null; };
    b.addEventListener("pointerdown", (e) => {
      fired = false; x0 = e.clientX; y0 = e.clientY;
      timer = setTimeout(() => { fired = true; timer = null; freqMenu(it, label); }, 500);
    });
    b.addEventListener("pointermove", (e) => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) cancel(); });
    b.addEventListener("pointerup", cancel);
    b.addEventListener("pointercancel", cancel);
    b.addEventListener("pointerleave", cancel);
    b.addEventListener("contextmenu", (e) => { e.preventDefault(); if (!fired) { cancel(); fired = true; freqMenu(it, label); } });
    b.addEventListener("click", () => {
      if (fired) { fired = false; return; }
      useFreq(it, b);
    });
    return b;
  }));
}

function useFreq(it, btn) {
  state.categoryId = it.cat.id;
  renderChips();
  $("f-desc").value = it.desc;
  $("freq-row").querySelectorAll(".freq-chip").forEach((c) => c.classList.toggle("on", c === btn));
  setMsg($("sheet-msg"), "");
  if (it.amount != null) {
    $("f-amount").value = (it.amount / 100).toFixed(2).replace(".", ",");
    document.activeElement?.blur();
  } else {
    $("f-amount").value = "";
    $("f-amount").focus(); // apre la tastiera per l'importo
  }
}

function freqMenu(it, label) {
  actionSheet({
    title: label,
    message: "Non comparirà più tra i Frequenti. Puoi farla tornare da Impostazioni › Dati.",
    actions: [{ label: "Rimuovi dai frequenti", danger: true, onClick: () => {
      freqHidden().add(it.key);
      saveFreqHidden();
      renderFreq();
      toast("Scorciatoia rimossa");
    } }],
  });
}

function renderFreqReset() {
  const n = freqHidden().size;
  $("freq-reset").hidden = n === 0;
  $("freq-reset-n").textContent = n ? String(n) : "";
}
$("freq-reset").addEventListener("click", () => {
  freqHidden().clear();
  saveFreqHidden();
  renderFreqReset();
  toast("Scorciatoie di nuovo visibili");
});



// =========================================================
// 0.5.0 — DESIDERI
// Tabella wishes: cosa, quanto costa, quanto hai messo da parte.
// I soldi messi da parte restano sul conto: il saldo mostra il "Disponibile".
// "Comprato" apre il pannello + già compilato; salvato, il desiderio si chiude.
// =========================================================
const wishesOn = () => state.sections.some((x) => x.id === "desideri" && x.on);
// 0.5.1: Salvadanaio = soldi per i Desideri non assegnati a un desiderio (nelle impostazioni sincronizzate)
const wishPool = () => state.settingsData?.wish_pool_cents || 0;
const POOL_NAME = "Salvadanaio";
function setPool(cents) {
  state.settingsData.wish_pool_cents = Math.max(0, cents);
  return saveSettingsData("Salvadanaio salvato solo su questo dispositivo");
}

async function loadWishSaved() {
  const { data, error } = await sb.from("wishes").select("saved_cents").eq("status", "attivo");
  state.wishSavedCents = (error ? 0 : data.reduce((a, w) => a + w.saved_cents, 0)) + wishPool(); // + Salvadanaio (0.5.1)
}

// mesi da oggi alla scadenza (almeno 1) e quanto mettere da parte al mese
function wishPlan(w) {
  if (!w.due_date) return null;
  const now = new Date(), [y, m] = w.due_date.split("-").map(Number);
  const months = Math.max(1, (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth()) + 1);
  const left = Math.max(0, w.price_cents - w.saved_cents);
  return { months, monthly: Math.ceil(left / months / 100) * 100, label: `${MESI[m - 1][0].toUpperCase()}${MESI[m - 1].slice(1)} ${y}` }; // bug #008: mese con la maiuscola
}

async function loadWishes() {
  const { data, error } = await sb.from("wishes").select("*").order("sort_order").order("created_at");
  if (error) {
    $("wish-list").replaceChildren(el("p", "secondary", "I Desideri non sono ancora disponibili: esegui lo script della 0.5.0 in Supabase."));
    return;
  }
  state.wishes = data;
  await loadSavingRecs(); // 0.6.0
  const open = data.filter((w) => w.status === "attivo");
  const closed = data.filter((w) => w.status !== "attivo");
  const saved = open.reduce((a, w) => a + w.saved_cents, 0);
  const pool = wishPool();
  state.wishSavedCents = saved + pool;
  $("wish-total").textContent = fmt(saved + pool);
  const price = open.reduce((a, w) => a + w.price_cents, 0);
  $("wish-count").textContent = open.length
    ? `per ${open.length} ${open.length === 1 ? "desiderio" : "desideri"} · ${Math.round((saved / Math.max(1, price)) * 100)}% del totale (${fmt(price)})${pool ? ` · ${fmt(pool)} nel ${POOL_NAME}` : ""}`
    : pool ? `tutti nel ${POOL_NAME}` : "";
  $("wish-sum").hidden = !open.length && !pool;
  renderPool(open);
  $("wish-empty").hidden = open.length > 0;
  $("wish-list").replaceChildren(...open.map(wishCard));
  const t = $("wish-closed-toggle");
  t.hidden = !closed.length;
  t.textContent = `Comprati e rinunciati (${closed.length}) ${$("wish-closed").hidden ? "›" : "⌄"}`;
  $("wish-closed").replaceChildren(...closed.map(wishCard));
  loadLeftover();
}
$("wish-closed-toggle").addEventListener("click", () => {
  $("wish-closed").hidden = !$("wish-closed").hidden;
  $("wish-closed-toggle").textContent = $("wish-closed-toggle").textContent.replace(/[›⌄]$/, $("wish-closed").hidden ? "›" : "⌄");
});

function wishCard(w) {
  const card = el("section", "card wish-card" + (w.status !== "attivo" ? " closed" : ""));
  const head = el("div", "adv-head");
  head.append(el("h2", null, w.name), el("b", "wish-price", fmt(w.price_cents)));
  card.append(head);
  if (w.status !== "attivo") {
    card.append(el("p", "secondary small adv-sub", w.status === "comprato" ? `Comprato il ${advDate(w.closed_on)}` : `Rinunciato il ${advDate(w.closed_on)}`));
    head.addEventListener("click", () => wishMenu(w));
    return card;
  }
  // ordine di priorità: si trascina con la maniglia ≡
  card.dataset.id = w.id;
  if ((state.wishes || []).filter((x) => x.status === "attivo").length > 1) {
    const handle = el("span", "handle wish-handle");
    handle.setAttribute("aria-label", `Sposta ${w.name}`);
    handle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 8h14M5 12h14M5 16h14"/></svg>';
    head.append(handle);
    attachSort(card, handle, saveWishOrder);
  }
  const pct = Math.min(100, Math.round((w.saved_cents / w.price_cents) * 100));
  const bar = el("div", "wish-bar");
  const fill = el("i"); fill.style.width = pct + "%";
  if (pct >= 100) fill.classList.add("full");
  bar.append(fill);
  const left = Math.max(0, w.price_cents - w.saved_cents);
  const info = el("p", "secondary small wish-info",
    left ? `${fmt(w.saved_cents)} messi da parte · mancano ${fmt(left)}` : `${fmt(w.saved_cents)} messi da parte · ci sei!`);
  card.append(bar, info);
  const plan = wishPlan(w);
  if (plan && left) card.append(el("p", "small wish-plan", `Entro ${plan.label}: ${fmt(plan.monthly)} al mese`));
  const auto = savingRecFor(w);
  if (auto) card.append(el("p", "small wish-auto", `↻ ${fmt(auto.amount_cents)} ${recLabel(auto).toLowerCase()}`));
  if (w.note) card.append(el("p", "secondary small wish-note", w.note));
  const row = el("div", "wish-actions");
  const put = el("button", "adv-btn", "Metti da parte");
  put.type = "button";
  put.addEventListener("click", () => openWishMove(w, "in"));
  const buy = el("button", "adv-btn ghost", "Comprato");
  buy.type = "button";
  buy.addEventListener("click", () => buyWish(w));
  row.append(put, buy);
  if (w.link) {
    const a = el("a", "wish-link", "Apri link ↗");
    a.href = w.link; a.target = "_blank"; a.rel = "noopener";
    row.append(a);
  }
  card.append(row);
  head.addEventListener("click", () => wishMenu(w));
  return card;
}

async function saveWishOrder(ids) {
  const changes = ids.map((id, i) => ({ id, i })).filter(({ id, i }) => state.wishes.find((w) => w.id === id)?.sort_order !== i);
  for (const { id, i } of changes) {
    const { error } = await sb.from("wishes").update({ sort_order: i }).eq("id", id);
    if (error) { toast("Ordine non salvato: " + traduciErrore(error.message)); break; }
    const w = state.wishes.find((x) => x.id === id);
    if (w) w.sort_order = i;
  }
}

function wishMenu(w) {
  const actions = [];
  if (w.status === "attivo") {
    actions.push({ label: "Modifica", onClick: () => openWishSheet(w) });
    actions.push({ label: savingRecFor(w) ? "Risparmio periodico ↻" : "Risparmio periodico", onClick: () => openWishAuto(w) });
    if (w.saved_cents) actions.push({ label: "Sposta soldi", onClick: () => openWishMove(w, "move") });
    if (w.saved_cents) actions.push({ label: "Riprendi soldi", onClick: () => openWishMove(w, "out") });
    actions.push({ label: "Rinuncio", danger: true, onClick: () => giveUpWish(w) });
  } else {
    actions.push({ label: "Elimina", danger: true, onClick: async () => {
      const { error } = await sb.from("wishes").delete().eq("id", w.id);
      if (error) return toast("Errore: " + traduciErrore(error.message));
      loadWishes();
    } });
  }
  actionSheet({ title: w.name, message: "", actions });
}

// 0.5.1: rinunciando, i soldi messi da parte possono restare nei Desideri (Salvadanaio)
function giveUpWish(w) {
  if (!w.saved_cents) return closeWish(w, "rinuncia").then(() => toast(`Hai rinunciato a ${w.name}`));
  actionSheet({
    title: `Rinunci a ${w.name}?`,
    message: `Hai messo da parte ${fmt(w.saved_cents)}.`,
    actions: [
      { label: `Sposta ${fmt(w.saved_cents)} nel ${POOL_NAME}`, onClick: async () => {
        await setPool(wishPool() + w.saved_cents);
        await closeWish(w, "rinuncia");
        toast(`${fmt(w.saved_cents)} spostati nel ${POOL_NAME}`);
      } },
      { label: "Rendili disponibili", danger: true, onClick: () => closeWish(w, "rinuncia").then(() => toast(`${w.name}: soldi di nuovo disponibili`)) },
    ],
  });
}

async function closeWish(w, status, date = isoDate(new Date())) {
  const patch = { status, closed_on: date };
  if (status === "comprato" && w.txId) patch.bought_tx_id = w.txId;
  const { error } = await sb.from("wishes").update(patch).eq("id", w.id);
  if (error) return toast("Errore: " + traduciErrore(error.message));
  await loadWishSaved();
  if (state.page === "desideri") loadWishes();
  if (state.page === "dashboard") loadBalance();
}

// "Comprato": il pannello + parte già compilato come uscita
function buyWish(w) {
  openSheet(null);
  setKind("uscita");
  state.wishBuying = { ...w };
  $("f-amount").value = fmtPlain(w.price_cents);
  $("f-desc").value = w.name;
  $("sheet-title").textContent = "Hai comprato";
  $("freq-box").hidden = true;          // niente scorciatoie: è già compilato
  $("kind-anticipo").hidden = true;
  setMsg($("sheet-msg"), "Scegli la categoria e controlla l'importo: salvando, il desiderio si chiude e i soldi messi da parte tornano nel conto.");
}

// ---------- nuovo / modifica ----------
function openWishSheet(w = null) {
  state.wishEdit = w;
  $("wish-title").textContent = w ? "Modifica desiderio" : "Nuovo desiderio";
  $("wish-price").value = w ? fmtPlain(w.price_cents) : "";
  $("wish-name").value = w?.name || "";
  $("wish-due").value = w?.due_date ? w.due_date.slice(0, 7) : "";
  $("wish-link").value = w?.link || "";
  $("wish-note").value = w?.note || "";
  setMsg($("wish-msg"), "");
  updateWishPlan();
  $("wish-sheet").scrollTop = 0;
  $("wish-sheet").classList.add("open");
  $("wish-sheet").setAttribute("aria-hidden", "false");
  $("wish-backdrop").classList.add("open");
}
function closeWishSheet() {
  $("wish-sheet").classList.remove("open");
  $("wish-sheet").setAttribute("aria-hidden", "true");
  $("wish-backdrop").classList.remove("open");
  document.activeElement?.blur();
}
function updateWishPlan() {
  const price = parseAmount($("wish-price").value);
  const due = $("wish-due").value;
  const plan = price && due ? wishPlan({ price_cents: price, saved_cents: state.wishEdit?.saved_cents || 0, due_date: due + "-01" }) : null;
  $("wish-plan").textContent = plan ? `Per arrivarci entro ${plan.label} metti da parte circa ${fmt(plan.monthly)} al mese.` : "";
}
["wish-price", "wish-due"].forEach((id) => $(id).addEventListener("input", updateWishPlan));
$("wish-new").addEventListener("click", () => openWishSheet(null));
$("wish-cancel").addEventListener("click", closeWishSheet);
$("wish-backdrop").addEventListener("click", closeWishSheet);
$("wish-sheet").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("wish-msg");
  const price = parseAmount($("wish-price").value);
  const name = $("wish-name").value.trim();
  if (price === null) { setMsg(msg, "Inserisci quanto costa, es. 1.200.", true); return $("wish-price").focus(); }
  if (!name) { setMsg(msg, "Scrivi cosa desideri.", true); return $("wish-name").focus(); }
  const link = $("wish-link").value.trim();
  if (link && !/^https?:\/\//i.test(link)) { setMsg(msg, "Il link deve iniziare con https://", true); return; }
  const row = {
    name, price_cents: price, due_date: $("wish-due").value ? $("wish-due").value + "-01" : null,
    link: link || null, note: $("wish-note").value.trim() || null,
  };
  const w = state.wishEdit;
  if (!w) Object.assign(row, { sort_order: (state.wishes || []).filter((x) => x.status === "attivo").length, saved_cents: 0, status: "attivo" });
  const { error } = w ? await sb.from("wishes").update(row).eq("id", w.id) : await sb.from("wishes").insert(row);
  if (error) return setMsg(msg, "Errore nel salvataggio: " + traduciErrore(error.message), true);
  closeWishSheet();
  toast(w ? "Desiderio aggiornato" : "Desiderio aggiunto");
  loadWishes();
});

// ---------- metti da parte / sposta / riprendi ----------
// La fonte è un desiderio o il Salvadanaio (oggetto con pool: true).
const poolItem = () => ({ id: "pool", pool: true, name: POOL_NAME, saved_cents: wishPool(), price_cents: null });
const moveTargets = (src) => [
  ...(src.pool ? [] : [poolItem()]),
  ...(state.wishes || []).filter((w) => w.status === "attivo" && w.id !== src.id),
];

function openWishMove(src, dir, leftover = null) {
  state.wishMove = { src, dir, leftover, dest: null };
  $("wmove-title").textContent = src.name;
  $("wmove-amount").value = leftover ? fmtPlain(leftover.cents) : "";
  setMsg($("wmove-msg"), "");
  renderWishMove();
  $("wmove-sheet").scrollTop = 0;
  $("wmove-sheet").classList.add("open");
  $("wmove-sheet").setAttribute("aria-hidden", "false");
  $("wmove-backdrop").classList.add("open");
}
function closeWishMove() {
  $("wmove-sheet").classList.remove("open");
  $("wmove-sheet").setAttribute("aria-hidden", "true");
  $("wmove-backdrop").classList.remove("open");
  document.activeElement?.blur();
}
function renderWishMove() {
  const m = state.wishMove, { src, dir } = m;
  const targets = moveTargets(src);
  const canMove = src.saved_cents > 0 && targets.length > 0;
  const moveBtn = document.querySelector('#wmove-dir [data-dir="move"]');
  moveBtn.textContent = src.pool ? "Assegna" : "Sposta";
  moveBtn.hidden = !canMove;
  document.querySelector('#wmove-dir [data-dir="out"]').hidden = !src.saved_cents;
  $("wmove-dir").style.gridTemplateColumns = `repeat(${[...document.querySelectorAll("#wmove-dir button")].filter((b) => !b.hidden).length}, 1fr)`;
  document.querySelectorAll("#wmove-dir button").forEach((b) => b.classList.toggle("on", b.dataset.dir === dir));
  // destinazione (solo per Sposta / Assegna)
  $("wmove-to").hidden = dir !== "move";
  if (dir === "move") {
    if (!m.dest || !targets.some((t) => t.id === m.dest.id)) m.dest = targets[0];
    $("wmove-dest").replaceChildren(...targets.map((t) => {
      const b = el("button", "chip" + (t.id === m.dest.id ? " on" : ""), t.pool ? `${POOL_NAME}` : t.name);
      b.type = "button";
      b.addEventListener("click", () => { m.dest = t; renderWishMove(); });
      return b;
    }));
  }
  const missing = (w) => (w.pool ? 0 : Math.max(0, w.price_cents - w.saved_cents));
  const left = missing(src);
  const plan = src.pool ? null : wishPlan(src);
  const lo = m.leftover;
  let quick = [];
  if (dir === "in") quick = [
    lo ? [`Avanzo di ${lo.mese} (${fmt(lo.cents)})`, lo.cents] : null,
    plan && left ? [`${fmt(plan.monthly)} al mese`, Math.min(plan.monthly, left)] : null,
    left ? [`Tutto quello che manca (${fmt(left)})`, left] : null];
  else if (dir === "out") quick = [src.saved_cents ? [`Tutto (${fmt(src.saved_cents)})`, src.saved_cents] : null];
  else if (m.dest) quick = [
    !m.dest.pool && missing(m.dest) && missing(m.dest) < src.saved_cents ? [`Quanto manca a ${m.dest.name} (${fmt(missing(m.dest))})`, missing(m.dest)] : null,
    [`Tutto (${fmt(src.saved_cents)})`, src.saved_cents]];
  $("wmove-quick").replaceChildren(...quick.filter(Boolean).map(([label, cents]) => {
    const b = el("button", "chip", label);
    b.type = "button";
    b.addEventListener("click", () => { $("wmove-amount").value = fmtPlain(cents); });
    return b;
  }));
  const ora = src.pool ? `Ora nel ${POOL_NAME} ${fmt(src.saved_cents)}.` : `Ora ${fmt(src.saved_cents)} di ${fmt(src.price_cents)}.`;
  $("wmove-note").textContent = dir === "in"
    ? `${ora} I soldi restano sul conto: scendono solo dal Disponibile.`
    : dir === "out"
      ? `${src.pool ? `Nel ${POOL_NAME}` : "Messi da parte"} ${fmt(src.saved_cents)}. Ripresi, tornano nel Disponibile.`
      : `Da ${src.name} (${fmt(src.saved_cents)}) a ${m.dest?.name || ""}. Il Disponibile non cambia.`;
}
document.querySelectorAll("#wmove-dir button").forEach((b) => b.addEventListener("click", () => {
  state.wishMove.dir = b.dataset.dir; renderWishMove();
}));
$("wmove-amount").addEventListener("input", () => setMsg($("wmove-msg"), ""));
$("wmove-cancel").addEventListener("click", closeWishMove);
$("wmove-backdrop").addEventListener("click", closeWishMove);

// aggiunge (o toglie, con cents negativi) soldi a un desiderio o al Salvadanaio
async function addSaved(item, cents) {
  if (item.pool) { await setPool(wishPool() + cents); return null; }
  const cur = (state.wishes || []).find((w) => w.id === item.id)?.saved_cents ?? item.saved_cents;
  const { error } = await sb.from("wishes").update({ saved_cents: Math.max(0, cur + cents) }).eq("id", item.id);
  if (!error) { const w = (state.wishes || []).find((x) => x.id === item.id); if (w) w.saved_cents = Math.max(0, cur + cents); }
  return error;
}

$("wmove-sheet").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { src, dir, dest, leftover } = state.wishMove;
  const cents = parseAmount($("wmove-amount").value);
  const msg = $("wmove-msg");
  if (cents === null) { setMsg(msg, "Inserisci un importo, es. 50.", true); return $("wmove-amount").focus(); }
  if (dir !== "in" && cents > src.saved_cents) {
    setMsg(msg, `${dir === "out" ? "Puoi riprendere" : "Puoi spostare"} al massimo ${fmt(src.saved_cents)}.`, true); return;
  }
  let error = null;
  if (dir === "move") {
    error = await addSaved(dest, cents);
    if (!error) {
      error = await addSaved(src, -cents);
      if (error) await addSaved(dest, -cents); // non riuscito: rimette com'era
    }
  } else error = await addSaved(src, dir === "in" ? cents : -cents);
  if (error) return setMsg(msg, "Errore: " + traduciErrore(error.message), true);
  closeWishMove();
  if (dir === "in" && leftover) leftoverDone(leftover.key); // IMPR-002
  toast(dir === "in" ? `${fmt(cents)} messi da parte ${src.pool ? `nel ${POOL_NAME}` : `per ${src.name}`}`
    : dir === "out" ? `${fmt(cents)} tornati disponibili`
    : `${fmt(cents)} spostati ${dest.pool ? `nel ${POOL_NAME}` : `su ${dest.name}`}`);
  loadWishes();
});

// ---------- 0.5.1: Salvadanaio ----------
function renderPool(open) {
  const pool = wishPool();
  $("pool-total").textContent = fmt(pool);
  $("pool-sub").textContent = pool
    ? "Soldi per i Desideri non ancora assegnati a un desiderio"
    : "Metti da parte per i Desideri senza sceglierne uno: lo assegni dopo";
  $("pool-assign").hidden = !pool || !open.length;
  const auto = savingRecFor(poolItem());
  $("pool-auto").hidden = !auto;
  if (auto) $("pool-auto").textContent = `↻ ${fmt(auto.amount_cents)} ${recLabel(auto).toLowerCase()}`;
}
$("pool-put").addEventListener("click", () => openWishMove(poolItem(), "in"));
$("pool-assign").addEventListener("click", () => openWishMove(poolItem(), "move"));
$("pool-head").addEventListener("click", () => {
  const p = poolItem();
  if (!p.saved_cents) return openWishAuto(p);
  actionSheet({ title: POOL_NAME, message: `Dentro ci sono ${fmt(p.saved_cents)}.`, actions: [
    ...(moveTargets(p).length ? [{ label: "Assegna a un desiderio", onClick: () => openWishMove(p, "move") }] : []),
    { label: "Risparmio periodico", onClick: () => openWishAuto(p) },
    { label: "Riprendi soldi", onClick: () => openWishMove(p, "out") },
  ] });
});

// ---------- IMPR-002 (0.5.1): avanzo del mese, nei Desideri e nella Dashboard ----------
// Nel mese nuovo, se nel mese prima hai speso meno del budget, propone di mettere
// da parte quello che è avanzato. Si propone una volta per mese (fatto o "Non ora").
const leftoverSeen = () => { try { return localStorage.getItem("flunora.leftoverDone") || ""; } catch { return ""; } };
function leftoverDone(key) {
  try { localStorage.setItem("flunora.leftoverDone", key); } catch {}
  $("wish-left").hidden = true;
  $("left-banner").hidden = true;
}

async function computeLeftover() {
  const prev = addMonths(firstOfMonth(new Date()), -1);
  const key = monthKey(prev);
  if (!wishesOn() || leftoverSeen() >= key) return null;
  const [bRes, tRes] = await Promise.all([
    sb.from("budgets").select("amount_cents").eq("month", isoDate(prev)).maybeSingle(),
    sb.from("transactions").select("amount_cents").eq("kind", "uscita")
      .gte("date", isoDate(prev)).lt("date", isoDate(addMonths(prev, 1))),
  ]);
  const budget = (bRes.error ? null : bRes.data?.amount_cents) ?? defaultBudget();
  if (tRes.error || !budget) return null;
  const spent = tRes.data.reduce((a, t) => a + t.amount_cents, 0);
  const left = budget - spent;
  if (!spent || left < 100) return null; // mese vuoto o niente avanzo
  return state.leftover = { key, mese: MESI[prev.getMonth()], cents: left, spent, budget };
}

async function loadLeftover() {
  const lo = await computeLeftover();
  $("wish-left").hidden = !lo;
  if (!lo) return;
  $("wish-left-title").textContent = `Del budget di ${lo.mese} ti sono avanzati ${fmt(lo.cents)}`;
  $("wish-left-sub").textContent = `Hai speso ${fmt(lo.spent)} su ${fmt(lo.budget)}. Vuoi metterli da parte per i Desideri?`;
  if (state.leftoverGo) { state.leftoverGo = false; chooseLeftoverTarget(); }
}

// dove mettere l'avanzo: nel Salvadanaio o in un desiderio a cui mancano soldi
function chooseLeftoverTarget() {
  const lo = state.leftover;
  if (!lo) return;
  const go = (w) => openWishMove(w, "in", { key: lo.key, mese: lo.mese, cents: w.pool ? lo.cents : Math.min(lo.cents, w.price_cents - w.saved_cents) });
  const wishes = (state.wishes || []).filter((w) => w.status === "attivo" && w.price_cents > w.saved_cents);
  actionSheet({
    title: "Dove lo metti?",
    message: `Avanzo di ${lo.mese}: ${fmt(lo.cents)}`,
    actions: [
      { label: `${POOL_NAME} · lo assegni dopo`, onClick: () => go(poolItem()) },
      ...wishes.map((w) => ({ label: `${w.name} · mancano ${fmt(w.price_cents - w.saved_cents)}`, onClick: () => go(w) })),
    ],
  });
}
$("wish-left-put").addEventListener("click", chooseLeftoverTarget);
const skipLeftover = () => {
  leftoverDone(state.leftover?.key || monthKey(addMonths(firstOfMonth(new Date()), -1)));
  toast("Va bene: te lo ripropongo il mese prossimo");
};
$("wish-left-skip").addEventListener("click", skipLeftover);

// avviso nella Dashboard: porta ai Desideri e apre la scelta
async function renderLeftoverBanner() {
  const lo = await computeLeftover();
  $("left-banner").hidden = !lo;
  if (lo) $("left-banner-title").textContent = `Del budget di ${lo.mese} ti sono avanzati ${fmt(lo.cents)}`;
}
const goLeftover = () => { state.leftoverGo = true; location.hash = "#desideri"; };
$("left-banner-open").addEventListener("click", goLeftover);
$("left-banner-go").addEventListener("click", goLeftover);
$("left-banner-close").addEventListener("click", skipLeftover);

// =========================================================
// 0.4.5 — ANTICIPI
// Soldi pagati per altri: tabelle advances (l'anticipo) e advance_shares (chi deve quanto).
// Non sono movimenti; la "tua parte" e le quote perse diventano normali uscite.
// =========================================================
const ADV_LATE_DAYS = 30;
const advDate = (iso) => new Date(iso + "T12:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" });
let advPeople = []; // righe del pannello: { name, cents, manual }

function resetAdvFields() {
  $("adv-own").value = "";
  advPeople = [{ name: "", cents: 0, manual: false }];
  renderAdvPeople();
}

function renderAdvFields() {
  const adv = state.kind === "anticipo";
  $("adv-box").hidden = !adv;
  $("adv-amount-hint").hidden = !adv;
  $("adv-cat-hint").hidden = !adv;
  $("cat-title").textContent = adv ? "Categoria della tua parte" : "Categoria";
  $("f-desc").placeholder = adv ? "Es. Regalo Giulia" : "Facoltativa";
  if (adv) splitAdv();
}

// divide in parti uguali quello che resta dopo la tua parte tra le quote non scritte a mano
function splitAdv() {
  const total = parseAmount($("f-amount").value) || 0;
  const own = parseSigned($("adv-own").value || "0") || 0;
  const fixed = advPeople.filter((p) => p.manual).reduce((a, p) => a + p.cents, 0);
  const auto = advPeople.filter((p) => !p.manual);
  const rest = Math.max(0, total - own - fixed);
  auto.forEach((p, i) => { p.cents = Math.floor(rest / auto.length) + (i < rest % auto.length ? 1 : 0); });
  renderAdvPeople();
}

function renderAdvPeople() {
  const box = $("adv-people");
  box.replaceChildren(...advPeople.map((p, i) => {
    const row = el("div", "group-row adv-person");
    const name = el("input");
    name.placeholder = "Nome"; name.maxLength = 60; name.autocomplete = "off"; name.value = p.name;
    name.setAttribute("aria-label", `Nome della persona ${i + 1}`);
    name.addEventListener("input", () => { p.name = name.value; });
    const amt = el("input", "amt");
    amt.inputMode = "decimal"; amt.autocomplete = "off"; amt.placeholder = "0,00";
    amt.value = p.cents ? fmtPlain(p.cents) : "";
    amt.setAttribute("aria-label", `Quota della persona ${i + 1}`);
    amt.addEventListener("input", () => { p.cents = parseAmount(amt.value) || 0; p.manual = amt.value.trim() !== ""; updateAdvCheck(); });
    amt.addEventListener("blur", () => splitAdv());
    row.append(name, amt);
    if (advPeople.length > 1) {
      const x = el("button", "adv-x", "×");
      x.type = "button"; x.setAttribute("aria-label", "Togli questa persona");
      x.addEventListener("click", () => { advPeople.splice(i, 1); splitAdv(); });
      row.append(x);
    }
    return row;
  }));
  updateAdvCheck();
}

function updateAdvCheck() {
  const total = parseAmount($("f-amount").value) || 0;
  const own = parseSigned($("adv-own").value || "0") || 0;
  const shares = advPeople.reduce((a, p) => a + p.cents, 0);
  const ok = total > 0 && own + shares === total;
  $("adv-check").textContent = total ? `Quote ${fmt(shares)} + tua parte ${fmt(own)} = ${fmt(own + shares)}` +
    (ok ? " ✓" : ` · mancano ${fmt(total - own - shares)}`) : "";
  $("adv-check").classList.toggle("bad", !!total && !ok);
}

$("adv-add").addEventListener("click", () => {
  advPeople.push({ name: "", cents: 0, manual: false });
  splitAdv();
  $("adv-people").lastElementChild?.querySelector("input")?.focus();
});
$("adv-own").addEventListener("input", splitAdv);
$("f-amount").addEventListener("input", () => { if (state.kind === "anticipo") splitAdv(); });

async function saveAdvance() {
  const msg = $("sheet-msg");
  const total = parseAmount($("f-amount").value);
  const own = parseSigned($("adv-own").value || "0");
  const desc = $("f-desc").value.trim();
  const people = advPeople.map((p) => ({ ...p, name: p.name.trim() })).filter((p) => p.name || p.cents);
  if (total === null) { setMsg(msg, "Inserisci quanto hai pagato in tutto.", true); return $("f-amount").focus(); }
  if (!desc) { setMsg(msg, "Scrivi una descrizione, es. Regalo Giulia.", true); return $("f-desc").focus(); }
  if (own === null || own < 0 || own >= total) { setMsg(msg, "La tua parte deve essere minore del totale.", true); return; }
  if (!people.length) { setMsg(msg, "Aggiungi chi deve restituirti i soldi.", true); return; }
  if (people.some((p) => !p.name)) { setMsg(msg, "Scrivi il nome di ogni persona.", true); return; }
  if (people.some((p) => p.cents <= 0)) { setMsg(msg, "Ogni persona deve avere una quota.", true); return; }
  if (own + people.reduce((a, p) => a + p.cents, 0) !== total) { setMsg(msg, "Le quote più la tua parte devono fare il totale.", true); return; }
  if (!state.categoryId) { setMsg(msg, "Scegli una categoria.", true); return; }

  const save = $("sheet-save");
  save.disabled = true;
  const date = $("f-date").value || isoDate(new Date());
  const { data: adv, error } = await sb.from("advances").insert({
    date, description: desc, total_cents: total, own_cents: own, own_category_id: state.categoryId,
  }).select().single();
  if (error) { save.disabled = false; return setMsg(msg, "Errore nel salvataggio: " + traduciErrore(error.message), true); }
  const { error: e2 } = await sb.from("advance_shares").insert(people.map((p, i) => ({
    advance_id: adv.id, person: p.name, amount_cents: p.cents, sort_order: i, status: "aperta",
  })));
  if (!e2 && own > 0) {
    const { data: tx } = await sb.from("transactions").insert({
      kind: "uscita", amount_cents: own, category_id: state.categoryId, date, description: `${desc} (tua parte)`,
    }).select().single();
    if (tx) await sb.from("advances").update({ own_tx_id: tx.id }).eq("id", adv.id);
  }
  save.disabled = false;
  if (e2) {
    await sb.from("advances").delete().eq("id", adv.id);
    return setMsg(msg, "Errore nel salvataggio: " + traduciErrore(e2.message), true);
  }
  state.lastCategory.anticipo = state.categoryId;
  closeSheet();
  toast("Anticipo salvato");
  if (state.page === "anticipi") loadAdvances();
  else refreshAfterChange(date);
}

// quanto devi ancora ricevere e se c'è qualcosa in ritardo (per saldo e pallino)
async function loadAdvanceOpen() {
  const { data, error } = await sb.from("advance_shares").select("amount_cents, advance_id").eq("status", "aperta");
  if (error) { state.advOpenCents = 0; return; }
  state.advOpenCents = data.reduce((a, x) => a + x.amount_cents, 0);
  if (!data.length) return setAdvAlert(false);
  const limit = isoDate(new Date(Date.now() - ADV_LATE_DAYS * 864e5));
  const { data: late } = await sb.from("advances").select("id").in("id", [...new Set(data.map((x) => x.advance_id))]).lte("date", limit);
  setAdvAlert(!!late?.length);
}
function setAdvAlert(on) {
  state.advAlert = on;
  document.querySelector('#tab-pill .tab[data-page="anticipi"]')?.classList.toggle("alert", on);
  $("btn-more").classList.toggle("alert", on && moreSections().some((x) => x.id === "anticipi"));
}

async function loadAdvances() {
  const [a, s] = await Promise.all([
    sb.from("advances").select("*").order("date", { ascending: false }),
    sb.from("advance_shares").select("*").order("sort_order"),
  ]);
  if (a.error || s.error) {
    $("adv-open").replaceChildren(el("p", "secondary", "Gli anticipi non sono ancora disponibili: esegui lo script della 0.4.5 in Supabase."));
    return;
  }
  const shares = new Map();
  for (const x of s.data) (shares.get(x.advance_id) || shares.set(x.advance_id, []).get(x.advance_id)).push(x);
  const list = a.data.map((x) => ({ ...x, shares: shares.get(x.id) || [] }));
  const open = list.filter((x) => x.shares.some((q) => q.status === "aperta"));
  const closed = list.filter((x) => !open.includes(x));
  const openShares = open.flatMap((x) => x.shares.filter((q) => q.status === "aperta"));
  const cents = openShares.reduce((t, q) => t + q.amount_cents, 0);
  state.advOpenCents = cents;
  $("adv-total").textContent = fmt(cents);
  const people = new Set(openShares.map((q) => q.person.toLowerCase())).size;
  $("adv-count").textContent = open.length
    ? `da ${people} ${people === 1 ? "persona" : "persone"} · ${open.length} ${open.length === 1 ? "anticipo aperto" : "anticipi aperti"}`
    : "Nessun anticipo aperto";
  $("adv-sum").hidden = !list.length;
  $("adv-empty").hidden = open.length > 0;
  $("adv-open").replaceChildren(...open.map(advCard));
  const t = $("adv-closed-toggle");
  t.hidden = !closed.length;
  t.textContent = `Chiusi (${closed.length}) ${$("adv-closed").hidden ? "›" : "⌄"}`;
  $("adv-closed").replaceChildren(...closed.map(advCard));
  const limit = isoDate(new Date(Date.now() - ADV_LATE_DAYS * 864e5));
  setAdvAlert(open.some((x) => x.date <= limit));
}
$("adv-closed-toggle").addEventListener("click", () => {
  $("adv-closed").hidden = !$("adv-closed").hidden;
  $("adv-closed-toggle").textContent = $("adv-closed-toggle").textContent.replace(/[›⌄]$/, $("adv-closed").hidden ? "›" : "⌄");
});

const STATUS_TXT = { conto: "restituiti sul conto", contanti: "restituiti in contanti", persa: "diventati una spesa" };
function advCard(x) {
  const card = el("section", "card adv-card");
  const head = el("div", "adv-head");
  head.append(el("h2", null, x.description));
  const days = Math.floor((Date.now() - new Date(x.date + "T12:00:00").getTime()) / 864e5);
  const isOpen = x.shares.some((q) => q.status === "aperta");
  if (isOpen && days >= ADV_LATE_DAYS) head.append(el("span", "adv-late", `da ${days} giorni`));
  else head.append(el("span", "secondary small", advDate(x.date)));
  const cat = catById(x.own_category_id);
  const sub = el("p", "secondary small adv-sub",
    `${isOpen && days >= ADV_LATE_DAYS ? advDate(x.date) + " · " : ""}pagato ${fmt(x.total_cents)} · ` +
    (x.own_cents ? `tua parte ${fmt(x.own_cents)}${cat ? ` (${cat.name})` : ""}` : "nessuna tua parte"));
  card.append(head, sub);
  for (const q of x.shares) {
    const row = el("div", "adv-row");
    const av = el("span", "adv-av", (q.person.trim()[0] || "?").toUpperCase());
    const who = el("span", "adv-who");
    who.append(el("span", null, q.person), el("span", "secondary small", fmt(q.amount_cents)));
    row.append(av, who);
    if (q.status === "aperta") {
      const b = el("button", "adv-btn", "Restituito");
      b.type = "button";
      b.addEventListener("click", () => advShareMenu(x, q));
      row.append(b);
    } else {
      row.classList.add("done", q.status);
      row.append(el("span", "adv-state", `${advDate(q.closed_on)}, ${STATUS_TXT[q.status]}`));
    }
    card.append(row);
  }
  card.addEventListener("contextmenu", (e) => { e.preventDefault(); advDeleteMenu(x); });
  head.addEventListener("click", () => advDeleteMenu(x));
  return card;
}

function advShareMenu(x, q) {
  actionSheet({
    title: `${q.person} · ${fmt(q.amount_cents)}`,
    message: x.description,
    actions: [
      { label: "Restituito sul conto", onClick: () => closeShare(x, q, "conto") },
      { label: "Restituito in contanti", onClick: () => closeShare(x, q, "contanti") },
      { label: "Non me li restituisce", danger: true, onClick: () => closeShare(x, q, "persa") },
    ],
  });
}

async function closeShare(x, q, status) {
  const today = isoDate(new Date());
  const patch = { status, closed_on: today };
  if (status === "persa") {
    const cat = catById(x.own_category_id) || chipCategories("uscita")[0];
    const { data: tx, error } = await sb.from("transactions").insert({
      kind: "uscita", amount_cents: q.amount_cents, category_id: cat?.id, date: today,
      description: `${x.description} · quota di ${q.person}`,
    }).select().single();
    if (error) return toast("Errore: " + traduciErrore(error.message));
    patch.lost_tx_id = tx.id;
  }
  const { error } = await sb.from("advance_shares").update(patch).eq("id", q.id);
  if (error) return toast("Errore: " + traduciErrore(error.message));
  toast(status === "persa" ? `Quota di ${q.person} segnata come spesa` : `Quota di ${q.person} restituita`);
  loadAdvances();
}

function advDeleteMenu(x) {
  actionSheet({
    title: x.description,
    message: "Eliminando l'anticipo si eliminano anche le quote. La tua parte resta tra i movimenti.",
    actions: [{ label: "Elimina anticipo", danger: true, onClick: async () => {
      const { error } = await sb.from("advances").delete().eq("id", x.id);
      if (error) return toast("Errore: " + traduciErrore(error.message));
      toast("Anticipo eliminato");
      loadAdvances();
    } }],
  });
}

$("sheet").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (state.kind === "anticipo") return saveAdvance();
  if (state.editingRec) return saveRecFromSheet(); // 0.6.0: modifica di un periodico
  const repeat = !state.editing && !$("rep-row").hidden ? $("f-repeat").value : "";
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
  if (repeat) return saveNewRec(row, repeat); // 0.6.0: nuovo movimento periodico
  const save = $("sheet-save");
  save.disabled = true;
  const wasEdit = !!state.editing;
  const old = state.editing ? { ...state.editing } : null;
  const { data: saved, error } = wasEdit
    ? await sb.from("transactions").update(row).eq("id", state.editing.id).select().maybeSingle()
    : await sb.from("transactions").insert(row).select().maybeSingle();
  if (!error && state.wishBuying) state.wishBuying.txId = saved?.id || null;
  save.disabled = false;
  if (error) { setMsg(msg, "Errore nel salvataggio: " + traduciErrore(error.message), true); return; }

  state.lastCategory[row.kind] = row.category_id;
  const buying = state.wishBuying; // 0.5.0: acquisto di un desiderio
  closeSheet();
  if (buying && !wasEdit) await closeWish(buying, "comprato", row.date);
  toast(buying && !wasEdit ? `${buying.name}: comprato` : wasEdit ? "Movimento aggiornato" : "Movimento salvato");
  refreshAfterChange(row.date);
  // 0.3.3: avviso se questa spesa avvicina o supera il budget della categoria
  budgetAlert(row, old).then((text) => { if (text) toast(text); });
  // 0.2.2: dopo lo stipendio, se quel mese non ha un budget, lo chiede
  if (!wasEdit && row.kind === "entrata" && /stipendio/i.test(catById(row.category_id)?.name || "")) {
    askBudgetAfterSalary(row);
  }
});

// IMPR-003 (0.5.1): Duplica — il pannello diventa un movimento nuovo già compilato, con la data di oggi
$("sheet-dup").addEventListener("click", () => {
  const tx = state.editing;
  if (!tx) return;
  openSheet(null);
  state.dupOf = tx.id;
  state.categoryId = tx.category_id;
  setKind(tx.kind);
  $("f-amount").value = fmtPlain(tx.amount_cents);
  $("f-desc").value = tx.description || "";
  $("f-date").value = isoDate(new Date());
  $("sheet-title").textContent = "Duplica movimento";
  $("freq-box").hidden = true;
  $("kind-anticipo").hidden = true;
  setMsg($("sheet-msg"), "È una copia con la data di oggi: controlla e salva.");
});

$("sheet-delete").addEventListener("click", async () => {
  if (state.editingRec) return deleteRec(state.editingRec); // 0.6.0
  const tx = state.editing;
  if (!tx) return;
  closeSheet();
  if (state.page === "mesi") await deleteTransactions([tx]);
});

// dopo un salvataggio aggiorna la pagina aperta (in "Mesi" si sposta sul mese del movimento)
function refreshAfterChange(dateStr) {
  state.prevIds = new Set(state.transactions.map((t) => t.id));
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
  anticipi: '<svg viewBox="0 0 24 24" class="stroke"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/></svg>',
  desideri: '<svg viewBox="0 0 24 24" class="stroke"><rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3.5-6-3.5-5-.5.5 1.2 2.5.5 5 .5zM12 8c1.5-3.5 6-3.5 5-.5-.5 1.2-2.5.5-5 .5z"/></svg>',
};
const SECTIONS = {
  dashboard:   { name: "Dashboard",   color: "#007aff" },
  mesi:        { name: "Mesi",        color: "#34c759" },
  abbonamenti: { name: "Abbonamenti", color: "#ff2d55", placeholder: true },
  auto:        { name: "Auto",        color: "#ff9500", placeholder: true },
  anticipi:    { name: "Anticipi",    color: "#af52de" },
  desideri:    { name: "Desideri",    color: "#30b0c7" },
};
const DEFAULT_SECTIONS = [
  { id: "dashboard", on: true }, { id: "mesi", on: true },
  { id: "abbonamenti", on: false }, { id: "auto", on: false },
  { id: "anticipi", on: false }, { id: "desideri", on: false },
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
  // 0.4.4: nessun limite alle sezioni attive; oltre le prime 4 vanno in "Altre sezioni"
  if (!out.some((s) => s.on)) out[0].on = true;
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
  pill.replaceChildren(el("span", "lens no-anim"));
  const on = state.sections.filter((s) => s.on).slice(0, MAX_TABS);
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
  requestAnimationFrame(() => moveLens(false));
  renderMoreButton();
}

// =========================================================
// 0.4.4 — ALTRE SEZIONI: le sezioni attive oltre le prime 4 si aprono
// dal pulsante accanto all'ingranaggio, senza spostare la barra
// =========================================================
const moreSections = () => state.sections.filter((s) => s.on).slice(MAX_TABS);
function renderMoreButton() {
  const extra = moreSections();
  $("btn-more").hidden = extra.length === 0;
  $("btn-more").classList.toggle("active", extra.some((s) => s.id === state.page));
  if (state.advAlert) setAdvAlert(true); // 0.4.5: il pallino resta dopo aver ridisegnato la barra
}
function openMore() {
  const list = $("more-list");
  list.replaceChildren(...moreSections().map((s) => {
    const info = SECTIONS[s.id];
    const b = el("button", "opt more-opt" + (s.id === state.page ? " on" : ""));
    b.type = "button";
    const ico = el("span", "ico");
    ico.style.setProperty("--c", info.color);
    ico.innerHTML = ICONS[s.id];
    b.append(ico, el("span", "label", info.name));
    if (s.id === state.page) b.append(el("span", "here", "Aperta"));
    else b.append(el("span", "chev", "\u203a"));
    b.addEventListener("click", () => { closeMore(); location.hash = s.id; });
    return b;
  }));
  $("more-sheet").classList.add("open");
  $("more-sheet").setAttribute("aria-hidden", "false");
  $("more-backdrop").classList.add("open");
}
function closeMore() {
  $("more-sheet").classList.remove("open");
  $("more-sheet").setAttribute("aria-hidden", "true");
  $("more-backdrop").classList.remove("open");
}
$("btn-more").addEventListener("click", openMore);
$("more-cancel").addEventListener("click", closeMore);
$("more-backdrop").addEventListener("click", closeMore);

// porta la "lente" di vetro sotto la sezione attiva (0.3.1)
function moveLens(animate = true) {
  const pill = $("tab-pill"), lens = pill?.querySelector(".lens");
  if (!lens) return;
  const t = pill.querySelector(".tab.active");
  lens.classList.toggle("no-anim", !animate);
  lens.style.opacity = t ? "1" : "0";
  if (!t) return;
  lens.style.width = t.offsetWidth + "px";
  lens.style.transform = `translateX(${t.offsetLeft}px)`;
  if (!animate) requestAnimationFrame(() => lens.classList.remove("no-anim"));
}
window.addEventListener("resize", () => moveLens(false));

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
  $("set-opening").textContent = openingLabel();
  $("set-backup").textContent = lastBackupText();
  renderFreqReset();
  renderLock();
  renderPeriodicCount();
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
    const sub = el("small");
    sub.append(el("span", "where"));
    if (info.placeholder) sub.append(" · in arrivo");
    label.append(sub);

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
      markSectionPlaces();
    });

    li.append(ico, label, sw, handle);
    ul.append(li);
  }
  markSectionPlaces();
}

function toggleSection(id, input) {
  const s = state.sections.find((x) => x.id === id);
  const active = state.sections.filter((x) => x.on).length;
  if (!input.checked && active <= 1) {
    input.checked = true;
    return toast("Serve almeno una sezione nella barra");
  }
  s.on = input.checked;
  renderTabbar();
  saveSections();
  markSectionPlaces();
}

// 0.4.4: sotto ogni sezione attiva, dove si trova (barra o Altre sezioni)
function markSectionPlaces() {
  let n = 0;
  for (const li of $("sections-list").children) {
    const s = state.sections.find((x) => x.id === li.dataset.id);
    const where = li.querySelector(".where");
    if (!where) continue;
    where.textContent = !s?.on ? "Disattivata" : ++n <= MAX_TABS ? "Nella barra" : "In Altre sezioni";
    where.classList.toggle("extra", !!s?.on && n > MAX_TABS);
  }
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
//  BUDGET PER CATEGORIA (0.3.3)
//  Un limite mensile per ogni categoria di spesa (colonna categories.budget_cents), uguale per tutti i mesi.
// =========================================================
function renderCatBudLink() {
  const cats = state.categories.filter((c) => c.kind === "uscita" && !c.archived);
  const n = cats.filter((c) => c.budget_cents > 0).length;
  $("catbud-count").textContent = n ? `${n} di ${cats.length} ›` : "Imposta ›";
}

$("catbud-link").addEventListener("click", openCatBudSheet);
$("catbud-cancel").addEventListener("click", closeCatBudSheet);
$("catbud-backdrop").addEventListener("click", closeCatBudSheet);

function openCatBudSheet() {
  const spent = new Map();
  for (const t of state.transactions) if (t.kind === "uscita") spent.set(t.category_id, (spent.get(t.category_id) || 0) + t.amount_cents);
  const mese = meseNome(state.month);
  const list = $("catbud-list");
  list.replaceChildren(...state.categories.filter((c) => c.kind === "uscita" && !c.archived).map((c) => {
    const row = el("label", "catbud-row");
    const txt = el("span", "nm");
    txt.append(el("span", null, c.name), el("small", null, `Spesi a ${mese}: ${fmt(spent.get(c.id) || 0)}`));
    const inp = el("input");
    inp.dataset.id = c.id;
    inp.inputMode = "decimal";
    inp.autocomplete = "off";
    inp.placeholder = "Nessuno";
    inp.setAttribute("aria-label", `Budget mensile per ${c.name}`);
    inp.value = c.budget_cents > 0 ? fmtPlain(c.budget_cents) : "";
    const eur = el("span", "eur", "€");
    const sync = () => row.classList.toggle("has-value", inp.value.trim() !== "");
    inp.addEventListener("input", () => { sync(); setMsg($("catbud-msg"), ""); updateCatBudSum(); });
    inp.addEventListener("blur", () => { const v = parseAmount(inp.value); if (v) inp.value = fmtPlain(v); });
    row.append(catIcon(c), txt, inp, eur);
    sync();
    return row;
  }));
  setMsg($("catbud-msg"), "");
  updateCatBudSum();
  $("catbud-sheet").scrollTop = 0;
  $("catbud-sheet").classList.add("open");
  $("catbud-sheet").setAttribute("aria-hidden", "false");
  $("catbud-backdrop").classList.add("open");
}

function closeCatBudSheet() {
  $("catbud-sheet").classList.remove("open");
  $("catbud-sheet").setAttribute("aria-hidden", "true");
  $("catbud-backdrop").classList.remove("open");
  if ($("catbud-sheet").contains(document.activeElement)) document.activeElement.blur();
}

// importo senza simbolo, es. 1.500,00 (per i campi da modificare)
function fmtPlain(cents) {
  return (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function updateCatBudSum() {
  let sum = 0;
  for (const inp of $("catbud-list").querySelectorAll("input")) sum += parseAmount(inp.value) || 0;
  const monthBud = state.budgetMonth ?? defaultBudget();
  let t = sum ? `Totale per categoria: ${fmt(sum)}` : "Nessun budget per categoria";
  if (sum && monthBud) t += ` · budget del mese: ${fmt(monthBud)}` + (sum > monthBud ? " (la somma lo supera)" : "");
  $("catbud-sum").textContent = t + ". Valgono tutti i mesi.";
}

$("catbud-sheet").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const msg = $("catbud-msg");
  const changes = [];
  for (const inp of $("catbud-list").querySelectorAll("input")) {
    const raw = inp.value.trim();
    const v = raw ? parseAmount(raw) : null;
    if (raw && v === null) { setMsg(msg, "Controlla gli importi, es. 150 o 80,50.", true); inp.focus(); return; }
    const c = catById(inp.dataset.id);
    const next = v > 0 ? v : null;
    if ((c.budget_cents || null) !== next) changes.push({ c, next });
  }
  if (!changes.length) return closeCatBudSheet();
  const btn = $("catbud-save");
  btn.disabled = true;
  const results = await Promise.all(changes.map(({ c, next }) =>
    sb.from("categories").update({ budget_cents: next }).eq("id", c.id)));
  btn.disabled = false;
  const err = results.find((r) => r.error)?.error;
  if (err) {
    setMsg(msg, /budget_cents|schema cache|PGRST204|42703/i.test(`${err.message} ${err.code}`)
      ? "Esegui prima lo script 0.3.3 in Supabase." : "Errore: " + traduciErrore(err.message), true);
    return;
  }
  for (const { c, next } of changes) c.budget_cents = next;
  closeCatBudSheet();
  toast("Budget per categoria salvati");
  renderDonut();
});

// dopo aver salvato una spesa: testo dell'avviso se la categoria passa l'80% o il limite (altrimenti null)
async function budgetAlert(row, old) {
  const cat = catById(row.category_id);
  if (row.kind !== "uscita" || !(cat?.budget_cents > 0)) return null;
  const bud = cat.budget_cents;
  const [y, m] = row.date.split("-").map(Number);
  const from = isoDate(new Date(y, m - 1, 1)), to = isoDate(new Date(y, m, 1));
  const { data, error } = await sb.from("transactions").select("amount_cents")
    .eq("category_id", cat.id).eq("kind", "uscita").gte("date", from).lt("date", to);
  if (error || !data) return null;
  const after = data.reduce((a, t) => a + t.amount_cents, 0);
  // quanto c'era prima di questo salvataggio
  const sameBefore = old && old.kind === "uscita" && old.category_id === cat.id && old.date.slice(0, 7) === row.date.slice(0, 7);
  const before = after - row.amount_cents + (sameBefore ? old.amount_cents : 0);
  if (after > bud && before <= bud) return `${cat.name}: budget superato di ${fmt(after - bud)}`;
  if (after === bud && before < bud) return `${cat.name}: budget esaurito`;
  if (after >= bud * 0.8 && after < bud && before < bud * 0.8) {
    return `${cat.name}: ${Math.floor((after / bud) * 100)}% del budget usato · restano ${fmt(bud - after)}`;
  }
  return null;
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

// =========================================================
//  NOVITÀ (0.2.3): note di rilascio
// =========================================================
const LS_SEEN = "flunora.seenVersion";

function releaseBlock(r, isCurrent) {
  const sec = el("section", "release");
  const head = el("div", "release-head");
  const h = el("h3", null, r.version);
  if (isCurrent) h.append(el("span", "now", "attuale"));
  head.append(h, el("span", null, r.date));
  const ul = el("ul", "card release-items");
  ul.append(...r.items.map((t) => el("li", null, t)));
  sec.append(head, ul);
  return sec;
}

function openReleases(fromWhatsNew = false) {
  $("releases-back").innerHTML = fromWhatsNew ? "&lsaquo; Indietro" : "&lsaquo; Impostazioni";
  $("releases-list").replaceChildren(...RELEASES.map((r, i) => releaseBlock(r, i === 0)));
  $("releases").scrollTop = 0;
  $("releases").classList.add("open");
  $("releases").setAttribute("aria-hidden", "false");
}
function closeReleases() {
  $("releases").classList.remove("open");
  $("releases").setAttribute("aria-hidden", "true");
}
$("open-whatsnew").addEventListener("click", () => openReleases(false));
$("releases-back").addEventListener("click", closeReleases);

// Al primo avvio e dopo ogni aggiornamento: le novità non ancora viste
function maybeShowWhatsNew() {
  const seen = lsGet(LS_SEEN);
  if (seen === APP_VERSION) return;
  const seenIdx = RELEASES.findIndex((r) => r.version === seen);
  // versioni più recenti di quella vista (al primo avvio solo l'attuale)
  const fresh = seen && seenIdx > 0 ? RELEASES.slice(0, seenIdx) : RELEASES.slice(0, 1);
  const first = !seen;

  $("whatsnew-title").textContent = first ? "Benvenuto in Flunora" : "Novità di Flunora";
  $("whatsnew-sub").textContent = fresh.length > 1
    ? `Ecco cosa è cambiato dalla versione ${seen}`
    : `Versione ${fresh[0].version} · ${fresh[0].date}`;
  const list = $("whatsnew-list");
  list.replaceChildren();
  for (const r of fresh) {
    if (fresh.length > 1) {
      const li = el("li", "ver-sep", `Versione ${r.version}`);
      list.append(li);
    }
    list.append(...r.items.map((t) => el("li", null, t)));
  }
  $("whatsnew").scrollTop = 0;
  $("whatsnew").classList.add("open");
  $("whatsnew").setAttribute("aria-hidden", "false");
  $("whatsnew-backdrop").classList.add("open");
}

function closeWhatsNew() {
  lsSet(LS_SEEN, APP_VERSION);
  $("whatsnew").classList.remove("open");
  $("whatsnew").setAttribute("aria-hidden", "true");
  $("whatsnew-backdrop").classList.remove("open");
}
$("whatsnew-ok").addEventListener("click", closeWhatsNew);
$("whatsnew-backdrop").addEventListener("click", closeWhatsNew);
$("whatsnew-all").addEventListener("click", () => { closeWhatsNew(); openReleases(true); });

// =========================================================
//  SALDO TOTALE (0.2.4)
//  saldo iniziale (a fine giornata della data scelta)
//  + entrate − uscite − investiti dei movimenti dal giorno dopo fino a oggi.
//  Il saldo iniziale sta nelle impostazioni sincronizzate: { cents, date }.
// =========================================================
const opening = () => {
  const o = state.settingsData?.opening;
  return o && Number.isFinite(o.cents) && /^\d{4}-\d{2}-\d{2}$/.test(o.date || "") ? o : null;
};

// come parseAmount ma accetta anche 0 e importi negativi ("-120", "−120")
function parseSigned(text) {
  const t = String(text).trim();
  const neg = /^[-−]/.test(t);
  const body = t.replace(/^[-−]\s*/, "");
  if (/^0+([.,]0*)?$/.test(body.replace(/\s|€/g, ""))) return 0;
  const v = parseAmount(body);
  return v === null ? null : neg ? -v : v;
}

const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return isoDate(new Date(y, m - 1, d + n)); };
const delta = (e, u, i) => Number(e) - Number(u) - Number(i);

// somma (entrate − uscite − investiti) dei movimenti tra due date incluse
async function sumBetween(from, to) {
  if (from > to) return 0;
  const { data, error } = await sb.from("transactions").select("kind, amount_cents").gte("date", from).lte("date", to);
  if (error) throw error;
  return data.reduce((a, t) => a + (t.kind === "entrata" ? t.amount_cents : -t.amount_cents), 0);
}

async function computeBalance(o) {
  const today = isoDate(new Date());
  const from = addDays(o.date, 1);
  if (from > today) return o.cents;
  const fromMonth = from.slice(0, 7) + "-01", todayMonth = today.slice(0, 7) + "-01";
  if (fromMonth === todayMonth) return o.cents + await sumBetween(from, today);
  // mese di partenza e mese corrente dai movimenti; i mesi interi in mezzo dai totali mensili
  const endFirst = isoDate(new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0));
  const [first, current, mid] = await Promise.all([
    sumBetween(from, endFirst),
    sumBetween(todayMonth, today),
    sb.from("monthly_totals").select("month, entrate_cents, uscite_cents, investimenti_cents")
      .gt("month", fromMonth).lt("month", todayMonth),
  ]);
  if (mid.error) throw mid.error;
  const middle = mid.data.reduce((a, r) => a + delta(r.entrate_cents, r.uscite_cents, r.investimenti_cents), 0);
  return o.cents + first + middle + current + await advanceDelta(o.date, today);
}

// 0.4.5: effetto degli anticipi sul saldo dopo la data del saldo iniziale.
// Pagare un anticipo toglie la parte degli altri (la propria è già un movimento);
// una quota restituita sul conto o diventata spesa la rimette (la spesa la toglie di nuovo come movimento).
async function advanceDelta(after, today) {
  const [adv, sh] = await Promise.all([
    sb.from("advances").select("total_cents, own_cents, date").gt("date", after).lte("date", today),
    sb.from("advance_shares").select("amount_cents, status, closed_on").in("status", ["conto", "persa"]).gt("closed_on", after),
  ]);
  if (adv.error || sh.error) return 0; // tabelle non ancora create: saldo come prima
  const out = adv.data.reduce((a, x) => a + x.total_cents - x.own_cents, 0);
  const back = sh.data.filter((x) => x.closed_on <= today).reduce((a, x) => a + x.amount_cents, 0);
  return back - out;
}

async function loadBalance() {
  const card = $("saldo-card");
  const o = opening();
  card.classList.toggle("empty", !o);
  if (!o) {
    card.innerHTML = `<span class="ic"><svg viewBox="0 0 24 24"><path d="M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></svg></span>
      <h2>Quanto hai in tutto?</h2>
      <span class="secondary">Indica quanto avevi in una certa data: da lì Flunora calcola il tuo saldo totale con i movimenti.</span>
      <span class="cta">Imposta il saldo iniziale</span>`;
    card.setAttribute("aria-label", "Imposta il saldo iniziale");
    $("saldo-eye").hidden = true;
    return;
  }
  $("saldo-eye").hidden = false;
  updateEye();
  if (!card.querySelector(".big")) {
    card.replaceChildren(el("span", "lbl", "Saldo totale"), el("span", "big", "–"), el("span", "when", ""));
  }
  try {
    const [cents] = await Promise.all([computeBalance(o), loadAdvanceOpen(), loadWishSaved()]);
    if (!opening()) return;
    state.balance = cents;
    showBalance(false);
  } catch (err) {
    state.balance = null;
    card.querySelector(".big").textContent = "–";
    card.querySelector(".when").textContent = "Saldo non disponibile: " + traduciErrore(err.message || "");
  }
}

// ---------- 0.3.2: saldo nascosto (scelta salvata su questo dispositivo) ----------
const SALDO_MASK = "****** €";
const saldoHidden = () => { try { return localStorage.getItem("flunora.hideSaldo") === "1"; } catch { return false; } };
const EYE = '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.1 3.9M6.2 6.6C3.9 8.2 2.5 12 2.5 12s3.5 7 9.5 7a9.6 9.6 0 0 0 4.2-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

function updateEye() {
  const eye = $("saldo-eye"), hidden = saldoHidden();
  eye.innerHTML = hidden ? EYE_OFF : EYE;
  eye.setAttribute("aria-label", hidden ? "Mostra il saldo totale" : "Nascondi il saldo totale");
  eye.setAttribute("aria-pressed", String(hidden));
}

// scrive il saldo nella carta: nascosto con gli asterischi, oppure l'importo (che scorre se `fromZero`)
function showBalance(fromZero) {
  const card = $("saldo-card"), big = card.querySelector(".big"), cents = state.balance;
  if (!big || cents == null) return;
  const oggi = new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long" });
  updateEye();
  if (saldoHidden()) {
    cancelAnimationFrame(big._raf);
    big._value = 0;                                  // al prossimo "mostra" l'importo scorre da zero
    big.textContent = SALDO_MASK;
    card.querySelector(".lbl").textContent = wishesOn() && state.wishSavedCents ? "Disponibile" : "Saldo totale";
    big.classList.remove("neg");                     // nemmeno il rosso deve far capire se è negativo
    big.classList.add("masked");
    card.querySelector(".when").textContent = `Oggi, ${oggi}`;
    card.setAttribute("aria-label", "Saldo totale nascosto. Tocca per cambiare il saldo iniziale");
    return;
  }
  big.classList.remove("masked");
  if (fromZero) big._value = 0;
  // 0.5.0 (bozza A): con la sezione Desideri attiva e soldi messi da parte, il numero grande è il disponibile
  const wishes = wishesOn() ? state.wishSavedCents || 0 : 0;
  const shown = cents - wishes;
  card.querySelector(".lbl").textContent = wishes ? "Disponibile" : "Saldo totale";
  countTo(big, shown, (v) => (v < 0 ? "− " : "") + fmt(Math.abs(v)));
  big.classList.toggle("neg", shown < 0);
  const extra = state.advOpenCents > 0 ? ` · da ricevere ${fmt(state.advOpenCents)}` : "";
  card.querySelector(".when").textContent = wishes
    ? `Desideri ${fmt(wishes)} · Conto ${(cents < 0 ? "− " : "") + fmt(Math.abs(cents))}${extra}`
    : (cents < 0 ? `In negativo oggi, ${oggi}` : `Disponibili oggi, ${oggi}`) + extra;
  card.setAttribute("aria-label", `Saldo totale ${(cents < 0 ? "− " : "") + fmt(Math.abs(cents))}. Tocca per cambiare il saldo iniziale`);
}

$("saldo-eye").addEventListener("click", () => {
  try { localStorage.setItem("flunora.hideSaldo", saldoHidden() ? "0" : "1"); } catch {}
  showBalance(true);
});

function openingLabel() {
  const o = opening();
  if (!o) return "Non impostato";
  const [y, m, d] = o.date.split("-").map(Number);
  return `${(o.cents < 0 ? "− " : "") + fmt(Math.abs(o.cents))} · ${new Date(y, m - 1, d).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}`;
}

$("saldo-card").addEventListener("click", openOpeningSheet);
$("open-opening").addEventListener("click", openOpeningSheet);
$("opening-cancel").addEventListener("click", closeOpeningSheet);
$("opening-backdrop").addEventListener("click", closeOpeningSheet);

function openOpeningSheet() {
  const o = opening();
  $("opening-amount").value = o ? (o.cents < 0 ? "−" : "") + (Math.abs(o.cents) / 100).toFixed(2).replace(".", ",") : "";
  $("opening-date").value = o?.date || isoDate(new Date());
  $("opening-actions").hidden = !o;
  setMsg($("opening-msg"), "");
  $("opening-sheet").scrollTop = 0;
  $("opening-sheet").classList.add("open");
  $("opening-sheet").setAttribute("aria-hidden", "false");
  $("opening-backdrop").classList.add("open");
}
function closeOpeningSheet() {
  $("opening-sheet").classList.remove("open");
  $("opening-sheet").setAttribute("aria-hidden", "true");
  $("opening-backdrop").classList.remove("open");
  if ($("opening-sheet").contains(document.activeElement)) document.activeElement.blur();
}

async function afterOpeningChange(text) {
  closeOpeningSheet();
  toast(text);
  $("set-opening").textContent = openingLabel();
  if (state.page === "dashboard") loadBalance();
}

$("opening-sheet").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const cents = parseSigned($("opening-amount").value);
  const date = $("opening-date").value;
  if (cents === null) { setMsg($("opening-msg"), "Inserisci un importo valido, es. 3.200 oppure 0.", true); $("opening-amount").focus(); return; }
  if (!date) { setMsg($("opening-msg"), "Scegli una data.", true); return; }
  state.settingsData.opening = { cents, date };
  const ok = await saveSettingsData("Saldo iniziale salvato solo su questo dispositivo");
  await afterOpeningChange(ok ? "Saldo iniziale salvato" : "Saldo iniziale salvato su questo dispositivo");
});

$("opening-remove").addEventListener("click", () => {
  actionSheet({
    title: "Rimuovere il saldo iniziale?",
    message: "Il saldo totale non verrà più mostrato finché non ne imposti uno nuovo.",
    actions: [{ label: "Rimuovi saldo iniziale", danger: true, onClick: async () => {
      delete state.settingsData.opening;
      await saveSettingsData();
      await afterOpeningChange("Saldo iniziale rimosso");
    } }],
  });
});

// =========================================================
//  BACKUP E RIPRISTINO (0.3.0)
// =========================================================
const BACKUP_FORMAT = 1;
const KINDS = ["entrata", "uscita", "investimento"];
const DEFAULT_REMINDER_DAYS = 30;
const LS_SNOOZE = "flunora.backupSnooze";

// legge tutte le righe di una tabella, a pagine da 1000 (limite di Supabase)
async function fetchAll(table, orderCol = "id") {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select("*").order(orderCol, { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
// come fetchAll, ma se la tabella non c'è ancora (script non eseguito) restituisce []
async function fetchAllOptional(table, orderCol) {
  try { return await fetchAll(table, orderCol); } catch { return []; }
}
const stripUser = (rows) => rows.map(({ user_id, ...r }) => r);

async function buildBackup() {
  const [categories, transactions, budgets, recurring, importRules, advances, advShares, wishes] = await Promise.all([
    fetchAll("categories"), fetchAll("transactions"),
    fetchAllOptional("budgets", "month"), fetchAllOptional("recurring"),
    fetchAllOptional("import_rules", "pattern"),
    fetchAllOptional("advances"), fetchAllOptional("advance_shares"), // 0.4.5
    fetchAllOptional("wishes"), // 0.5.0
  ]);
  const { sections, budget_cents, opening, backup_reminder_days } = state.settingsData || {};
  return {
    app: "flunora",
    format: BACKUP_FORMAT,
    app_version: APP_VERSION,
    created_at: new Date().toISOString(),
    data: {
      categories: stripUser(categories),
      transactions: stripUser(transactions),
      budgets: budgets.map((b) => ({ month: b.month, amount_cents: b.amount_cents })),
      recurring: stripUser(recurring),
      import_rules: importRules.map((r) => ({ pattern: r.pattern, category_id: r.category_id })),
      // 0.4.5: anticipi con le loro quote (i collegamenti ai movimenti non servono al ripristino)
      advances: advances.map((a) => ({
        date: a.date, description: a.description, total_cents: a.total_cents, own_cents: a.own_cents,
        own_category_id: a.own_category_id,
        shares: advShares.filter((q) => q.advance_id === a.id).sort((x, y) => x.sort_order - y.sort_order)
          .map((q) => ({ person: q.person, amount_cents: q.amount_cents, status: q.status, closed_on: q.closed_on })),
      })),
      // 0.5.0: desideri (il collegamento alla spesa d'acquisto non serve al ripristino)
      wishes: wishes.map((w) => ({
        name: w.name, price_cents: w.price_cents, saved_cents: w.saved_cents, due_date: w.due_date, link: w.link,
        note: w.note, sort_order: w.sort_order, status: w.status, closed_on: w.closed_on,
      })),
      settings: { sections: sections || state.sections, budget_cents, opening, backup_reminder_days, wish_pool_cents: state.settingsData.wish_pool_cents || 0 },
    },
  };
}

// ---------- controllo del file ----------
function validateBackup(obj) {
  const fail = (m) => ({ ok: false, error: m });
  if (!obj || typeof obj !== "object" || obj.app !== "flunora") return fail("Questo file non è un backup di Flunora.");
  if (!Number.isInteger(obj.format) || obj.format < 1) return fail("Il file di backup è danneggiato.");
  if (obj.format > BACKUP_FORMAT) return fail("Questo backup è stato creato con una versione più recente di Flunora: aggiorna l'app e riprova.");
  const d = obj.data;
  if (!d || !Array.isArray(d.categories) || !Array.isArray(d.transactions)) return fail("Il file di backup è danneggiato.");
  const ids = new Set();
  for (const c of d.categories) {
    if (!c || typeof c.id !== "string" || typeof c.name !== "string" || !c.name.trim() || !KINDS.includes(c.kind)) {
      return fail("Il backup contiene una categoria non valida.");
    }
    ids.add(c.id);
  }
  let from = null, to = null;
  for (const t of d.transactions) {
    if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !Number.isInteger(t.amount_cents) || t.amount_cents <= 0
        || !KINDS.includes(t.kind) || !ids.has(t.category_id)) {
      return fail("Il backup contiene un movimento non valido.");
    }
    if (!from || t.date < from) from = t.date;
    if (!to || t.date > to) to = t.date;
  }
  if (d.budgets && !Array.isArray(d.budgets)) return fail("Il file di backup è danneggiato.");
  return {
    ok: true,
    summary: { created_at: obj.created_at, version: obj.app_version, tx: d.transactions.length, cat: d.categories.length, from, to },
  };
}

// ---------- condividere o scaricare un file ----------
async function deliverFile(name, type, content) {
  const blob = new Blob([content], { type });
  const file = new File([blob], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; }
    catch (e) { if (e?.name === "AbortError") return false; /* altrimenti prova a scaricare */ }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

// ---------- copie sul dispositivo (IndexedDB) ----------
const idbOpen = () => new Promise((resolve, reject) => {
  const req = indexedDB.open("flunora", 1);
  req.onupgradeneeded = () => req.result.createObjectStore("copies", { keyPath: "id", autoIncrement: true });
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
async function idbRun(mode, fn) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("copies", mode);
    const result = fn(tx.objectStore("copies"));
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error);
  });
}
async function listCopies() {
  try {
    const all = await idbRun("readonly", (st) => st.getAll());
    return (all || []).filter((c) => c.user_id === state.user.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  } catch { return []; }
}
async function saveCopy(reason) {
  const backup = await buildBackup();
  await idbRun("readwrite", (st) => st.add({
    user_id: state.user.id, created_at: backup.created_at, reason,
    tx: backup.data.transactions.length, json: JSON.stringify(backup),
  }));
  // tiene solo le ultime 3 di questo utente
  const mine = await listCopies();
  for (const old of mine.slice(3)) await idbRun("readwrite", (st) => st.delete(old.id));
}
async function maybeAutoCopy() {
  try {
    const last = (await listCopies())[0];
    if (last && Date.now() - Date.parse(last.created_at) < 7 * 864e5) return;
    const { count } = await sb.from("transactions").select("id", { count: "exact", head: true });
    if (count) await saveCopy("auto");
  } catch { /* le copie sono un aiuto in più: un errore non blocca l'app */ }
}

// ---------- pagina Backup ----------
const daysSince = (iso) => Math.floor((Date.now() - Date.parse(iso)) / 864e5);
const reminderDays = () => state.settingsData?.backup_reminder_days ?? DEFAULT_REMINDER_DAYS;
function lastBackupText() {
  const iso = state.settingsData?.last_backup_at;
  if (!iso) return "Mai";
  const n = daysSince(iso);
  return n === 0 ? "Oggi" : n === 1 ? "Ieri" : `${n} giorni fa`;
}
const whenText = (iso) => {
  const d = new Date(iso), n = daysSince(iso);
  const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (n === 0 && new Date().getDate() === d.getDate()) return `Oggi, ${time}`;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long" }) + `, ${time}`;
};

$("open-backup").addEventListener("click", openBackup);
$("backup-back").addEventListener("click", () => {
  $("backup").classList.remove("open");
  $("backup").setAttribute("aria-hidden", "true");
});

async function openBackup() {
  renderBackupPage();
  $("backup").scrollTop = 0;
  $("backup").classList.add("open");
  $("backup").setAttribute("aria-hidden", "false");
  renderCopies();
}

function renderBackupPage() {
  const iso = state.settingsData?.last_backup_at;
  if (iso) {
    const n = daysSince(iso);
    $("backup-title").textContent = n === 0 ? "Ultimo backup oggi" : n === 1 ? "Ultimo backup ieri" : `Ultimo backup ${n} giorni fa`;
    const cnt = state.settingsData.last_backup_count;
    $("backup-sub").textContent = new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })
      + (cnt != null ? ` · ${cnt} ${cnt === 1 ? "movimento" : "movimenti"}` : "");
  } else {
    $("backup-title").textContent = "Non hai ancora fatto un backup";
    $("backup-sub").textContent = "Salva tutti i tuoi dati in un file, sul telefono o su iCloud Drive.";
  }
  document.querySelectorAll("#reminder-seg button").forEach((b) => b.classList.toggle("on", Number(b.dataset.days) === reminderDays()));
}

async function renderCopies() {
  const ul = $("copies-list");
  const copies = await listCopies();
  ul.replaceChildren();
  if (!copies.length) {
    ul.append(el("li", null, "Nessuna copia per ora"));
    ul.firstChild.classList.add("secondary");
    return;
  }
  for (const c of copies) {
    const li = el("li", "copy");
    const grow = el("div", "grow");
    grow.append(el("span", "t", whenText(c.created_at)),
      el("span", "s", `${c.reason === "auto" ? "Automatica settimanale" : c.reason === "import" ? "Prima di un'importazione" : "Prima di un ripristino"} · ${c.tx} ${c.tx === 1 ? "movimento" : "movimenti"}`));
    const btn = el("button", "act", "Ripristina");
    btn.type = "button";
    btn.addEventListener("click", () => {
      try { startRestore(JSON.parse(c.json), "Copia sul dispositivo · " + whenText(c.created_at)); }
      catch { toast("Questa copia è danneggiata"); }
    });
    li.append(grow, btn);
    ul.append(li);
  }
}

$("reminder-seg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-days]");
  if (!b) return;
  state.settingsData.backup_reminder_days = Number(b.dataset.days);
  saveSettingsData();
  renderBackupPage();
  renderBackupBanner();
});

// ---------- crea backup ----------
// Su iPhone la finestra Condividi va aperta da un tocco: prima si prepara il file, poi si tocca "Salva".
$("backup-create").addEventListener("click", async () => {
  const btn = $("backup-create");
  btn.disabled = true;
  btn.textContent = "Preparo il backup…";
  let backup;
  try { backup = await buildBackup(); }
  catch (e) { toast("Backup non riuscito: " + traduciErrore(e.message || "")); return; }
  finally { btn.disabled = false; btn.textContent = "Crea backup"; }
  const n = backup.data.transactions.length;
  const name = `flunora-backup-${isoDate(new Date())}.json`;
  actionSheet({
    title: "Backup pronto",
    message: `${n} ${n === 1 ? "movimento" : "movimenti"} e ${backup.data.categories.length} categorie. Scegli dove salvarlo, ad esempio "Salva su File".`,
    actions: [{ label: "Salva o condividi…", onClick: async () => {
      const ok = await deliverFile(name, "application/json", JSON.stringify(backup, null, 1));
      if (!ok) return;
      state.settingsData.last_backup_at = backup.created_at;
      state.settingsData.last_backup_count = n;
      saveSettingsData();
      renderBackupPage();
      renderBackupBanner();
      $("set-backup").textContent = lastBackupText();
      toast("Backup salvato");
    } }],
  });
});

// ---------- esporta CSV ----------
const csvCell = (v) => {
  const s = String(v ?? "");
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function buildCsv(rows) {
  const tipo = { entrata: "Entrata", uscita: "Uscita", investimento: "Investimento" };
  const lines = ["Data;Tipo;Categoria;Descrizione;Importo"];
  for (const t of rows) {
    const [y, m, d] = t.date.split("-");
    const signed = (t.kind === "entrata" ? 1 : -1) * t.amount_cents;
    lines.push([`${d}/${m}/${y}`, tipo[t.kind], catById(t.category_id)?.name || "", t.description || "",
      (signed / 100).toFixed(2).replace(".", ",")].map(csvCell).join(";"));
  }
  return "﻿" + lines.join("\r\n");   // il BOM fa leggere bene gli accenti a Excel
}

$("backup-csv").addEventListener("click", async () => {
  let all;
  try { all = await fetchAll("transactions"); }
  catch (e) { return toast("Esportazione non riuscita: " + traduciErrore(e.message || "")); }
  if (!all.length) return toast("Non ci sono movimenti da esportare");
  all.sort((a, b) => a.date.localeCompare(b.date));
  const years = [...new Set(all.map((t) => t.date.slice(0, 4)))].sort().reverse();
  const exportRows = (rows, label) => actionSheet({
    title: "Esportazione pronta",
    message: `${rows.length} ${rows.length === 1 ? "movimento" : "movimenti"} (${label}).`,
    actions: [{ label: "Salva o condividi…", onClick: () =>
      deliverFile(`flunora-movimenti-${label.replace(/\s+/g, "-").toLowerCase()}.csv`, "text/csv", buildCsv(rows)) }],
  });
  actionSheet({
    title: "Esporta movimenti in CSV",
    message: "Il file si apre con Excel o Numbers.",
    actions: [
      { label: "Tutti gli anni", onClick: () => exportRows(all, "tutti gli anni") },
      ...years.map((y) => ({ label: y, onClick: () => exportRows(all.filter((t) => t.date.startsWith(y)), y) })),
    ],
  });
});

// ---------- ripristino ----------
$("backup-restore").addEventListener("click", () => { $("restore-file").value = ""; $("restore-file").click(); });
$("restore-file").addEventListener("change", async () => {
  const f = $("restore-file").files?.[0];
  if (!f) return;
  if (f.size > 50 * 1024 * 1024) return toast("Il file è troppo grande per essere un backup di Flunora");
  let obj;
  try { obj = JSON.parse(await f.text()); }
  catch { return actionSheet({ title: "File non valido", message: "Questo file non è un backup di Flunora.", actions: [] }); }
  startRestore(obj, f.name);
});

$("restore-cancel").addEventListener("click", closeRestore);
$("restore-backdrop").addEventListener("click", closeRestore);
$("restore-mode").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-mode]");
  if (b && state.restore) { state.restore.mode = b.dataset.mode; renderRestoreMode(); }
});

function startRestore(obj, label) {
  const v = validateBackup(obj);
  if (!v.ok) return actionSheet({ title: "Impossibile ripristinare", message: v.error, actions: [] });
  state.restore = { obj, mode: "merge" };
  const s = v.summary;
  const mese = (iso) => iso ? new Date(iso + "T12:00").toLocaleDateString("it-IT", { month: "short", year: "numeric" }) : "–";
  const rows = [
    ["File", label],
    ["Creato il", s.created_at ? new Date(s.created_at).toLocaleString("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–"],
    ["Movimenti", String(s.tx)],
    ["Categorie", String(s.cat)],
    ["Periodo", s.from ? `${mese(s.from)} – ${mese(s.to)}` : "Nessun movimento"],
  ];
  if (s.version) rows.push(["Versione app", s.version]);
  $("restore-info").replaceChildren(...rows.map(([k, val]) => {
    const d = el("div", "kv");
    d.append(el("span", null, k), el("b", null, val));
    return d;
  }));
  setMsg($("restore-msg"), "");
  renderRestoreMode();
  $("restore-sheet").scrollTop = 0;
  $("restore-sheet").classList.add("open");
  $("restore-sheet").setAttribute("aria-hidden", "false");
  $("restore-backdrop").classList.add("open");
}
function renderRestoreMode() {
  const m = state.restore.mode;
  document.querySelectorAll("#restore-mode .opt").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
  $("restore-go").textContent = m === "replace" ? "Sostituisci tutto" : "Unisci";
  $("restore-go").classList.toggle("danger", m === "replace");
}
function closeRestore() {
  $("restore-sheet").classList.remove("open");
  $("restore-sheet").setAttribute("aria-hidden", "true");
  $("restore-backdrop").classList.remove("open");
  state.restore = null;
}

$("restore-go").addEventListener("click", () => {
  if (!state.restore) return;
  if (state.restore.mode === "replace") {
    actionSheet({
      title: "Sostituire tutti i dati?",
      message: "Movimenti, categorie e budget attuali verranno rimpiazzati da quelli del backup. Prima Flunora salva una copia su questo dispositivo.",
      actions: [{ label: "Sostituisci tutto", danger: true, onClick: runRestore }],
    });
  } else runRestore();
});

async function runRestore() {
  const r = state.restore;
  if (!r) return;
  const btn = $("restore-go");
  btn.disabled = true;
  btn.textContent = "Ripristino in corso…";
  const msg = $("restore-msg");
  try {
    // 1. copia di sicurezza dei dati attuali
    try { await saveCopy("restore"); }
    catch { setMsg(msg, "Non riesco a salvare la copia di sicurezza: ripristino annullato.", true); return; }
    // 2. ripristino in un'unica operazione sul database
    const d = r.obj.data;
    const { data: res, error } = await sb.rpc("restore_backup", {
      payload: { categories: d.categories, transactions: d.transactions, budgets: d.budgets || [], import_rules: d.import_rules || [], advances: d.advances || [], wishes: d.wishes || [] },
      replace_all: r.mode === "replace",
    });
    if (error) {
      setMsg(msg, /restore_backup|schema cache|PGRST20|42883/i.test(`${error.message} ${error.code}`)
        ? "Esegui prima lo script 0.3.0 in Supabase." : "Ripristino non riuscito: " + traduciErrore(error.message), true);
      return;
    }
    // 3. impostazioni sincronizzate (sezioni, budget fisso, saldo iniziale, promemoria)
    const bs = d.settings || {};
    const keep = { last_backup_at: state.settingsData.last_backup_at, last_backup_count: state.settingsData.last_backup_count };
    if (r.mode === "replace") {
      state.settingsData = { ...bs, ...keep };
    } else {
      for (const k of ["budget_cents", "opening", "backup_reminder_days", "wish_pool_cents"]) {
        if (state.settingsData[k] == null && bs[k] != null) state.settingsData[k] = bs[k];
      }
    }
    if (r.mode === "replace" && bs.sections) state.sections = normalizeSections(bs.sections);
    await saveSettingsData();
    // 4. ricarica tutto
    closeRestore();
    $("backup").classList.remove("open");
    $("settings").classList.remove("open");
    await loadCategories();
    renderTabbar();
    route();
    const n = res?.transactions_added ?? 0, skip = res?.transactions_skipped ?? 0;
    toast(r.mode === "replace" ? `Ripristinati ${n} movimenti`
      : `Aggiunti ${n} movimenti${skip ? `, ${skip} già presenti` : ""}`);
  } finally {
    btn.disabled = false;
    if (state.restore) renderRestoreMode();
  }
}

// ---------- promemoria in Dashboard ----------
$("backup-banner-go").addEventListener("click", () => { openSettings(); openBackup(); });
$("backup-banner-open").addEventListener("click", () => { openSettings(); openBackup(); });
$("backup-banner-close").addEventListener("click", () => {
  lsSet(LS_SNOOZE, String(Date.now() + 3 * 864e5));   // lo ripropone tra 3 giorni
  $("backup-banner").hidden = true;
});

async function renderBackupBanner() {
  const banner = $("backup-banner");
  const days = reminderDays();
  const snooze = Number(lsGet(LS_SNOOZE) || 0);
  if (!days || Date.now() < snooze) { banner.hidden = true; return; }
  const iso = state.settingsData?.last_backup_at;
  if (iso) {
    const n = daysSince(iso);
    banner.hidden = n < days;
    $("backup-banner-title").textContent = `Ultimo backup ${n} giorni fa`;
    return;
  }
  // mai fatto: lo suggerisce solo se c'è già qualcosa da salvare
  const { count } = await sb.from("transactions").select("id", { count: "exact", head: true });
  banner.hidden = !count;
  $("backup-banner-title").textContent = "Ancora nessun backup";
}

// =========================================================
//  BARRA IN BASSO CHE SI NASCONDE SCORRENDO (0.3.0)
//  Giù: la barra scende e libera lo schermo. Su (o in cima alla pagina): torna.
// =========================================================
let lastScrollY = window.scrollY;
window.addEventListener("scroll", () => {
  if (state.freezeBar) return;     // durante l'eliminazione di una riga la pagina si accorcia: non è uno scorrimento
  // il "rimbalzo" di iOS in cima e in fondo non conta come scorrimento (bug #002)
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const y = Math.min(Math.max(0, window.scrollY), max);
  const dy = y - lastScrollY;
  if (Math.abs(dy) < 6) return;
  document.body.classList.toggle("bar-hidden", dy > 0 && y > 60);
  lastScrollY = y;
}, { passive: true });
const showBar = () => { document.body.classList.remove("bar-hidden"); lastScrollY = window.scrollY; };
window.addEventListener("hashchange", showBar);

// =========================================================
//  ANIMAZIONI (0.3.1) — brevi, e spente con "Riduci movimento"
// =========================================================
const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// aggiunge una classe per il tempo di un'animazione (riparte anche se c'era già)
function playClass(node, cls, ms) {
  if (!node || reduceMotion()) return;
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
  clearTimeout(node["_t_" + cls]);
  node["_t_" + cls] = setTimeout(() => node.classList.remove(cls), ms);
}

// fa scorrere un importo dal valore mostrato prima a quello nuovo
function countTo(node, target, render, ms = 600) {
  const from = node._value ?? 0;
  node._value = target;
  cancelAnimationFrame(node._raf);
  if (reduceMotion() || from === target) { node.textContent = render(target); return; }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    node.textContent = render(Math.round(from + (target - from) * e));
    if (k < 1) node._raf = requestAnimationFrame(step);
  };
  node._raf = requestAnimationFrame(step);
}

// eliminazione fluida: la riga scivola via a sinistra, poi lo spazio si richiude.
// Se il giorno resta vuoto si richiude anche la sua intestazione. Solo transform/opacity
// per lo scivolamento; durante la chiusura la barra in basso resta ferma.
function collapseRows(ids) {
  if (reduceMotion()) return Promise.resolve();
  const rows = ids.map((id) => document.querySelector(`#tx-list li[data-id="${CSS.escape(id)}"]`)).filter(Boolean);
  if (!rows.length) return Promise.resolve();
  const gone = new Set(rows);
  const targets = [];
  for (const day of new Set(rows.map((li) => li.closest(".day")))) {
    const lis = [...day.querySelectorAll("li.swipe")];
    if (lis.every((li) => gone.has(li))) targets.push(day);
    else targets.push(...lis.filter((li) => gone.has(li)));
  }
  state.freezeBar = true;
  // 1. scivola via
  rows.forEach((li) => {
    const c = li.querySelector(".row-content");
    c.style.transition = "transform .2s cubic-bezier(.4, 0, 1, 1)";
    c.style.transform = "translateX(-100%)";
  });
  return new Promise((done) => setTimeout(() => {
    // 2. lo spazio si richiude
    targets.forEach((n) => {
      n.style.height = n.offsetHeight + "px";
      if (n.classList.contains("day") && n.parentElement.children.length > 1) {
        n.dataset.gap = n.nextElementSibling ? "after" : "before"; // assorbe lo spazio tra i giorni
      }
    });
    void document.body.offsetHeight;
    targets.forEach((n) => n.classList.add("collapsing"));
    setTimeout(() => {
      state.freezeBar = false;
      lastScrollY = window.scrollY;
      done();
    }, 250);
  }, 190));
}

// =========================================================
//  PANNELLI: si chiudono trascinando in basso la maniglia o il titolo (0.3.3)
// =========================================================
function attachSheetDrag(sheet) {
  const backdrop = sheet.previousElementSibling?.classList.contains("sheet-backdrop") ? sheet.previousElementSibling : null;
  if (!backdrop) return;
  let startY = 0, dy = 0, lastY = 0, lastT = 0, v = 0, dragging = false, id = null;

  const reset = () => {
    sheet.classList.remove("dragging");
    sheet.style.transform = "";
    backdrop.style.opacity = "";
  };
  sheet.addEventListener("pointerdown", (e) => {
    if (!sheet.classList.contains("open") || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (!e.target.closest(".grabber, .sheet-head") || e.target.closest("button, input, a, select, textarea")) return;
    startY = lastY = e.clientY; lastT = e.timeStamp; dy = 0; v = 0; dragging = true; id = e.pointerId;
    try { sheet.setPointerCapture(id); } catch {}
    sheet.classList.add("dragging");
  });
  sheet.addEventListener("pointermove", (e) => {
    if (!dragging || e.pointerId !== id) return;
    const raw = e.clientY - startY;
    dy = raw > 0 ? raw : -Math.sqrt(-raw) * 2;            // verso l'alto fa solo un po' di resistenza
    const dt = e.timeStamp - lastT;
    if (dt > 0) { v = (e.clientY - lastY) / dt; lastY = e.clientY; lastT = e.timeStamp; }
    sheet.style.transform = `translateY(${dy}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / sheet.offsetHeight));
  });
  const end = (e) => {
    if (!dragging || e.pointerId !== id) return;
    dragging = false;
    const close = dy > sheet.offsetHeight * 0.25 || (v > 0.6 && dy > 30);
    reset();                                               // riparte dalla posizione attuale con la transizione
    if (close) backdrop.click();                           // chiude come "Annulla"
  };
  sheet.addEventListener("pointerup", end);
  sheet.addEventListener("pointercancel", end);
}
document.querySelectorAll(".sheet").forEach(attachSheetDrag);

// niente zoom con due dita (Safari) — resta lo Zoom di sistema in Accessibilità
document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
document.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });

// =========================================================
// 0.6.0 — MOVIMENTI PERIODICI e RISPARMIO PERIODICO
// Tabella recurring: modello (tipo, categoria, importo, descrizione), ogni mese o
// ogni anno, giorno (e mese), data di partenza, ultima data già aggiunta.
// I movimenti nascono quando apri l'app, ognuno con la sua data; recurring_id + mese
// è unico, quindi niente doppioni. kind "risparmio" = soldi messi da parte in
// automatico per un desiderio (wish_id) o per il Salvadanaio (wish_id vuoto).
// =========================================================
const REC_KINDS = ["uscita", "entrata", "investimento", "risparmio"];
const REC_GROUP = { uscita: "Uscite", entrata: "Entrate", investimento: "Investimenti", risparmio: "Risparmio" };
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate(); // m da 0
const recDate = (rec, y, m) => isoDate(new Date(y, m, Math.min(rec.day_of_month, daysIn(y, m))));
const shortDay = (iso) => new Date(iso + "T12:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });

// prossima data dopo `after` (esclusa); senza `after` la prima dalla partenza (inclusa)
function recNext(rec, after = null) {
  if (!rec.start_date) return null;
  const from = after && after > rec.start_date ? after : rec.start_date;
  let [y, m] = from.split("-").map(Number); m -= 1;
  if (rec.frequency === "anno") m = (rec.month_of_year || m + 1) - 1;
  for (let i = 0; i < 40; i++) {
    const d = recDate(rec, y, m);
    if (d >= rec.start_date && (!after || d > after)) return d;
    if (rec.frequency === "anno") y++; else if (++m > 11) { m = 0; y++; }
  }
  return null;
}
function recLabel(rec) {
  const d = rec.day_of_month;
  const g = d >= 31 ? "l'ultimo giorno" : d === 1 ? "il 1°" : d === 8 || d === 11 ? `l'${d}` : `il ${d}`;
  return rec.frequency === "anno" ? `Ogni anno, ${g} ${MESI[(rec.month_of_year || 1) - 1]}` : `Ogni mese, ${g}`;
}
const recMonthly = (rec) => (rec.frequency === "anno" ? Math.round(rec.amount_cents / 12) : rec.amount_cents);

async function loadRecurring() {
  const { data, error } = await sb.from("recurring").select("*").order("created_at");
  state.recMissing = !!error;
  state.recurring = error ? [] : data.filter((r) => r.start_date); // i modelli vecchi senza partenza non contano
  return state.recurring;
}

// aggiunge quello che è arrivato a scadenza (all'apertura e dopo ogni modifica)
let recRunning = false;
async function runRecurring(quiet = false) {
  if (recRunning) return;
  recRunning = true;
  try {
    const recs = (await loadRecurring()).filter((r) => r.active);
    const today = isoDate(new Date());
    const added = [];
    let savedCents = 0;
    for (const rec of recs) {
      let last = rec.last_date, d = recNext(rec, last), n = 0;
      while (d && d <= today && n < 36) {
        if (rec.kind === "risparmio") {
          const cents = await applySaving(rec);
          if (cents === null) break;          // desiderio chiuso: il risparmio si ferma
          savedCents += cents;
        } else {
          const { error } = await sb.from("transactions").insert({
            date: d, amount_cents: rec.amount_cents, kind: rec.kind, category_id: rec.category_id,
            description: rec.description, recurring_id: rec.id,
          });
          if (error && !/duplicate|23505/i.test(`${error.message} ${error.code}`)) break;
          if (!error) added.push(rec);
        }
        last = d; n++; d = recNext(rec, d);
      }
      if (last !== rec.last_date) {
        rec.last_date = last;
        await sb.from("recurring").update({ last_date: last }).eq("id", rec.id);
      }
    }
    if (added.length || savedCents) {
      if (!quiet) {
        const names = [...new Set(added.map((r) => r.description))];
        const text = added.length
          ? `${added.length === 1 ? "Aggiunto 1 movimento periodico" : `Aggiunti ${added.length} movimenti periodici`}: ${names.slice(0, 2).join(", ")}${names.length > 2 ? "…" : ""}`
          : `${fmt(savedCents)} messi da parte in automatico per i Desideri`;
        toast(text, added.length ? { label: "Vedi", onClick: () => { location.hash = "#mesi"; } } : null);
      }
      if (state.page === "mesi") loadMonth();
      if (state.page === "dashboard") loadDashboard();
      if (state.page === "desideri") loadWishes();
    }
  } finally { recRunning = false; }
}

// risparmio periodico: soldi messi da parte; null se il desiderio non è più attivo
async function applySaving(rec) {
  if (!rec.wish_id) { await setPool(wishPool() + rec.amount_cents); return rec.amount_cents; }
  const { data: w } = await sb.from("wishes").select("*").eq("id", rec.wish_id).maybeSingle();
  if (!w || w.status !== "attivo") {
    await sb.from("recurring").update({ active: false }).eq("id", rec.id);
    return null;
  }
  const cents = Math.max(0, Math.min(rec.amount_cents, w.price_cents - w.saved_cents)); // non oltre il prezzo
  if (cents) await sb.from("wishes").update({ saved_cents: w.saved_cents + cents }).eq("id", w.id);
  return cents;
}

// ---------- "Ripeti" nel pannello + ----------
function syncRepRow() {
  const rec = !!state.editingRec;
  const show = rec || (!state.editing && !state.wishBuying && !state.dupOf && state.kind !== "anticipo");
  $("rep-row").hidden = !show;
  updateRepHint();
}
function updateRepHint() {
  const hint = $("rep-hint");
  const freq = $("f-repeat").value, date = $("f-date").value;
  if ($("rep-row").hidden || !freq || !date) { hint.hidden = true; return; }
  const [y, m, d] = date.split("-").map(Number);
  const rec = { frequency: freq, day_of_month: d, month_of_year: m, start_date: date };
  const today = isoDate(new Date());
  const next = date > today ? date : recNext(rec, today);
  hint.textContent = state.editingRec
    ? `${recLabel(rec)}. Il prossimo arriva ${shortDay(next)}. I movimenti già aggiunti non cambiano.`
    : `${recLabel(rec)}${date <= today ? ": questo lo aggiungo subito" : ""}, il prossimo arriva ${shortDay(date > today ? date : next)}. Lo trovi in Impostazioni › Movimenti periodici.`;
  hint.hidden = false;
}
$("f-repeat").addEventListener("change", updateRepHint);
$("f-date").addEventListener("change", updateRepHint);

async function saveNewRec(row, freq) {
  const [, m, d] = row.date.split("-").map(Number);
  const rec = {
    kind: row.kind, category_id: row.category_id, amount_cents: row.amount_cents,
    description: row.description || catById(row.category_id)?.name || "Movimento",
    frequency: freq, day_of_month: d, month_of_year: freq === "anno" ? m : null,
    start_date: row.date, last_date: null, active: true,
  };
  const { error } = await sb.from("recurring").insert(rec);
  if (error) {
    return setMsg($("sheet-msg"), /frequency|start_date|schema cache|PGRST204|42703/i.test(`${error.message} ${error.code}`)
      ? "Prima esegui lo script della 0.6.0 in Supabase." : "Errore nel salvataggio: " + traduciErrore(error.message), true);
  }
  state.lastCategory[row.kind] = row.category_id;
  closeSheet();
  await runRecurring(true);
  const today = isoDate(new Date());
  toast(row.date <= today ? `Movimento salvato: si ripete ${recLabel(rec).toLowerCase()}` : `Periodico salvato: il primo arriva ${shortDay(row.date)}`);
  refreshAfterChange(row.date);
  if ($("periodic").classList.contains("open")) renderPeriodic();
}

// ---------- modifica di un periodico (stesso pannello del +) ----------
function openRecSheet(rec) {
  openSheet(null);
  state.editingRec = rec;
  state.categoryId = rec.category_id;
  setKind(rec.kind);
  $("sheet-title").textContent = "Movimento periodico";
  $("f-amount").value = fmtPlain(rec.amount_cents);
  $("f-desc").value = rec.description || "";
  const next = recNext(rec, rec.last_date) || rec.start_date;
  $("f-date").value = next;
  state.editingRec.shownDate = next;
  $("f-repeat").value = rec.frequency;
  $("f-repeat").querySelector('option[value=""]').disabled = true;
  $("freq-box").hidden = true;
  $("kind-anticipo").hidden = true;
  $("sheet-foot").hidden = false;
  $("sheet-dup").hidden = true;
  $("sheet-pause").hidden = false;
  $("sheet-pause").textContent = rec.active ? "Sospendi" : "Riattiva";
  $("sheet").classList.add("top"); $("sheet-backdrop").classList.add("top");
  syncRepRow();
  setMsg($("sheet-msg"), "");
}

async function saveRecFromSheet() {
  const rec = state.editingRec, msg = $("sheet-msg");
  const amount = parseAmount($("f-amount").value);
  if (amount === null) return setMsg(msg, "Inserisci un importo valido, es. 12,50.", true);
  if (!state.categoryId) return setMsg(msg, "Scegli una categoria.", true);
  const date = $("f-date").value;
  if (!date) return setMsg(msg, "Scegli una data.", true);
  const [, m, d] = date.split("-").map(Number);
  const freq = $("f-repeat").value || rec.frequency;
  const patch = {
    kind: state.kind, category_id: state.categoryId, amount_cents: amount,
    description: $("f-desc").value.trim() || catById(state.categoryId)?.name || "Movimento",
    frequency: freq, day_of_month: d, month_of_year: freq === "anno" ? m : null,
  };
  // data o frequenza cambiate: si riparte da quella data (i mesi già fatti restano, senza doppioni)
  if (date !== rec.shownDate || freq !== rec.frequency) Object.assign(patch, { start_date: date, last_date: null });
  const { error } = await sb.from("recurring").update(patch).eq("id", rec.id);
  if (error) return setMsg(msg, "Errore nel salvataggio: " + traduciErrore(error.message), true);
  closeSheet();
  toast("Movimento periodico aggiornato");
  await runRecurring(true);
  renderPeriodic();
}

$("sheet-pause").addEventListener("click", async () => {
  const rec = state.editingRec;
  if (!rec) return;
  // riattivando, riparte dalla prossima data: i mesi in pausa non si recuperano
  const patch = rec.active ? { active: false } : { active: true, last_date: isoDate(new Date()) };
  const { error } = await sb.from("recurring").update(patch).eq("id", rec.id);
  if (error) return toast("Errore: " + traduciErrore(error.message));
  closeSheet();
  toast(rec.active ? `${rec.description}: in pausa` : `${rec.description}: di nuovo attivo`);
  renderPeriodic();
});

function deleteRec(rec) {
  actionSheet({
    title: `Eliminare ${rec.description}?`,
    message: "I movimenti già aggiunti restano dove sono.",
    actions: [{ label: "Elimina movimento periodico", danger: true, onClick: async () => {
      const { error } = await sb.from("recurring").delete().eq("id", rec.id);
      if (error) return toast("Errore: " + traduciErrore(error.message));
      closeSheet();
      toast("Movimento periodico eliminato");
      renderPeriodic();
    } }],
  });
}

// ---------- pagina Impostazioni › Movimenti periodici ----------
async function renderPeriodicCount() {
  const recs = await loadRecurring();
  const on = recs.filter((r) => r.active).length;
  $("set-periodic").textContent = state.recMissing ? "" : on ? String(on) : "Nessuno";
}

async function openPeriodic() {
  $("periodic").scrollTop = 0;
  $("periodic").classList.add("open");
  $("periodic").setAttribute("aria-hidden", "false");
  await renderPeriodic();
}
function closePeriodic() {
  $("periodic").classList.remove("open");
  $("periodic").setAttribute("aria-hidden", "true");
  renderPeriodicCount();
}
$("open-periodic").addEventListener("click", openPeriodic);
$("periodic-back").addEventListener("click", closePeriodic);
$("per-new").addEventListener("click", () => {
  openSheet(null);
  if (state.kind === "anticipo") setKind("uscita");
  $("f-repeat").value = "mese";
  $("sheet-title").textContent = "Nuovo periodico";
  $("freq-box").hidden = true;
  $("kind-anticipo").hidden = true;
  $("sheet").classList.add("top"); $("sheet-backdrop").classList.add("top");
  updateRepHint();
});

async function renderPeriodic() {
  const recs = await loadRecurring();
  if (!state.wishes) { const { data } = await sb.from("wishes").select("*"); state.wishes = data || []; }
  const box = $("per-groups");
  box.replaceChildren();
  if (state.recMissing) {
    box.append(el("p", "secondary foot", "I movimenti periodici non sono ancora disponibili: esegui lo script della 0.6.0 in Supabase."));
    $("per-sum").hidden = true;
    return;
  }
  // quanto pesano al mese (gli annuali divisi per 12)
  const on = recs.filter((r) => r.active);
  const sum = (k) => on.filter((r) => r.kind === k).reduce((a, r) => a + recMonthly(r), 0);
  const sum_ = $("per-sum");
  sum_.hidden = !on.length;
  sum_.replaceChildren(
    ...[["Uscite al mese", sum("uscita"), "out"], ["Entrate al mese", sum("entrata"), "in"], ["Risparmio al mese", sum("risparmio"), "save"]]
      .filter(([, c]) => c).map(([l, c, k]) => { const d = el("div", "per-kpi " + k); d.append(el("span", "secondary small", l), el("strong", null, fmt(c))); return d; })
  );
  const today = isoDate(new Date());
  for (const k of REC_KINDS) {
    const list = recs.filter((r) => r.kind === k).sort((a, b) => (b.active - a.active) || (recNext(a, a.last_date) || "").localeCompare(recNext(b, b.last_date) || ""));
    if (!list.length) continue;
    box.append(el("h3", "section-title", REC_GROUP[k]));
    const ul = el("ul", "card list settings per-list");
    for (const r of list) {
      const li = el("li", "tap" + (r.active ? "" : " paused"));
      if (k === "risparmio") {
        const ico = el("span", "cat-ico");
        ico.style.setProperty("--c", "#ff9f0a");
        ico.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 11a7 6 0 0 1 12.5-3.5H20v4l-2 1v3h-2l-1 2h-2v-1.5h-3V18H8l-1-2.5A6 6 0 0 1 5 11z"/></svg>';
        li.append(ico);
      } else li.append(catIcon(catById(r.category_id)));
      const label = el("span", "label");
      const wish = r.wish_id ? state.wishes.find((w) => w.id === r.wish_id) : null;
      const name = k === "risparmio" ? (r.wish_id ? wish?.name || r.description : POOL_NAME) : r.description;
      const next = recNext(r, r.last_date);
      label.append(el("span", null, name), el("small", null, r.active ? `${recLabel(r)} · prossimo ${next === today ? "oggi" : advDate(next)}` : `${recLabel(r)} · in pausa`));
      const sign = k === "entrata" ? "+ " : k === "risparmio" ? "" : "− ";
      li.append(label, el("span", "value per-amt" + (k === "entrata" ? " in" : ""), sign + fmt(r.amount_cents)), el("span", "chev", "›"));
      li.addEventListener("click", () => (k === "risparmio" ? openWishAuto(r.wish_id ? (wish || { id: r.wish_id, name: r.description, price_cents: 0, saved_cents: 0 }) : poolItem()) : openRecSheet(r)));
      ul.append(li);
    }
    box.append(ul);
  }
  if (!recs.length) box.append(el("p", "secondary foot per-empty", "Nessun movimento periodico. Creane uno qui sotto, oppure scegli \"Ripeti\" quando aggiungi un movimento con +."));
}

// ---------- Dashboard: in arrivo nei prossimi 7 giorni ----------
async function renderUpcoming() {
  const recs = (await loadRecurring()).filter((r) => r.active);
  const today = isoDate(new Date());
  const lim = isoDate(new Date(Date.now() + 7 * 864e5));
  const items = recs.map((r) => ({ r, d: recNext(r, r.last_date && r.last_date > today ? r.last_date : today) }))
    .filter((x) => x.d && x.d > today && x.d <= lim).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 4);
  $("upcoming").hidden = !items.length;
  const tomorrow = isoDate(new Date(Date.now() + 864e5));
  $("up-list").replaceChildren(...items.map(({ r, d }) => {
    const li = el("li");
    const sd = shortDay(d);
    const when = el("span", "up-when", d === tomorrow ? "Domani" : sd[0].toUpperCase() + sd.slice(1));
    const name = r.kind === "risparmio" ? `Risparmio · ${r.wish_id ? r.description : POOL_NAME}` : r.description;
    const sign = r.kind === "entrata" ? "+ " : r.kind === "risparmio" ? "" : "− ";
    li.append(when, el("span", "up-name", name), el("span", "up-amt" + (r.kind === "entrata" ? " in" : ""), sign + fmt(r.amount_cents)));
    return li;
  }));
}
$("upcoming-all").addEventListener("click", () => { openSettings(); openPeriodic(); });

// ---------- Dashboard: recap del mese passato (nei primi 10 giorni del mese) ----------
const recapSeen = () => { try { return localStorage.getItem("flunora.recapSeen") || ""; } catch { return ""; } };
async function renderRecap() {
  const card = $("recap");
  const now = new Date();
  const prev = addMonths(firstOfMonth(now), -1), before = addMonths(prev, -1);
  const key = monthKey(prev);
  if (now.getDate() > 10 || recapSeen() >= key) { card.hidden = true; return; }
  const { data, error } = await sb.from("transactions").select("date, amount_cents, kind, category_id")
    .gte("date", isoDate(before)).lt("date", isoDate(firstOfMonth(now)));
  if (error) { card.hidden = true; return; }
  const inM = (t, d) => t.date >= isoDate(d) && t.date < isoDate(addMonths(d, 1));
  const cur = data.filter((t) => inM(t, prev)), old = data.filter((t) => inM(t, before));
  if (!cur.length) { card.hidden = true; return; }
  const tot = (rows, k) => rows.filter((t) => t.kind === k).reduce((a, t) => a + t.amount_cents, 0);
  const ent = tot(cur, "entrata"), usc = tot(cur, "uscita"), inv = tot(cur, "investimento");
  const diff = ent - usc - inv;
  const mese = MESI[prev.getMonth()];
  $("recap-title").textContent = `${mese[0].toUpperCase()}${mese.slice(1)} in breve`;
  $("recap-grid").replaceChildren(...[["Entrate", ent, "in"], ["Uscite", usc, "out"], ["Rimasti", diff, diff < 0 ? "out" : "in"]].map(([l, c, k]) => {
    const d = el("div", "recap-kpi " + k);
    d.append(el("span", "secondary small", l), el("strong", null, (l === "Rimasti" && c < 0 ? "− " : "") + fmt(Math.abs(c))));
    return d;
  }));
  const byCat = new Map();
  cur.filter((t) => t.kind === "uscita").forEach((t) => byCat.set(t.category_id, (byCat.get(t.category_id) || 0) + t.amount_cents));
  const top = [...byCat].sort((a, b) => b[1] - a[1])[0];
  const oldUsc = tot(old, "uscita");
  const parts = [];
  if (top) parts.push(`Spesa più alta: ${catById(top[0])?.name || "altro"} (${fmt(top[1])})`);
  if (oldUsc) {
    const pct = Math.round(((usc - oldUsc) / oldUsc) * 100);
    parts.push(pct === 0 ? `uscite uguali a ${MESI[before.getMonth()]}` : `uscite ${pct > 0 ? "+" : "−"}${Math.abs(pct)}% rispetto a ${MESI[before.getMonth()]}`);
  }
  $("recap-note").textContent = parts.join(" · ");
  card.hidden = false;
}
$("recap-close").addEventListener("click", () => {
  try { localStorage.setItem("flunora.recapSeen", monthKey(addMonths(firstOfMonth(new Date()), -1))); } catch {}
  $("recap").hidden = true;
});

// ---------- Desideri: risparmio periodico ----------
async function loadSavingRecs() {
  const { data, error } = await sb.from("recurring").select("*").eq("kind", "risparmio");
  state.savingRecs = error ? [] : data.filter((r) => r.active);
}
const savingRecFor = (t) => (state.savingRecs || []).find((r) => (t.pool ? !r.wish_id : r.wish_id === t.id));

function openWishAuto(target) {
  const rec = savingRecFor(target);
  state.wishAuto = { target, rec };
  $("wauto-title").textContent = target.name;
  const sel = $("wauto-day");
  if (!sel.options.length) {
    for (let d = 1; d <= 28; d++) sel.append(new Option(String(d), String(d)));
    sel.append(new Option("ultimo giorno", "31"));
  }
  sel.value = String(rec?.day_of_month || 1);
  $("wauto-amount").value = rec ? fmtPlain(rec.amount_cents) : "";
  const plan = target.pool ? null : wishPlan(target);
  const left = target.pool ? 0 : Math.max(0, target.price_cents - target.saved_cents);
  $("wauto-quick").replaceChildren(...[plan && left ? [`${fmt(plan.monthly)} al mese, per arrivarci entro ${plan.label}`, plan.monthly] : null]
    .filter(Boolean).map(([label, cents]) => {
      const b = el("button", "chip", label);
      b.type = "button";
      b.addEventListener("click", () => { $("wauto-amount").value = fmtPlain(cents); });
      return b;
    }));
  $("wauto-note").textContent = target.pool
    ? "Ogni mese, in quel giorno, Flunora mette da parte questa cifra nel Salvadanaio quando apri l'app. I soldi restano sul conto: scendono solo dal Disponibile."
    : "Ogni mese, in quel giorno, Flunora mette da parte questa cifra quando apri l'app. Si ferma da sola quando il desiderio è completo, comprato o se rinunci.";
  $("wauto-stop").hidden = !rec;
  setMsg($("wauto-msg"), "");
  $("wauto-sheet").scrollTop = 0;
  $("wauto-sheet").classList.add("open");
  $("wauto-sheet").setAttribute("aria-hidden", "false");
  $("wauto-backdrop").classList.add("open");
}
function closeWishAuto() {
  $("wauto-sheet").classList.remove("open");
  $("wauto-sheet").setAttribute("aria-hidden", "true");
  $("wauto-backdrop").classList.remove("open");
  document.activeElement?.blur();
}
$("wauto-cancel").addEventListener("click", closeWishAuto);
$("wauto-backdrop").addEventListener("click", closeWishAuto);
$("wauto-sheet").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { target, rec } = state.wishAuto, msg = $("wauto-msg");
  const cents = parseAmount($("wauto-amount").value);
  if (cents === null) { setMsg(msg, "Inserisci un importo, es. 50.", true); return $("wauto-amount").focus(); }
  const day = Number($("wauto-day").value);
  // parte dal prossimo giorno scelto (oggi compreso)
  const now = new Date(), today = isoDate(now);
  const probe = { frequency: "mese", day_of_month: day, start_date: isoDate(firstOfMonth(now)) };
  const start = recNext(probe, isoDate(new Date(Date.now() - 864e5)));
  const row = { amount_cents: cents, day_of_month: day, description: target.name, active: true };
  const { error } = rec
    ? await sb.from("recurring").update(day !== rec.day_of_month ? { ...row, start_date: start, last_date: null } : row).eq("id", rec.id)
    : await sb.from("recurring").insert({ ...row, kind: "risparmio", category_id: null, frequency: "mese", month_of_year: null,
        wish_id: target.pool ? null : target.id, start_date: start, last_date: null });
  if (error) {
    return setMsg(msg, /risparmio|wish_id|frequency|check|schema cache|PGRST204|42703|23514/i.test(`${error.message} ${error.code}`)
      ? "Prima esegui lo script della 0.6.0 in Supabase." : "Errore: " + traduciErrore(error.message), true);
  }
  closeWishAuto();
  toast(start === today ? `Risparmio periodico attivo: oggi ${fmt(cents)} per ${target.name}` : `Risparmio periodico attivo: il primo ${shortDay(start)}`);
  await runRecurring(true);
  if (state.page === "desideri") loadWishes();
  if ($("periodic").classList.contains("open")) renderPeriodic();
});
$("wauto-stop").addEventListener("click", async () => {
  const { target, rec } = state.wishAuto;
  if (!rec) return;
  const { error } = await sb.from("recurring").delete().eq("id", rec.id);
  if (error) return setMsg($("wauto-msg"), "Errore: " + traduciErrore(error.message), true);
  closeWishAuto();
  toast(`Risparmio periodico tolto da ${target.name}`);
  if (state.page === "desideri") loadWishes();
  if ($("periodic").classList.contains("open")) renderPeriodic();
});

// =========================================================
// IMPR-004 (0.5.1) — BLOCCO CON FACE ID
// Una passkey dell'iPhone (WebAuthn) fa da chiave: Flunora chiede Face ID all'apertura
// e quando torni dopo più di LOCK_AFTER_MS. È un blocco dello schermo su questo
// dispositivo: i dati restano protetti come prima dall'accesso a Supabase.
// =========================================================
const LOCK_KEY = "flunora.lock", LOCK_AFTER_MS = 60 * 1000;
function lockCfg() { try { return JSON.parse(localStorage.getItem(LOCK_KEY) || "null"); } catch { return null; } }
function lockOff() { try { localStorage.removeItem(LOCK_KEY); } catch {} hideLock(); }
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

async function lockSupported() {
  try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
  catch { return false; }
}

async function renderLock() {
  const t = $("lock-toggle");
  t.checked = !!lockCfg();
  const ok = await lockSupported();
  t.disabled = !ok && !t.checked;
  $("lock-foot").textContent = ok || t.checked
    ? "Flunora chiede Face ID quando la apri e quando ci torni dopo più di un minuto. Vale solo per questo iPhone."
    : "Su questo dispositivo Face ID non è disponibile per Flunora.";
}

$("lock-toggle").addEventListener("change", async (e) => {
  const t = e.target;
  if (!t.checked) { lockOff(); toast("Blocco con Face ID disattivato"); return; }
  t.checked = false;
  try {
    const cred = await navigator.credentials.create({ publicKey: {
      rp: { name: "Flunora", id: location.hostname },
      user: { id: randomBytes(16), name: state.user?.email || "Flunora", displayName: "Flunora" },
      challenge: randomBytes(32),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60000,
    } });
    localStorage.setItem(LOCK_KEY, JSON.stringify({ id: toB64(cred.rawId), on: new Date().toISOString() }));
    t.checked = true;
    toast("Blocco con Face ID attivo");
  } catch (err) {
    toast(err?.name === "NotAllowedError" ? "Face ID annullato: blocco non attivato" : "Face ID non disponibile: " + (err?.message || err));
  }
});

let lockBusy = false;
function showLock() {
  $("lock").hidden = false;
  document.body.classList.add("is-locked");
  setMsg($("lock-msg"), "");
  unlock();
}
function hideLock() {
  $("lock").hidden = true;
  document.body.classList.remove("is-locked");
}
async function unlock() {
  const cfg = lockCfg();
  if (!cfg) return hideLock();
  if (lockBusy) return;
  lockBusy = true;
  try {
    await navigator.credentials.get({ publicKey: {
      challenge: randomBytes(32),
      rpId: location.hostname,
      allowCredentials: [{ type: "public-key", id: fromB64(cfg.id) }],
      userVerification: "required",
      timeout: 60000,
    } });
    hideLock();
  } catch (err) {
    // la prima richiesta automatica può non partire senza un tocco: resta il pulsante
    setMsg($("lock-msg"), err?.name === "NotAllowedError" ? "" : "Face ID non riuscito. Riprova.", true);
  } finally { lockBusy = false; }
}
$("lock-open").addEventListener("click", unlock);
$("lock-out").addEventListener("click", async () => { lockOff(); await sb.auth.signOut(); });

let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (state.user && lockCfg() && hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS) showLock();
});

init();

// =========================================================
// 0.4.6 — bug #007: con un pannello aperto (pannello +, menu, impostazioni…)
// la pagina sotto resta ferma; scorre solo il pannello.
// Su iPhone "overflow: hidden" non basta: la pagina si blocca in posizione fissa
// e alla chiusura torna esattamente dove era.
// =========================================================
const OVERLAYS = ".sheet, .action-sheet, .settings-panel";
let lockedY = null;
function syncScrollLock() {
  const open = !!document.querySelector(OVERLAYS.split(", ").map((s) => s + ".open").join(", "));
  const body = document.body;
  if (open && lockedY === null) {
    lockedY = window.scrollY;
    state.freezeBar = true;                  // il blocco non deve nascondere o mostrare la barra
    body.style.top = `-${lockedY}px`;
    body.classList.add("scroll-locked");
  } else if (!open && lockedY !== null) {
    const y = lockedY;
    lockedY = null;
    body.classList.remove("scroll-locked");
    body.style.top = "";
    window.scrollTo(0, y);
    lastScrollY = window.scrollY;
    requestAnimationFrame(() => { state.freezeBar = false; });
  }
}
new MutationObserver(syncScrollLock).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
