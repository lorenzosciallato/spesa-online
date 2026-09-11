// Motore di scelta del prodotto piu conveniente.
// Aritmetica pura: stesso input -> stesso output, zero costi, zero IA.

// Conversioni verso l'unita standard (kg / l / pz) per il prezzo unitario.
const A_STANDARD = {
  g: { fattore: 0.001, unita: 'kg' },
  kg: { fattore: 1, unita: 'kg' },
  ml: { fattore: 0.001, unita: 'l' },
  cl: { fattore: 0.01, unita: 'l' },
  l: { fattore: 1, unita: 'l' },
  pz: { fattore: 1, unita: 'pz' },
};

// Quanti pezzi richiede l'offerta per far scattare lo sconto.
export function lottoOfferta(offerta) {
  if (!offerta) return 1;
  switch (offerta.tipo) {
    case 'nxm':
      return offerta.n;
    case 'bundle':
      return offerta.n;
    case 'sconto':
      return 1; // lo sconto vale gia sul singolo pezzo
    default:
      return 1;
  }
}

// Costo totale per n confezioni, offerta applicata.
export function costoPer(prodotto, n) {
  const { prezzo, offerta } = prodotto;
  if (!offerta) return prezzo * n;

  switch (offerta.tipo) {
    case 'sconto':
      return prezzo * n * (1 - offerta.percentuale / 100);
    case 'nxm': {
      // 3x2: ogni gruppo di n si paga m.
      const gruppi = Math.floor(n / offerta.n);
      const resto = n % offerta.n;
      return gruppi * offerta.m * prezzo + resto * prezzo;
    }
    case 'bundle': {
      // "2 a 3,00 euro"
      const gruppi = Math.floor(n / offerta.n);
      const resto = n % offerta.n;
      return gruppi * offerta.totale + resto * prezzo;
    }
    default:
      return prezzo * n;
  }
}

// Prezzo per kg / l / pz, usato per i prodotti della casa.
export function prezzoUnitario(prodotto, n = 1) {
  const formato = prodotto.formato;
  if (!formato) return null;
  const conv = A_STANDARD[formato.unita];
  if (!conv || !formato.valore) return null;

  const quantitaStandard = formato.valore * conv.fattore * n;
  if (quantitaStandard <= 0) return null;

  return {
    valore: costoPer(prodotto, n) / quantitaStandard,
    unita: conv.unita,
  };
}

function arrotonda(n) {
  return Math.round(n * 100) / 100;
}

// Valuta un prodotto per la quantita desiderata, considerando se conviene
// salire alla quantita dell'offerta.
function valuta(prodotto, quantitaVoluta, prezzoSingoloPiuBasso) {
  const lotto = lottoOfferta(prodotto.offerta);

  // Candidati: la quantita che ho chiesto, e il lotto dell'offerta se e' piu alto.
  const candidati = new Set([quantitaVoluta]);
  if (lotto > quantitaVoluta) {
    // Arrotondo al multiplo di lotto che copre il fabbisogno.
    candidati.add(Math.ceil(quantitaVoluta / lotto) * lotto);
  }

  let migliore = null;
  for (const n of candidati) {
    const totale = costoPer(prodotto, n);
    const perPezzo = totale / n;
    const salito = n > quantitaVoluta;

    // Regola del progetto: si sale alla quantita dell'offerta solo se il
    // prezzo a pezzo scende sotto il singolo piu economico sul mercato.
    if (salito && !(perPezzo < prezzoSingoloPiuBasso - 1e-9)) continue;

    if (!migliore || perPezzo < migliore.perPezzo - 1e-9) {
      migliore = { quantita: n, totale, perPezzo, salito };
    }
  }

  // Se l'offerta non conviene, resto sulla quantita richiesta.
  if (!migliore) {
    const totale = costoPer(prodotto, quantitaVoluta);
    migliore = {
      quantita: quantitaVoluta,
      totale,
      perPezzo: totale / quantitaVoluta,
      salito: false,
    };
  }

  const unitario = prezzoUnitario(prodotto, migliore.quantita);

  return {
    prodotto,
    quantita: migliore.quantita,
    totale: arrotonda(migliore.totale),
    prezzoAPezzo: arrotonda(migliore.perPezzo),
    prezzoUnitario: unitario
      ? { valore: arrotonda(unitario.valore), unita: unitario.unita }
      : null,
    quantitaAlzataPerOfferta: migliore.salito,
  };
}

function motivazione(opzione, categoria) {
  const parti = [];
  const o = opzione.prodotto.offerta;
  if (o) parti.push(`in offerta (${o.etichetta})`);
  if (opzione.quantitaAlzataPerOfferta) {
    parti.push(`quantita portata a ${opzione.quantita} perche l'offerta abbassa il prezzo a pezzo`);
  }
  if (categoria === 'casa' && opzione.prezzoUnitario) {
    parti.push(
      `scelto sul prezzo unitario (${opzione.prezzoUnitario.valore.toFixed(2)} €/${opzione.prezzoUnitario.unita})`,
    );
  } else {
    parti.push(`${opzione.prezzoAPezzo.toFixed(2)} € a confezione`);
  }
  return parti.join(', ');
}

/**
 * Sceglie il prodotto migliore fra i risultati di ricerca.
 * @param {Array} prodotti risultati del catalogo
 * @param {{quantita:number, categoria:string}} voce
 * @returns {{scelta:object|null, alternative:Array}}
 */
export function scegliMigliore(prodotti, voce) {
  const disponibili = prodotti.filter((p) => p.disponibile !== false && p.prezzo > 0);
  if (disponibili.length === 0) return { scelta: null, alternative: [] };

  const quantita = Math.max(1, Math.round(voce.quantita || 1));

  // Riferimento per la regola sulle offerte: la confezione singola piu economica.
  const prezzoSingoloPiuBasso = Math.min(
    ...disponibili.map((p) => costoPer(p, 1)),
  );

  const opzioni = disponibili.map((p) => valuta(p, quantita, prezzoSingoloPiuBasso));

  // Per i prodotti della casa ordino sul prezzo unitario, altrove sul prezzo
  // a confezione: e' la regola che mi hai dato per detersivi, carta igienica e tabs.
  const perUnitario = voce.categoria === 'casa';
  opzioni.sort((a, b) => {
    if (perUnitario && a.prezzoUnitario && b.prezzoUnitario) {
      const d = a.prezzoUnitario.valore - b.prezzoUnitario.valore;
      if (Math.abs(d) > 1e-9) return d;
    }
    const d = a.prezzoAPezzo - b.prezzoAPezzo;
    if (Math.abs(d) > 1e-9) return d;
    return a.totale - b.totale;
  });

  const [scelta, ...resto] = opzioni;
  scelta.motivo = motivazione(scelta, voce.categoria);

  return {
    scelta,
    // Le alternative sostituibili sono gli altri risultati, gia in ordine di convenienza.
    alternative: resto.slice(0, 8).map((o) => ({
      ...o,
      motivo: motivazione(o, voce.categoria),
    })),
  };
}
