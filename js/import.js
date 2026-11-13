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
const PDFJS_BASE = () => new URL("js/vendor/pdfjs/", location.href).href;

// Safari non sa scorrere un ReadableStream con "for await" (Chrome sì): pdf.js lo usa
// per leggere il testo. Aggiungiamo noi questa capacità (bug #005).
function polyfillStreams() {
  const RS = globalThis.ReadableStream;
  if (!RS || RS.prototype[Symbol.asyncIterator]) return;
  async function* values() {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
  Object.defineProperty(RS.prototype, Symbol.asyncIterator, { value: values, writable: true, configurable: true });
  if (!RS.prototype.values) Object.defineProperty(RS.prototype, "values", { value: values, writable: true, configurable: true });
}

// il lettore lavora nella pagina (non in un worker separato, dove la correzione sopra non arriva):
// per un estratto conto di poche pagine è veloce uguale
function loadPdfJs() {
  if (!pdfjsPromise) {
    polyfillStreams();
    pdfjsPromise = Promise.all([import(PDFJS_BASE() + "pdf.min.mjs"), import(PDFJS_BASE() + "pdf.worker.min.mjs")])
      .then(([lib, worker]) => {
        globalThis.pdfjsWorker = worker;
        lib.GlobalWorkerOptions.workerSrc = PDFJS_BASE() + "pdf.worker.min.mjs";
        return lib;
      }).catch((e) => { pdfjsPromise = null; e.stage = "caricamento"; throw e; });
  }
  return pdfjsPromise;
}

// testo di una pagina letto pezzo per pezzo, senza "for await" (che Safari non ha sugli stream)
async function pageText(page) {
  if (!page.streamTextContent) return page.getTextContent();
  const reader = page.streamTextContent().getReader();
  const out = { items: [] };
  while (true) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.items.push(...value.items);
  }
}

// solo il testo: niente font, immagini, canvas o WebAssembly
async function extractText(lib, data) {
  const task = lib.getDocument({
    data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, enableXfa: false,
    isOffscreenCanvasSupported: false, isImageDecoderSupported: false, useWasm: false, stopAtErrors: false,
  });
  try {
    const doc = await task.promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await pageText(await doc.getPage(i));
      pages.push(tc.items.filter((it) => it.str && it.str.trim())
        .map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5] })));
    }
    return pages;
  } finally {
    try { await task.destroy(); } catch { /* niente */ }
  }
}

async function readPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const lib = await loadPdfJs();
  return extractText(lib, data);
}

// testo breve dell'errore, da mostrare per capire cosa non va
const errDetail = (e) => {
  const one = (x) => x ? `${x.name || "Errore"}: ${String(x.message || x).slice(0, 160)}` : "";
  return [e?.stage ? `[${e.stage}]` : "", one(e), e?.first && e.first !== e ? "· prima: " + one(e.first) : ""]
    .filter(Boolean).join(" ") + ` · ${navigator.userAgent.match(/OS [\d_]+|Version\/[\d.]+|Chrome\/\d+/g)?.join(" ") || ""}`;
};

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
    catch (err) {
      if (/password/i.test(err?.name || "")) return impStop(["Il PDF è protetto da password", "Scarica di nuovo l'estratto conto senza password e riprova. Non è stato importato nulla."]);
      return impStop(err?.stage === "caricamento"
        ? ["Non riesco ad aprire il lettore di PDF", "Controlla la connessione e riprova. Non è stato importato nulla."]
        : ["Non riesco a leggere il file", "Assicurati che sia il PDF dell'estratto conto, non una foto. Non è stato importato nulla."], errDetail(err));
    }
    const res = FlunoraBDP.parse(pages);
    if (res.problems.includes("not_bdp")) return impStop(["Estratto conto non riconosciuto", "Per ora Flunora legge solo l'estratto conto PDF della Banca di Piacenza. Non è stato importato nulla."]);
    if (!res.rows.length) return impStop(["Nessun movimento trovato", "Il file non contiene movimenti da importare."]);
    imp.res = res;
    impLoading("Controllo i movimenti già presenti…");
    await buildItems(res);
    renderCheck();
  } catch (err) {
    impStop(["Qualcosa è andato storto", "Non è stato importato nulla. " + traduciErrore(err?.message || "")], errDetail(err));
  } finally {
    imp.busy = false;
  }
});

