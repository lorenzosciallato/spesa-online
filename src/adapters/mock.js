// Catalogo finto, serve a sviluppare e testare interfaccia e motore di scelta
// senza dipendere dal sito Conad. Stessa forma dei dati dell'adapter reale.

const CATALOGO = [
  // latte
  { id: 'lt1', nome: 'Latte intero UHT', marca: 'Conad', prezzo: 0.89, formato: { valore: 1, unita: 'l' }, offerta: null, parole: ['latte', 'latte intero'] },
  { id: 'lt2', nome: 'Latte parzialmente scremato', marca: 'Granarolo', prezzo: 1.39, formato: { valore: 1, unita: 'l' }, offerta: { tipo: 'nxm', n: 3, m: 2, etichetta: '3x2' }, parole: ['latte', 'latte scremato'] },
  { id: 'lt3', nome: 'Latte fresco intero', marca: 'Parmalat', prezzo: 1.75, formato: { valore: 1, unita: 'l' }, offerta: null, parole: ['latte', 'latte fresco'] },
  { id: 'lt4', nome: 'Latte intero UHT', marca: 'Zymil', prezzo: 1.55, formato: { valore: 1, unita: 'l' }, offerta: { tipo: 'sconto', percentuale: 30, etichetta: '-30%' }, parole: ['latte'] },

  // pasta
  { id: 'pa1', nome: 'Penne rigate', marca: 'Conad', prezzo: 0.69, formato: { valore: 500, unita: 'g' }, offerta: null, parole: ['pasta', 'penne'] },
  { id: 'pa2', nome: 'Spaghetti n.5', marca: 'Barilla', prezzo: 1.19, formato: { valore: 500, unita: 'g' }, offerta: { tipo: 'bundle', n: 2, totale: 1.80, etichetta: '2 a 1,80 €' }, parole: ['pasta', 'spaghetti'] },
  { id: 'pa3', nome: 'Fusilli', marca: 'De Cecco', prezzo: 1.45, formato: { valore: 500, unita: 'g' }, offerta: null, parole: ['pasta', 'fusilli'] },

  // pane
  { id: 'pn1', nome: 'Pane casereccio', marca: 'Conad', prezzo: 2.20, formato: { valore: 500, unita: 'g' }, offerta: null, parole: ['pane'] },
  { id: 'pn2', nome: 'Pane in cassetta integrale', marca: 'Mulino Bianco', prezzo: 2.49, formato: { valore: 400, unita: 'g' }, offerta: null, parole: ['pane', 'pancarre'] },

  // acqua
  { id: 'aq1', nome: 'Acqua naturale 6x1,5L', marca: 'Conad', prezzo: 1.74, formato: { valore: 9, unita: 'l' }, offerta: null, parole: ['acqua'] },
  { id: 'aq2', nome: 'Acqua naturale 6x1,5L', marca: 'San Benedetto', prezzo: 2.39, formato: { valore: 9, unita: 'l' }, offerta: { tipo: 'nxm', n: 2, m: 1, etichetta: '2x1' }, parole: ['acqua'] },

  // prodotti per la casa (qui conta il prezzo unitario)
  { id: 'ci1', nome: 'Carta igienica 4 rotoli', marca: 'Conad', prezzo: 1.99, formato: { valore: 4, unita: 'pz' }, offerta: null, parole: ['carta igienica'] },
  { id: 'ci2', nome: 'Carta igienica 12 rotoli', marca: 'Foxy', prezzo: 4.99, formato: { valore: 12, unita: 'pz' }, offerta: null, parole: ['carta igienica'] },
  { id: 'ci3', nome: 'Carta igienica 24 rotoli', marca: 'Regina', prezzo: 8.49, formato: { valore: 24, unita: 'pz' }, offerta: { tipo: 'sconto', percentuale: 20, etichetta: '-20%' }, parole: ['carta igienica'] },

  { id: 'dl1', nome: 'Detersivo lavatrice liquido', marca: 'Conad', prezzo: 3.49, formato: { valore: 1.5, unita: 'l' }, offerta: null, parole: ['detersivo', 'detersivo lavatrice', 'bucato'] },
  { id: 'dl2', nome: 'Detersivo lavatrice liquido', marca: 'Dash', prezzo: 8.99, formato: { valore: 4.5, unita: 'l' }, offerta: null, parole: ['detersivo', 'detersivo lavatrice', 'bucato'] },
  { id: 'dl3', nome: 'Tabs lavastoviglie 60 pastiglie', marca: 'Finish', prezzo: 11.99, formato: { valore: 60, unita: 'pz' }, offerta: { tipo: 'sconto', percentuale: 25, etichetta: '-25%' }, parole: ['tabs', 'lavastoviglie', 'pastiglie'] },
  { id: 'dl4', nome: 'Tabs lavastoviglie 20 pastiglie', marca: 'Conad', prezzo: 3.99, formato: { valore: 20, unita: 'pz' }, offerta: null, parole: ['tabs', 'lavastoviglie', 'pastiglie'] },

  // vari
  { id: 'uo1', nome: 'Uova fresche medie 6pz', marca: 'Conad', prezzo: 1.59, formato: { valore: 6, unita: 'pz' }, offerta: null, parole: ['uova'] },
  { id: 'ca1', nome: 'Caffe macinato 250g', marca: 'Lavazza', prezzo: 3.29, formato: { valore: 250, unita: 'g' }, offerta: { tipo: 'nxm', n: 3, m: 2, etichetta: '3x2' }, parole: ['caffe'] },
  { id: 'es1', nome: 'Prodotto esaurito di prova', marca: 'Test', prezzo: 1.00, formato: { valore: 1, unita: 'pz' }, offerta: null, disponibile: false, parole: ['esaurito'] },
];

export const nome = 'mock';

export async function cerca(query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const risultati = CATALOGO.filter((p) => {
    const testo = `${p.nome} ${p.marca} ${p.parole.join(' ')}`.toLowerCase();
    // Tutte le parole della query devono comparire da qualche parte.
    return q.split(/\s+/).every((parola) => testo.includes(parola));
  });

  return risultati.map((p) => ({ ...p, disponibile: p.disponibile !== false }));
}

export async function aggiungiAlCarrello() {
  throw new Error("L'adapter mock non ha un carrello reale");
}
