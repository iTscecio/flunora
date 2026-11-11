// =========================================================
//  Flunora 0.4.0 — IMPORTA ESTRATTO CONTO
//  1. Scegli il PDF  2. Controllo (i conti tornano?)  3. Revisione  4. Fatto
//  Il PDF si legge solo sul dispositivo (pdf.js incluso nell'app). Su Supabase
//  arrivano solo i movimenti confermati, in un'unica operazione annullabile.
//  Usa le funzioni di app.js (sb, state, el, $, fmt, toast, actionSheet, ...).
// =========================================================
const IMP_FEES = "__commissioni__";                // categoria "Commissioni" da creare al momento
const imp = { res: null, items: [], tab: "all", file: "", rules: new Map(), busy: false, batch: null };

// ---------- pannello Importa (Impostazioni › Dati) ----------
$("open-import").addEventListener("click", openImport);
$("import-back").addEventListener("click", () => {
  $("import").classList.remove("open");
  $("import").setAttribute("aria-hidden", "true");
});

function openImport() {
  $("import").scrollTop = 0;
  $("import").classList.add("open");
  $("import").setAttribute("aria-hidden", "false");
  renderImportHistory();
}

const shortDate = (isoStr, year = false) => new Date(isoStr + (isoStr.length === 10 ? "T12:00" : ""))
  .toLocaleDateString("it-IT", year ? { day: "numeric", month: "long", year: "numeric" } : { day: "numeric", month: "short" });
// "il 5 novembre" / "l'11 novembre"
const ilData = (isoStr, year = false) => {
  const d = Number(isoStr.slice(8, 10));
  return ([1, 8, 11].includes(d) ? "l'" : "il ") + shortDate(isoStr, year);
};
const periodText = (a, b) => a && b
  ? `Dal ${new Date(a + "T12:00").toLocaleDateString("it-IT", { day: "numeric", month: "long" })} al ${shortDate(b, true)}` : "";
const scriptMissing = (err) => /import_|schema cache|PGRST20|42P01|42703|function/i.test(`${err?.message} ${err?.code}`);

async function renderImportHistory() {
  const ul = $("import-history");
  const { data, error } = await sb.from("import_batches").select("*").order("created_at", { ascending: false }).limit(20);
  if (error) {
    ul.replaceChildren(el("li", null, scriptMissing(error) ? "Esegui prima lo script 0.4.0 in Supabase." : "Elenco non disponibile."));
    return;
  }
  if (!data.length) { ul.replaceChildren(el("li", "secondary", "Nessuna importazione")); return; }
  ul.replaceChildren(...data.map((b) => {
    const li = el("li", b.undone_at ? "imp-hist undone" : "tap imp-hist");
    const t = el("span", "label");
    t.append(el("b", null, `${b.bank}${b.account ? " · …" + b.account : ""}`),
      el("small", null, [periodText(b.period_from, b.period_to), `importata ${ilData(b.created_at.slice(0, 10))}`].filter(Boolean).join(" · ")));
    li.append(t, el("span", "value", b.undone_at ? "Annullata" : `${b.n_added} mov.`));
    if (!b.undone_at) li.addEventListener("click", () => confirmUndo(b));
    return li;
  }));
}

function confirmUndo(b) {
  actionSheet({
    title: "Annullare questa importazione?",
    message: `Vengono tolti i ${b.n_added} movimenti importati ${ilData(b.created_at.slice(0, 10), true)}, anche se poi li hai modificati. Gli altri movimenti restano.`,
    actions: [{ label: "Annulla importazione", danger: true, onClick: () => undoImport(b.id) }],
  });
}

async function undoImport(batchId) {
  const { data, error } = await sb.rpc("undo_import", { batch: batchId });
  if (error) return toast("Non riuscito: " + traduciErrore(error.message));
  toast(`Importazione annullata · ${data} ${data === 1 ? "movimento tolto" : "movimenti tolti"}`);
  closeImpSheet();
  renderImportHistory();
  refreshPagesAfterImport();
}

function refreshPagesAfterImport() {
  if (state.page === "mesi") loadMonth();
  else if (state.page === "dashboard") loadDashboard();
}

