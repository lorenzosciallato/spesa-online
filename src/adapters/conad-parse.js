// Interpretazione dei testi letti dalle schede prodotto di spesaonline.conad.it.
// Funzioni pure, senza browser: cosi' si testano da sole e si aggiustano in
// fretta quando il sito cambia il modo di scrivere prezzi e offerte.

const UNITA = {
  kg: 'kg', chilo: 'kg', chili: 'kg',
  g: 'g', gr: 'g', grammi: 'g',
  l: 'l', lt: 'l', litro: 'l', litri: 'l',
  ml: 'ml', cl: 'cl',
  pz: 'pz', pezzi: 'pz', pezzo: 'pz', rotoli: 'pz', rotolo: 'pz',
  capsule: 'pz', cialde: 'pz', lavaggi: 'pz', tabs: 'pz', pastiglie: 'pz',
  fette: 'pz', uova: 'pz', bustine: 'pz', filtri: 'pz',
};

const RE_UNITA = 'kg|gr|g|lt|l|ml|cl|pz|pezzi|pezzo|rotoli|rotolo|capsule|cialde|lavaggi|tabs|pastiglie|fette|uova|bustine|filtri';

// Un prezzo "al chilo / al litro / al pezzo" NON e' il prezzo della confezione.
const RE_PER_UNITA = /(?:\/|al\s|a\s|per\s)\s*(?:kg|chilo|l\b|lt\b|litro|pz|pezzo|100\s*g|100\s*ml|etto|unit)/i;

export function numero(testo) {
  if (testo == null) return null;
  const m = String(testo).replace(/\s/g, '').match(/(\d{1,5})(?:[.,](\d{1,2}))?/);
  if (!m) return null;
  return parseFloat(`${m[1]}.${m[2] || '0'}`);
}

// Legge un prezzo in euro da un testo tipo "1,29 €", "€ 1,29", "1.29".
// Restituisce null se il testo e' un prezzo unitario (al kg, al litro...).
export function leggiPrezzo(testo) {
  if (!testo) return null;
  const pulito = String(testo).replace(/\s+/g, ' ').trim();
  if (RE_PER_UNITA.test(pulito)) return null;
  const m = pulito.match(/(?:€\s*)?(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|euro)?/i);
  if (!m) return null;
  // Senza simbolo dell'euro e senza decimali non mi fido: puo' essere altro.
  const haEuro = /€|euro/i.test(pulito);
  const haDecimali = /[.,]\d{1,2}/.test(m[1]);
  if (!haEuro && !haDecimali) return null;
  const valore = numero(m[1]);
  return valore > 0 ? valore : null;
}

// Tutti i prezzi di confezione presenti in un testo lungo, in ordine.
export function tuttiIPrezzi(testo) {
  const trovati = [];
  const re = /(?:€\s*)?(\d{1,4}[.,]\d{2})\s*(?:€)?(?:\s*(\/|al|a|per)\s*(kg|chilo|l|lt|litro|pz|pezzo|100\s*g|100\s*ml|etto))?/gi;
  let m;
  while ((m = re.exec(testo)) !== null) {
    if (m[2]) continue; // prezzo unitario, non della confezione
    if (!/€/.test(m[0])) continue;
    trovati.push(numero(m[1]));
  }
  return trovati;
}

// "500 g", "1,5 l", "6x1,5 L", "4 rotoli", "24 pz" -> { valore, unita }.
export function leggiFormato(testo) {
  if (!testo) return null;
  const t = String(testo).toLowerCase().replace(/\s+/g, ' ');

  const multi = t.match(new RegExp(`(\\d{1,3})\\s*[x×]\\s*(\\d{1,4}(?:[.,]\\d{1,3})?)\\s*(${RE_UNITA})\\b`));
  if (multi) {
    const unita = UNITA[multi[3]];
    if (unita) return { valore: arrotonda(parseInt(multi[1], 10) * numero(multi[2])), unita };
  }

  const singolo = t.match(new RegExp(`(\\d{1,4}(?:[.,]\\d{1,3})?)\\s*(${RE_UNITA})\\b`));
  if (singolo) {
    const unita = UNITA[singolo[2]];
    if (unita) return { valore: numero(singolo[1]), unita };
  }
  return null;
}

