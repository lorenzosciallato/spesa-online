// Selettori e testi usati dall'adapter Conad. Sono qui, in un file solo,
// perche' sono la parte che si rompe a ogni restyling del sito: quando
// succede si aggiusta questo file e basta, senza toccare la logica.
//
// Ogni voce e' una lista di candidati provati in ordine: il primo che trova
// qualcosa vince. Per calibrarli sul sito reale:
//
//   npm run conad:ispeziona -- latte
//
// che apre la ricerca, salva screenshot e HTML e stampa cosa ha riconosciuto.

export const BASE_URL = process.env.CONAD_BASE_URL || 'https://spesaonline.conad.it';

// Pagine del sito.
// L'indirizzo di ricerca si puo' cambiare senza toccare il codice:
//   CONAD_URL_RICERCA='/ricerca?testo={q}'
const URL_RICERCA = process.env.CONAD_URL_RICERCA || '/search?q={q}';

export const PAGINE = {
  home: '/',
  ricerca: (q) => URL_RICERCA.replace('{q}', encodeURIComponent(q)),
  carrello: process.env.CONAD_URL_CARRELLO || '/cartdetail',
};

// Pezzi di URL che l'app NON deve mai aprire: orario di ritiro, checkout,
// pagamento. Il browser li blocca a monte, cosi' un errore di selettore non
// puo' mai portare a un ordine completato.
export const URL_VIETATI = [
  'checkout',
  'payment',
  'pagamento',
  'timeslot',
  'time-slot',
  'slot',
  'fascia',
  'orario',
  'placeorder',
  'order-confirm',
  'conferma',
];

// Finestre di cookie e promozioni da chiudere da soli.
export const POPUP = [
  '#onetrust-accept-btn-handler',
  '#onetrust-reject-all-handler',
  'button#accept-recommended-btn-handler',
  '[data-testid="uc-accept-all-button"]',
  '.iubenda-cs-accept-btn',
  'button:has-text("Accetta tutti")',
  'button:has-text("Accetta tutto")',
  'button:has-text("Accetta e chiudi")',
  'button:has-text("Accetta")',
  'button:has-text("Ho capito")',
  'button:has-text("Continua")',
  '.modal.show [data-dismiss="modal"]',
  '.modal.show button.close',
  '.modal.show [aria-label="Chiudi"]',
  '.modal.show [aria-label="Close"]',
  '[role="dialog"] [aria-label="Chiudi"]',
  '[role="dialog"] [aria-label="Close"]',
  '[class*="popup"] [class*="close"]',
  '[class*="promo"] [class*="close"]',
];

// Un singolo risultato di ricerca.
export const SCHEDA = [
  '[data-pid]',
  '.product-tile',
  '.product-card',
  '[class*="product-tile"]',
  '[class*="productTile"]',
  '[class*="product-card"]',
  '[class*="ProductCard"]',
  '.product-grid .product',
  '.search-results .product',
  'article[class*="product"]',
  'li[class*="product"]',
];