// ---------- 1. lettura del PDF sul dispositivo ----------
let pdfjsPromise = null;
function loadPdfJs() {
  if (!pdfjsPromise) {
    const base = new URL("js/vendor/pdfjs/", location.href).href;
    pdfjsPromise = import(base + "pdf.min.mjs").then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.mjs";
      return lib;
    }).catch((e) => { pdfjsPromise = null; throw e; });
  }
  return pdfjsPromise;
}

async function readPdf(file) {
  const lib = await loadPdfJs();
  const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  const doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    pages.push(tc.items.filter((it) => it.str && it.str.trim())
      .map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5] })));
  }
  try { await task.destroy(); } catch { /* niente */ }
  return pages;
}

$("import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";                 // si può riscegliere lo stesso file
  if (!file || imp.busy) return;
  imp.busy = true;
  imp.file = file.name;
  openImpSheet("Controllo");
  impLoading("Leggo il PDF sul tuo iPhone…");
  try {
    // lo script 0.4.0 c'è?
    const probe = await sb.from("import_batches").select("id").limit(1);
    if (probe.error) return impStop(scriptMissing(probe.error)
      ? ["Manca lo script 0.4.0", "Esegui prima lo script 0.4.0 in Supabase, poi riprova. Non è stato importato nulla."]
      : ["Connessione non riuscita", "Riprova tra poco. Non è stato importato nulla."]);
    let pages;
    try { pages = await readPdf(file); }
    catch { return impStop(["Non riesco a leggere il file", "Assicurati che sia il PDF dell'estratto conto, non una foto o un file protetto. Non è stato importato nulla."]); }
    const res = FlunoraBDP.parse(pages);
    if (res.problems.includes("not_bdp")) return impStop(["Estratto conto non riconosciuto", "Per ora Flunora legge solo l'estratto conto PDF della Banca di Piacenza. Non è stato importato nulla."]);
    if (!res.rows.length) return impStop(["Nessun movimento trovato", "Il file non contiene movimenti da importare."]);
    imp.res = res;
    impLoading("Controllo i movimenti già presenti…");
    await buildItems(res);
    renderCheck();
  } catch (err) {
    impStop(["Qualcosa è andato storto", "Non è stato importato nulla. " + traduciErrore(err?.message || "")]);
  } finally {
    imp.busy = false;
  }
});

// ---------- 2. dai movimenti dell'estratto conto alle proposte ----------
const findCat = (kind, re) => state.categories.find((c) => c.kind === kind && !c.archived && re.test(c.name));
const catByName = (kind, name) => findCat(kind, new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"));
const daysBetween = (a, b) => Math.abs(Date.parse(a + "T12:00") - Date.parse(b + "T12:00")) / 864e5;

async function buildItems(res) {
  const keys = FlunoraBDP.importKeys(res);
  const canoni = FlunoraBDP.pairCanoni(res.rows);
  const items = res.rows.map((r, i) => {
    const c = FlunoraBDP.classify(r, res.owner);
    return { i, row: r, key: keys[i], ...c, status: "ask", categoryId: null, suggest: null, source: "", note: "" };
  });

  // regole ricordate (negozio -> categoria)
  imp.rules = new Map();
  const rules = await sb.from("import_rules").select("pattern, category_id");
  for (const r of rules.data || []) imp.rules.set(r.pattern, r.category_id);

  // movimenti già presenti nello stesso periodo (con 3 giorni di margine)
  const dates = items.map((it) => it.date).concat(res.rows.map((r) => r.date)).sort();
  const pad = (d, n) => { const x = new Date(d + "T12:00"); x.setDate(x.getDate() + n); return isoDate(x); };
  const existing = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("transactions").select("id, date, amount_cents, kind, description, import_key, category_id")
      .gte("date", pad(dates[0], -3)).lte("date", pad(dates.at(-1), 3)).order("date").range(from, from + 999);
    if (error) throw error;
    existing.push(...data);
    if (data.length < 1000) break;
  }
  const importedKeys = new Set(existing.map((t) => t.import_key).filter(Boolean));
  const usedManual = new Set();

  const fees = findCat("uscita", /^commissioni$/i);
  const salary = findCat("entrata", /stipendio/i);

  for (const it of items) {
    if (canoni.has(it.i)) { it.status = "ign"; it.note = "Canone +/− nello stesso giorno: si annullano"; continue; }
    if (it.ignore) { it.status = "ign"; it.note = it.reason; continue; }
    if (importedKeys.has(it.key)) { it.status = "dup"; it.note = "Già importato in precedenza"; continue; }
    // inserito a mano? stesso tipo e importo, data entro 3 giorni
    const twin = existing.find((t) => !t.import_key && !usedManual.has(t.id) && t.kind === it.kind
      && t.amount_cents === it.amount && daysBetween(t.date, it.date) <= 3);
    if (twin) {
      usedManual.add(twin.id);
      it.status = "dup";
      it.note = `Già presente: ${twin.description || catById(twin.category_id)?.name || "movimento"} del ${shortDate(twin.date)}`;
      it.twinOf = twin.id;
      continue;
    }
    // categoria proposta
    let cat = null, weak = false;
    if (it.special === "fee") { cat = fees ? fees.id : IMP_FEES; it.source = fees ? "auto" : "new-cat"; }
    else if (it.special === "salary" && salary) { cat = salary.id; it.source = "auto"; }
    else if (it.merchantKey && imp.rules.has(it.merchantKey)) {
      const c = catById(imp.rules.get(it.merchantKey));
      if (c && !c.archived && c.kind === it.kind) { cat = c.id; it.source = "rule"; }
    }
    if (!cat && it.keyword && it.kind === "uscita") {
      const c = catByName("uscita", it.keyword.cat);
      if (c) { cat = c.id; weak = it.keyword.weak; it.source = "keyword"; }
    }
    if (cat && !weak) { it.status = "new"; it.categoryId = cat; }
    else { it.status = "ask"; it.suggest = cat; }
  }
  imp.items = items;
  imp.tab = "all";
}

