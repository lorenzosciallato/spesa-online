import test from 'node:test';
import assert from 'node:assert/strict';

import { analizzaLista, analizzaVoce } from '../src/parser.js';

test('senza quantita prende 1 confezione', () => {
  const voce = analizzaVoce('pasta');
  assert.equal(voce.nome, 'pasta');
  assert.equal(voce.quantita, 1);
});

test('riconosce la forma "latte x6"', () => {
  const voce = analizzaVoce('latte x6');
  assert.equal(voce.nome, 'latte');
  assert.equal(voce.quantita, 6);
});

test('riconosce numero, unita e articolo', () => {
  const voce = analizzaVoce('2 kg di pane');
  assert.equal(voce.nome, 'pane');
  assert.equal(voce.quantita, 2);
  assert.equal(voce.unita, 'kg');
});

test('riconosce i numeri dettati a parole', () => {
  const voce = analizzaVoce('tre bottiglie di acqua');
  assert.equal(voce.nome, 'acqua');
  assert.equal(voce.quantita, 3);
});

test('non taglia i nomi composti', () => {
  assert.equal(analizzaVoce('olio di oliva').nome, 'olio di oliva');
});

test('classifica i prodotti per la casa', () => {
  assert.equal(analizzaVoce('carta igienica').categoria, 'casa');
  assert.equal(analizzaVoce('latte').categoria, 'generico');
});

test('divide una lista dettata di seguito', () => {
  const voci = analizzaLista('latte x6, pasta e due confezioni di biscotti');
  assert.deepEqual(
    voci.map((v) => [v.nome, v.quantita]),
    [
      ['latte', 6],
      ['pasta', 1],
      ['biscotti', 2],
    ],
  );
});
