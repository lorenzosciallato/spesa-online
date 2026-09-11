// Parser della lista della spesa dettata a voce.
// Tutto a regole: nessun modello IA, nessuna chiamata di rete.
// Esempi che deve reggere:
//   "latte x6, pasta, 2 kg di pane"
//   "tre bottiglie di acqua e due confezioni di biscotti"

const FILLER = new Set([
  'di', 'del', 'della', 'dello', 'dei', 'degli', 'delle',
  'un', 'uno', 'una', 'il', 'lo', 'la', 'i', 'gli', 'le',
  'da', 'dal', 'per', 'con',
]);

// Parole che indicano un'unita di misura o un contenitore.
// 'pz' = confezioni intere, il resto e' peso/volume.
const UNITS = {
  confezione: 'pz', confezioni: 'pz', conf: 'pz',
  pacco: 'pz', pacchi: 'pz', pacchetto: 'pz', pacchetti: 'pz',
  bottiglia: 'pz', bottiglie: 'pz', brick: 'pz',
  barattolo: 'pz', barattoli: 'pz', vasetto: 'pz', vasetti: 'pz',
  scatola: 'pz', scatole: 'pz', busta: 'pz', buste: 'pz',
  pezzo: 'pz', pezzi: 'pz', pz: 'pz',
  kg: 'kg', chilo: 'kg', chili: 'kg', chilogrammi: 'kg', kilo: 'kg',
  g: 'g', gr: 'g', grammo: 'g', grammi: 'g', etto: 'g', etti: 'g',
  l: 'l', litro: 'l', litri: 'l',
  ml: 'ml',
};

// La dettatura vocale restituisce spesso i numeri in lettere.
const NUM_WORDS = {
  un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5,
  sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12,
  ventiquattro: 24,
};

// Categorie usate dal motore di scelta: per i prodotti della casa conta
// il prezzo unitario, non la confezione piu economica.
const CATEGORIE = {
  casa: [
    'carta igienica', 'scottex', 'tovaglioli', 'fazzoletti',
    'detersivo', 'detersivi', 'ammorbidente', 'candeggina', 'sgrassatore',
    'lavastoviglie', 'tabs', 'pastiglie', 'brillantante', 'sapone',
    'piatti', 'bucato', 'anticalcare',
  ],
};

function normalizza(testo) {
  return testo
    .toLowerCase()
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function categoriaDi(nome) {
  for (const [categoria, chiavi] of Object.entries(CATEGORIE)) {
    if (chiavi.some((k) => nome.includes(k))) return categoria;
  }
  return 'generico';
}

function ripulisciNome(parole) {
  // Toglie gli articoli in testa ma li lascia in mezzo: "olio di oliva" resta intero.
  while (parole.length > 1 && FILLER.has(parole[0])) parole.shift();
  return parole.join(' ').trim();
}

// Divide la dettatura nelle singole voci. La " e " conta come separatore
// ("pane e latte" = due voci); e' il compromesso giusto perche' in una lista
// dettata la congiunzione separa quasi sempre due prodotti diversi.
export function dividiVoci(testo) {
  return normalizza(testo)
    .split(/[,;\n]+|\s+e\s+|\s+poi\s+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function analizzaVoce(grezzo) {
  let testo = normalizza(grezzo);
  let quantita = null;
  let unita = 'pz';

  // "latte x6" oppure "latte per 6"
  const suffisso = testo.match(/\s+(?:x|per)\s*(\d+)\s*$/);
  if (suffisso) {
    quantita = parseInt(suffisso[1], 10);
    testo = testo.slice(0, suffisso.index).trim();
  }

  // "6 x latte"
  if (quantita === null) {
    const prefisso = testo.match(/^(\d+)\s*x\s+(.+)$/);
    if (prefisso) {
      quantita = parseInt(prefisso[1], 10);
      testo = prefisso[2].trim();
    }
  }

  // "2 kg di pane", "tre bottiglie di acqua", "2 pane"
  if (quantita === null) {
    const parole = testo.split(' ');
    const primo = parole[0];
    const numero = /^\d+(?:[.,]\d+)?$/.test(primo)
      ? parseFloat(primo.replace(',', '.'))
      : NUM_WORDS[primo] ?? null;

    if (numero !== null && parole.length > 1) {
      quantita = numero;
      parole.shift();
      const possibileUnita = UNITS[parole[0]];
      if (possibileUnita) {
        unita = possibileUnita;
        parole.shift();
      }
      testo = ripulisciNome(parole);
    }
  }

  const nome = ripulisciNome(testo.split(' '));

  return {
    grezzo: grezzo.trim(),
    nome,
    // Regola del progetto: se non specifico la quantita, 1 confezione.
    quantita: quantita ?? 1,
    unita,
    categoria: categoriaDi(nome),
  };
}

export function analizzaLista(testo) {
  return dividiVoci(testo)
    .map(analizzaVoce)
    .filter((voce) => voce.nome.length > 1);
}
