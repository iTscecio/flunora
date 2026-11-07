// =========================================================
//  Flunora — logica dell'app
// =========================================================
const APP_VERSION = "0.1.0";

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
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return null;
  return Math.round(n * 100);
}

function setMsg(el, text, isError = false) {
  el.textContent = text || "";
  el.classList.toggle("error", isError);
}

let toastTimer;
function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

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
  await loadCategories();
  route();
}

async function loadCategories() {
  const { data, error } = await sb.from("categories").select("*").order("kind").order("sort_order");
  if (error) { toast("Errore categorie: " + error.message); return; }
  state.categories = data;
  fillFilterSelect();
}
const catById = (id) => state.categories.find((c) => c.id === id);

// Indirizzi: #dashboard  #mesi  #mesi/2026-11  #impostazioni
function route() {
  if (!state.user) return;
  const [page, arg] = location.hash.slice(1).split("/");
  const p = ["dashboard", "mesi", "impostazioni"].includes(page) ? page : "dashboard";
  if (p === "mesi" && /^\d{4}-\d{2}$/.test(arg || "")) {
    const [y, m] = arg.split("-").map(Number);
    state.month = new Date(y, m - 1, 1);
  }
  state.page = p;
  for (const id of ["dashboard", "mesi", "impostazioni"]) $("page-" + id).hidden = id !== p;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.page === p));
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
$("filter-cat").addEventListener("change", renderList);

async function loadMonth() {
  const shown = state.month.getTime();
  $("month-label").textContent = `${MESI[state.month.getMonth()]} ${state.month.getFullYear()}`;
  const { data, error } = await sb
    .from("transactions")
    .select("*")
    .gte("date", isoDate(state.month))
    .lt("date", isoDate(addMonths(state.month, 1)))
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) { toast("Errore movimenti: " + error.message); return; }
  if (shown !== state.month.getTime()) return; // mese cambiato nel frattempo
  state.transactions = data;
  renderKpis();
  renderDonut();
  renderList();
}

function renderKpis() {
  const t = { entrata: 0, uscita: 0, investimento: 0 };
  for (const tx of state.transactions) t[tx.kind] += tx.amount_cents;
  const saldo = t.entrata - t.uscita - t.investimento;
  $("kpi-entrate").textContent = fmt(t.entrata);
  $("kpi-uscite").textContent = fmt(t.uscita);
  $("kpi-invest").textContent = fmt(t.investimento);
  $("kpi-saldo").textContent = signed(saldo);
  $("kpi-saldo").classList.toggle("neg", saldo < 0);
}

function renderDonut() {
  const wrap = $("donut-wrap");
  wrap.replaceChildren();
  const byCat = new Map();
  for (const tx of state.transactions) {
    if (tx.kind === "uscita") byCat.set(tx.category_id, (byCat.get(tx.category_id) || 0) + tx.amount_cents);
  }
  const total = [...byCat.values()].reduce((a, b) => a + b, 0);
  if (!total) { wrap.append(el("p", "secondary", "Nessuna spesa registrata.")); return; }

  const items = [...byCat].map(([id, cents]) => ({ cat: catById(id), cents })).sort((a, b) => b.cents - a.cents);
  const NS = "http://www.w3.org/2000/svg";
  const size = 128, r = 48, C = 2 * Math.PI * r;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", size); svg.setAttribute("height", size);
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Spese per categoria");
  let off = 0;
  for (const it of items) {
    const len = (it.cents / total) * C;
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", size / 2); c.setAttribute("cy", size / 2); c.setAttribute("r", r);
    c.setAttribute("fill", "none"); c.setAttribute("stroke", it.cat?.color || "#8e8e93");
    c.setAttribute("stroke-width", 18);
    c.setAttribute("stroke-dasharray", `${Math.max(0, len - 1.5)} ${C - Math.max(0, len - 1.5)}`);
    c.setAttribute("stroke-dashoffset", -off);
    c.setAttribute("transform", `rotate(-90 ${size / 2} ${size / 2})`);
    svg.append(c);
    off += len;
  }
  const txt = document.createElementNS(NS, "text");
  txt.setAttribute("x", size / 2); txt.setAttribute("y", size / 2 + 4);
  txt.setAttribute("text-anchor", "middle"); txt.setAttribute("class", "total");
  txt.textContent = fmt(total);
  svg.append(txt);

  const ul = el("ul", "legend");
  for (const it of items) {
    const li = el("li");
    const dot = el("span", "dot"); dot.style.background = it.cat?.color || "#8e8e93";
    li.append(dot, el("span", "name", it.cat?.name || "?"), el("span", "val", fmt(it.cents)),
      el("span", "pct", Math.round((it.cents / total) * 100) + "%"));
    ul.append(li);
  }
  wrap.append(svg, ul);
}