// ---------- schermate ----------
function openImpSheet(title) {
  $("imp-title").textContent = title;
  $("imp-cancel").style.visibility = "";
  $("imp-done").hidden = true;
  $("imp-foot").hidden = true;
  $("imp-sheet").scrollTop = 0;
  $("imp-sheet").classList.add("open");
  $("imp-sheet").setAttribute("aria-hidden", "false");
  $("imp-backdrop").classList.add("open");
}
function closeImpSheet() {
  $("imp-sheet").classList.remove("open");
  $("imp-sheet").setAttribute("aria-hidden", "true");
  $("imp-backdrop").classList.remove("open");
}
// chiudere a metà non salva nulla; dopo l'importazione chiude e basta
function cancelImport() {
  if (imp.busy) return;
  closeImpSheet();
  imp.items = []; imp.res = null;
}
$("imp-cancel").addEventListener("click", cancelImport);
$("imp-backdrop").addEventListener("click", cancelImport);
$("imp-done").addEventListener("click", cancelImport);

function impLoading(text) {
  $("imp-foot").hidden = true;
  const box = el("div", "imp-loading");
  box.append(el("span", "spinner"), el("span", "secondary", text));
  $("imp-body").replaceChildren(box);
}

function impStop([title, text]) {
  $("imp-title").textContent = "Importazione";
  const box = el("div", "imp-stop");
  const ic = el("span", "imp-big bad");
  ic.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01"/></svg>';
  box.append(ic, el("h2", null, title), el("p", "secondary", text));
  $("imp-body").replaceChildren(box);
  $("imp-foot").hidden = true;
}

const CHECK_SVG = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const WARN_SVG = '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01"/></svg>';
function checkRow(ok, title, sub) {
  const li = el("li", "imp-check");
  const ic = el("span", "imp-dot " + (ok ? "ok" : "bad"));
  ic.innerHTML = ok ? CHECK_SVG : WARN_SVG;
  const t = el("span", "label");
  t.append(el("b", null, title));
  if (sub) t.append(el("small", null, sub));
  li.append(ic, t);
  return li;
}
const countBy = (st) => imp.items.filter((it) => it.status === st).length;
const money = (c) => (c < 0 ? "− " : "") + fmt(Math.abs(c));

