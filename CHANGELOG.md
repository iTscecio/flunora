# Changelog — Flunora

I bug risolti si scrivono così: "Risolto un bug per cui … (bug #00X)", con lo stesso codice del documento di progetto e delle Novità nell'app.

## 0.3.3
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
