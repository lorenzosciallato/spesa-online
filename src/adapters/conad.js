// Adapter per spesaonline.conad.it — DA IMPLEMENTARE.
//
// Questo e' il punto in cui si innesta il catalogo reale. Tutto il resto
// dell'app (parser, motore di scelta, interfaccia) e' gia pronto e non va
// toccato: deve solo arrivare qui un array di prodotti nella forma descritta
// sotto.
//
// Forma del prodotto attesa dal motore di scelta:
//   {
//     id: string,
//     nome: string,
//     marca: string,
//     prezzo: number,            // prezzo della singola confezione, in euro
//     formato: { valore: number, unita: 'g'|'kg'|'ml'|'l'|'pz' },
//     offerta: null | {
//       tipo: 'nxm',    n: 3, m: 2,          etichetta: '3x2'
//       tipo: 'bundle', n: 2, totale: 1.80,  etichetta: '2 a 1,80 €'
//       tipo: 'sconto', percentuale: 30,     etichetta: '-30%'
//     },
//     disponibile: boolean,
//     immagine?: string,
//   }
//
// DUE STRADE, da decidere dopo un'ispezione del sito:
//
// 1. Endpoint JSON interni (preferibile). Se il sito carica i risultati di
//    ricerca via XHR, si chiamano direttamente quelli: veloce, leggero,
//    molto meno fragile. Da verificare aprendo il sito e guardando il
//    traffico di rete durante una ricerca.
//
// 2. Playwright headless. Funziona sempre ma e' lento e si rompe a ogni
//    restyling. Richiede una sessione loggata persistente.
//
// In entrambi i casi servono: punto vendita Conad di Tolentino e modalita
// RITIRO IN NEGOZIO impostati sulla sessione, altrimenti prezzi e
// disponibilita non sono quelli giusti.

export const nome = 'conad';

export async function cerca(_query) {
  throw new Error(
    "Adapter Conad non ancora implementato. Avvia con CATALOGO=mock per lavorare sul resto dell'app.",
  );
}

// Non completare MAI l'ordine e non inserire MAI dati di pagamento:
// questa funzione si ferma all'aggiunta al carrello.
export async function aggiungiAlCarrello(_prodotto, _quantita) {
  throw new Error('Adapter Conad non ancora implementato');
}