function renderCheck() {
  const res = imp.res;
  $("imp-title").textContent = "Controllo";
  const body = [];
  const head = el("ul", "card list settings");
  const h = el("li", "imp-check");
  const bank = el("span", "ico");
  bank.style.setProperty("--c", "#30b0c7");
  bank.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 10l9-6 9 6M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18"/></svg>';
  const ht = el("span", "label");
  ht.append(el("b", null, `${res.bank}${res.account ? " · conto …" + res.account : ""}`), el("small", null, periodText(res.from, res.to)));
  h.append(bank, ht);
  head.append(h);
  body.push(head);

  const kinds = { carta: 0, stip: 0, bon: 0, altri: 0 };
  for (const it of imp.items) {
    if (it.via === "carta") kinds.carta++;
    else if (it.special === "salary") kinds.stip++;
    else if (/BONIFICO/.test(it.row.type)) kinds.bon++;
    else kinds.altri++;
  }
  const parts = [kinds.carta && `${kinds.carta} pagamenti con carta`, kinds.stip && `${kinds.stip} stipendi`,
    kinds.bon && `${kinds.bon} bonifici`, kinds.altri && `${kinds.altri} altri`].filter(Boolean).join(", ");
  const dups = countBy("dup");
  const checks = el("ul", "card list settings");
  checks.append(
    checkRow(true, `${res.rows.length} movimenti letti`, parts),
    checkRow(res.ok, res.ok ? "I conti tornano" : "I conti non tornano",
      `${money(res.opening ?? 0)} + ${fmt(res.sumIn)} − ${fmt(res.sumOut)} = ${money((res.opening ?? 0) + res.sumIn - res.sumOut)}`
      + (res.ok ? ", come nel saldo finale" : ` invece di ${money(res.closing ?? 0)}`)),
    checkRow(true, dups ? `${dups} ${dups === 1 ? "movimento già presente" : "movimenti già presenti"}` : "Nessun movimento già presente",
      dups ? "Verranno saltati: li trovi tra gli ignorati" : "Né inserito a mano né importato prima"));
  body.push(checks);

  if (!res.ok) {
    body.push(el("p", "imp-note bad", "Flunora potrebbe aver letto male il file, quindi si ferma qui: non è stato importato nulla. Se l'estratto conto è quello giusto, segnalamelo."));
    $("imp-body").replaceChildren(...body);
    $("imp-foot").hidden = true;
    return;
  }
  const sum = el("ul", "card list settings");
  const kv = (a, b, cls = "") => { const li = el("li", "imp-kv " + cls); li.append(el("span", "label", a), el("b", null, String(b))); return li; };
  sum.append(kv("Da importare", countBy("new")), kv("Da confermare", countBy("ask"), "warn"),
    kv("Ignorati (spostamenti tra conti, canone, già presenti)", countBy("ign") + countBy("dup"), "muted"));
  body.push(sum);
  $("imp-body").replaceChildren(...body);
  setFoot("Rivedi i movimenti", "", () => renderReview());
}

function setFoot(label, note, onClick, disabled = false) {
  $("imp-foot").hidden = false;
  const b = $("imp-go");
  b.textContent = label;
  b.disabled = disabled;
  b.onclick = onClick;
  $("imp-foot-note").textContent = note || "";
}

// ---------- 3. revisione ----------
const TABS = [["all", "Tutti"], ["ask", "Dubbi"], ["new", "Nuovi"], ["ign", "Ignorati"]];
const inTab = (it, tab) => tab === "all" || (tab === "ign" ? it.status === "ign" || it.status === "dup" : it.status === tab);

function renderReview() {
  $("imp-title").textContent = "Rivedi";
  const seg = el("div", "segmented imp-tabs");
  for (const [id, label] of TABS) {
    const n = id === "all" ? imp.items.length : imp.items.filter((it) => inTab(it, id)).length;
    const b = el("button", id === imp.tab ? "on" : "");
    b.type = "button";
    b.append(document.createTextNode(label + " "), el("span", id === "ask" && n ? "n warn" : "n", String(n)));
    b.addEventListener("click", () => { imp.tab = id; renderReview(); });
    seg.append(b);
  }
  const body = [seg, el("p", "imp-note", "Tocca un movimento per cambiare la categoria: Flunora se la ricorda per la prossima volta.")];
  const groups = imp.tab === "all"
    ? [["ask", "Da confermare"], ["new", "Nuovi"], ["ign", "Ignorati"]]
    : [[imp.tab, null]];
  for (const [g, title] of groups) {
    const list = imp.items.filter((it) => inTab(it, g)).sort((a, b) => a.date.localeCompare(b.date));
    if (!list.length) continue;
    if (title) body.push(el("h3", "section-title" + (g === "ask" ? " warn" : ""), `${title} · ${list.length}`));
    const ul = el("ul", "card list imp-list");
    ul.append(...list.map(itemRow));
    body.push(ul);
  }
  if (body.length === 2) body.push(el("p", "secondary imp-empty", "Nessun movimento qui."));
  $("imp-body").replaceChildren(...body);
  const n = countBy("new"), ask = countBy("ask");
  setFoot(n ? `Importa ${n} ${n === 1 ? "movimento" : "movimenti"}` : "Nessun movimento da importare",
    ask ? `${ask === 1 ? "Il movimento da confermare resta fuori" : `I ${ask} da confermare restano fuori`} finché non scegli la categoria` : "",
    doImport, n === 0);
}

