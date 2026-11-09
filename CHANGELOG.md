# Changelog — Flunora

## 0.2.1
- Il pannello + (nuovo movimento) e l'editor di una nuova categoria non aprono più la tastiera da soli: si apre solo toccando un campo
- Se premi "Salva" con un campo vuoto o non valido, l'app porta comunque il cursore lì per correggerlo

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
