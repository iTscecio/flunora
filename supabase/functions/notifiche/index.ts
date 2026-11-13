// =========================================================
//  Flunora 0.6.1 — funzione "notifiche" (Supabase Edge Function)
//
//  Ogni ora (pg_cron, script 0.6.1_notifiche.sql):
//   1. aggiunge i movimenti periodici e il risparmio periodico arrivati a scadenza
//      (come fa l'app all'apertura; niente doppioni);
//   2. manda le notifiche su iPhone a chi le ha accese per quell'ora (ora di Roma):
//      periodici di domani, inizio mese, anticipi in ritardo, backup, riepilogo dell'anno.
//  Dall'app: { test: true } manda una notifica di prova ai dispositivi di chi la chiede.
//
//  Le chiavi delle notifiche (VAPID) le genera questa funzione la prima volta e restano
//  nella tabella push_keys, leggibile solo da qui. Non serve nessuna chiave da copiare.
//  Web Push scritto solo con WebCrypto (RFC 8291 aes128gcm + RFC 8292 VAPID).
// =========================================================

// ---------- strumenti ----------
const enc = new TextEncoder();
export const b64u = (buf: ArrayBuffer | Uint8Array): string => {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const unb64u = (s: string): Uint8Array =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// ---------- chiavi VAPID ----------
export async function newVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  return { public_key: b64u(raw), private_jwk: jwk };
}

