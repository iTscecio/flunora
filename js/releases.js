// =========================================================
//  Flunora — note di rilascio mostrate nell'app (Impostazioni › Novità)
//  La prima voce è sempre la versione attuale. Testi per chi usa l'app:
//  i dettagli tecnici restano nel CHANGELOG.md del codice.
// =========================================================
window.RELEASES = [
  {
    version: "0.4.3", date: "12 novembre 2026",
    items: [
      "Nuovo: nel pannello + compare la fila \"Frequenti\", con le spese che registri più spesso; un tocco compila categoria, descrizione e, se è sempre lo stesso, l'importo",
      "Le scorciatoie nascono da sole: una spesa con la stessa descrizione e categoria registrata almeno 3 volte negli ultimi 90 giorni",
      "Se l'importo cambia ogni volta (per esempio benzina o spesa), la scorciatoia lascia l'importo vuoto e apre la tastiera",
      "Tenendo premuta una scorciatoia puoi rimuoverla; in Impostazioni › Dati puoi farle tornare tutte",
    ],
  },
  {
    version: "0.4.2", date: "11 novembre 2026",
    items: [
      "Nuovo: nei dettagli della carta Categorie una freccia ti dice se in una categoria stai spendendo più o meno del solito",
      "Il solito è la media dei 3 mesi precedenti; nel mese in corso il confronto è fino allo stesso giorno del mese, così all'inizio del mese non sembra sempre di spendere meno",
      "La freccia compare solo quando la differenza conta (almeno il 10% e 5 €)",
    ],
  },
  {
    version: "0.4.1", date: "11 novembre 2026",
    items: [
      "Nuovo: nella carta Categorie della pagina Mesi il pulsante \"Dettagli\" mostra o nasconde le spese e i budget di ogni categoria",
      "Sotto la barra delle categorie c'è una piccola legenda con il colore e la percentuale di ogni categoria; un tocco filtra i movimenti",
      "Flunora ricorda se tieni i dettagli aperti o chiusi (vale per questo dispositivo)",
      "Risolto un bug per cui nella pagina Mesi i movimenti con una descrizione lunga uscivano dalla pagina a destra e bisognava scorrere in orizzontale: ora vanno a capo e l'importo resta sempre visibile (bug #006)",
    ],
  },
  {
    version: "0.4.0", date: "11 novembre 2026",
    items: [
      "Nuovo: importa l'estratto conto PDF della Banca di Piacenza, da Impostazioni › Importa estratto conto",
      "Il file viene letto solo sul tuo iPhone: su Flunora arrivano solo i movimenti che confermi",
      "Prima di importare, Flunora controlla che i conti tornino con il saldo dell'estratto conto",
      "Rivedi tutto prima di salvare: movimenti da confermare, nuovi e ignorati",
      "Categorie proposte in automatico, e Flunora si ricorda le tue scelte per la volta dopo",
      "Nessun doppione, anche se importi due volte lo stesso file o hai già inserito un movimento a mano",
      "Gli spostamenti tra i tuoi conti non contano come spese né entrate",
      "Commissioni e bolli finiscono nella nuova categoria \"Commissioni\"",
      "Puoi annullare un'importazione intera, anche giorni dopo",
      "Risolto un bug per cui su iPhone l'estratto conto non veniva letto (\"Non riesco a leggere il file\") (bug #005)",
    ],
  },
  {
    version: "0.3.3", date: "11 novembre 2026",
    items: [
      "Nuovo: imposta un budget mensile per ogni categoria di spesa, da \"Budget per categoria\" nella pagina Mesi",
      "Nella carta Categorie vedi per ogni categoria quanto hai speso e quanto ti resta",
      "La barra diventa arancione quando sei vicino al limite e rossa quando lo superi",
      "Quando una spesa ti porta oltre l'80% o oltre il limite, Flunora ti avvisa",
      "Chiudi i pannelli anche trascinando in basso la lineetta in alto",
    ],
  },
  {
    version: "0.3.2", date: "11 novembre 2026",
    items: [
      "Nuovo: nascondi il saldo totale con un tocco sull'occhio: al posto dell'importo compare ****** €",
      "Tocca di nuovo l'occhio per rivederlo",
      "La scelta resta anche chiudendo e riaprendo Flunora (vale per questo dispositivo)",
    ],
  },
  {
    version: "0.3.1", date: "11 novembre 2026",
    items: [
      "Flunora è più fluida: passaggi animati tra Dashboard, Mesi e le altre sezioni",
      "Nuova barra in basso in stile liquid glass, con la sezione attiva che scivola da una voce all'altra",
      "I grafici si disegnano all'apertura e gli importi principali scorrono fino al valore",
      "Pannelli, avvisi e pulsanti rispondono al tocco in modo più morbido",
      "Lo zoom non si attiva più per sbaglio con il doppio tocco o con due dita",
      "Se sull'iPhone è attivo \"Riduci movimento\", Flunora resta ferma e veloce",
      "Risolto un bug per cui, arrivando in fondo alla pagina, la barra in basso ricompariva per il rimbalzo (bug #002)",
      "Risolto un bug per cui, toccando un movimento, la riga si colorava di rosso con la scritta \"Elimina\" sopra l'importo e lasciava una striscia vuota a sinistra (bug #003)",
      "Risolto un bug per cui eliminare un movimento andava a scatti: ora la riga scivola via subito e lo spazio si richiude in modo fluido (bug #004)",
    ],
  },
  {
    version: "0.3.0", date: "11 novembre 2026",
    items: [
      "Nuovo: fai un backup di tutti i tuoi dati in un file e salvalo dove vuoi (File, iCloud Drive, AirDrop, mail)",
      "Ripristina un backup vedendo prima cosa contiene: data, movimenti, categorie e periodo",
      "Scegli se unire il backup ai dati attuali o sostituire tutto",
      "Prima di ogni ripristino Flunora salva una copia dei tuoi dati, così puoi sempre tornare indietro",
      "Flunora tiene le ultime 3 copie anche dentro l'app, ripristinabili con un tocco",
      "Esporta i movimenti in un file CSV da aprire in Excel o Numbers",
      "Ti ricorda di fare un backup dopo 7, 14 o 30 giorni (o mai, se preferisci)",
      "Risolto un bug per cui la barra in basso copriva gli ultimi movimenti: ora si nasconde scorrendo verso il basso e torna scorrendo verso l'alto (bug #001)",
    ],
  },
  {
    version: "0.2.4", date: "9 novembre 2026",
    items: [
      "Nuovo: il saldo totale in cima alla Dashboard, cioè quanto hai in tutto oggi",
      "Imposta il saldo iniziale a una data e Flunora lo aggiorna con ogni movimento",
    ],
  },
  {
    version: "0.2.3", date: "9 novembre 2026",
    items: [
      "Nuova pagina \"Novità\" con la storia di tutte le versioni",
      "Dopo ogni aggiornamento le novità compaiono da sole",
    ],
  },
  {
    version: "0.2.2", date: "9 novembre 2026",
    items: [
      "Nuova pagina Mesi: in alto vedi subito quanto ti resta da spendere",
      "Imposta un budget mensile, uguale per tutti i mesi o diverso per un mese specifico",
      "Quando registri lo stipendio, Flunora ti propone di impostare il budget",
      "Le spese per categoria ora sono una barra unica: tocca una categoria per vedere solo i suoi movimenti",
      "Movimenti raggruppati per giorno, con il totale speso",
      "Cerca un movimento per descrizione, categoria o importo",
      "Corretto: scrivendo \"1.500\" ora si intendono 1.500 € e non 1,50 €",
    ],
  },
  {
    version: "0.2.1", date: "9 novembre 2026",
    items: [
      "Aprendo il pannello + la tastiera non compare più da sola",
      "Uscita, Entrata e Investimento: la scelta attiva è ben visibile e colorata",
    ],
  },
  {
    version: "0.2.0", date: "9 novembre 2026",
    items: [
      "Gestisci le tue categorie: crea, rinomina, cambia icona e colore, riordina",
      "Archivia una categoria che non usi più senza perdere lo storico",
      "Elimina una categoria spostando i suoi movimenti in un'altra",
      "Crea una categoria al volo mentre inserisci un movimento",
      "Icone delle categorie in tutta l'app",
    ],
  },
  {
    version: "0.1.2", date: "8 novembre 2026",
    items: [
      "Nuove Impostazioni, aperte dall'ingranaggio in alto",
      "Tema chiaro, scuro o automatico",
      "Scegli le sezioni della barra in basso e il loro ordine",
      "In arrivo: Abbonamenti e Auto",
    ],
  },
  {
    version: "0.1.1", date: "8 novembre 2026",
    items: [
      "Scorri un movimento verso sinistra per eliminarlo",
      "Seleziona più movimenti ed eliminali insieme",
      "Hai eliminato per sbaglio? Tocca \"Annulla\"",
    ],
  },
  {
    version: "0.1.0", date: "7 novembre 2026",
    items: [
      "Flunora su iPhone: aggiungila alla schermata Home",
      "Nuova barra in basso in stile liquid glass",
      "Dashboard con l'andamento dell'anno, mese per mese",
      "Pannello + per inserire un movimento in pochi tocchi",
    ],
  },
  {
    version: "0.0.1", date: "4 novembre 2026",
    items: [
      "Prima versione: accesso, pagina del mese, inserimento delle entrate e delle uscite",
    ],
  },
];
