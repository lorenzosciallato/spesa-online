// Collaudo dell'adapter Conad contro il sito finto, con un vero Chromium.
// Se Playwright non ha un browser a disposizione i test vengono saltati.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { creaSitoFinto, statoSitoFinto, azzeraSitoFinto } from './sito-finto/server.js';

const server = creaSitoFinto();
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const porta = server.address().port;
const profilo = await mkdtemp(join(tmpdir(), 'spesa-conad-'));

process.env.CONAD_BASE_URL = `http://127.0.0.1:${porta}`;
process.env.CONAD_HEADLESS = '1';
process.env.CONAD_PROFILO = profilo;
process.env.CONAD_ATTESA_MS = '300';

const conad = await import('../src/adapters/conad.js');

let browserDisponibile = true;
try {
  await conad._interno.browser();
} catch (errore) {
  browserDisponibile = false;
  console.warn(`Browser non disponibile, salto i test dell'adapter: ${errore.message}`);
}

test.after(async () => {
  await conad.chiudi();
  server.close();
  await rm(profilo, { recursive: true, force: true });
});

test('chiude cookie e promozioni e legge le schede della ricerca', { skip: !browserDisponibile }, async () => {
  azzeraSitoFinto();
  const prodotti = await conad.cerca('latte');
  const nomi = prodotti.map((p) => p.nome);
  assert.ok(nomi.includes('Latte intero UHT 1 l'), nomi.join(', '));
  assert.equal(prodotti.length, 6);

  const conadUht = prodotti.find((p) => p.pid === '100');
  assert.equal(conadUht.prezzo, 0.89);
  assert.equal(conadUht.marca, 'Conad');
  assert.deepEqual(conadUht.formato, { valore: 1, unita: 'l' });
  assert.equal(conadUht.disponibile, true);
  assert.equal(conadUht.ricerca, 'latte');

  const granarolo = prodotti.find((p) => p.pid === '101');
  assert.deepEqual(granarolo.offerta, { tipo: 'nxm', n: 3, m: 2, etichetta: '3x2' });

  const zymil = prodotti.find((p) => p.pid === '103');
  assert.equal(zymil.prezzo, 1.09, 'prende il prezzo scontato, non il listino barrato');

  const alpro = prodotti.find((p) => p.pid === '104');
  assert.equal(alpro.disponibile, false);

  const multipack = prodotti.find((p) => p.pid === '105');
  assert.deepEqual(multipack.formato, { valore: 6, unita: 'l' });
  assert.deepEqual(multipack.offerta, { tipo: 'bundle', n: 2, totale: 9, etichetta: '2 a 9,00 €' });

  const popupChiusi = await (await conad._interno.browser()).evaluate(
    () => !document.querySelector('#onetrust-banner-sdk') && !document.querySelector('.modal.show'),
  );
  assert.equal(popupChiusi, true);
});

test('aggiunge al carrello la quantita richiesta usando lo stepper', { skip: !browserDisponibile }, async () => {
  azzeraSitoFinto();
  const prodotti = await conad.cerca('latte');
  const granarolo = prodotti.find((p) => p.pid === '101');

  const esito = await conad.aggiungiAlCarrello(granarolo, 3);
  assert.equal(esito.ok, true);
  assert.equal(esito.quantita, 3);
  assert.equal(statoSitoFinto().carrello.get('101'), 3);

  // Una seconda chiamata con quantita gia raggiunta non aggiunge altro.
  const di_nuovo = await conad.aggiungiAlCarrello(granarolo, 3);
  assert.equal(di_nuovo.quantita, 3);
  assert.equal(statoSitoFinto().carrello.get('101'), 3);
});

test('legge il carrello del sito con righe e totale', { skip: !browserDisponibile }, async () => {
  azzeraSitoFinto();
  const prodotti = await conad.cerca('penne');
  await conad.aggiungiAlCarrello(prodotti[0], 2);

  const carrello = await conad.leggiCarrello();
  assert.equal(carrello.righe.length, 1);
  assert.equal(carrello.righe[0].nome, 'Penne rigate 500 g');
  assert.equal(carrello.righe[0].quantita, 2);
  assert.equal(carrello.righe[0].prezzo, 1.38);
  assert.equal(carrello.totale, 1.38);
});

test('riconosce sessione, punto vendita Tolentino e ritiro in negozio', { skip: !browserDisponibile }, async () => {
  const s = await conad.stato();
  assert.equal(s.pronto, true, s.problemi.join('; '));
  assert.match(s.puntoVendita, /Tolentino/);
});

test('non apre mai il checkout, nemmeno se glielo si chiede', { skip: !browserDisponibile }, async () => {
  await assert.rejects(conad._interno.vaiA('/checkout'));
  assert.equal(statoSitoFinto().ordineCompletato, false);
  assert.ok(!statoSitoFinto().visite.some((v) => v.startsWith('/checkout')));
});
