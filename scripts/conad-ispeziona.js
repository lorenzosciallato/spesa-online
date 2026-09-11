// Diagnostica per calibrare i selettori sul sito vero.
//
//   npm run conad:ispeziona -- latte
//
// Apre la ricerca, salva screenshot e HTML nella cartella ./ispezione e
// stampa cosa ha riconosciuto: quale selettore ha trovato le schede, quanti
// prodotti, prezzi, formati, offerte. Se qualcosa manca, si aggiusta
// src/adapters/conad-selettori.js guardando l'HTML salvato.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const query = process.argv.slice(2).join(' ').trim() || 'latte';
process.env.CONAD_DEBUG = '1';

const conad = await import('../src/adapters/conad.js');

const cartella = join(process.cwd(), 'ispezione');
await mkdir(cartella, { recursive: true });

console.log(`Cerco "${query}"...`);
const esito = await conad.ispeziona(query);
const pagina = await conad._interno.browser();

const base = join(cartella, `ricerca-${query.replace(/[^a-z0-9]+/gi, '-')}`);
await pagina.screenshot({ path: `${base}.png`, fullPage: true });
await writeFile(`${base}.html`, await pagina.content());
await writeFile(`${base}.json`, JSON.stringify(esito, null, 2));

console.log(`\nURL: ${esito.url}`);
console.log(`Selettore delle schede: ${esito.selettoreUsato || 'NESSUNO (nessuna scheda riconosciuta)'}`);
console.log(`Schede trovate: ${esito.schede.length}\n`);

for (const p of esito.prodotti.filter(Boolean)) {
  const formato = p.formato ? `${p.formato.valore} ${p.formato.unita}` : '?';
  const offerta = p.offerta ? p.offerta.etichetta : '-';
  console.log(`- [${p.pid || '?'}] ${p.nome} | ${p.marca || '?'} | ${p.prezzo.toFixed(2)} € | ${formato} | offerta: ${offerta} | ${p.disponibile ? 'disponibile' : 'ESAURITO'}`);
}

if (esito.schede.length === 0) {
  console.log('\nNessuna scheda: guarda l\'HTML salvato e aggiungi il selettore giusto a SCHEDA in conad-selettori.js.');
} else {
  const senzaPrezzo = esito.prodotti.filter((p) => p && !p.prezzo).length;
  if (senzaPrezzo) console.log(`\n${senzaPrezzo} schede senza prezzo: controlla DENTRO_SCHEDA.prezzo.`);
}

console.log(`\nSalvato in ${base}.{png,html,json}`);
await conad.chiudi();
process.exit(0);
