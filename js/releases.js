// =========================================================
//  Flunora — note di rilascio mostrate nell'app (Impostazioni › Novità)
//  La prima voce è sempre la versione attuale. Testi per chi usa l'app:
//  i dettagli tecnici restano nel CHANGELOG.md del codice.
// =========================================================
window.RELEASES = [
  {
    version: "0.7.0", date: "13 novembre 2026",
    items: [
      "Nuova sezione Auto: la attivi in Impostazioni › Sezioni. La prima volta scegli le categorie delle spese dell'auto (Flunora propone quelle giuste e può creare Assicurazione auto, Bollo auto e Manutenzione auto)",
      "Quanto costa l'auto: la media al mese, il totale dell'anno, il costo di ogni km e le spese per voce, anno per anno, anche quelle importate dall'estratto conto",
      "Rifornimenti: con \"+ Rifornimento\" (o con + dalla sezione Auto) segni anche litri, km e se hai fatto il pieno; Flunora calcola il prezzo al litro e il consumo in km/l. Litri e km si aggiungono anche ai rifornimenti già presenti, toccandoli",
      "Chilometri: quelli del contachilometri, letti dai rifornimenti o segnati con \"Aggiorna i km\"; quanti ne fai quest'anno e al mese",
      "Scadenze dell'auto: assicurazione, bollo, revisione, tagliando (anche a km) e altre, con avviso 1, 3, 7, 15 o 30 giorni prima, nella Dashboard (\"In arrivo\") e con una notifica (nuovo tipo \"Scadenze dell'auto\")",
      "Assicurazione e bollo diventano pagamenti periodici ogni anno: arrivano da soli e la scadenza passa all'anno dopo; se li avevi già tra gli Abbonamenti, Flunora li collega",
      "Nella pagina Mesi i rifornimenti mostrano litri e km; il backup include tutto quello che riguarda l'auto",
    ],
  },
  {
    version: "0.6.4", date: "13 novembre 2026",
    items: [
      "Importando l'estratto conto, Flunora riconosce gli addebiti degli abbonamenti e dei pagamenti periodici anche se arrivano qualche giorno prima o dopo: non diventano doppioni (IMPR-013)",
      "Se l'importo sull'estratto conto è diverso, Flunora corregge l'addebito già aggiunto e ti chiede se usare il nuovo prezzo dai prossimi, con quanto cambia all'anno (IMPR-013)",
      "Un addebito arrivato prima della data prevista viene collegato all'abbonamento, che quel mese non viene aggiunto una seconda volta (IMPR-013)",
      "Blocco con Face ID: all'apertura non compare più il popup di conferma di Apple; tocchi \"Sblocca con Face ID\" e Face ID parte subito (IMPR-015)",
    ],
  },
  {
    version: "0.6.3", date: "13 novembre 2026",
    items: [
      "Abbonamenti: per ognuno vedi quanto costa all'anno e da quando lo paghi; in alto anche il totale all'anno di tutti gli abbonamenti (IMPR-011)",
      "Aprendo un abbonamento: quanto l'hai pagato finora, quante volte, e la storia del prezzo (IMPR-011)",
      "Aumenti di prezzo: nella lista compare \"↑ Aumentato da … a …\"; se cambi l'importo di un addebito, Flunora ti chiede se è cambiato il prezzo dell'abbonamento e lo aggiorna per i prossimi (IMPR-012)",
    ],
  },
  {
    version: "0.6.2", date: "13 novembre 2026",
    items: [
      "Abbonamenti con prova gratuita: scegli quando finisce e il primo addebito arriva quel giorno; nella lista compare \"In prova fino al …\" (IMPR-009)",
      "Promemoria per disdire: una data entro cui decidere se tenere un abbonamento, utile per gli annuali che si rinnovano da soli (IMPR-010)",
      "Flunora ti avvisa 1, 3 o 7 giorni prima, con una notifica (nuovo tipo \"Prove e disdette\" in Impostazioni › Notifiche) e in \"In arrivo\" nella Dashboard",
    ],
  },
  {
    version: "0.6.1", date: "13 novembre 2026",
    items: [
      "Nuovo: le notifiche su iPhone, anche ad app chiusa. Le attivi in Impostazioni › Notifiche (serve Flunora aperta dall'icona sulla schermata Home)",
      "Scegli cosa ricevere: periodici in arrivo il giorno prima, recap e avanzo a inizio mese, anticipi in ritardo, promemoria del backup e riepilogo dell'anno; e a che ora",
      "Gli abbonamenti e i pagamenti periodici ora arrivano ogni giorno anche se non apri Flunora",
      "Nuovo: i Recap, in Impostazioni › Recap. Per ogni mese e ogni anno: quanto ti è rimasto, il confronto con il mese prima e il budget, le categorie, gli abbonamenti, i desideri e gli anticipi; si salvano in PDF (IMPR-006)",
      "Nella Dashboard il recap del mese passato resta nei primi 3 giorni del mese (con \"Dettagli\"), quello dell'anno dal 1° al 10 gennaio",
    ],
  },
  {
    version: "0.6.0", date: "13 novembre 2026",
    items: [
      "Nuovo: la sezione Abbonamenti (si attiva in Impostazioni › Sezioni). Dentro trovi abbonamenti, pagamenti ed entrate periodiche e il risparmio periodico dei Desideri, con quanto pesano al mese e la prossima data",
      "Nel pannello + scegli \"Ripeti\" (ogni mese o ogni anno) e, per le uscite, se è un abbonamento o un pagamento periodico: Flunora aggiunge il movimento da sola, con la sua data, quando apri l'app",
      "Ogni abbonamento o pagamento periodico si può modificare, sospendere o eliminare; riattivandolo riparte da quel giorno",
      "Nei movimenti del mese quelli periodici sono segnati con ↻",
      "Nuovo nei Desideri: il risparmio periodico. Scegli quanto mettere da parte ogni mese per un desiderio o nel Salvadanaio; si ferma da solo quando il desiderio è completo",
      "Nella Dashboard: \"In arrivo\" con i periodici dei prossimi 7 giorni e, a inizio mese, il riepilogo del mese passato",
    ],
  },
  {
    version: "0.5.1", date: "13 novembre 2026",
    items: [
      "Nuovo: \"Duplica\" nel pannello di un movimento: apre una copia già compilata con la data di oggi, da controllare e salvare (IMPR-003)",
      "Nuovo nei Desideri: il Salvadanaio, per mettere da parte soldi per i Desideri senza sceglierne uno; li assegni a un desiderio quando vuoi (IMPR-008)",
      "Nei Desideri puoi spostare i soldi da un desiderio a un altro o nel Salvadanaio, senza toccare il Disponibile; rinunciando a un desiderio puoi tenere i soldi nel Salvadanaio (IMPR-007)",
      "A inizio mese, se nel mese prima hai speso meno del budget, un avviso nella Dashboard e nei Desideri ti propone di mettere da parte quello che è avanzato, nel Salvadanaio o in un desiderio (IMPR-002)",
      "Nuovo: blocco con Face ID, in Impostazioni › Sicurezza. Flunora chiede Face ID quando la apri e quando ci torni dopo più di un minuto (IMPR-004)",
    ],
  },
  {
    version: "0.5.0", date: "12 novembre 2026",
    items: [
      "Nuovo: la sezione Desideri, per le cose che vuoi comprare; si attiva in Impostazioni › Sezioni",
      "Per ogni desiderio scrivi quanto costa e, se vuoi, entro quando, un link e una nota; Flunora ti dice quanto mettere da parte ogni mese",
      "\"Metti da parte\" e \"Riprendi\" spostano i soldi solo virtualmente: restano sul conto, non sono spese e non toccano il budget",
      "Con la sezione attiva, nella Dashboard il numero grande è il Disponibile; sotto vedi \"Desideri\" e \"Conto\". Disattivando la sezione torna il saldo totale",
      "Metti in ordine di priorità i desideri trascinando ≡",
      "Risolto un bug per cui nei Desideri il mese scelto compariva con la lettera minuscola (bug #008)",
      "\"Comprato\" apre il pannello + già compilato: salvando, la spesa va nella categoria che scegli e il desiderio si chiude; \"Rinuncio\" rende di nuovo disponibili i soldi",
    ],
  },
  {
    version: "0.4.6", date: "12 novembre 2026",
    items: [
      "Nuovo: importando l'estratto conto, un bonifico in arrivo con l'importo di una quota aperta viene proposto come restituzione di un anticipo; se confermi, la quota si chiude da sola e non conta come entrata",
      "Il pagamento di un anticipo già segnato (stesso totale, entro 3 giorni) finisce tra gli ignorati con la nota \"Già negli Anticipi\", così non conta due volte",
      "Una restituzione già segnata a mano come \"Restituito sul conto\" non viene importata di nuovo",
      "Toccando + mentre sei nella sezione Anticipi, il pannello si apre già su \"Anticipo\"; dalle altre pagine parte come sempre (IMPR-001)",
      "Risolto un bug per cui con il pannello + aperto si poteva scorrere la pagina sotto, Dashboard o Mesi; ora resta ferma con tutti i pannelli e i menu (bug #007)",
    ],
  },
  {
    version: "0.4.5", date: "12 novembre 2026",
    items: [
      "Nuovo: la sezione Anticipi, per i soldi che paghi per altri e che ti verranno restituiti; si attiva in Impostazioni › Sezioni",
      "Nel pannello + c'è il tipo \"Anticipo\": scrivi quanto hai pagato, la tua parte (una spesa nella categoria che scegli) e chi ti deve restituire il resto; le quote si dividono in parti uguali e puoi correggerle",
      "Gli anticipi non contano nel budget, in \"Ti restano\" e nelle Categorie: il saldo totale scende quando paghi e risale quando ti restituiscono i soldi sul conto",
      "Per ogni persona: \"Restituito sul conto\", \"Restituito in contanti\" o \"Non me li restituisce\" (la quota diventa una spesa nella categoria dell'anticipo)",
      "Sotto il saldo totale vedi quanto devi ancora ricevere; dopo 30 giorni l'anticipo si segna in arancione e la sezione mostra un pallino",
      "Gli anticipi sono anche nel backup. Fino alla 0.4.6, quando importi l'estratto conto scarta il pagamento dell'anticipo e i bonifici di restituzione",
    ],
  },
  {
    version: "0.4.4", date: "12 novembre 2026",
    items: [
      "Nuovo: le sezioni non sono più limitate a 4. Le prime 4 attive stanno nella barra, le altre si aprono dal pulsante a quattro quadratini accanto all'ingranaggio",
      "Toccando una sezione nel pannello \"Altre sezioni\" si apre la sua pagina, senza spostare niente nella barra",
      "In Impostazioni › Sezioni, sotto ogni sezione, vedi se è nella barra o in Altre sezioni; trascinando ≡ scegli quali stanno nella barra",
      "Nuove sezioni segnaposto: Anticipi (in arrivo nella 0.4.5) e Desideri (in arrivo nella 0.5.0)",
    ],
  },
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