// Interpreta i testi delle etichette promozionali.
//   "3x2" / "2x1" / "prendi 3 paghi 2" / "1+1"      -> nxm
//   "2 a 3,00 €" / "2 pezzi a 3 €"                    -> bundle
//   "-30%" / "sconto 30%" con prezzo gia' scontato    -> solo etichetta
//   "50% sul secondo" / "secondo al 50%"              -> bundle su 2 pezzi
export function leggiOfferta(testi, prezzo) {
  const etichette = (Array.isArray(testi) ? testi : [testi])
    .map((t) => String(t || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (etichette.length === 0) return null;

  for (const t of etichette) {
    const basso = t.toLowerCase();

    let m = basso.match(/(?<![\d,.])(\d)\s*[x×]\s*(\d)(?![\d,.]|\s*(?:kg|g|gr|l|lt|ml|cl)\b)/);
    if (m && +m[1] > +m[2]) return { tipo: 'nxm', n: +m[1], m: +m[2], etichetta: t };

    m = basso.match(/prendi\s*(\d)\s*(?:e\s*)?paghi\s*(\d)/);
    if (m && +m[1] > +m[2]) return { tipo: 'nxm', n: +m[1], m: +m[2], etichetta: t };

    m = basso.match(/(?<![\d,.])(\d)\s*\+\s*(\d)(?![\d,.])/);
    if (m) return { tipo: 'nxm', n: +m[1] + +m[2], m: +m[1], etichetta: t };

    m = basso.match(/(\d)\s*(?:pz|pezzi|conf(?:ezioni)?)?\s*(?:a|per)\s*(?:€\s*)?(\d{1,3}[.,]\d{2})\s*(?:€|euro)?/);
    if (m && +m[1] > 1) return { tipo: 'bundle', n: +m[1], totale: numero(m[2]), etichetta: t };

    m = basso.match(/(\d{1,2})\s*%[^\d]{0,15}second|second[^\d]{0,15}(\d{1,2})\s*%/);
    if (m && prezzo) {
      const perc = +(m[1] || m[2]);
      return {
        tipo: 'bundle',
        n: 2,
        totale: arrotonda(prezzo + prezzo * (1 - perc / 100)),
        etichetta: t,
      };
    }
  }

  // Sconto percentuale o etichetta generica: il prezzo mostrato in scheda e'
  // gia' quello scontato, quindi la tengo solo come informazione.
  const informativa = etichette.find((t) => /\d\s*%|sconto|offerta|sottocosto|promo|bassi e fissi|convenienza/i.test(t));
  if (informativa) return { tipo: 'prezzo', etichetta: informativa };

  return null;
}

function arrotonda(n) {
  return Math.round(n * 100) / 100;
}

function pulisci(testo) {
  return String(testo || '').replace(/\s+/g, ' ').trim();
}

/**
 * Da quello che ha letto il browser in una scheda a un prodotto nella forma
 * che si aspetta il motore di scelta.
 * @param {object} g testi grezzi estratti dal DOM
 */
export function interpretaScheda(g) {
  const nome = pulisci(g.nome);
  if (!nome) return null;

  // Prezzo della confezione: primo candidato dai selettori dedicati, poi
  // il primo prezzo con l'euro nel testo della scheda che non sia unitario.
  let prezzo = null;
  for (const t of g.prezzi || []) {
    prezzo = leggiPrezzo(t);
    if (prezzo) break;
  }
  const prezzoPieno = (g.prezziPieni || []).map(leggiPrezzo).find(Boolean) || null;
  if (!prezzo) {
    const candidati = tuttiIPrezzi(g.testo || '').filter((p) => p !== prezzoPieno);
    prezzo = candidati[0] || null;
  }
  if (prezzoPieno && prezzo && prezzoPieno < prezzo) {
    // Ho preso il listino invece dello scontato: li scambio.
    const daScontato = tuttiIPrezzi(g.testo || '').find((p) => p < prezzoPieno);
    if (daScontato) prezzo = daScontato;
  }

  const formato = leggiFormato(g.formato) || leggiFormato(nome) || leggiFormato(g.testo) || null;

  const promo = [...(g.promo || [])];
  if (prezzoPieno && prezzo && prezzoPieno > prezzo) {
    promo.push(`-${Math.round((1 - prezzo / prezzoPieno) * 100)}%`);
  }
  const offerta = leggiOfferta(promo, prezzo);

  const testo = pulisci(g.testo);
  const esaurito = Boolean(g.esaurito) || /esaurit|non disponibil|terminat|sold out/i.test(testo.replace(nome, ''));

  return {
    id: pulisci(g.pid) || pulisci(g.href) || nome,
    nome,
    marca: pulisci(g.marca) || '',
    prezzo: prezzo || 0,
    prezzoPieno,
    formato,
    offerta,
    disponibile: !esaurito && Boolean(prezzo),
    immagine: g.immagine || undefined,
    url: g.href || undefined,
    pid: pulisci(g.pid) || undefined,
  };
}
