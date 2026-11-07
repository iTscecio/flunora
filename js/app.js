// =========================================================
//  Flunora — logica dell'app (passo 1: login + pagina mese)
// =========================================================

const sb = window.supabase.createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_KEY
);

// ---------- stato ----------
const state = {
  user: null,
  categories: [],       // tutte le categorie dell'utente
  transactions: [],     // movimenti del mese visualizzato
  month: firstOfMonth(new Date()), // primo giorno del mese visualizzato
  editingId: null,      // id del movimento in modifica (null = nuovo)
};

// ---------- utilità ----------
const $ = (id) => document.getElementById(id);
let euro;
try { euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }); }
catch { euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }); }
const fmt = (cents) => euro.format(cents / 100);
const monthName = (d) => d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
const monthShort = (d) => d.toLocaleDateString("it-IT", { month: "long" });

function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }

// Data in formato AAAA-MM-GG senza passare dal fuso orario UTC
function isoDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// "12,50" / "12.50" / "1.250,00" -> 1250 (centesimi). Restituisce null se non valido.
function parseAmount(text) {
  let s = String(text).trim().replace(/\s|€/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function setMsg(el, text, isError = false) {
  el.textContent = text || "";
  el.classList.toggle("error", isError);
}

// =========================================================
//  AUTENTICAZIONE
// =========================================================
async function init() {
  const { data } = await sb.auth.getSession();
  handleSession(data.session);
  sb.auth.onAuthStateChange((_event, session) => handleSession(session));
}

let sessionChecked = false;
function handleSession(session) {
  const user = session?.user ?? null;
  if (sessionChecked && user?.id === state.user?.id) return; // nessun cambiamento
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
  if (error) setMsg(msg, traduciErrore(error.message), true);
  else setMsg(msg, "");
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
  else if (!data.session) setMsg(msg, "Registrazione fatta: controlla la tua email e conferma l'account, poi accedi.");
  else setMsg(msg, "");
});

$("btn-logout").addEventListener("click", () => sb.auth.signOut());

function traduciErrore(m) {
  if (/invalid login credentials/i.test(m)) return "Email o password errate.";
  if (/email not confirmed/i.test(m)) return "Devi prima confermare l'email (controlla la posta).";
  if (/already registered/i.test(m)) return "Questa email è già registrata: usa Accedi.";
  if (/signups not allowed/i.test(m)) return "Le nuove registrazioni sono disattivate.";
  return m;
}

// =========================================================
//  AVVIO APP
// =========================================================
async function startApp() {
  await loadCategories();
  resetForm();
  await loadMonth();
}

async function loadCategories() {
  const { data, error } = await sb
    .from("categories")
    .select("*")
    .order("kind")
    .order("sort_order");
  if (error) { alert("Errore nel caricare le categorie: " + error.message); return; }
  state.categories = data;
  fillCategorySelect();
  fillFilterSelect();
}

const catById = (id) => state.categories.find((c) => c.id === id);

// =========================================================
//  MESE: caricamento e disegno
// =========================================================
async function loadMonth() {
  const from = isoDate(state.month);
  const to = isoDate(addMonths(state.month, 1));
  const { data, error } = await sb
    .from("transactions")
    .select("*")
    .gte("date", from)
    .lt("date", to)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) { alert("Errore nel caricare i movimenti: " + error.message); return; }
  state.transactions = data;
  render();
}

function render() {
  $("month-label").textContent = monthName(state.month);
  $("prev-label").textContent = monthShort(addMonths(state.month, -1));
  $("next-label").textContent = monthShort(addMonths(state.month, 1));
  $("list-title").textContent = "Movimenti di " + monthShort(state.month);
  renderKpis();
  renderDonut();
  renderList();
}

function totals() {
  const t = { entrata: 0, uscita: 0, investimento: 0 };
  for (const tx of state.transactions) t[tx.kind] += tx.amount_cents;
  return t;
}

function renderKpis() {
  const t = totals();
  const saldo = t.entrata - t.uscita - t.investimento;
  $("kpi-entrate").textContent = fmt(t.entrata);
  $("kpi-uscite").textContent = fmt(t.uscita);
  $("kpi-invest").textContent = fmt(t.investimento);
  const s = $("kpi-saldo");
  s.textContent = (saldo > 0 ? "+ " : "") + fmt(saldo);
  s.style.color = saldo < 0 ? "var(--bad)" : "";
}