function catLabel(id) {
  if (id === IMP_FEES) return { name: "Commissioni", color: "#8e8e93", icon: "euro", fresh: true };
  return catById(id);
}

function itemRow(it) {
  const li = el("li", "tap imp-item s-" + it.status);
  const t = el("span", "label");
  t.append(el("b", null, it.title),
    el("small", null, [shortDate(it.date), it.via, it.kind === "entrata" ? "entrata" : ""].filter(Boolean).join(" · ")));
  const chip = el("span", "imp-chip");
  if (it.status === "new") {
    const c = catLabel(it.categoryId);
    chip.append(catIcon(c, "sm"), document.createTextNode(c?.name || "?"));
    if (c?.fresh) chip.append(el("span", "fresh", "nuova"));
  } else if (it.status === "ask") {
    chip.classList.add("ask");
    const s = it.suggest && catLabel(it.suggest);
    chip.textContent = s ? `${s.name}? Conferma ›` : "Scegli la categoria ›";
  } else {
    chip.classList.add("ign");
    chip.textContent = it.note;
  }
  t.append(chip);
  li.append(t, el("span", "amt" + (it.kind === "entrata" ? " in" : ""), (it.kind === "entrata" ? "+ " : "− ") + fmt(it.amount)));
  li.addEventListener("click", () => pickCategory(it));
  return li;
}

function pickCategory(it) {
  const cats = state.categories.filter((c) => c.kind === it.kind && !c.archived);
  const actions = [];
  if (it.status === "ask" && it.suggest) {
    const s = catLabel(it.suggest);
    actions.push({ label: `Sì, ${s.name}`, category: s, onClick: () => setItemCat(it, it.suggest) });
  }
  for (const c of cats) if (c.id !== it.suggest) actions.push({ label: c.name, category: c, onClick: () => setItemCat(it, c.id) });
  if (it.kind === "uscita" && !findCat("uscita", /^commissioni$/i) && it.suggest !== IMP_FEES) {
    actions.push({ label: "Commissioni (nuova)", category: catLabel(IMP_FEES), onClick: () => setItemCat(it, IMP_FEES) });
  }
  if (it.status === "new" || it.status === "ask") actions.push({ label: "Non importare", danger: true, onClick: () => skipItem(it) });
  const msg = it.status === "dup" ? `${it.note}. Scegli una categoria solo se vuoi importarlo comunque.`
    : it.status === "ign" ? `${it.note}. Scegli una categoria solo se vuoi importarlo comunque.`
    : it.merchantKey ? "Flunora userà questa categoria anche le prossime volte per questo negozio." : "";
  actionSheet({ title: `${it.title} · ${(it.kind === "entrata" ? "+ " : "− ") + fmt(it.amount)}`, message: msg, actions });
}

function setItemCat(it, catId) {
  const remember = !!it.merchantKey && it.status !== "dup" && it.status !== "ign";
  it.status = "new"; it.categoryId = catId; it.suggest = null; it.source = "user"; it.remember = remember;
  // stessa scelta per gli altri movimenti dello stesso negozio ancora da decidere
  if (remember) {
    for (const o of imp.items) {
      if (o !== it && o.merchantKey === it.merchantKey && o.kind === it.kind && (o.status === "ask" || (o.status === "new" && o.source !== "user"))) {
        o.status = "new"; o.categoryId = catId; o.suggest = null; o.source = "user";
      }
    }
  }
  renderReview();
}

function skipItem(it) {
  it.status = "ign"; it.note = "Escluso da te"; it.categoryId = null; it.remember = false;
  renderReview();
}