// Dentro la scheda.
export const DENTRO_SCHEDA = {
  nome: [
    '.pdp-link a',
    '.product-name',
    '.product-title',
    '[class*="product-name"]',
    '[class*="productName"]',
    '[class*="product-title"]',
    '[class*="ProductTitle"]',
    '[class*="name"]',
    '[class*="title"]',
    'h2',
    'h3',
    'h4',
    'a[href*="/p/"]',
    'a[title]',
  ],
  marca: [
    '.product-brand',
    '[class*="brand"]',
    '[class*="Brand"]',
    '[class*="marca"]',
  ],
  // Prezzo della confezione. NON il prezzo al chilo/litro: quello viene
  // riconosciuto e scartato leggendo il testo (vedi conad.js).
  prezzo: [
    '.price .sales .value',
    '.price .sales',
    '.sales .value',
    '[class*="price"] [class*="sales"]',
    '[class*="sale-price"]',
    '[class*="salePrice"]',
    '[class*="current-price"]',
    '[class*="currentPrice"]',
    '[class*="final-price"]',
    '[class*="price"]',
    '[class*="Price"]',
    '[class*="prezzo"]',
  ],
  // Prezzo di listino barrato, se in sconto.
  prezzoPieno: [
    '.price .strike-through .value',
    '.price .strike-through',
    'del',
    's',
    '[class*="strike"]',
    '[class*="old-price"]',
    '[class*="list-price"]',
    '[class*="prezzo-pieno"]',
  ],
  formato: [
    '[class*="format"]',
    '[class*="Format"]',
    '[class*="formato"]',
    '[class*="weight"]',
    '[class*="size"]',
    '[class*="quantity-info"]',
  ],
  promo: [
    '[class*="promo"]',
    '[class*="Promo"]',
    '[class*="offer"]',
    '[class*="offerta"]',
    '[class*="badge"]',
    '[class*="Badge"]',
    '[class*="label"]',
    '[class*="sticker"]',
    '[class*="discount"]',
  ],
  esaurito: [
    '[class*="out-of-stock"]',
    '[class*="outOfStock"]',
    '[class*="esaurito"]',
    '[class*="not-available"]',
    '[class*="unavailable"]',
    '[class*="sold-out"]',
  ],
  aggiungi: [
    'button.add-to-cart',
    'button[class*="add-to-cart"]',
    'button[class*="addToCart"]',
    'button[class*="add-cart"]',
    'button[data-action="add"]',
    'button[aria-label*="Aggiungi"]',
    'button[title*="Aggiungi"]',
    'button:has-text("Aggiungi")',
    'button:has-text("Acquista")',
    'button[class*="cart"]',
    'button[class*="plus"]',
    'button[class*="increase"]',
    'button[aria-label*="Aumenta"]',
    'button:has-text("+")',
  ],
  // Dopo la prima aggiunta le schede mostrano spesso uno stepper: "-" [n] "+".
  piu: [
    'button[class*="plus"]',
    'button[class*="increase"]',
    'button[class*="increment"]',
    'button[aria-label*="Aumenta"]',
    'button[aria-label*="aumenta"]',
    'button[aria-label*="Aggiungi"]',
    'button:has-text("+")',
  ],
  quantita: [
    'input[type="number"]',
    'input[class*="quantity"]',
    'input[class*="qty"]',
    '[class*="quantity"] input',
    '[class*="qty"] input',
    '[class*="quantity-value"]',
    '[class*="qty-value"]',
  ],
  immagine: ['img'],
  link: ['a[href*="/p/"]', 'a[href]'],
};

// Pagina carrello.
export const CARRELLO = {
  riga: [
    '.product-line-item',
    '.cart-item',
    '[class*="line-item"]',
    '[class*="lineItem"]',
    '[class*="cart-item"]',
    '[class*="cartItem"]',
    '[class*="cart-product"]',
  ],
  nome: DENTRO_SCHEDA.nome,
  marca: DENTRO_SCHEDA.marca,
  quantita: [
    'input[class*="quantity"]',
    'input[class*="qty"]',
    'select[class*="quantity"]',
    '[class*="quantity"]',
    '[class*="qty"]',
  ],
  prezzoRiga: [
    '.line-item-total-price .value',
    '[class*="line-item-total"]',
    '[class*="item-total"]',
    '[class*="row-total"]',
    '[class*="subtotal"]',
    '[class*="price"]',
  ],
  totale: [
    '.grand-total',
    '.grand-total-sum',
    '[class*="grand-total"]',
    '[class*="grandTotal"]',
    '[class*="cart-total"]',
    '[class*="order-total"]',
    '[class*="totale"]',
    '[class*="total"]',
  ],
  vuoto: [
    'text=/carrello.{0,20}vuoto/i',
    '[class*="empty-cart"]',
    '[class*="cart-empty"]',
  ],
};

// Intestazione: chi sono, dove ritiro.
export const SESSIONE = {
  utente: [
    '[class*="user-name"]',
    '[class*="userName"]',
    '[class*="account-name"]',
    '.user-message',
    '[class*="logged"]',
    'a[href*="account"]',
    'a[href*="profilo"]',
  ],
  accedi: [
    'a[href*="login"]',
    'a[href*="Login"]',
    'a:has-text("Accedi")',
    'button:has-text("Accedi")',
  ],
  puntoVendita: [
    '[class*="store-name"]',
    '[class*="storeName"]',
    '[class*="punto-vendita"]',
    '[class*="selected-store"]',
    '[class*="store"]',
    '[class*="negozio"]',
  ],
  modalita: [
    '[class*="service-type"]',
    '[class*="serviceType"]',
    '[class*="delivery-mode"]',
    '[class*="shipping-method"]',
    '[class*="modalita"]',
    '[class*="service"]',
  ],
};

export const TESTI = {
  puntoVendita: /tolentino/i,
  ritiro: /ritir/i,
  consegna: /consegna|domicilio/i,
  esaurito: /esaurit|non disponibil|terminat|sold out/i,
};
