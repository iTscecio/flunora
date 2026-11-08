# Changelog — Flunora

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