// ---------- 4. importazione ----------
async function doImport() {
  const chosen = imp.items.filter((it) => it.status === "new");
  if (!chosen.length || imp.busy) return;
  imp.busy = true;
  $("imp-go").disabled = true;
  impLoading("Salvo una copia dei tuoi dati e importo…");
  try {
    try { await saveCopy("import"); } catch { /* la copia è un aiuto in più */ }

    // categoria "Commissioni" se serve
    if (chosen.some((it) => it.categoryId === IMP_FEES)) {
      let fees = findCat("uscita", /^commissioni$/i);
      if (!fees) {
        const maxOrder = Math.max(0, ...state.categories.filter((c) => c.kind === "uscita").map((c) => c.sort_order || 0));
        const { data, error } = await sb.from("categories")
          .insert({ name: "Commissioni", kind: "uscita", color: "#8e8e93", icon: "euro", sort_order: maxOrder + 1 }).select().single();
        if (error) throw error;
        fees = data;
        await loadCategories();
      }
      for (const it of chosen) if (it.categoryId === IMP_FEES) it.categoryId = fees.id;
    }

    // regole ricordate
    const rules = new Map();
    for (const it of chosen) if (it.remember && it.merchantKey) rules.set(it.merchantKey, it.categoryId);
    if (rules.size) {
      await sb.from("import_rules").upsert([...rules].map(([pattern, category_id]) =>
        ({ user_id: state.user.id, pattern, category_id, updated_at: new Date().toISOString() })), { onConflict: "user_id,pattern" });
    }

    const meta = { bank: imp.res.bank, account: imp.res.account, period_from: imp.res.from, period_to: imp.res.to, file_name: imp.file };
    const rows = chosen.map((it) => ({
      date: it.date, amount_cents: it.amount, kind: it.kind, category_id: it.categoryId,
      description: it.description || it.title, import_key: it.key,
    }));
    const { data, error } = await sb.rpc("import_transactions", { meta, rows });
    if (error) throw error;
    imp.batch = data;
    renderDone(chosen, data, rules.size);
    renderImportHistory();
    refreshPagesAfterImport();
  } catch (err) {
    impStop(["Importazione non riuscita", "Non è stato importato nulla. " + traduciErrore(err?.message || "")]);
  } finally {
    imp.busy = false;
  }
}

function renderDone(chosen, result, nRules) {
  $("imp-title").textContent = "Fatto";
  $("imp-cancel").style.visibility = "hidden";   // resta lo spazio: "Fine" sta a destra
  $("imp-done").hidden = false;
  const box = el("div", "imp-stop");
  const ic = el("span", "imp-big ok");
  ic.innerHTML = CHECK_SVG;
  const n = result.added;
  box.append(ic, el("h2", null, `${n} ${n === 1 ? "movimento importato" : "movimenti importati"}`), el("p", "secondary", periodText(imp.res.from, imp.res.to)));
  const sum = el("ul", "card list settings");
  const kv = (a, b) => { const li = el("li", "imp-kv"); li.append(el("span", "label", a), el("b", null, String(b))); return li; };
  sum.append(kv("Entrate", chosen.filter((it) => it.kind === "entrata").length), kv("Uscite", chosen.filter((it) => it.kind === "uscita").length),
    kv("Non importati", imp.items.length - chosen.length));
  if (result.skipped) sum.append(kv("Già presenti, saltati", result.skipped));
  if (nRules) sum.append(kv("Negozi ricordati per la prossima volta", nRules));
  const undo = el("button", "imp-undo", "Annulla questa importazione");
  undo.type = "button";
  undo.addEventListener("click", () => confirmUndo({ id: result.batch_id, n_added: n, created_at: new Date().toISOString() }));
  $("imp-body").replaceChildren(box, sum, el("p", "imp-note", "Prima di importare Flunora ha salvato una copia dei tuoi dati."), undo,
    el("p", "imp-note", "Puoi annullarla anche più tardi da Impostazioni › Importa estratto conto."));
  const month = (imp.res?.to || isoDate(new Date())).slice(0, 7);
  setFoot("Vai a Mesi", "", () => {
    cancelImport();
    $("import").classList.remove("open");
    $("import").setAttribute("aria-hidden", "true");
    if ($("settings").classList.contains("open")) closeSettings();
    location.hash = "#mesi/" + month;
  });
}
// (il pannello si chiude anche trascinandolo in basso: attachSheetDrag in app.js, tramite lo sfondo)
