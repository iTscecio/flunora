// =========================================================
//  Flunora — icone delle categorie (0.2.0)
//  Disegni 24x24 a tratto, colorati dal CSS (stroke: currentColor)
// =========================================================
window.CATEGORY_ICONS = {
  // spese quotidiane
  cart:      { label: "Carrello",     d: "M3 4h2l2.5 11h10l2-7H7M10 20h.01M17 20h.01" },
  food:      { label: "Cibo",         d: "M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3 4-3 7v3h3" },
  coffee:    { label: "Caffè",        d: "M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v2M12 3v2" },
  shirt:     { label: "Vestiti",      d: "M8 3l4 2 4-2 5 4-3 3-2-1v12H8V9l-2 1-3-3z" },
  // casa
  home:      { label: "Casa",         d: "M4 11l8-7 8 7v9H4zM10 20v-5h4v5" },
  bolt:      { label: "Bollette",     d: "M13 3L5 14h6l-1 7 8-11h-6z" },
  wifi:      { label: "Internet",     d: "M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01" },
  tool:      { label: "Manutenzione", d: "M14 7l3-3 3 3-3 3M17 7L6 18H4v-2L15 5" },
  // trasporti
  fuel:      { label: "Carburante",   d: "M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h12M8 8h4M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3" },
  car:       { label: "Auto",         d: "M5 16V11l2-4.5h10L19 11v5M3.5 16h17M5 11h14M7.5 16v2.5M16.5 16v2.5" },
  train:     { label: "Treno e bus",  d: "M6 4h12a1 1 0 0 1 1 1v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a1 1 0 0 1 1-1zM5 11h14M8 21l2-3M16 21l-2-3M9 14.5h.01M15 14.5h.01" },
  plane:     { label: "Viaggi",       d: "M12 2.5l1.5 1.5v6l7 4v2l-7-2v4l2 1.5V21L12 20l-3.5 1v-1.5l2-1.5v-4l-7 2v-2l7-4V4z" },
  suitcase:  { label: "Vacanze",      d: "M5 7h14v13H5zM9 7V4h6v3M9 11v5M15 11v5" },
  // tempo libero
  play:      { label: "Svago",        d: "M7 4l13 8-13 8z" },
  music:     { label: "Musica",       d: "M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z" },
  game:      { label: "Giochi",       d: "M6 8h12a4 4 0 0 1 4 4v2a3 3 0 0 1-5.4 1.8L15 14H9l-1.6 1.8A3 3 0 0 1 2 14v-2a4 4 0 0 1 4-4zM7 11v3M5.5 12.5h3M16 12h.01M18 13.5h.01" },
  tv:        { label: "TV",           d: "M3 6h18v12H3zM8 21h8M8 2l4 4 4-4" },
  book:      { label: "Libri",        d: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 1 2-2h13M8 7h7" },
  sport:     { label: "Sport",        d: "M6 7v10M18 7v10M3 9.5v5M21 9.5v5M6 12h12" },
  gift:      { label: "Regali",       d: "M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9C10 4 6 5 7.5 7.5 8.5 9 12 9 12 9zM12 9c2-5 6-4 4.5-1.5C15.5 9 12 9 12 9z" },
  cake:      { label: "Festa",        d: "M4 21h16M5 21v-7h14v7M5 16c2 1.5 4 1.5 7 0s5-1.5 7 0M12 14v-4M12 7.5c-1-1 0-3 0-3s1 2 0 3z" },
  // salute e persone
  health:    { label: "Salute",       d: "M9 4h6v5h5v6h-5v5H9v-5H4V9h5z" },
  pill:      { label: "Farmaci",      d: "M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7zM7 10l7 7" },
  heart:     { label: "Cura",         d: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" },
  people:    { label: "Famiglia",     d: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5M16 5a3 3 0 0 1 0 6M18 14.5c2 .7 3 2.6 3 5.5" },
  school:    { label: "Istruzione",   d: "M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5M22 9v5" },
  // soldi e servizi
  briefcase: { label: "Lavoro",       d: "M3 8h18v12H3zM8 8V5h8v3M3 13h18" },
  banknote:  { label: "Contanti",     d: "M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9v.01M18 15v.01" },
  card:      { label: "Carta",        d: "M3 6h18v12H3zM3 10h18M7 15h4" },
  bank:      { label: "Banca",        d: "M3 10l9-6 9 6M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18" },
  euro:      { label: "Euro",         d: "M17 7.5A6 6 0 1 0 17 16.5M5 10.5h8M5 13.5h8" },
  trend:     { label: "Investimenti", d: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  chart:     { label: "Grafico",      d: "M4 20V10M10 20V4M16 20v-7M3 20h18" },
  repeat:    { label: "Abbonamenti",  d: "M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" },
  phone:     { label: "Telefono",     d: "M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2" },
  umbrella:  { label: "Assicurazioni",d: "M3 12a9 9 0 0 1 18 0zM12 12v6a2 2 0 0 0 4 0" },
  doc:       { label: "Documenti",    d: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" },
  star:      { label: "Preferiti",    d: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" },
  tag:       { label: "Etichetta",    d: "M3 12V4h8l10 10-8 8zM7.5 7.5h.01" },
  dots:      { label: "Altro",        d: "M6 12h.01M12 12h.01M18 12h.01" },
};

// 12 colori in stile iOS
window.CATEGORY_COLORS = [
  "#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c7be", "#30b0c7",
  "#007aff", "#5856d6", "#af52de", "#ff2d55", "#a2845e", "#8e8e93",
];

// <svg> dell'icona richiesta (o "tag" se non esiste)
window.iconSvg = function (name) {
  const ic = window.CATEGORY_ICONS[name] || window.CATEGORY_ICONS.tag;
  return `<svg viewBox="0 0 24 24" class="ci" aria-hidden="true"><path d="${ic.d}"/></svg>`;
};
