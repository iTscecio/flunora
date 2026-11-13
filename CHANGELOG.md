# Changelog — Flunora

I bug risolti si scrivono così: "Risolto un bug per cui … (bug #00X)", con lo stesso codice del documento di progetto e delle Novità nell'app.

## 0.6.3
- IMPR-011 Costo all'anno: nella lista Abbonamenti "… all'anno · dal mese anno" per ogni abbonamento e il totale all'anno sotto "Abbonamenti al mese"; aprendo un periodico, riepilogo (`#rec-info`): da quando lo paghi, pagato finora e quante volte, all'anno al prezzo di oggi, ultimi cambi di prezzo. Tutto calcolato dai movimenti con `recurring_id` (`loadRecStats`), nessuna modifica a Supabase
- IMPR-012 Aumenti di prezzo: dai movimenti collegati, l'ultimo cambio negli ultimi 6 mesi compare nella lista ("↑ Aumentato da … a …" in rosso, "↓ Sceso" in verde). Cambiando l'importo di un addebito nato da un periodico, l'app chiede se è cambiato il prezzo e, se sì, aggiorna il periodico per i prossimi addebiti; cambiando l'importo nell'abbonamento l'avviso dice di quanto cambia all'anno
- Il riconoscimento degli aumenti dall'estratto conto importato arriva con IMPR-013 (0.6.4)

## 0.6.2
- IMPR-009 Prova gratuita e IMPR-010 Promemoria per disdire, solo per gli abbonamenti: nel pannello (nuovo o modifica) interruttori "Prova gratuita" (con "Finisce il") e "Promemoria per disdire" (con "Decidi entro il", proposta 2 giorni prima del prossimo addebito) e "Avvisami" (1, 3 o 7 giorni prima). Con la prova il primo addebito è alla fine della prova (`start_date` = `trial_end`); spegnendo l'interruttore la data si toglie
- Lista Abbonamenti: riga "In prova fino al …" / "Decidi entro il …"; Dashboard "In arrivo": "· fine prova" e "· decidi se disdire"
- Notifiche: nuovo tipo "Prove e disdette" (app e funzione `notifiche`), una volta per abbonamento e data
- Supabase (`0.6.2_prove_disdette.sql`): `recurring` + `trial_end`, `cancel_by`, `notice_days` (0–30, di base 3); `restore_backup` ripristina anche questi campi. Funzione `notifiche` da aggiornare (stesso procedimento della 0.6.1)

