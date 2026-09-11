// Un finto spesaonline.conad.it, quanto basta per collaudare l'adapter:
// ricerca con schede prodotto, cookie banner, popup promozionale, carrello
// con stepper, pagina di checkout che NON deve mai essere raggiunta.
// Il markup imita quello di un negozio Salesforce Commerce Cloud, la
// piattaforma su cui gira il sito vero.

import { createServer } from 'node:http';

const PRODOTTI = [
  { pid: '100', nome: 'Latte intero UHT 1 l', marca: 'Conad', prezzo: '0,89', unitario: '0,89 €/l' },
  { pid: '101', nome: 'Latte parzialmente scremato 1 l', marca: 'Granarolo', prezzo: '1,39', unitario: '1,39 €/l', promo: '3x2' },
  { pid: '102', nome: 'Latte fresco intero 1 l', marca: 'Parmalat', prezzo: '1,75', unitario: '1,75 €/l' },
  { pid: '103', nome: 'Latte senza lattosio 1 l', marca: 'Zymil', prezzo: '1,09', listino: '1,55', unitario: '1,09 €/l', promo: '-30%' },
  { pid: '104', nome: 'Latte di mandorla 1 l', marca: 'Alpro', prezzo: '2,19', unitario: '2,19 €/l', esaurito: true },
  { pid: '105', nome: 'Latte intero 6x1 l', marca: 'Conad', prezzo: '5,10', unitario: '0,85 €/l', promo: '2 a 9,00 €' },
  { pid: '200', nome: 'Penne rigate 500 g', marca: 'Conad', prezzo: '0,69', unitario: '1,38 €/kg' },
  { pid: '201', nome: 'Spaghetti n.5 500 g', marca: 'Barilla', prezzo: '1,19', unitario: '2,38 €/kg', promo: 'Prendi 3 paghi 2' },
  { pid: '300', nome: 'Carta igienica 4 rotoli', marca: 'Conad', prezzo: '1,99', unitario: '0,50 €/pz' },
  { pid: '301', nome: 'Carta igienica 12 rotoli', marca: 'Foxy', prezzo: '4,99', unitario: '0,42 €/pz' },
];

const carrello = new Map(); // pid -> quantita
export const visite = []; // percorsi richiesti, per i test
let ordineCompletato = false;

const pagina = (titolo, corpo, { popup = true } = {}) => `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>${titolo} | Conad finto</title>
<style>
  .product-tile{border:1px solid #ccc;padding:8px;margin:8px;width:260px;display:inline-block;vertical-align:top}
  .strike-through{text-decoration:line-through;color:#888}
  #onetrust-banner-sdk{position:fixed;bottom:0;left:0;right:0;background:#eee;padding:20px}
  .modal{display:none;position:fixed;top:20%;left:30%;background:#fff;border:2px solid #c00;padding:20px}
  .modal.show{display:block}
</style></head><body>
<header>
  <a href="/account" class="user-name">Ciao Lorenzo</a>
  <span class="store-name">Conad Tolentino - Via Roma 1</span>
  <span class="service-type">Ritiro in negozio</span>
  <a href="/cartdetail" class="minicart">Carrello (<span class="minicart-quantity">${[...carrello.values()].reduce((a, b) => a + b, 0)}</span>)</a>
</header>
<main>${corpo}</main>
<div id="onetrust-banner-sdk"><p>Usiamo i cookie.</p><button id="onetrust-accept-btn-handler">Accetta tutti</button></div>
${popup ? '<div class="modal show" id="promo"><p>Promozione della settimana!</p><button type="button" class="close" data-dismiss="modal" aria-label="Chiudi">×</button></div>' : ''}
<script>
  document.getElementById('onetrust-accept-btn-handler').onclick = () => document.getElementById('onetrust-banner-sdk').remove();
  const promo = document.getElementById('promo');
  if (promo) promo.querySelector('.close').onclick = () => promo.classList.remove('show');
  async function api(percorso, corpo) {
    const r = await fetch(percorso, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    return r.json();
  }
  function disegnaStepper(tile, q) {
    const azioni = tile.querySelector('.actions');
    if (q <= 0) {
      azioni.innerHTML = '<button type="button" class="add-to-cart btn">Aggiungi</button>';
      azioni.querySelector('.add-to-cart').onclick = () => cambia(tile, 1);
      return;
    }
    azioni.innerHTML = '<button type="button" class="qty-minus" aria-label="Diminuisci">-</button> <span class="quantity-value">' + q + '</span> <button type="button" class="qty-plus" aria-label="Aumenta quantita">+</button>';
    azioni.querySelector('.qty-minus').onclick = () => cambia(tile, q - 1);
    azioni.querySelector('.qty-plus').onclick = () => cambia(tile, q + 1);
  }
  async function cambia(tile, q) {
    const esito = await api('/api/cart', { pid: tile.dataset.pid, quantity: q });
    document.querySelector('.minicart-quantity').textContent = esito.totale;
    // Il sito vero ridisegna dopo la risposta: simulo il ritardo.
    setTimeout(() => disegnaStepper(tile, esito.quantita), 150);
  }
  for (const tile of document.querySelectorAll('.product-tile')) {
    if (tile.classList.contains('out-of-stock')) continue;
    disegnaStepper(tile, Number(tile.dataset.qty));
  }
</script>
</body></html>`;