async function vapidHeader(endpoint: string, publicKey: string, privateJwk: JsonWebKey, subject: string) {
  const aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${publicKey}`;
}

// ---------- cifratura del contenuto (aes128gcm) ----------
export async function encryptPayload(text: string, p256dh: string, auth: string) {
  const uaPublic = unb64u(p256dh), authSecret = unb64u(auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const prkKey = await hmac(authSecret, ecdh);
  const ikm = await hmac(prkKey, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(enc.encode(text), new Uint8Array([2])); // 2 = ultimo (e unico) blocco
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, plain));
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

export async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: unknown,
  keys: { public_key: string; private_jwk: JsonWebKey }, subject: string) {
  const body = await encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(sub.endpoint, keys.public_key, keys.private_jwk, subject),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
    },
    body,
  });
  return res.status;
}

// ---------- date (Europe/Rome) e periodici: stessa logica dell'app ----------
export function romeNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m0: number, d: number) => { const x = new Date(Date.UTC(y, m0, d)); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };
const addDays = (s: string, n: number) => { const [y, m, d] = s.split("-").map(Number); return iso(y, m - 1, d + n); };
const daysIn = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
type Rec = { id: string; user_id: string; kind: string; category_id: string | null; description: string; amount_cents: number;
  frequency: string; day_of_month: number; month_of_year: number | null; start_date: string | null; last_date: string | null;
  active: boolean; wish_id: string | null; is_subscription?: boolean; trial_end?: string | null; cancel_by?: string | null; notice_days?: number };
export function recNext(r: Rec, after: string | null = null): string | null {
  if (!r.start_date) return null;
  const from = after && after > r.start_date ? after : r.start_date;
  let [y, m] = from.split("-").map(Number); m -= 1;
  if (r.frequency === "anno") m = (r.month_of_year || m + 1) - 1;
  for (let i = 0; i < 40; i++) {
    const d = iso(y, m, Math.min(r.day_of_month, daysIn(y, m)));
    if (d >= r.start_date && (!after || d > after)) return d;
    if (r.frequency === "anno") y++; else if (++m > 11) { m = 0; y++; }
  }
  return null;
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const eur = (c: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" } as Intl.NumberFormatOptions).format(c / 100);
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const NT_DEFAULT = { hour: 9, types: { periodici: true, prove: true, mese: true, anticipi: true, backup: true, anno: true } };
const SUBJECT = "https://itscecio.github.io/flunora/";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-flunora-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------- la funzione ----------
// testDb: solo per le prove fuori da Supabase
export async function handler(req: Request, testDb?: any, testNow?: Date): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let db = testDb;
  if (!db) {
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    // @ts-ignore Deno
    db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  }
  const body = await req.json().catch(() => ({}));

  // chiavi: create la prima volta
  let { data: keys } = await db.from("push_keys").select("*").eq("id", 1).maybeSingle();
  if (!keys) return json({ error: "Esegui prima lo script 0.6.1 in Supabase" }, 500);
  if (!keys.public_key) {
    const k = await newVapidKeys();
    await db.from("push_keys").update(k).eq("id", 1);
    keys = { ...keys, ...k };
  }

  // prova dall'app: solo ai dispositivi di chi la chiede
  if (body.test) {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(token);
    if (!u?.user) return json({ error: "Accesso richiesto" }, 401);
    const { data: subs } = await db.from("push_subscriptions").select("*").eq("user_id", u.user.id);
    let sent = 0;
    for (const s of subs || []) {
      const st = await sendPush(s, { title: "Flunora", body: "Notifica di prova: le notifiche funzionano su questo iPhone", url: "./#dashboard" }, keys, SUBJECT);
      if (st === 404 || st === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
      else if (st < 300) sent++;
    }
    return json({ sent });
  }

  // giro di ogni ora: solo pg_cron, con il segreto che sta nel database
  if (!keys.cron_secret || req.headers.get("x-flunora-cron") !== keys.cron_secret) return json({ error: "Non autorizzato" }, 401);
  const now = romeNow(testNow);
  if (body.init) return json({ ok: true, public_key: keys.public_key });

  // 1. periodici arrivati a scadenza, per tutti
  const { data: recs } = await db.from("recurring").select("*").eq("active", true).not("start_date", "is", null);
  let added = 0;
  for (const r of (recs || []) as Rec[]) {
    // il risparmio nel Salvadanaio sta nelle impostazioni dell'app: lo aggiunge l'app all'apertura,
    // così non si sovrascrivono a vicenda
    if (r.kind === "risparmio" && !r.wish_id) continue;
    let last = r.last_date, d = recNext(r, last), n = 0;
    while (d && d <= now.date && n < 36) {
      if (r.kind === "risparmio") {
        const { data: w } = await db.from("wishes").select("*").eq("id", r.wish_id).maybeSingle();
        if (!w || w.status !== "attivo") { await db.from("recurring").update({ active: false }).eq("id", r.id); break; }
        const c = Math.max(0, Math.min(r.amount_cents, w.price_cents - w.saved_cents));
        if (c) await db.from("wishes").update({ saved_cents: w.saved_cents + c }).eq("id", w.id);
      } else {
        const { error } = await db.from("transactions").insert({
          user_id: r.user_id, date: d, amount_cents: r.amount_cents, kind: r.kind, category_id: r.category_id,
          description: r.description, recurring_id: r.id,
        });
        if (error && !/duplicate|23505/i.test(`${error.message} ${error.code}`)) break;
        if (!error) added++;
      }
      last = d; n++; d = recNext(r, d);
    }
    if (last !== r.last_date) await db.from("recurring").update({ last_date: last }).eq("id", r.id);
  }

  // 2. notifiche: per ogni persona con almeno un dispositivo iscritto
  const { data: subs } = await db.from("push_subscriptions").select("*");
  const byUser = new Map<string, typeof subs>();
  for (const s of subs || []) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]);
  let sent = 0;
  for (const [uid, list] of byUser) {
    const { data: st } = await db.from("user_settings").select("data").eq("user_id", uid).maybeSingle();
    const cfg = { ...NT_DEFAULT, ...(st?.data?.notify || {}) };
    const types = { ...NT_DEFAULT.types, ...(cfg.types || {}) };
    if (Number(cfg.hour) !== now.hour) continue;
    const out: { kind: string; ref: string; title: string; body: string; url: string }[] = [];

    if (types.periodici) {
      const tomorrow = addDays(now.date, 1);
      const due = ((recs || []) as Rec[]).filter((r) => r.user_id === uid && recNext(r, r.last_date && r.last_date > now.date ? r.last_date : now.date) === tomorrow);
      if (due.length) {
        out.push({ kind: "periodici", ref: tomorrow, title: due.length === 1 ? "Domani" : `Domani, ${due.length} periodici`,
          body: due.map((r) => `${r.kind === "risparmio" && !r.wish_id ? "Salvadanaio" : r.description} ${eur(r.amount_cents)}`).join(" · "), url: "./#abbonamenti" });
      }
    }
    // 0.6.2: qualche giorno prima della fine di una prova gratuita o della data per disdire
    if (types.prove) {
      const label = (r: Rec) => r.frequency === "anno" ? "all'anno" : "al mese";
      const giorno = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return `${dd} ${MESI[m - 1]}`; };
      for (const r of ((recs || []) as Rec[]).filter((x) => x.user_id === uid && x.is_subscription)) {
        for (const [d, k] of [[r.trial_end, "trial"], [r.cancel_by, "cancel"]] as const) {
          if (!d || addDays(d, -(r.notice_days ?? 3)) !== now.date) continue;
          out.push(k === "trial"
            ? { kind: "prove", ref: `${r.id}-trial-${d}`, title: `La prova di ${r.description} sta finendo`,
                body: `Finisce il ${giorno(d)}: poi ${eur(r.amount_cents)} ${label(r)}. Se non ti serve, disdici prima`, url: "./#abbonamenti" }
            : { kind: "prove", ref: `${r.id}-cancel-${d}`, title: `${r.description}: decidi se tenerlo`,
                body: `Entro il ${giorno(d)} scegli se disdire: costa ${eur(r.amount_cents)} ${label(r)}`, url: "./#abbonamenti" });
        }
      }
    }
    if (types.mese && now.d === 1) {
      const p0 = iso(now.y, now.m - 2, 1), p1 = iso(now.y, now.m - 1, 1);
      const { data: tx } = await db.from("transactions").select("amount_cents, kind").eq("user_id", uid).gte("date", p0).lt("date", p1);
      if (tx?.length) {
        const sum = (k: string) => tx.filter((t: { kind: string }) => t.kind === k).reduce((a: number, t: { amount_cents: number }) => a + t.amount_cents, 0);
        const ent = sum("entrata"), usc = sum("uscita"), rim = ent - usc - sum("investimento");
        const { data: b } = await db.from("budgets").select("amount_cents").eq("user_id", uid).eq("month", p0).maybeSingle();
        const budget = b?.amount_cents ?? st?.data?.budget_cents ?? null;
        const extra = budget && budget - usc >= 100 ? ` · Avanzati ${eur(budget - usc)} del budget` : "";
        const mese = MESI[(now.m + 10) % 12];
        out.push({ kind: "mese", ref: p0.slice(0, 7), title: `${cap(mese)} in breve`,
          body: `Entrate ${eur(ent)} · Uscite ${eur(usc)} · Rimasti ${rim < 0 ? "− " : ""}${eur(Math.abs(rim))}${extra}`, url: "./#dashboard" });
      }
    }
    if (types.anticipi) {
      const limit = addDays(now.date, -30);
      const { data: adv } = await db.from("advances").select("id, date, description").eq("user_id", uid).lte("date", limit);
      const ids = (adv || []).map((a: { id: string }) => a.id);
      if (ids.length) {
        const { data: open } = await db.from("advance_shares").select("advance_id, person, amount_cents").in("advance_id", ids).eq("status", "aperta");
        if (open?.length) {
          const desc = (id: string) => adv!.find((a: { id: string }) => a.id === id)?.description || "";
          const week = Math.floor(Date.parse(now.date) / (7 * 864e5)); // una volta a settimana
          out.push({ kind: "anticipi", ref: String(week), title: open.length === 1 ? "Un anticipo da ricevere" : `${open.length} anticipi da ricevere`,
            body: open.slice(0, 3).map((q: { advance_id: string; person: string; amount_cents: number }) => `${q.person} ${eur(q.amount_cents)} (${desc(q.advance_id)})`).join(" · ") + (open.length > 3 ? " · …" : ""),
            url: "./#anticipi" });
        }
      }
    }
    if (types.backup) {
      const days = Number(st?.data?.backup_reminder_days || 0);
      if (days > 0) {
        const last = st?.data?.last_backup_at ? String(st.data.last_backup_at).slice(0, 10) : null;
        const since = last ? Math.floor((Date.parse(now.date) - Date.parse(last)) / 864e5) : null;
        if (since === null || since >= days) {
          const ref = since === null ? `mai-${Math.floor(Date.parse(now.date) / (7 * 864e5))}` : `${last}-${Math.floor((since - days) / 7)}`;
          out.push({ kind: "backup", ref, title: "È ora del backup",
            body: since === null ? "Non hai ancora salvato un backup: lo trovi in Impostazioni › Backup e ripristino" : `L'ultimo backup è di ${since} giorni fa: salvane una copia da Impostazioni › Backup e ripristino`,
            url: "./#dashboard" });
        }
      }
    }
    if (types.anno && now.m === 1 && now.d === 2) {
      const y = now.y - 1;
      const { data: tx } = await db.from("transactions").select("amount_cents, kind").eq("user_id", uid).gte("date", `${y}-01-01`).lt("date", `${y + 1}-01-01`);
      if (tx?.length) {
        const sum = (k: string) => tx.filter((t: { kind: string }) => t.kind === k).reduce((a: number, t: { amount_cents: number }) => a + t.amount_cents, 0);
        const rim = sum("entrata") - sum("uscita") - sum("investimento");
        out.push({ kind: "anno", ref: String(y), title: `Il tuo ${y} in breve`,
          body: `Ti sono rimasti ${rim < 0 ? "− " : ""}${eur(Math.abs(rim))}. Mese migliore, categorie, abbonamenti e desideri: apri il recap`, url: "./#dashboard" });
      }
    }

    for (const n of out) {
      // una sola volta per tipo e periodo
      const { error: dup } = await db.from("notify_log").insert({ user_id: uid, kind: n.kind, ref: n.ref });
      if (dup) continue;
      for (const s of list || []) {
        const code = await sendPush(s, { title: n.title, body: n.body, url: n.url, tag: `${n.kind}-${n.ref}` }, keys, SUBJECT);
        if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
        else if (code < 300) sent++;
      }
    }
  }
  return json({ ok: true, ora: now.hour, aggiunti: added, notifiche: sent });
}

// Deno.serve passa anche un secondo argomento (dati della connessione): va ignorato.
// In caso di errore la risposta dice cosa è successo, così si legge da net._http_response.
// @ts-ignore Deno
if (typeof Deno !== "undefined" && Deno.serve) Deno.serve(async (req: Request) => {
  try { return await handler(req); }
  catch (err) { return json({ error: String((err as Error)?.stack || err).slice(0, 600) }, 500); }
});