// Ciambella SVG delle sole uscite, raggruppate per categoria
function renderDonut() {
  const wrap = $("donut-wrap");
  wrap.replaceChildren();

  const byCat = new Map();
  for (const tx of state.transactions) {
    if (tx.kind !== "uscita") continue;
    byCat.set(tx.category_id, (byCat.get(tx.category_id) || 0) + tx.amount_cents);
  }
  const total = [...byCat.values()].reduce((a, b) => a + b, 0);
  if (total === 0) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Nessuna spesa registrata.";
    wrap.append(p);
    return;
  }

  const items = [...byCat.entries()]
    .map(([id, cents]) => ({ cat: catById(id), cents }))
    .sort((a, b) => b.cents - a.cents);

  const NS = "http://www.w3.org/2000/svg";
  const size = 150, r = 56, stroke = 22, C = 2 * Math.PI * r;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Spese per categoria");

  let offset = 0;
  for (const it of items) {
    const len = (it.cents / total) * C;
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", size / 2);
    c.setAttribute("cy", size / 2);
    c.setAttribute("r", r);
    c.setAttribute("fill", "none");
    c.setAttribute("stroke", it.cat?.color || "#888");
    c.setAttribute("stroke-width", stroke);
    c.setAttribute("stroke-dasharray", `${len} ${C - len}`);
    c.setAttribute("stroke-dashoffset", -offset);
    c.setAttribute("transform", `rotate(-90 ${size / 2} ${size / 2})`);
    svg.append(c);
    offset += len;
  }
  const label = document.createElementNS(NS, "text");
  label.setAttribute("x", size / 2);
  label.setAttribute("y", size / 2 + 5);
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("font-size", "13");
  label.setAttribute("font-weight", "600");
  label.setAttribute("fill", "currentColor");
  label.textContent = fmt(total);
  svg.append(label);

  const ul = document.createElement("ul");
  ul.className = "legend";
  for (const it of items) {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = it.cat?.color || "#888";
    const name = document.createElement("span");
    name.textContent = it.cat?.name || "?";
    const val = document.createElement("span");
    val.className = "val";
    val.textContent = fmt(it.cents);
    const pct = document.createElement("span");
    pct.className = "pct";
    pct.textContent = Math.round((it.cents / total) * 100) + "%";
    li.append(dot, name, val, pct);
    ul.append(li);
  }
  wrap.append(svg, ul);
}

function renderList() {
  const ul = $("tx-list");
  ul.replaceChildren();
  const filter = $("filter-cat").value;
  const rows = state.transactions.filter((tx) => !filter || tx.category_id === filter);
  $("tx-empty").hidden = rows.length > 0;

  for (const tx of rows) {
    const cat = catById(tx.category_id);
    const li = document.createElement("li");
    if (tx.id === state.editingId) li.classList.add("editing");

    const date = document.createElement("span");
    date.className = "tx-date";
    const [y, m, d] = tx.date.split("-").map(Number);
    date.textContent = new Date(y, m - 1, d).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

    const main = document.createElement("div");
    main.className = "tx-main";
    main.title = "Clicca per modificare";
    const desc = document.createElement("div");
    desc.className = "tx-desc";
    desc.textContent = tx.description || cat?.name || "Movimento";
    const sub = document.createElement("div");
    sub.className = "tx-cat";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = cat?.color || "#888";
    const kindLabel = { entrata: "Entrata", uscita: "", investimento: "Investimento" }[tx.kind];
    sub.append(dot, document.createTextNode([kindLabel, cat?.name].filter(Boolean).join(" · ")));
    main.append(desc, sub);
    main.addEventListener("click", () => startEdit(tx));

    const amt = document.createElement("span");
    amt.className = "tx-amt" + (tx.kind === "entrata" ? " in" : "");
    amt.textContent = (tx.kind === "entrata" ? "+ " : "− ") + fmt(tx.amount_cents);

    const del = document.createElement("button");
    del.className = "tx-del";
    del.textContent = "✕";
    del.title = "Elimina";
    del.setAttribute("aria-label", "Elimina movimento");
    del.addEventListener("click", () => deleteTx(tx));

    li.append(date, main, amt, del);
    ul.append(li);
  }
}

