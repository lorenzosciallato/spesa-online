import test from 'node:test';
import assert from 'node:assert/strict';

import {
  leggiPrezzo, leggiFormato, leggiOfferta, interpretaScheda, tuttiIPrezzi,
} from '../src/adapters/conad-parse.js';

test('legge i prezzi scritti all italiana', () => {
  assert.equal(leggiPrezzo('1,29 €'), 1.29);
  assert.equal(leggiPrezzo('€ 0,89'), 0.89);
  assert.equal(leggiPrezzo('12.50'), 12.5);
});

test('scarta il prezzo al chilo e al litro', () => {
  assert.equal(leggiPrezzo('1,29 €/kg'), null);
  assert.equal(leggiPrezzo('€ 2,58 al kg'), null);
  assert.equal(leggiPrezzo('0,89 € / l'), null);
  assert.deepEqual(tuttiIPrezzi('1,39 € 1,39 €/l -30% 1,99 € al kg'), [1.39]);
});

test('legge il formato, anche nei multipack', () => {
  assert.deepEqual(leggiFormato('500 g'), { valore: 500, unita: 'g' });
  assert.deepEqual(leggiFormato('Acqua naturale 6x1,5 L'), { valore: 9, unita: 'l' });
  assert.deepEqual(leggiFormato('Carta igienica 4 rotoli'), { valore: 4, unita: 'pz' });
  assert.deepEqual(leggiFormato('Caffe 250gr'), { valore: 250, unita: 'g' });
});

test('riconosce le offerte 3x2, prendi/paghi, 1+1', () => {
  assert.deepEqual(leggiOfferta('3x2', 1), { tipo: 'nxm', n: 3, m: 2, etichetta: '3x2' });
  assert.equal(leggiOfferta('Prendi 3 paghi 2', 1).n, 3);
  assert.deepEqual(leggiOfferta('1+1', 1), { tipo: 'nxm', n: 2, m: 1, etichetta: '1+1' });
});

test('non scambia il formato 6x1,5 L per un 6x1', () => {
  assert.equal(leggiOfferta('6x1,5 L', 1), null);
  assert.equal(leggiOfferta('4x125 g', 1), null);
});

test('riconosce "2 a 3,00 €" e lo sconto sul secondo pezzo', () => {
  assert.deepEqual(leggiOfferta('2 a 3,00 €', 2), { tipo: 'bundle', n: 2, totale: 3, etichetta: '2 a 3,00 €' });
  const secondo = leggiOfferta('50% sul secondo pezzo', 2);
  assert.equal(secondo.tipo, 'bundle');
  assert.equal(secondo.totale, 3);
});

test('uno sconto percentuale resta solo informativo: il prezzo in scheda e gia scontato', () => {
  assert.deepEqual(leggiOfferta('-30%', 1), { tipo: 'prezzo', etichetta: '-30%' });
});

test('interpreta una scheda completa preferendo il prezzo scontato', () => {
  const p = interpretaScheda({
    pid: '103',
    href: 'https://x/p/103.html',
    nome: 'Latte senza lattosio 1 l',
    marca: 'Zymil',
    prezzi: ['1,09 €', '1,55 €'],
    prezziPieni: ['1,55 €'],
    promo: ['-30%'],
    formato: '',
    esaurito: false,
    testo: 'Zymil Latte senza lattosio 1 l -30% 1,55 € 1,09 € 1,09 €/l Aggiungi',
  });
  assert.equal(p.prezzo, 1.09);
  assert.equal(p.prezzoPieno, 1.55);
  assert.deepEqual(p.formato, { valore: 1, unita: 'l' });
  assert.equal(p.offerta.tipo, 'prezzo');
  assert.equal(p.disponibile, true);
});

test('scheda senza selettori di prezzo: ripiega sul testo, ignorando il prezzo al kg', () => {
  const p = interpretaScheda({
    nome: 'Penne rigate 500 g',
    prezzi: [],
    testo: 'Conad Penne rigate 500 g 0,69 € 1,38 €/kg Aggiungi',
  });
  assert.equal(p.prezzo, 0.69);
});

test('un prodotto esaurito risulta non disponibile', () => {
  const p = interpretaScheda({ nome: 'Latte di mandorla', prezzi: ['2,19 €'], testo: 'Latte di mandorla 2,19 € Prodotto esaurito' });
  assert.equal(p.disponibile, false);
});
