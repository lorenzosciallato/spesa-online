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
const URL_RICERCA = process.env.CONAD_URL_RICERCA || '/search?query={q}';

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
  '.product-card',
  '[class*="product-card"]',
  '[data-pid]',
  '.product-tile',
  'article[class*="product"]',
];

// Dentro la scheda.
export const DENTRO_SCHEDA = {
  nome: [
    '.product-description h3',
    'a.product h3',
    '.product-description',
    'a.product[aria-label]',
    'img[alt]',
    'h3',
    'h2',
  ],
  marca: [
    '.product-brand',
    '[class*="brand"]',
  ],
  // Prezzo della confezione. NON il prezzo al chilo/litro: quello viene
  // riconosciuto e scartato leggendo il testo (vedi conad.js).
  prezzo: [
    '.product-price-red',
    '.product-info .product-price',
    'div.product-price:not(.product-price-kg)',
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
    '.product-quantity',
    '[class*="product-quantity"]',
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
    '.product-not-available',
    '.out-of-stock',
    '[class*="not-available"]',
    '[class*="sold-out"]',
    '[class*="esaurito"]',
  ],
  aggiungi: [
    'button.add-product',
    'button[onclick*="addToCart"]',
    'button:has-text("Aggiungi")',
    'button[class*="add-product"]',
  ],
  // Dopo la prima aggiunta la scheda mostra uno stepper: "-" [n] "+".
  // Sul sito vero e' il blocco `.add-quantity` (nascosto con `uk-hidden`
  // finche' il prodotto non e' nel carrello); il "+" e' un altro
  // `button.add-quantity-button` che richiama sempre ProductCard.addToCart.
  piu: [
    '.add-quantity button.add-quantity-button:last-child',
    'button.qty-plus',
    'button[class*="plus"]',
    'button[class*="increase"]',
    'button[class*="increment"]',
    'button[aria-label*="Aumenta"]',
    'button[aria-label*="aumenta"]',
    'button:has-text("+")',
  ],
  // Quantita' del prodotto NEL CARRELLO, letta dallo stepper della scheda.
  // ATTENZIONE: NON usare `.product-quantity`: sul sito vero quello e' il
  // formato della confezione ("1 L"), non la quantita' -> falso positivo.
  // Lo stepper e' visibile solo quando il prodotto e' davvero nel carrello,
  // quindi `primoVisibile` restituisce null (=> 0) finche' non lo aggiungi.
  quantita: [
    '.add-quantity b.quantity',
    '.add-quantity .quantity',
    '.quantity-value',
    '[class*="qty-value"]',
    'input[type="number"]',
    'input[class*="quantity"]:not([class*="product-quantity"])',
  ],
  immagine: ['img'],
  link: ['a[href*="/p/"]', 'a[href]'],
};

// Contatore del carrello in alto a destra ("X € - [N]"): e' lo stato reale
// del carrello, quello da guardare per capire se un'aggiunta e' andata a
// buon fine. Sul sito vero compare solo quando hai scelto negozio e servizio
// (cioe' da loggato); sul sito finto di collaudo e' `.minicart-quantity`.
export const CONTATORE = [
  '.minicart-quantity',
  '[class*="minicart"] [class*="quantity"]',
  '[class*="mini-cart"] [class*="quantity"]',
  '[class*="minicart"] [class*="count"]',
  '[class*="cart"] [class*="badge"]',
  '[class*="cart"] [class*="count"]',
  'header [class*="cart"] [class*="num"]',
];

// Situazioni in cui il sito NON aggiunge e apre invece un pannello:
// - `interactionCondition = "REQUIRE_SERVICE_CHOICE"`: manca la scelta del
//   negozio/servizio (tipico da sloggato) -> prima serve `npm run conad:login`.
// - una modale di avviso ("modal-cart", contingentamento, ecc.).
export const SCELTA_SERVIZIO = /REQUIRE_SERVICE_CHOICE|REQUIRE_LOGIN|CHOOSE_SERVICE/i;
export const MODALE_BLOCCANTE = [
  '.uk-modal.uk-open',
  '.component-modal-cart-generic.uk-open',
  '[class*="modal-cart"].uk-open',
  '[class*="modal-contingentamento"].uk-open',
  '.modal.show',
];

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
  // Nome/marca della riga: prima i selettori tipici della pagina carrello,
  // poi quelli della scheda come ripiego.
  nome: [
    '.line-item-name',
    '.product-line-item-name',
    '[class*="line-item-name"]',
    '[class*="lineItemName"]',
    '[class*="item-name"]',
    ...DENTRO_SCHEDA.nome,
  ],
  marca: [
    '.line-item-brand',
    '[class*="line-item-brand"]',
    '[class*="item-brand"]',
    ...DENTRO_SCHEDA.marca,
  ],
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
