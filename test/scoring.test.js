import test from 'node:test';
import assert from 'node:assert/strict';

import { costoPer, scegliMigliore } from '../src/scoring.js';
import { cerca } from '../src/adapters/mock.js';

const prodotto = (extra) => ({
  id: 'x',
  nome: 'x',
  marca: 'x',
  prezzo: 2,
  formato: { valore: 1, unita: 'l' },
  offerta: null,
  disponibile: true,
  ...extra,
});

test('3x2: tre pezzi si pagano due', () => {
  const p = prodotto({ offerta: { tipo: 'nxm', n: 3, m: 2, etichetta: '3x2' } });
  assert.equal(costoPer(p, 3), 4);
  assert.equal(costoPer(p, 4), 6); // 3 scontati + 1 pieno
});

test('bundle: due a prezzo fisso', () => {
  const p = prodotto({ offerta: { tipo: 'bundle', n: 2, totale: 3, etichetta: '2 a 3 €' } });
  assert.equal(costoPer(p, 2), 3);
});

test('sconto percentuale', () => {
  const p = prodotto({ prezzo: 10, offerta: { tipo: 'sconto', percentuale: 30, etichetta: '-30%' } });
  assert.equal(costoPer(p, 1), 7);
});

test('sceglie la confezione singola piu economica', async () => {
  const { scelta } = scegliMigliore(await cerca('latte'), {
    quantita: 1,
    categoria: 'generico',
  });
  assert.equal(scelta.prodotto.marca, 'Conad');
  assert.equal(scelta.totale, 0.89);
});

test("non alza la quantita se l'offerta non batte il singolo piu economico", async () => {
  // Il 3x2 su Granarolo porta il pezzo a 0,93 €, sopra gli 0,89 € del Conad.
  const { scelta } = scegliMigliore(await cerca('latte'), {
    quantita: 1,
    categoria: 'generico',
  });
  assert.equal(scelta.quantita, 1);
});

test("alza la quantita quando l'offerta scende sotto il singolo piu economico", () => {
  const prodotti = [
    prodotto({ id: 'caro', prezzo: 3, offerta: { tipo: 'nxm', n: 3, m: 2, etichetta: '3x2' } }),
    prodotto({ id: 'base', prezzo: 2.5, offerta: null }),
  ];
  // 3x2 su 3 € = 2 € a pezzo, sotto i 2,50 € del singolo piu economico.
  const { scelta } = scegliMigliore(prodotti, { quantita: 1, categoria: 'generico' });
  assert.equal(scelta.prodotto.id, 'caro');
  assert.equal(scelta.quantita, 3);
  assert.equal(scelta.quantitaAlzataPerOfferta, true);
});

test('per i prodotti della casa vince il prezzo unitario, non la confezione', async () => {
  const { scelta } = scegliMigliore(await cerca('carta igienica'), {
    quantita: 1,
    categoria: 'casa',
  });
  // Regina 24 rotoli a -20% = 6,79 € -> 0,283 €/rotolo, il migliore.
  assert.equal(scelta.prodotto.marca, 'Regina');
  assert.equal(scelta.prezzoUnitario.unita, 'pz');
});

test('scarta i prodotti esauriti', async () => {
  const { scelta } = scegliMigliore(await cerca('esaurito'), {
    quantita: 1,
    categoria: 'generico',
  });
  assert.equal(scelta, null);
});
