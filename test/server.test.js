// Il server con il catalogo finto, da capo a fondo: lista -> scelte ->
// carrello -> rapporto. Verifica le API che usa l'interfaccia.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const server = spawn(process.execPath, [fileURLToPath(new URL('../src/server.js', import.meta.url))], {
  env: { ...process.env, PORT: '0', CATALOGO: 'mock' },
  stdio: ['ignore', 'pipe', 'inherit'],
});

const base = await new Promise((ok, ko) => {
  server.stdout.on('data', (d) => {
    const m = String(d).match(/http:\/\/localhost:(\d+)/);
    if (m) ok(`http://localhost:${m[1]}`);
  });
  server.once('exit', (c) => ko(new Error(`server uscito con ${c}`)));
});

test.after(() => server.kill());

async function json(percorso, corpo) {
  const r = await fetch(`${base}${percorso}`, corpo
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }
    : undefined);
  return { stato: r.status, dati: await r.json() };
}

test('/api/stato risponde con il catalogo attivo', async () => {
  const { dati } = await json('/api/stato');
  assert.equal(dati.catalogo, 'mock');
  assert.equal(dati.pronto, true);
});

test('/api/spesa sceglie e salta quello che non trova', async () => {
  const { dati } = await json('/api/spesa', { testo: 'latte x2, pasta, unicorno' });
  assert.equal(dati.risultati.length, 3);
  assert.equal(dati.risultati[0].stato, 'ok');
  assert.equal(dati.risultati[0].scelta.quantita, 2);
  assert.equal(dati.risultati[2].stato, 'saltato');
  assert.equal(dati.totale, 2.47);
});

test('/api/carrello aggiunge le scelte e restituisce righe, totale e falliti', async () => {
  const spesa = (await json('/api/spesa', { testo: 'latte x2, pasta' })).dati;
  const voci = spesa.risultati.map((r) => ({ prodotto: r.scelta.prodotto, quantita: r.scelta.quantita }));
  voci.push({ prodotto: { id: 'es1', nome: 'Prodotto esaurito di prova' }, quantita: 1 });

  const { dati } = await json('/api/carrello', { voci });
  assert.equal(dati.aggiunti.length, 2);
  assert.equal(dati.falliti.length, 1);
  assert.match(dati.falliti[0].motivo, /esaurito/);
  assert.equal(dati.carrello.righe.length, 2);
  assert.equal(dati.carrello.totale, Math.round((0.89 * 2 + 0.69) * 100) / 100);
});

test('/api/carrello rifiuta una richiesta vuota', async () => {
  const { stato } = await json('/api/carrello', { voci: [] });
  assert.equal(stato, 400);
});