// ---------- 2. dai movimenti dell'estratto conto alle proposte ----------
const findCat = (kind, re) => state.categories.find((c) => c.kind === kind && !c.archived && re.test(c.name));
const catByName = (kind, name) => findCat(kind, new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"));
const daysBetween = (a, b) => Math.abs(Date.parse(a + "T12:00") - Date.parse(b + "T12:00")) / 864e5;

// IMPR-013 (0.6.4): abbonamenti e periodici. L'addebito sull'estratto conto può arrivare
// qualche giorno prima o dopo la data del periodico, e con un prezzo diverso.
const REC_DAYS = 5;
const normTxt = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const REC_STOP = new Set(["abbonamento", "pagamento", "mensile", "annuale", "rata", "the", "com", "www", "per", "con", "del", "della", "di", "srl", "spa"]);
// il nome dell'abbonamento compare nel testo dell'estratto conto? ("Netflix" ↔ "Netflix.com Amsterdam")
function recNameMatch(rec, it) {
  const text = " " + normTxt([it.title, it.description, it.row?.type, it.row?.detail].filter(Boolean).join(" ")) + " ";
  const words = normTxt(rec.description).split(" ").filter((w) => w.length >= 3 && !REC_STOP.has(w));
  if (!words.length) return false;
  const joined = words.join("");                       // "Disney Plus" ↔ "DisneyPlus"
  return words.some((w) => w.length >= 4 && text.includes(" " + w)) || text.replace(/ /g, "").includes(joined)
    || (words.length === 1 && text.includes(" " + words[0] + " "));
}

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
    const { data, error } = await sb.from("transactions").select("id, date, amount_cents, kind, description, import_key, category_id, recurring_id")
      .gte("date", pad(dates[0], -3)).lte("date", pad(dates.at(-1), 3)).order("date").range(from, from + 999);
    if (error) throw error;
    existing.push(...data);
    if (data.length < 1000) break;
  }
  const importedKeys = new Set(existing.map((t) => t.import_key).filter(Boolean));
  const usedManual = new Set();

  const fees = findCat("uscita", /^commissioni$/i);
  const salary = findCat("entrata", /stipendio/i);

  // 0.4.6: anticipi (se lo script 0.4.5 non è stato eseguito, si va avanti senza)
  let advances = [], shares = [];
  {
    const [a, q] = await Promise.all([
      sb.from("advances").select("id, date, description, total_cents, own_cents"),
      sb.from("advance_shares").select("id, advance_id, person, amount_cents, status, closed_on"),
    ]);
    if (!a.error && !q.error) { advances = a.data; shares = q.data; }
  }
  const advById = new Map(advances.map((a) => [a.id, a]));
  const usedAdv = new Set(), usedShare = new Set();

  // IMPR-013: periodici attivi (senza lo script 0.6.0 si va avanti senza)
  let recs = [];
  try { recs = (await loadRecurring()).filter((r) => r.active && r.kind !== "risparmio"); } catch { recs = []; }
  const recById = new Map(recs.map((r) => [r.id, r]));
  const usedRec = new Set();

  for (const it of items) {
    if (canoni.has(it.i)) { it.status = "ign"; it.note = "Canone +/− nello stesso giorno: si annullano"; continue; }
    if (it.ignore) { it.status = "ign"; it.note = it.reason; continue; }
    if (importedKeys.has(it.key)) { it.status = "dup"; it.note = "Già importato in precedenza"; continue; }
    // IMPR-013: addebito di un abbonamento già aggiunto da Flunora, con qualche giorno
    // di scarto o con un prezzo diverso
    {
      const recTx = existing.filter((t) => t.recurring_id && !t.import_key && !usedManual.has(t.id) && t.kind === it.kind
        && daysBetween(t.date, it.date) <= REC_DAYS)
        .map((t) => ({ t, rec: recById.get(t.recurring_id) }))
        .filter(({ t, rec }) => t.amount_cents === it.amount ? true : rec && recNameMatch(rec, it))
        .sort((a, b) => (a.t.amount_cents !== it.amount) - (b.t.amount_cents !== it.amount) || daysBetween(a.t.date, it.date) - daysBetween(b.t.date, it.date));
      const hit = recTx[0];
      if (hit) {
        usedManual.add(hit.t.id);
        const name = hit.rec?.description || hit.t.description || "periodico";
        it.twinOf = hit.t.id;
        if (hit.t.amount_cents === it.amount) {
          it.status = "dup";
          it.note = `Già presente: ${name} del ${shortDate(hit.t.date)}`;
        } else {
          // stesso abbonamento, prezzo diverso: si corregge l'addebito invece di aggiungerne un altro
          it.status = "rec";
          it.recFix = { tx: hit.t, rec: hit.rec || null, name, updatePrice: !!(hit.rec && hit.rec.amount_cents === hit.t.amount_cents) };
        }
        continue;
      }
    }
    // IMPR-013: addebito arrivato prima che Flunora aggiungesse il periodico
    {
      const cand = recs.filter((r) => !usedRec.has(r.id) && r.kind === it.kind).map((rec) => ({ rec, d: recNext(rec, rec.last_date) }))
        .filter(({ rec, d }) => d && daysBetween(d, it.date) <= REC_DAYS
          && (recNameMatch(rec, it) || (rec.amount_cents === it.amount && daysBetween(d, it.date) <= 2)))
        .sort((a, b) => daysBetween(a.d, it.date) - daysBetween(b.d, it.date));
      if (cand[0]) {
        const { rec, d } = cand[0];
        usedRec.add(rec.id);
        const cat = catById(rec.category_id);
        it.status = cat && !cat.archived ? "new" : "ask";
        it.categoryId = it.status === "new" ? rec.category_id : null;
        it.source = "rec";
        it.description = rec.description;
        it.recLink = { rec, d, updatePrice: rec.amount_cents !== it.amount };
        continue;
      }
    }
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
    // 0.4.6: pagamento di un anticipo già segnato? stesso totale, data entro 3 giorni
    if (it.kind === "uscita") {
      const adv = advances.find((a) => !usedAdv.has(a.id) && a.total_cents === it.amount && daysBetween(a.date, it.date) <= 3);
      if (adv) {
        usedAdv.add(adv.id);
        it.status = "dup";
        it.note = `Già negli Anticipi: ${adv.description}`;
        continue;
      }
    }
    // 0.4.6: restituzione di una quota? stesso importo, dopo la data dell'anticipo
    if (it.kind === "entrata") {
      const fit = (q) => !usedShare.has(q.id) && q.amount_cents === it.amount && advById.get(q.advance_id)?.date <= it.date;
      // già segnata a mano come "Restituito sul conto" entro 7 giorni: è un doppione
      const done = shares.find((q) => fit(q) && q.status === "conto" && daysBetween(q.closed_on, it.date) <= 7);
      if (done) {
        usedShare.add(done.id);
        it.status = "dup";
        it.note = `Già segnata come restituzione di ${done.person}`;
        continue;
      }
      const open = shares.filter((q) => fit(q) && q.status === "aperta");
      if (open.length) {
        it.status = "ask";
        it.advOptions = open.slice(0, 4).map((q) => ({ share: q, adv: advById.get(q.advance_id) }));
        continue;
      }
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

function impStop([title, text], detail = "") {
  $("imp-title").textContent = "Importazione";
  const box = el("div", "imp-stop");
  const ic = el("span", "imp-big bad");
  ic.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01"/></svg>';
  box.append(ic, el("h2", null, title), el("p", "secondary", text));
  if (detail) box.append(el("p", "imp-detail", "Dettaglio tecnico (mandamelo con uno screenshot): " + detail));
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
  const recN = imp.items.filter((it) => it.recLink || it.recFix).length;
  if (recN) sum.append(kv("Abbonamenti riconosciuti", recN));
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
const inTab = (it, tab) => tab === "all" || (tab === "ign" ? it.status === "ign" || it.status === "dup"
  : tab === "new" ? it.status === "new" || it.status === "adv" || it.status === "rec" : it.status === tab);

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
  const n = countBy("new"), ask = countBy("ask"), back = countBy("adv"), fix = countBy("rec");
  const notes = [];
  if (fix) notes.push(`${fix === 1 ? "1 addebito di un abbonamento viene corretto" : `${fix} addebiti di abbonamenti vengono corretti`} con l'importo dell'estratto conto`);
  if (back) notes.push(`${back === 1 ? "1 restituzione chiude la sua quota" : `${back} restituzioni chiudono le loro quote`} negli Anticipi`);
  if (ask) notes.push(`${ask === 1 ? "Il movimento da confermare resta fuori" : `I ${ask} da confermare restano fuori`} finché non scegli la categoria`);
  setFoot(n ? `Importa ${n} ${n === 1 ? "movimento" : "movimenti"}` : back || fix ? "Conferma" : "Nessun movimento da importare",
    notes.join(". "), doImport, n + back + fix === 0);
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
  if (it.status === "rec") {
    // IMPR-013: abbonamento già in Flunora con un altro importo
    chip.classList.add("rec");
    chip.append(document.createTextNode(`${it.recFix.name} · era ${fmt(it.recFix.tx.amount_cents)}`));
    if (it.recFix.updatePrice) chip.append(el("span", "fresh rec", "nuovo prezzo"));
  } else if (it.status === "adv") {
    chip.classList.add("adv");
    chip.textContent = `Restituzione di ${it.advShare.person} · ${it.advDesc}`;
  } else if (it.status === "ask" && it.advOptions) {
    chip.classList.add("ask");
    const o = it.advOptions[0];
    chip.textContent = it.advOptions.length === 1 ? `Restituzione di ${o.share.person}? ›` : "Restituzione di un anticipo? ›";
  } else if (it.status === "new") {
    const c = catLabel(it.categoryId);
    chip.append(catIcon(c, "sm"), document.createTextNode(c?.name || "?"));
    if (c?.fresh) chip.append(el("span", "fresh", "nuova"));
    if (it.recLink) chip.append(el("span", "fresh rec", it.recLink.updatePrice ? `${it.recLink.rec.description} · nuovo prezzo` : it.recLink.rec.description));
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

// IMPR-013: scelte per un addebito riconosciuto come abbonamento
function pickRec(it) {
  const f = it.recFix, l = it.recLink;
  const rec = f ? f.rec : l.rec;
  const from = f ? f.tx.amount_cents : rec.amount_cents;
  const year = (d) => Math.abs(rec?.frequency === "anno" ? d : d * 12);
  const diff = it.amount - from;
  const actions = [];
  if (f) {
    if (rec) actions.push({ label: `Correggi l'addebito e usa ${fmt(it.amount)} dai prossimi`, onClick: () => { it.status = "rec"; f.updatePrice = true; renderReview(); } });
    actions.push({ label: "Correggi solo questo addebito", onClick: () => { it.status = "rec"; f.updatePrice = false; renderReview(); } });
    actions.push({ label: "Importalo come movimento a parte", onClick: () => { delete it.recFix; it.status = "ask"; it.twinOf = null; pickCategory(it); } });
  } else {
    if (diff) actions.push({ label: `Sì, e usa ${fmt(it.amount)} dai prossimi`, onClick: () => { l.updatePrice = true; renderReview(); } });
    actions.push({ label: diff ? "Sì, ma cambia solo questo addebito" : `Sì, è ${rec.description}`, onClick: () => { l.updatePrice = false; renderReview(); } });
    actions.push({ label: "No, non è l'abbonamento", onClick: () => { delete it.recLink; it.source = ""; it.description = it.title; it.status = "ask"; pickCategory(it); } });
  }
  actions.push({ label: "Non importare", danger: true, onClick: () => { delete it.recFix; delete it.recLink; skipItem(it); } });
  const msg = f
    ? `Flunora l'aveva già aggiunto il ${shortDate(f.tx.date)} a ${fmt(from)}; l'estratto conto dice ${fmt(it.amount)}. Non diventa un doppione: si corregge l'importo.`
      + (rec ? ` Se il prezzo è cambiato: ${diff > 0 ? "+" : "−"}${fmt(year(diff))} all'anno.` : "")
    : `È l'addebito di ${rec.description} previsto il ${shortDate(l.d)}: viene collegato all'abbonamento e Flunora non lo aggiunge una seconda volta.`
      + (diff ? ` Il prezzo era ${fmt(from)}: ${diff > 0 ? "+" : "−"}${fmt(year(diff))} all'anno.` : "");
  actionSheet({ title: `${f ? f.name : rec.description} · ${(it.kind === "entrata" ? "+ " : "− ") + fmt(it.amount)}`, message: msg, actions });
}

function pickCategory(it) {
  if (it.recFix || (it.recLink && it.status === "new")) return pickRec(it);
  const cats = state.categories.filter((c) => c.kind === it.kind && !c.archived);
  const actions = [];
  // 0.4.6: collega l'entrata a una quota da restituire (non diventa un movimento)
  for (const o of it.advOptions || []) {
    if (it.status === "adv" && it.advShare?.id === o.share.id) continue;
    actions.push({ label: `Sì, ${o.share.person} · ${o.adv?.description || "anticipo"}`, onClick: () => setItemAdv(it, o) });
  }
  if (it.status === "ask" && it.suggest) {
    const s = catLabel(it.suggest);
    actions.push({ label: `Sì, ${s.name}`, category: s, onClick: () => setItemCat(it, it.suggest) });
  }
  for (const c of cats) if (c.id !== it.suggest) actions.push({ label: c.name, category: c, onClick: () => setItemCat(it, c.id) });
  if (it.kind === "uscita" && !findCat("uscita", /^commissioni$/i) && it.suggest !== IMP_FEES) {
    actions.push({ label: "Commissioni (nuova)", category: catLabel(IMP_FEES), onClick: () => setItemCat(it, IMP_FEES) });
  }
  if (it.status === "new" || it.status === "ask") actions.push({ label: "Non importare", danger: true, onClick: () => skipItem(it) });
  const msg = it.advOptions && it.status !== "adv"
    ? "È la restituzione di un anticipo? Se sì, Flunora chiude la quota e non la conta come entrata."
    : it.status === "adv" ? "Scegli una categoria per importarlo invece come entrata." : it.status === "dup" ? `${it.note}. Scegli una categoria solo se vuoi importarlo comunque.`
    : it.status === "ign" ? `${it.note}. Scegli una categoria solo se vuoi importarlo comunque.`
    : it.merchantKey ? "Flunora userà questa categoria anche le prossime volte per questo negozio." : "";
  actionSheet({ title: `${it.title} · ${(it.kind === "entrata" ? "+ " : "− ") + fmt(it.amount)}`, message: msg, actions });
}

function setItemAdv(it, o) {
  it.status = "adv"; it.advShare = o.share; it.advDesc = o.adv?.description || "anticipo";
  it.categoryId = null; it.suggest = null; it.remember = false;
  renderReview();
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
  delete it.recFix; delete it.recLink;
  it.status = "ign"; it.note = "Escluso da te"; it.categoryId = null; it.remember = false;
  renderReview();
}

// ---------- 4. importazione ----------
async function doImport() {
  const chosen = imp.items.filter((it) => it.status === "new");
  const backs = imp.items.filter((it) => it.status === "adv"); // 0.4.6
  const fixes = imp.items.filter((it) => it.status === "rec" && it.recFix); // IMPR-013
  if ((!chosen.length && !backs.length && !fixes.length) || imp.busy) return;
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
    let data = { added: 0, skipped: 0, batch_id: null };
    if (rows.length) {
      const r = await sb.rpc("import_transactions", { meta, rows });
      if (r.error) throw r.error;
      data = r.data;
    }
    // 0.4.6: quote restituite sul conto, con la data dell'estratto conto
    for (const it of backs) {
      const { error } = await sb.from("advance_shares").update({ status: "conto", closed_on: it.date })
        .eq("id", it.advShare.id).eq("status", "aperta");
      if (error) throw error;
    }
    // IMPR-013: addebiti collegati agli abbonamenti
    const prices = new Map();   // abbonamento -> nuovo prezzo
    const linked = chosen.filter((it) => it.recLink);
    for (const it of linked) {
      const { rec, d } = it.recLink;
      await sb.from("transactions").update({ recurring_id: rec.id }).eq("import_key", it.key).is("recurring_id", null);
      // la data prevista è coperta: Flunora non lo aggiunge di nuovo. Nello stesso mese ci pensa
      // già il controllo dei doppioni (un addebito per periodico al mese), e annullando
      // l'importazione il periodico torna normale; a cavallo di due mesi si sposta l'ultima data
      if (d.slice(0, 7) !== it.date.slice(0, 7) && (!rec.last_date || d > rec.last_date)) {
        await sb.from("recurring").update({ last_date: d }).eq("id", rec.id);
      }
      if (it.recLink.updatePrice) prices.set(rec.id, it.amount);
    }
    for (const it of fixes) {
      const { error } = await sb.from("transactions").update({ amount_cents: it.amount, import_key: it.key }).eq("id", it.recFix.tx.id);
      if (error) throw error;
      if (it.recFix.updatePrice && it.recFix.rec) prices.set(it.recFix.rec.id, it.amount);
    }
    for (const [id, cents] of prices) await sb.from("recurring").update({ amount_cents: cents }).eq("id", id);
    imp.batch = data;
    renderDone(chosen, data, rules.size, backs.length, { linked: linked.length, fixed: fixes.length, prices: prices.size });
    renderImportHistory();
    refreshPagesAfterImport();
  } catch (err) {
    impStop(["Importazione non riuscita", "Non è stato importato nulla. " + traduciErrore(err?.message || "")]);
  } finally {
    imp.busy = false;
  }
}

function renderDone(chosen, result, nRules, nBacks = 0, recs = { linked: 0, fixed: 0, prices: 0 }) {
  $("imp-title").textContent = "Fatto";
  $("imp-cancel").style.visibility = "hidden";   // resta lo spazio: "Fine" sta a destra
  $("imp-done").hidden = false;
  const box = el("div", "imp-stop");
  const ic = el("span", "imp-big ok");
  ic.innerHTML = CHECK_SVG;
  const n = result.added;
  box.append(ic, el("h2", null, !n && recs.fixed ? `${recs.fixed === 1 ? "Abbonamento aggiornato" : "Abbonamenti aggiornati"}` : `${n} ${n === 1 ? "movimento importato" : "movimenti importati"}`), el("p", "secondary", periodText(imp.res.from, imp.res.to)));
  const sum = el("ul", "card list settings");
  const kv = (a, b) => { const li = el("li", "imp-kv"); li.append(el("span", "label", a), el("b", null, String(b))); return li; };
  sum.append(kv("Entrate", chosen.filter((it) => it.kind === "entrata").length), kv("Uscite", chosen.filter((it) => it.kind === "uscita").length),
    kv("Non importati", imp.items.length - chosen.length - nBacks - recs.fixed));
  if (recs.linked) sum.append(kv("Collegati agli abbonamenti", recs.linked));
  if (recs.fixed) sum.append(kv("Addebiti di abbonamenti corretti", recs.fixed));
  if (recs.prices) sum.append(kv("Prezzi di abbonamenti aggiornati", recs.prices));
  if (nBacks) sum.append(kv("Restituzioni di anticipi", nBacks));
  if (result.skipped) sum.append(kv("Già presenti, saltati", result.skipped));
  if (nRules) sum.append(kv("Negozi ricordati per la prossima volta", nRules));
  const undo = el("button", "imp-undo", "Annulla questa importazione");
  undo.hidden = !result.batch_id;
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
