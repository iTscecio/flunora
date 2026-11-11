// =========================================================
//  Flunora 0.4.0 — lettura dell'estratto conto PDF della Banca di Piacenza
//  Funzioni pure (niente rete, niente DOM): ricevono il testo del PDF letto da
//  pdf.js sul dispositivo e restituiscono i movimenti già interpretati.
//  window.FlunoraBDP = { parse, classify, ruleKey, KEYWORDS }
// =========================================================
(function (root) {
  "use strict";

  const DATE = /^\d\d\/\d\d\/\d{4}$/;
  const AMOUNT = /^(\d{1,3}(?:\.\d{3})*,\d\d)(-?)$/;

  // "1.234,56-" -> -123456 (centesimi, con segno)
  function cents(str) {
    const m = String(str).trim().match(AMOUNT);
    if (!m) return null;
    const v = Math.round(Number(m[1].replace(/\./g, "").replace(",", ".")) * 100);
    return m[2] ? -v : v;
  }
  const iso = (d) => { const [g, m, a] = d.split("/"); return `${a}-${m}-${g}`; };

  // unisce le righe di dettaglio: "MCDON-" + "ALD'S" -> "MCDONALD'S"
  function joinLines(lines) {
    let out = "";
    for (const raw of lines) {
      const l = raw.trim();
      if (!l) continue;
      if (/[A-Za-zÀ-ÿ]-$/.test(out) && /^[A-Za-zÀ-ÿ]/.test(l)) out = out.slice(0, -1) + l;
      else out = out ? out + " " + l : l;
    }
    return out;
  }

  // ---------------------------------------------------------
  //  parse(pages): pages = [[{s, x, y}], ...] (testo di pdf.js, y dal basso)
  // ---------------------------------------------------------
  function parse(pages) {
    const all = pages.flat().map((i) => i.s).join("\n");
    const res = {
      bank: null, account: null, owner: null, from: null, to: null,
      opening: null, closing: null, summary: null, rows: [], problems: [],
    };
    if (!/BANCA DI PIACENZA|bancadipiacenza|BCPCIT2P/i.test(all)) {
      res.problems.push("not_bdp");
      return res;
    }
    res.bank = "Banca di Piacenza";
    const acc = all.match(/Numero conto corrente:\s*([A-Z0-9]+)/i);
    if (acc) res.account = acc[1].slice(-4);
    const own = all.match(/Intestato a:\s*([^\n]+)/i);
    if (own) res.owner = own[1].trim();
    const per = all.match(/periodo dal (\d\d\/\d\d\/\d{4}) al (\d\d\/\d\d\/\d{4})/i);
    if (per) { res.from = iso(per[1]); res.to = iso(per[2]); }

    let done = false;          // dopo "SALDO FINALE" non ci sono più movimenti
    let last = null;           // ultimo movimento (il dettaglio può continuare nella pagina dopo)
    for (const items of pages) {
      if (done) break;
      // intestazione della tabella: posizione della colonna "Descrizione"
      const head = items.find((i) => i.s.trim() === "Descrizione");
      if (!head) continue;
      const descX = head.x, headY = head.y;

      // riepilogo in prima pagina: saldo iniziale, uscite, entrate, saldo finale
      if (!res.summary) {
        const sumHead = items.find((i) => /^Saldo iniziale al/i.test(i.s.trim()));
        if (sumHead) {
          const nums = items.filter((i) => AMOUNT.test(i.s.trim()) && i.y < sumHead.y && i.y > sumHead.y - 30)
            .sort((a, b) => a.x - b.x).map((i) => cents(i.s));
          if (nums.length === 4) res.summary = { opening: nums[0], out: Math.abs(nums[1]), in: nums[2], closing: nums[3] };
        }
      }

      const body = items.filter((i) => i.y < headY - 4);
      const starts = body.filter((i) => i.x < descX - 60 && DATE.test(i.s.trim()) && i.x < 90)
        .sort((a, b) => b.y - a.y);
      // righe di dettaglio prima del primo movimento della pagina: continuano l'ultimo
      const firstY = starts.length ? starts[0].y : -Infinity;
      if (last) {
        const cont = body.filter((i) => Math.abs(i.x - descX) < 4 && i.y > firstY + 3).sort((a, b) => b.y - a.y);
        if (cont.length) last.detailLines.push(...cont.map((i) => i.s));
      }

      for (let k = 0; k < starts.length; k++) {
        const d = starts[k], rowY = d.y;
        const nextY = k + 1 < starts.length ? starts[k + 1].y : -Infinity;
        const line = body.filter((i) => Math.abs(i.y - rowY) <= 2.5 && i !== d);
        const valuta = line.find((i) => DATE.test(i.s.trim()) && i.x < descX - 5);
        const type = line.filter((i) => Math.abs(i.x - descX) < 4).map((i) => i.s.trim()).join(" ");
        const amt = line.find((i) => i.x > descX + 100 && AMOUNT.test(i.s.trim()));
        const cls = line.find((i) => /^[SE]\/\d$/.test(i.s.trim()));
        const detailLines = body
          .filter((i) => Math.abs(i.x - descX) < 4 && i.y < rowY - 2.5 && i.y > nextY + 2.5)
          .sort((a, b) => b.y - a.y).map((i) => i.s);

        if (/^SALDO INIZIALE/i.test(type)) { res.opening = amt ? cents(amt.s) : null; continue; }
        if (/^SALDO FINALE/i.test(type)) { res.closing = amt ? cents(amt.s) : null; done = true; last = null; break; }
        if (!amt) { res.problems.push("row_without_amount:" + d.s); continue; }
        last = {
          date: iso(d.s.trim()),
          valuta: valuta ? iso(valuta.s.trim()) : null,
          type: type.toUpperCase(),
          cents: cents(amt.s),           // con segno: uscite negative
          cls: cls ? cls.s.trim() : "",
          detailLines,
        };
        res.rows.push(last);
      }
    }
    for (const r of res.rows) { r.detail = joinLines(r.detailLines); delete r.detailLines; }

    // verifica: saldo iniziale + entrate − uscite = saldo finale
    const sumIn = res.rows.filter((r) => r.cents > 0).reduce((a, r) => a + r.cents, 0);
    const sumOut = -res.rows.filter((r) => r.cents < 0).reduce((a, r) => a + r.cents, 0);
    res.sumIn = sumIn; res.sumOut = sumOut;
    res.ok = res.opening != null && res.closing != null && res.rows.length > 0
      && res.opening + sumIn - sumOut === res.closing
      && (!res.summary || (res.summary.in === sumIn && res.summary.out === sumOut
        && res.summary.opening === res.opening && res.summary.closing === res.closing));
    if (!res.ok) res.problems.push("totals");
    return res;
  }

  // ---------------------------------------------------------
  //  Nomi: "FARMACIA PONTE SUL NUR - PONTENURE (ITA)" -> nome e luogo
  // ---------------------------------------------------------
  const KEEP_UPPER = /^(S\.?R\.?L\.?|S\.?P\.?A\.?|S\.?C\.?A\.?|S\.?N\.?C\.?|S\.?A\.?S\.?|SRL|SPA|SCA|SNC|SAS|AG|GMBH|IT|UK|USA)$/i;
  function titleCase(s) {
    return s.toLowerCase().split(/(\s+)/).map((w) => {
      if (!w.trim()) return w;
      if (KEEP_UPPER.test(w) || /\d/.test(w)) return w.toUpperCase();
      return w.replace(/(^|[-.*(])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
    }).join("");
  }
  // chiave di una regola: lettere e numeri del nome, maiuscoli
  function ruleKey(name) {
    return String(name || "").toUpperCase().replace(/^PAYPAL\s*\*/, "").replace(/[^A-Z0-9À-Ý]+/g, " ").trim().slice(0, 60);
  }
  function splitPlace(text) {
    let t = text.replace(/\s*\([A-Z]{3}\)\s*$/, "").replace(/^PAYPAL\s*\*/i, "").trim();
    const m = t.match(/^(.+?)\s*-\s+(.+)$/);
    const name = (m ? m[1] : t).trim();
    let place = m ? m[2].replace(/\s*-\s+.*$/, "").trim() : "";
    if (/^[\d\s]+$/.test(place)) place = "";            // es. numeri di telefono al posto del luogo
    return { name, place };
  }
  function cutCompany(s) {
    const m = s.match(/^(.*?\b(?:S\.?R\.?L|S\.?P\.?A|S\.?C\.?A|S\.?N\.?C|S\.?A\.?S)\b\.?)/i);
    return (m ? m[1] : s).trim();
  }
  const sameName = (a, b) => {
    const A = new Set(String(a || "").toUpperCase().split(/[^A-ZÀ-Ý]+/).filter((w) => w.length > 1));
    const B = String(b || "").toUpperCase().split(/[^A-ZÀ-Ý]+/).filter((w) => w.length > 1);
    return A.size > 0 && B.length > 0 && [...A].every((w) => B.includes(w));
  };
  const maskIban = (s) => s && s.length > 8 ? `${s.slice(0, 2)}…${s.slice(-4)}` : s || "";

  // parole chiave -> nome della categoria (forti: categoria proposta; deboli: da confermare)
  const KEYWORDS = [
    { cat: "Supermercato", re: /\b(FAMILA|SUPERMERCAT\w*|IPERMERCAT\w*|CONAD|COOP|ESSELUNGA|LIDL|CARREFOUR|EUROSPIN|PAM|ALDI|DESPAR|SPAR|PENNY|IN'S|TIGROS|BENNET|U2|IPER|MD SPA)\b/ },
    { cat: "Benzina", re: /\b(ENI|AGIP|Q8|TAMOIL|ESSO|SHELL|IP|API|ERG|CARBURANT\w*|BENZIN\w*|DISTRIBUTOR\w*|ENILIVE)\b/ },
    { cat: "Abbonamenti", re: /\b(AMAZON PRIME|PRIME VIDEO|NETFLIX|SPOTIFY|DISNEY|DAZN|NOW TV|HO\.? MOBILE|ILIAD|VODAFONE|WINDTRE|WIND TRE|FASTWEB|APPLE\.COM|ICLOUD|YOUTUBE|GOOGLE ONE|CHATGPT|OPENAI|ANTHROPIC|CLAUDE)\b/ },
    { cat: "Salute", re: /\b(FARMACI\w*|PARAFARMACI\w*|OSPEDAL\w*|DENTIST\w*|OTTIC\w*|MEDIC\w*|POLIAMBULATORI\w*|ASL)\b/ },
    { cat: "Svago", re: /\b(MCDONALD'?S?|BURGER|PIZZ\w*|RISTORANT\w*|TRATTORIA|OSTERIA|GELATERI\w*|CREMERIA|CINEMA|PUB|BIRRERIA|GASTRO\w*|SUSHI|KEBAB|BAR|CAFFE|CAFE)\b/ },
    { cat: "Casa", re: /\b(IKEA|LEROY MERLIN|BRICO\w*|OBI|ENEL|HERA|IREN|A2A|EDISON|ACQUEDOTT\w*|CONDOMINI\w*|AFFITTO)\b/ },
    { cat: "Benzina", re: /\b(GAS)\b/, weak: true },
  ];
  function keyword(name) {
    const t = String(name || "").toUpperCase();
    for (const k of KEYWORDS) if (k.re.test(t)) return { cat: k.cat, weak: !!k.weak };
    return null;
  }

  // ---------------------------------------------------------
  //  classify(row, owner): cosa è il movimento
  //  -> { kind, date, title, description, merchantKey, special, ignore, reason, keyword }
  //     special: "fee" (Commissioni), "salary" (Stipendio)
  // ---------------------------------------------------------
  function classify(r, owner) {
    const t = r.type, d = r.detail || "";
    const out = {
      kind: r.cents < 0 ? "uscita" : "entrata",
      amount: Math.abs(r.cents),
      date: r.date, title: titleCase(t), description: titleCase(t), via: "",
      merchantKey: null, special: null, ignore: false, reason: "", keyword: null,
    };

    // pagamenti con carta
    const pos = d.match(/Operazione POS del (\d\d\/\d\d\/\d{4})(?: \d\d:\d\d)? con carta .*?\*\d{4}\s+(.+)$/i);
    if (pos) {
      out.date = iso(pos[1]);
      const rest = pos[2].replace(/^importo [\d.,]+ divisa \d+\s+/i, "");
      const { name, place } = splitPlace(rest);
      out.title = titleCase(name) + (place ? " · " + titleCase(place) : "");
      out.description = out.title;
      out.merchantKey = ruleKey(name);
      out.keyword = keyword(name);
      out.via = "carta";
      return out;
    }
    // addebiti diretti (SDD)
    const sdd = d.match(/Cred:\s*\S+\s+(.+?)(?:\s+Deb:|\s+Rif:|$)/i);
    if (sdd) {
      const name = cutCompany(sdd[1]);
      out.title = titleCase(name);
      out.description = out.title;
      out.merchantKey = ruleKey(name);
      out.keyword = keyword(name);
      out.via = "addebito diretto";
      return out;
    }
    // canone, commissioni, bolli e spese della banca
    if (/^(COMMISSION|RECUPERO BOLLI|IMPOSTA DI BOLLO|BOLLO|SPESE|CANONE|COSTO|ONERI)/.test(t)) {
      out.special = "fee";
      out.title = /BOLL/.test(t) ? "Imposta di bollo"
        : /CANONE/.test(t) ? "Canone conto corrente"
        : /COMMISSION/.test(t) && /BONIFICO/i.test(d) ? "Commissioni bonifico"
        : titleCase(t);
      out.description = out.title;
      return out;
    }
    // prelievi di contanti: non sono spese (si gestiranno con i conti, 0.7.0)
    if (/PRELIEV|PRELEV/.test(t)) {
      out.ignore = true; out.reason = "Prelievo di contanti · non contato";
      out.title = "Prelievo di contanti";
      return out;
    }
    // bonifici fatti da te
    const benef = d.match(/A FAVORE DI (.+?)\s+C\.\s*BENEF\.\s*(\S+)/i);
    if (/BONIFICO|GIROCONTO|GIRO/.test(t) || benef) {
      const who = benef ? benef[1] : "";
      const iban = benef ? benef[2] : "";
      if (/GIRO/.test(t) || (who && sameName(owner, who))) {
        out.ignore = true;
        out.title = `Spostamento ${out.kind === "uscita" ? "verso" : "da"} il conto ${maskIban(iban)}`.trim();
        out.reason = "Tra i tuoi conti · non contato";
        return out;
      }
      out.title = who ? `Bonifico a ${titleCase(who)}` : titleCase(t);
      out.description = out.title;
      out.merchantKey = who ? ruleKey("BONIFICO " + who) : null;
      out.via = "bonifico";
      return out;
    }
    // bonifici ricevuti (stipendio e altri)
    const oc = d.match(/BONIFICO O\/C\s+(.+?)\s+(?:BIC:|CRO:|NOTE:|$)/i);
    if (oc) {
      const who = cutCompany(oc[1]);
      if (sameName(owner, who)) {
        out.ignore = true; out.reason = "Tra i tuoi conti · non contato";
        out.title = "Spostamento da un tuo conto";
        return out;
      }
      out.title = titleCase(who);
      out.description = out.title;
      out.merchantKey = ruleKey("DA " + who);
      out.via = "bonifico";
      if (/EMOLUMENT|STIPEND/.test(t) || /salary|stipendio|competenze/i.test(d)) out.special = "salary";
      return out;
    }
    if (/EMOLUMENT|STIPEND/.test(t)) { out.special = "salary"; return out; }
    return out;
  }

  // canone +x / −x nello stesso giorno: si annullano
  function pairCanoni(rows) {
    const used = new Set();
    rows.forEach((a, i) => {
      if (!/^CANONE/.test(a.type) || used.has(i)) return;
      const j = rows.findIndex((b, k) => k !== i && !used.has(k) && /^CANONE/.test(b.type)
        && b.date === a.date && b.cents === -a.cents);
      if (j >= 0) { used.add(i); used.add(j); }
    });
    return used;
  }

  // impronta stabile di un movimento dell'estratto conto (per non importarlo due volte)
  function importKeys(res) {
    const seen = new Map();
    return res.rows.map((r) => {
      const base = ["bdp", res.account || "", r.date, r.valuta || "", r.cents,
        (r.type + " " + (r.detail || "")).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().slice(0, 90)].join("|");
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      return n > 1 ? `${base}#${n}` : base;
    });
  }

  root.FlunoraBDP = { parse, classify, pairCanoni, importKeys, ruleKey, keyword, titleCase, cents, KEYWORDS };
})(typeof window !== "undefined" ? window : globalThis);