function scheda(p) {
  const q = carrello.get(p.pid) || 0;
  const promo = p.promo ? `<span class="promo-badge">${p.promo}</span>` : '';
  const listino = p.listino ? `<span class="strike-through"><span class="value">${p.listino} €</span></span>` : '';
  const esaurito = p.esaurito ? '<span class="availability-msg">Prodotto esaurito</span>' : '';
  return `<div class="product-tile ${p.esaurito ? 'out-of-stock' : ''}" data-pid="${p.pid}" data-qty="${q}">
    <img src="/img/${p.pid}.jpg" alt="">
    <div class="product-brand">${p.marca}</div>
    <div class="pdp-link"><a class="link" href="/p/${p.pid}.html">${p.nome}</a></div>
    ${promo}
    <div class="price">${listino}<span class="sales"><span class="value">${p.prezzo} €</span></span></div>
    <div class="unit-price">${p.unitario}</div>
    ${esaurito}
    <div class="actions">${p.esaurito ? '<button type="button" class="add-to-cart" disabled>Non disponibile</button>' : ''}</div>
  </div>`;
}

function paginaRicerca(q) {
  const parole = q.toLowerCase().split(/\s+/).filter(Boolean);
  const trovati = PRODOTTI.filter((p) => parole.every((w) => `${p.nome} ${p.marca}`.toLowerCase().includes(w)));
  return pagina(`Ricerca ${q}`, `
    <h1>Risultati per "${q}"</h1>
    <div class="search-results"><div class="product-grid">${trovati.map(scheda).join('')}</div></div>
    <a href="/checkout">Vai alla cassa</a>`);
}

function paginaCarrello() {
  const righe = [...carrello.entries()].map(([pid, q]) => {
    const p = PRODOTTI.find((x) => x.pid === pid);
    const tot = (parseFloat(p.prezzo.replace(',', '.')) * q).toFixed(2).replace('.', ',');
    return `<div class="product-line-item" data-pid="${pid}">
      <div class="line-item-brand">${p.marca}</div>
      <div class="line-item-name">${p.nome}</div>
      <input class="quantity" type="number" value="${q}">
      <div class="line-item-total-price"><span class="value">${tot} €</span></div>
    </div>`;
  });
  const totale = [...carrello.entries()]
    .reduce((s, [pid, q]) => s + parseFloat(PRODOTTI.find((x) => x.pid === pid).prezzo.replace(',', '.')) * q, 0)
    .toFixed(2)
    .replace('.', ',');
  return pagina('Carrello', righe.length
    ? `<h1>Il tuo carrello</h1>${righe.join('')}<div class="grand-total">Totale <span class="grand-total-sum">${totale} €</span></div><a href="/checkout" class="checkout-btn">Procedi</a>`
    : '<h1>Il tuo carrello e vuoto</h1>', { popup: false });
}

export function creaSitoFinto() {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    visite.push(url.pathname + url.search);

    if (req.method === 'POST' && url.pathname === '/api/cart') {
      let corpo = '';
      for await (const pezzo of req) corpo += pezzo;
      const { pid, quantity } = JSON.parse(corpo);
      if (quantity > 0) carrello.set(pid, quantity);
      else carrello.delete(pid);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ quantita: carrello.get(pid) || 0, totale: [...carrello.values()].reduce((a, b) => a + b, 0) }));
      return;
    }

    if (url.pathname.startsWith('/checkout')) {
      ordineCompletato = true; // se arriviamo qui il test deve fallire
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(pagina('Checkout', '<h1>Scegli orario e paga</h1>'));
      return;
    }

    let html;
    if (url.pathname === '/search') html = paginaRicerca(url.searchParams.get('q') || '');
    else if (url.pathname === '/cartdetail') html = paginaCarrello();
    else if (url.pathname === '/') html = pagina('Home', '<h1>Spesa online</h1>');
    else if (url.pathname.startsWith('/img/')) {
      res.writeHead(200, { 'Content-Type': 'image/gif' });
      res.end(Buffer.from('R0lGODlhAQABAAAAACw=', 'base64'));
      return;
    } else {
      res.writeHead(404);
      res.end('non trovato');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
}

export function statoSitoFinto() {
  return { carrello: new Map(carrello), ordineCompletato, visite: [...visite] };
}

export function azzeraSitoFinto() {
  carrello.clear();
  visite.length = 0;
  ordineCompletato = false;
}

if (process.argv[1] && process.argv[1].endsWith('sito-finto/server.js')) {
  const porta = Number(process.env.PORT) || 3999;
  creaSitoFinto().listen(porta, () => console.log(`Conad finto su http://localhost:${porta}`));
}