## 0.6.1
- Notifiche su iPhone (Web Push): `sw.js` (solo notifiche, nessuna cache), Impostazioni › Notifiche con stato (attive, spente, bloccate, da aprire dalla schermata Home, non supportate), cinque tipi (periodici di domani, inizio mese, anticipi in ritardo, backup, riepilogo dell'anno), ora (6–23, di base 9), "In programma" con le prossime notifiche e "Manda una notifica di prova". Iscrizione in `push_subscriptions`; scelte in `user_settings.data.notify`
- Funzione Supabase `notifiche` (`supabase/functions/notifiche/index.ts`), chiamata ogni ora da pg_cron: aggiunge periodici e risparmio periodico dei desideri arrivati a scadenza (il Salvadanaio lo aggiunge l'app), poi manda le notifiche all'ora scelta (ora di Roma), una sola volta per tipo e periodo (`notify_log`); toglie le iscrizioni scadute (404/410). Web Push con sola WebCrypto (aes128gcm, VAPID ES256); chiavi create dalla funzione e salvate in `push_keys` (non leggibile dall'app; `push_public_key()` dà solo la pubblica). Prova: `{ test: true }` con l'accesso di chi la chiede
- Recap (IMPR-006): Impostazioni › Recap con anni e mesi (fino a 24); recap del mese (rimasti, entrate/uscite/investito, confronto con il mese prima, budget, categorie, abbonamenti, desideri, anticipi) e dell'anno (mese migliore, più caro, uscite medie); PDF con la stampa. Dashboard: recap del mese nei primi 3 giorni con "Dettagli", carta dell'anno dal 1° al 10 gennaio
- Supabase (`0.6.1_notifiche.sql`, dopo aver creato la funzione): tabelle `push_subscriptions`, `push_keys`, `notify_log`; estensioni pg_cron e pg_net; giro `flunora-notifiche` ogni ora; prima chiamata per creare le chiavi

## 0.6.0
- Sezione Abbonamenti (non più segnaposto): riepilogo "al mese" per gruppo (gli annuali divisi per 12) e quattro gruppi — Abbonamenti, Pagamenti periodici, Entrate periodiche, Desideri — con la descrizione sulla riga ("Pagamento periodico", "Entrata periodica", "Risparmio periodico"), la regola ("Ogni mese, il 2", "Ogni anno, il 20 marzo", "l'ultimo giorno") e la prossima data; "+ Nuovo" apre il pannello + come abbonamento
- Pannello +: riga "Ripeti" (Mai / Ogni mese / Ogni anno) per i movimenti nuovi e, per le uscite, "Tipo" (Abbonamento / Pagamento periodico). Il giorno è quello della data; il 31 diventa l'ultimo giorno dei mesi corti. Salvando nasce il periodico; se la data è oggi o passata il primo movimento arriva subito
- Modifica di un periodico nello stesso pannello: importo, categoria, descrizione, data (= prossima), frequenza e tipo; cambiando data o frequenza si riparte da lì (i mesi già fatti non si ripetono). "Sospendi" / "Riattiva" (riparte dal giorno della riattivazione, i mesi di pausa non si recuperano) ed "Elimina" (i movimenti già aggiunti restano)
- `runRecurring` all'avvio: per ogni periodico attivo aggiunge le date arrivate (al massimo 36 per volta) con `recurring_id`; l'indice unico periodico + mese evita i doppioni; aggiorna `last_date`; avviso "Aggiunto 1 movimento periodico: … · Vedi"
- Nei movimenti del mese i periodici hanno "↻ periodico"
- Risparmio periodico (kind `risparmio`): dal menu di un desiderio o del Salvadanaio, importo e giorno (con la rata per arrivare alla scadenza, se c'è). Non supera quanto manca; si ferma quando il desiderio non è più attivo. Riga "↻ … ogni mese, il …" sulla carta
- Dashboard: "In arrivo" (periodici dei prossimi 7 giorni) e, nei primi 10 giorni del mese, "Mese in breve" (entrate, uscite, rimasti, spesa più alta, uscite rispetto al mese prima), chiudibile (`flunora.recapSeen`)
- Impostazioni: tolta la voce "Movimenti periodici · Coming Soon"
- Supabase (`0.6.0_abbonamenti.sql`): `recurring` + `frequency`, `month_of_year`, `start_date`, `last_date`, `is_subscription`, `wish_id`; `category_id` facoltativa solo per il risparmio; giorno 1–31; `restore_backup` ripristina anche i periodici (parte 8; il risparmio si ricollega al desiderio con lo stesso nome). I modelli vecchi senza `start_date` sono ignorati
- Backup: i periodici con il nome del desiderio collegato

## 0.5.1
- IMPR-003 Duplica movimento: nel pannello "Modifica movimento" i pulsanti in fondo sono "Duplica" ed "Elimina" (`#sheet-foot`). "Duplica" trasforma il pannello in un movimento nuovo (`state.dupOf`) con tipo, categoria, importo e descrizione dell'originale e la data di oggi; niente Frequenti né Anticipo
- IMPR-008 Salvadanaio: soldi destinati ai Desideri ma non assegnati. Sta nelle impostazioni sincronizzate (`user_settings.data.wish_pool_cents`, anche nel backup): nessuno script Supabase. Carta `#wish-pool` con "Metti da parte" e "Assegna"; toccando il titolo: Assegna, Riprendi. Conta nel totale "Messi da parte" e nei Desideri del saldo (Disponibile = conto − desideri − Salvadanaio)
- IMPR-007 Sposta soldi: nel pannello `#wmove-sheet` terza scelta "Sposta" ("Assegna" dal Salvadanaio) con la destinazione ("Verso": Salvadanaio e gli altri desideri attivi) e le scorciatoie "Quanto manca a …" e "Tutto". Prima aggiunge alla destinazione, poi toglie dalla fonte; se la seconda scrittura non riesce, rimette com'era. "Sposta soldi" anche nel menu del desiderio. "Rinuncio" con soldi messi da parte chiede: spostarli nel Salvadanaio o renderli disponibili
- IMPR-002 Avanzo del mese: mese precedente = budget (`budgets` del mese o budget mensile) − uscite; se le uscite sono > 0 e l'avanzo ≥ 1 € e la sezione Desideri è attiva: avviso `#left-banner` nella Dashboard (porta ai Desideri e apre la scelta) e carta `#wish-left` nei Desideri. Destinazione: Salvadanaio o un desiderio a cui mancano soldi; il pannello parte con l'avanzo (per un desiderio, al massimo quanto manca) e ha la scorciatoia "Avanzo di …". Una volta per mese: `localStorage` `flunora.leftoverDone` = "AAAA-MM"
- IMPR-004 Blocco con Face ID: Impostazioni › Sicurezza. Attivandolo si crea una passkey dell'iPhone (WebAuthn, autenticatore della piattaforma, verifica utente obbligatoria); l'id resta in `localStorage` `flunora.lock`. Schermata `#lock` all'avvio (coperta subito, prima di leggere la sessione) e al ritorno dopo più di 60 secondi in background; "Esci e accedi con la password" toglie il blocco. È un blocco dello schermo di questo dispositivo: nessun dato nuovo su Supabase

## 0.5.0
- Nuova sezione Desideri (non più segnaposto): riepilogo "Messi da parte", schede con prezzo, barra di avanzamento, "mancano …", "Entro mese anno: … al mese" se c'è una scadenza, nota e link; "Comprati e rinunciati (n)" a scomparsa; toccando il titolo: Modifica, Riprendi soldi, Rinuncio (o Elimina per quelli chiusi)
- Ordine di priorità trascinando la maniglia ≡ (con almeno 2 desideri attivi; `attachSort`, salva `sort_order`)
- Pannello "Nuovo desiderio" (`#wish-sheet`): quanto costa, desiderio, entro il (mese), link, nota; mostra quanto mettere da parte al mese
- Pannello "Metti da parte / Riprendi" (`#wmove-sheet`) con scorciatoie (rata mensile, tutto quello che manca, tutto)
- "Comprato" apre il pannello + come uscita già compilata (importo, descrizione), senza Frequenti né Anticipo; salvando, il desiderio passa a "comprato" e ricorda la spesa (`bought_tx_id`)
- Saldo (bozza A): con la sezione Desideri attiva e soldi messi da parte il numero grande è "Disponibile" = conto − Desideri; sotto "Desideri … · Conto …" (+ "da ricevere" degli anticipi). Sezione spenta → "Saldo totale" come prima
- Supabase (`0.5.0_desideri.sql`): tabella `wishes` (stato attivo / comprato / rinuncia) con regole per utente; `restore_backup` ripristina anche i desideri (con "Unisci" salta quelli con stesso nome e prezzo)
- Backup: il file include i desideri
- Risolto un bug per cui nei Desideri il mese scelto compariva con la lettera minuscola (bug #008): `wishPlan` scrive il mese con la maiuscola ("Entro Luglio 2027"); il campo "Entro il" ha `text-transform: capitalize`, anche sul valore mostrato da Safari (`::-webkit-date-and-time-value`)
- I soldi messi da parte non sono movimenti: non contano in budget, "Ti restano", Categorie e totali

## 0.4.6
- Import dell'estratto conto collegato agli anticipi (`buildItems` legge `advances` e `advance_shares`; se mancano si va avanti come prima):
  - uscita con lo stesso importo del totale di un anticipo e data entro 3 giorni → "dup", nota "Già negli Anticipi: …"
  - entrata con lo stesso importo di una quota restituita sul conto entro 7 giorni → "dup", nota "Già segnata come restituzione di …"
  - entrata con lo stesso importo di una quota aperta (anticipo con data precedente o uguale) → "Dubbi" con "Restituzione di …? ›"; nel menu "Sì, Persona · Anticipo" (fino a 4 quote) oppure una categoria per importarla come entrata
  - nuovo stato "adv" (nel gruppo Nuovi): non diventa un movimento; all'importazione la quota passa a "conto" con la data dell'estratto conto; il riepilogo finale conta "Restituzioni di anticipi"
  - se ci sono solo restituzioni il pulsante è "Conferma le restituzioni" e non si crea un'importazione (niente "Annulla questa importazione")
- IMPR-001: `openSheet` sceglie "Anticipo" se il pannello si apre dalla sezione Anticipi; da un'altra pagina, se l'ultimo tipo era "Anticipo", torna a "Uscita"
- Risolto un bug per cui con il pannello + aperto si poteva scorrere la pagina sotto (bug #007). Con un pannello, un menu o le impostazioni aperti (`.sheet`, `.action-sheet`, `.settings-panel` con `.open`) il body va in `position: fixed` alla posizione attuale e torna lì alla chiusura (`syncScrollLock`, osservando le classi); `overscroll-behavior: contain` sui pannelli
- Nessuno script Supabase

## 0.4.5
- Nuova sezione Anticipi (non più segnaposto), icona con due mani: riepilogo "Da ricevere", anticipi aperti con le quote per persona, "Chiusi (n)" a scomparsa; toccando il titolo di un anticipo si può eliminarlo
- Pannello +: quarto tipo "Anticipo" (solo per movimenti nuovi e con la sezione Anticipi attiva). L'importo grande è il totale pagato; "La tua parte" (0 se non c'è); "Chi deve restituire" con nome e quota, divisa in parti uguali tra le quote non scritte a mano; controllo che quote + tua parte = totale; descrizione obbligatoria; la categoria vale per la tua parte e per le quote non restituite
- Supabase (`0.4.5_anticipi.sql`): tabelle `advances` e `advance_shares` (stato aperta / conto / contanti / persa, data di chiusura) con regole per utente; `restore_backup` ripristina anche gli anticipi (con "Unisci" salta quelli con stessa data, descrizione e totale)
- Gli anticipi non sono movimenti: non contano in budget, "Ti restano", Categorie, totali mensili e Frequenti. La tua parte è un'uscita normale ("… (tua parte)"); "Non me li restituisce" crea un'uscita ("… · quota di …") nella categoria dell'anticipo
- Saldo totale: meno la parte degli altri degli anticipi pagati dopo la data del saldo iniziale, più le quote restituite sul conto o diventate spesa (`advanceDelta`); le quote restituite in contanti non toccano il saldo del conto. Sotto il saldo "da ricevere X €"
- Anticipo con quote aperte da 30 giorni o più (`ADV_LATE_DAYS`): etichetta arancione "da N giorni" e pallino sull'icona della sezione (o sul pulsante Altre sezioni)
- Backup: il file include gli anticipi con le quote
- Selettore del tipo su una riga anche con quattro voci
- Da sapere fino alla 0.4.6: importando l'estratto conto, il pagamento dell'anticipo e i bonifici di restituzione compaiono come movimenti e vanno scartati nella revisione

## 0.4.4
- Sezioni senza limite: l'interruttore in Impostazioni dice solo se una sezione è attiva; nella barra vanno le prime 4 attive (`MAX_TABS`) nell'ordine trascinato, le altre in "Altre sezioni"
- Pulsante `#btn-more` (quattro quadratini, stile liquid glass) a sinistra dell'ingranaggio; compare solo se c'è almeno una sezione attiva fuori dalla barra; blu quando è aperta una di quelle sezioni
- Pannello `#more-sheet` (stesso stile del menu dal basso): elenco delle sezioni fuori dalla barra con icona e colore; un tocco apre la pagina (`#id`) senza cambiare la barra; la lente della barra si nasconde
- Impostazioni › Sezioni: sotto ogni sezione "Nella barra", "In Altre sezioni" o "Disattivata" (`markSectionPlaces`); tolto l'avviso "Al massimo 4 sezioni"; resta l'obbligo di almeno una sezione attiva
- Nuove sezioni segnaposto, spente: Anticipi (0.4.5) e Desideri (0.5.0), con icona e pagina "In arrivo"
- `normalizeSections` non spegne più le sezioni oltre la quarta
- Nessuno script Supabase

## 0.4.3
- Pannello + (solo "Nuovo movimento"): fila "Frequenti" (`#freq-box`, `#freq-row`) sotto Uscita / Entrata / Investimento, una fila per tipo
- Scorciatoia = stesso tipo, categoria e descrizione (senza maiuscole/minuscole) registrata almeno 3 volte negli ultimi 90 giorni (`FREQ_MIN`, `FREQ_DAYS`); al massimo 6 (`FREQ_MAX`), le più usate prima, a parità la più recente; escluse le categorie archiviate
- Movimenti importati: contano solo se la descrizione è lunga al massimo 25 caratteri (cioè rinominata), così le descrizioni della banca non diventano scorciatoie
- Un tocco compila categoria e descrizione; l'importo solo se è sempre uguale, altrimenti resta vuoto e si apre la tastiera; la data resta quella proposta; il salvataggio resta manuale
- Tenendo premuto (500 ms, o clic destro sul PC) si apre "Rimuovi dai frequenti"; le scorciatoie rimosse sono salvate sul dispositivo (localStorage `flunora.freqHidden`); in Impostazioni › Dati compare "Mostra le scorciatoie nascoste" quando ce n'è almeno una
- La fila scorre in orizzontale senza barra di scorrimento, con una sfumatura sul bordo destro
- I movimenti degli ultimi 90 giorni si leggono a ogni apertura del pannello (solo tipo, categoria, importo, descrizione, data); se la lettura fallisce il pannello funziona come prima
- Impostazioni: "Movimenti periodici" ora indica la 0.6, come nella roadmap
- Nessuno script Supabase

## 0.4.2
- Carta Categorie, dettagli: accanto a ogni categoria "↑ N% sul solito" (arancione) o "↓ N% sul solito" (verde)
- "Il solito" = media delle spese per categoria nei 3 mesi precedenti (`USUAL_MONTHS`); contano solo i mesi con almeno una spesa, e si divide per quel numero di mesi
- Mese in corso: per i mesi precedenti si sommano solo le spese fino allo stesso giorno del mese; mesi passati: mese intero; mesi futuri: nessun confronto
- Freccia mostrata solo se la media è almeno 1 € e la differenza almeno il 10% e almeno 5 €; nota sotto le righe che spiega il confronto
- `loadMonth` legge in parallelo le uscite dei 3 mesi precedenti (solo categoria, importo, data); se la lettura fallisce le frecce non compaiono
- Nessuno script Supabase

## 0.4.1
- Carta Categorie (pagina Mesi): pulsante "Dettagli" / "Nascondi" nell'intestazione (`#cat-toggle`, `aria-expanded`); chiusa all'inizio, scelta salvata sul dispositivo (localStorage `flunora.catDetails`)
- Sotto la barra, legenda compatta (`#cat-dots`) con colore, nome e percentuale di ogni categoria di spesa; un tocco filtra i movimenti come prima
- Nei dettagli (`#cat-details`) le righe con speso e budget (categorie con budget, poi le altre con importo e percentuale) e "Budget per categoria ›"; la vecchia legenda a due colonne è sostituita dalla legenda compatta
- Risolto un bug per cui nella pagina Mesi i movimenti con una descrizione lunga uscivano dalla pagina a destra e bisognava scorrere in orizzontale (bug #006). Causa: l'elenco dei giorni (`.tx-days`, `.day`) è una griglia con colonna automatica, che si allargava fino alla descrizione intera su una riga (`white-space: nowrap`). Ora la colonna è `minmax(0, 1fr)`, la descrizione va a capo (anche parole lunghissime) e l'importo non si restringe; `.page` con `overflow-x: clip` come protezione
- Nessuno script Supabase

## 0.4.0
- Import dell'estratto conto PDF della Banca di Piacenza (Impostazioni › Importa estratto conto); script `supabase/migrations/0.4.0_import.sql` (rieseguibile, richiede lo 0.3.3)
- Lettura del PDF sul dispositivo con pdf.js 6.2.108 (build legacy, Apache 2.0) incluso in `js/vendor/pdfjs/`, caricato solo quando serve; nessun dato del file esce dal telefono tranne i movimenti confermati
- `js/bank-bdp.js`: ricostruzione delle righe dalle posizioni del testo (data, valuta, descrizione, importo con "-" per le uscite, dettaglio su più righe e su più pagine); saldo iniziale/finale e riepilogo; verifica saldo iniziale + entrate − uscite = saldo finale (altrimenti l'import si ferma)
- Classificazione: pagamenti con carta (data reale del POS, nome e luogo del negozio), addebiti diretti SDD, stipendio (bonifico con "EMOLUMENTI"/competenze), bonifici a sé stessi e giroconti ignorati, prelievi ignorati, canone +x/−x nello stesso giorno ignorato, commissioni/bolli/spese nella categoria "Commissioni" (creata se manca)
- Categorie proposte: regole negozio → categoria (`import_rules`, salvate quando scegli una categoria), parole chiave (supermercati, carburante, abbonamenti, salute, svago, casa); "GAS" proposto come Benzina ma da confermare; senza proposta il movimento resta "Da confermare" e non viene importato
- Doppioni: impronta `import_key` unica per utente (indice parziale) e confronto con i movimenti inseriti a mano (stesso tipo e importo, data entro 3 giorni)
- Importazione in un'unica operazione (`import_transactions`) registrata in `import_batches`; `undo_import` toglie solo i movimenti di quell'importazione; elenco delle importazioni con "Annulla"
- Copia di sicurezza sul dispositivo prima di ogni importazione; backup e ripristino includono impronte e regole
- Correzione minore: `restore_backup` con "Unisci" non va in errore su movimenti già importati
- Risolto un bug per cui su iPhone l'estratto conto non veniva letto, con il messaggio "Non riesco a leggere il file" (bug #005). Causa: pdf.js legge il testo con `for await` su un ReadableStream, che Safari (26.6) non supporta. Ora Flunora aggiunge a Safari questa capacità prima di caricare pdf.js, legge il testo pagina per pagina con il reader e fa lavorare il lettore nella pagina invece che in un worker separato; opzioni di pdf.js ridotte al solo testo; in caso di errore la schermata mostra il dettaglio tecnico

- Budget per categoria: colonna `categories.budget_cents` (vuota = nessun limite, > 0), uguale per tutti i mesi, solo per le categorie di spesa (script `supabase/migrations/0.3.3_budget_categorie.sql`, rieseguibile)
- Carta Categorie: con almeno un budget la legenda diventa un elenco con speso / budget, barra verde, arancione dall'80%, rossa oltre il limite e testo "Restano", "Quasi finito", "Budget esaurito", "Oltre di"; le categorie senza budget mostrano importo e percentuale; tocco su una riga = filtro come prima
- Pannello "Budget per categoria" dalla carta Categorie: un campo per ogni categoria di spesa attiva, con lo speso del mese, totale e confronto con il budget del mese; più categorie salvate insieme
- Avviso dopo aver salvato una spesa quando la categoria supera l'80%, raggiunge o supera il limite (solo al passaggio della soglia)
- Ripristino backup (`restore_backup`): conserva il budget delle categorie; con "Unisci" lo assegna alle categorie esistenti che non ne hanno uno
- Tutti i pannelli dal basso si chiudono trascinando in basso la maniglia o la riga del titolo (oltre 1/4 dell'altezza o gesto veloce); altrimenti tornano al loro posto

## 0.3.2
- Saldo totale nascondibile: pulsante a forma di occhio sulla carta del saldo; nascosto mostra "****** €", senza colore rosso e senza "in negativo" per non far capire nulla
- Scelta salvata sul dispositivo (localStorage `flunora.hideSaldo`), come il tema
- Con il saldo nascosto l'importo non scorre all'apertura; mostrandolo scorre da zero al valore
- Nessuno script Supabase

## 0.3.1
- Barra in basso in stile liquid glass (sfocatura, riflessi, bordo luminoso; tinta più piena in tema scuro) con una "lente" che scivola sulla sezione attiva
- Transizioni tra le pagine (dissolvenza) e tra mesi/anni (scorrimento a destra o sinistra)
- Grafico dell'anno che cresce barra per barra, barra Categorie che si disegna, gruppi di movimenti che salgono in sequenza
- Importi di "Ti restano" e del Saldo totale che scorrono fino al valore (requestAnimationFrame, 600 ms)
- Movimento appena aggiunto evidenziato; righe eliminate che si chiudono; pannelli con apertura a molla; pulsanti con effetto pressione
- Zoom disattivato: viewport senza ridimensionamento, touch-action: manipulation, blocco del pizzico su Safari
- Con "Riduci movimento" attivo tutte le animazioni sono spente
- Risolto un bug per cui, arrivando in fondo alla pagina, il rimbalzo di iOS faceva ricomparire la barra (bug #002). Lo scorrimento ora è limitato tra 0 e il fondo della pagina
- Risolto un bug per cui, toccando un movimento, lo sfondo grigio trasparente lasciava vedere il rosso di "Elimina" e la riga non arrivava al bordo sinistro (bug #003). Ora sfondo pieno e riga a tutta larghezza
- Risolto un bug per cui eliminare un movimento andava a scatti (bug #004): attesa del server a riga ferma, poi chiusura, poi ridisegno, con la barra che reagiva all'accorciarsi della pagina. Ora l'animazione parte subito in parallelo con il server: la riga scivola via (transform), poi lo spazio si richiude; un giorno rimasto vuoto si richiude con la sua intestazione; la barra resta ferma durante la chiusura

## 0.3.0
- Backup completo in un file JSON (formato 1): movimenti, categorie anche archiviate, budget fisso e dei singoli mesi, saldo iniziale, sezioni della barra; letto a pagine da 1000 righe, senza id utente; salvato con il menu Condividi di iOS (o scaricato)
- Ripristino con controllo del file e anteprima (data, movimenti, categorie, periodo, versione); "Unisci" aggiunge solo ciò che manca contando i movimenti identici, "Sostituisci tutto" rimpiazza i dati
- Ripristino in un'unica operazione sul database: funzione `restore_backup` (script `supabase/migrations/0.3.0_ripristino.sql`, provato su PostgreSQL 16 senza permesso di tabelle temporanee)
- Copia di sicurezza sul dispositivo (IndexedDB) prima di ogni ripristino e una volta a settimana; si tengono le ultime 3 per utente
- Esportazione CSV per Excel/Numbers (separatore ";", virgola decimale, BOM UTF-8), di tutti gli anni o di un anno
- Promemoria backup (7, 14, 30 giorni o mai; predefinito 30) con avviso in Dashboard, rimandabile di 3 giorni
- Risolto un bug per cui la barra in basso copriva gli ultimi movimenti (bug #001). Ora si nasconde scorrendo verso il basso e torna scorrendo verso l'alto, e c'è più spazio in fondo alle pagine

## 0.2.4
- Saldo totale in cima alla Dashboard: saldo iniziale + entrate − uscite − investiti dei movimenti dal giorno dopo la data scelta fino a oggi (i movimenti futuri non contano)
- Saldo iniziale (importo anche zero o negativo + data) dalla carta del saldo o da Impostazioni › Dati; salvato nelle impostazioni sincronizzate, nessuno script Supabase
- Calcolo efficiente: totali mensili per i mesi interi, movimenti solo per il primo e l'ultimo mese

## 0.2.3
- Pagina "Novità" in Impostazioni › Informazioni con le note di rilascio di tutte le versioni (`js/releases.js`)
- Al primo avvio e dopo ogni aggiornamento compare da solo un pannello con le novità non ancora viste (anche più versioni insieme)

## 0.2.2
- Nuova pagina Mesi in stile "Carte"
  - carta "Ti restano questo mese": budget − uscite, oppure (senza budget) entrate − uscite − investiti; barra di quanto speso, giorni alla fine del mese; diventa arancione se si va oltre
  - riquadro "Categorie": barra unica divisa per categoria con percentuali; tocco su una categoria per filtrare i movimenti
  - movimenti raggruppati per giorno (Oggi, Ieri, data) con il totale delle sole spese
  - pulsante Cerca: per descrizione, categoria o importo
- Budget mensile
  - budget fisso valido per tutti i mesi, sincronizzato tra PC e iPhone
  - budget diverso per un singolo mese, con ritorno al budget fisso
  - dopo aver salvato lo Stipendio, se il mese non ha un budget l'app lo chiede, con proposte rapide
  - voce "Budget mensile" in Impostazioni › Dati
  - script `supabase/migrations/0.2.2_budget.sql`
- Importi: "1.500" ora vale millecinquecento euro (prima veniva letto come 1,50 €)

## 0.2.1
- Il pannello + (nuovo movimento) e l'editor di una nuova categoria non aprono più la tastiera da soli: si apre solo toccando un campo
- Se premi "Salva" con un campo vuoto o non valido, l'app porta comunque il cursore lì per correggerlo
- Selettori a segmenti più chiari: la scelta attiva è un riquadro pieno e colorato (Uscita rosso, Entrata verde, Investimento viola; blu per tema e altri selettori)

## 0.2.0
- Gestione categorie in Impostazioni › Categorie, divisa per Uscite, Entrate e Investimenti
- Per ogni categoria: numero di movimenti e totale dell'anno in corso
- Nuova categoria e modifica: nome, icona (38 disegni) e colore (12 colori iOS); il tipo si sceglie solo alla creazione
- Ordine delle categorie trascinando ≡
- Archiviazione: la categoria sparisce dalle scelte ma lo storico resta; ripristino da "Archiviate"
- Eliminazione: subito se non ha movimenti, altrimenti spostando i movimenti in un'altra categoria oppure archiviandola
- "+ Nuova" tra le categorie del pannello +, con la nuova categoria già selezionata
- Icone delle categorie nell'elenco movimenti, nel pannello + e nella legenda del grafico
- Script `supabase/migrations/0.2.0_categorie.sql` (provato su PostgreSQL 16 con le regole di sicurezza attive)

## 0.1.2
- Impostazioni a schermo intero, aperte dall'ingranaggio in alto a destra, con intestazione in stile liquid glass
- Tema scelto a mano: Automatico, Chiaro o Scuro (per dispositivo)
- Sezioni della barra personalizzabili: da 1 a 4, attivabili con un interruttore e riordinabili trascinando ≡
- Le sezioni scelte sono salvate su Supabase e uguali su PC e iPhone (script `supabase/migrations/0.1.2_user_settings.sql`)
- Nuove sezioni segnaposto: Abbonamenti e Auto (pagina "In arrivo")
- Voci "Coming Soon" aggiornate al nuovo piano: Categorie 0.2, Backup 0.3, Import 0.4, Periodici 0.5
- Schema del database salvato nel repository (`supabase/`)

## 0.1.1
- Eliminazione dei movimenti più semplice, in stile iPhone:
  - scorri un movimento verso sinistra per scoprire il pulsante rosso "Elimina"
  - scorrimento lungo per eliminare subito
  - modalità "Seleziona" per eliminare più movimenti insieme
- Dopo ogni eliminazione compare "Annulla" per 5 secondi, che ripristina i movimenti
- Anche "Elimina movimento" nel pannello di modifica ora offre "Annulla"

## 0.1.0
- Versione pensata per iPhone: installabile sulla schermata Home (Safari > Condividi > Aggiungi alla schermata Home)
- Barra di navigazione in basso in stile liquid glass: Dashboard, Mesi, Impostazioni e pulsante +
- Dashboard per anno: totali, media spese mensile, grafico entrate/uscite per mese, elenco dei mesi
- Pannello dal basso per aggiungere e modificare i movimenti, con categorie a pulsanti
- Impostazioni in stile iOS con versione, account ed elenco delle funzioni in arrivo (Coming Soon)
- Tema chiaro/scuro automatico, icona dell'app

## 0.0.1
- Login e registrazione con Supabase
- Pagina del mese: totali, grafico spese per categoria, elenco movimenti
- Inserimento, modifica ed eliminazione dei movimenti