// =========================================================
//  MODULO: inserimento e modifica
// =========================================================
function fillCategorySelect() {
  const kind = $("f-kind").value;
  const sel = $("f-category");
  const prev = sel.value;
  sel.replaceChildren();
  for (const c of state.categories.filter((c) => c.kind === kind)) {
    sel.append(new Option(c.name, c.id));
  }
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

function fillFilterSelect() {
  const sel = $("filter-cat");
  sel.replaceChildren(new Option("Tutte le categorie", ""));
  const groups = { uscita: "Uscite", entrata: "Entrate", investimento: "Investimenti" };
  for (const [kind, label] of Object.entries(groups)) {
    const og = document.createElement("optgroup");
    og.label = label;
    for (const c of state.categories.filter((c) => c.kind === kind)) og.append(new Option(c.name, c.id));
    sel.append(og);
  }
}

// Data proposta: oggi se si sta guardando il mese corrente, altrimenti il 1° del mese
function defaultDate() {
  const today = new Date();
  return firstOfMonth(today).getTime() === state.month.getTime() ? isoDate(today) : isoDate(state.month);
}

function resetForm() {
  state.editingId = null;
  $("f-amount").value = "";
  $("f-desc").value = "";
  $("f-date").value = defaultDate();
  $("form-title").textContent = "Aggiungi movimento";
  $("f-submit").textContent = "Salva";
  $("f-cancel").hidden = true;
  fillCategorySelect();
}

function startEdit(tx) {
  state.editingId = tx.id;
  $("f-kind").value = tx.kind;
  fillCategorySelect();
  $("f-category").value = tx.category_id;
  $("f-amount").value = (tx.amount_cents / 100).toFixed(2).replace(".", ",");
  $("f-date").value = tx.date;
  $("f-desc").value = tx.description || "";
  $("form-title").textContent = "Modifica movimento";
  $("f-submit").textContent = "Aggiorna";
  $("f-cancel").hidden = false;
  setMsg($("form-msg"), "");
  renderList();
  $("tx-form").scrollIntoView({ behavior: "smooth", block: "center" });
  $("f-amount").focus();
}

$("f-kind").addEventListener("change", fillCategorySelect);
$("f-cancel").addEventListener("click", () => { resetForm(); setMsg($("form-msg"), ""); renderList(); });
$("filter-cat").addEventListener("change", renderList);

$("tx-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("form-msg");
  const amount = parseAmount($("f-amount").value);
  if (amount === null) { setMsg(msg, "Importo non valido (es. 12,50).", true); $("f-amount").focus(); return; }
  if (!$("f-category").value) { setMsg(msg, "Scegli una categoria.", true); return; }

  const row = {
    amount_cents: amount,
    kind: $("f-kind").value,
    category_id: $("f-category").value,
    date: $("f-date").value,
    description: $("f-desc").value.trim() || null,
  };

  const btn = $("f-submit");
  btn.disabled = true;
  const query = state.editingId
    ? sb.from("transactions").update(row).eq("id", state.editingId)
    : sb.from("transactions").insert(row);
  const { error } = await query;
  btn.disabled = false;

  if (error) { setMsg(msg, "Errore nel salvataggio: " + error.message, true); return; }

  const wasEdit = !!state.editingId;
  // Se la data cade in un altro mese, ci spostiamo lì per mostrarla
  const [y, m] = row.date.split("-").map(Number);
  const target = new Date(y, m - 1, 1);
  const kind = row.kind, cat = row.category_id;
  if (target.getTime() !== state.month.getTime()) state.month = target;
  resetForm();
  // mantiene tipo e categoria dell'ultimo inserimento per velocizzare il successivo
  $("f-kind").value = kind; fillCategorySelect(); $("f-category").value = cat;
  setMsg(msg, wasEdit ? "Movimento aggiornato." : "Movimento salvato.");
  await loadMonth();
  $("f-amount").focus();
});

async function deleteTx(tx) {
  const label = tx.description || catById(tx.category_id)?.name || "questo movimento";
  if (!confirm(`Eliminare "${label}" da ${fmt(tx.amount_cents)}?`)) return;
  const { error } = await sb.from("transactions").delete().eq("id", tx.id);
  if (error) { alert("Errore nell'eliminazione: " + error.message); return; }
  if (state.editingId === tx.id) resetForm();
  await loadMonth();
}

// ---------- navigazione mese ----------
$("prev-month").addEventListener("click", () => changeMonth(-1));
$("next-month").addEventListener("click", () => changeMonth(1));
function changeMonth(n) {
  state.month = addMonths(state.month, n);
  if (!state.editingId) $("f-date").value = defaultDate();
  loadMonth();
}

// ---------- pulsante + su telefono ----------
$("fab").addEventListener("click", () => {
  $("tx-form").scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => $("f-amount").focus(), 300);
});

init();