function fillFilterSelect() {
  const sel = $("filter-cat");
  sel.replaceChildren(new Option("Tutte", ""));
  for (const [kind, label] of [["uscita", "Uscite"], ["entrata", "Entrate"], ["investimento", "Investimenti"]]) {
    const og = document.createElement("optgroup");
    og.label = label;
    for (const c of state.categories.filter((c) => c.kind === kind)) og.append(new Option(c.name, c.id));
    sel.append(og);
  }
}

function renderList() {
  const ul = $("tx-list");
  ul.replaceChildren();
  const f = $("filter-cat").value;
  const rows = state.transactions.filter((t) => !f || t.category_id === f);
  ul.hidden = rows.length === 0;
  $("tx-empty").hidden = rows.length > 0;

  for (const tx of rows) {
    const cat = catById(tx.category_id);
    const li = el("li", "tap");
    const grow = el("div", "grow");
    const sub = el("div", "sub");
    const dot = el("span", "dot"); dot.style.background = cat?.color || "#8e8e93";
    const [y, m, d] = tx.date.split("-").map(Number);
    const giorno = new Date(y, m - 1, d).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
    const tipo = { entrata: "Entrata", uscita: "", investimento: "Investimento" }[tx.kind];
    sub.append(dot, document.createTextNode([giorno, tipo, cat?.name].filter(Boolean).join(" · ")));
    grow.append(el("div", "title", tx.description || cat?.name || "Movimento"), sub);
    const amt = el("span", "amt" + (tx.kind === "entrata" ? " in" : ""),
      (tx.kind === "entrata" ? "+ " : "− ") + fmt(tx.amount_cents));
    li.append(grow, amt);
    li.addEventListener("click", () => openSheet(tx));
    ul.append(li);
  }
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
  const cats = state.categories.filter((c) => c.kind === kind);
  if (!cats.some((c) => c.id === state.categoryId)) {
    state.categoryId = state.lastCategory[kind] || cats[0]?.id || null;
  }
  renderChips();
}

function renderChips() {
  const box = $("cat-chips");
  box.replaceChildren();
  for (const c of state.categories.filter((c) => c.kind === state.kind)) {
    const b = el("button", "chip" + (c.id === state.categoryId ? " on" : ""));
    b.type = "button";
    b.style.setProperty("--chip-c", c.color);
    const dot = el("span", "dot"); dot.style.background = c.color;
    b.append(dot, document.createTextNode(c.name));
    b.addEventListener("click", () => { state.categoryId = c.id; renderChips(); });
    box.append(b);
  }
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
  if (!tx) $("f-amount").focus({ preventScroll: true });
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
});

$("sheet-delete").addEventListener("click", async () => {
  const tx = state.editing;
  if (!tx) return;
  const label = tx.description || catById(tx.category_id)?.name || "questo movimento";
  if (!confirm(`Eliminare "${label}" da ${fmt(tx.amount_cents)}?`)) return;
  const { error } = await sb.from("transactions").delete().eq("id", tx.id);
  if (error) { setMsg($("sheet-msg"), "Errore: " + traduciErrore(error.message), true); return; }
  closeSheet();
  toast("Movimento eliminato");
  refreshAfterChange(tx.date);
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
//  IMPOSTAZIONI: voci in arrivo
// =========================================================
document.querySelectorAll(".settings li.soon").forEach((li) => {
  li.addEventListener("click", () => toast(`Arriva con la versione ${li.dataset.ver}`));
});

init();
