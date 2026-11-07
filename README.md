# Flunora

App personale per tenere traccia di entrate, uscite e investimenti, mese per mese.
Pensata per iPhone, funziona anche da PC.

- **Interfaccia:** HTML, CSS e JavaScript, senza passaggi di compilazione
- **Dati e login:** [Supabase](https://supabase.com), protetti da regole di accesso per utente (RLS)
- **Pubblicazione:** GitHub Pages

La chiave in `js/config.js` è la chiave *publishable* di Supabase, pensata per stare nel codice pubblico:
i dati restano visibili solo al proprietario dell'account.

Versioni e novità: vedi [CHANGELOG.md](CHANGELOG.md).
