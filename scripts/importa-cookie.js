// Importa nel profilo del browser dell'app i cookie di Conad esportati dal
// browser normale (dove l'accesso e' gia' fatto a mano). Cosi' il robot
// risulta loggato senza passare dal modulo di login (e dal reCAPTCHA).
//
// Uso:
//   node scripts/importa-cookie.js percorso/dei/cookie.json
//
// Il file puo' essere nel formato dell'estensione "Cookie-Editor" /
// "EditThisCookie" (un elenco) oppure nel formato Playwright ({ cookies: [...] }).

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROFILO = process.env.CONAD_PROFILO || join(homedir(), '.spesa-conad', 'profilo');

function normalizzaSameSite(v, secure) {
  const s = String(v || '').toLowerCase();
  if (s === 'strict') return 'Strict';
  if (s === 'no_restriction' || s === 'none') return secure ? 'None' : 'Lax';
  return 'Lax';
}

function normalizza(grezzi) {
  const out = [];
  for (const c of grezzi) {
    if (!c || !c.name || c.value == null) continue;
    const dominio = String(c.domain || '');
    if (!/conad/i.test(dominio)) continue; // solo i cookie di Conad
    const secure = Boolean(c.secure);
    const cookie = {
      name: String(c.name),
      value: String(c.value),
      domain: dominio,
      path: c.path ? String(c.path) : '/',
      httpOnly: Boolean(c.httpOnly),
      secure,
      sameSite: normalizzaSameSite(c.sameSite, secure),
    };
    const scad = c.expirationDate ?? c.expires;
    if (typeof scad === 'number' && scad > 0) cookie.expires = Math.round(scad);
    else cookie.expires = -1; // cookie di sessione
    out.push(cookie);
  }
  return out;
}

async function main() {
  const percorso = process.argv[2];
  if (!percorso) {
    console.error('Manca il file. Uso: node scripts/importa-cookie.js cookie.json');
    process.exit(1);
  }

  const testo = await readFile(percorso, 'utf8');
  let dati;
  try {
    dati = JSON.parse(testo);
  } catch {
    console.error('Il file non e\' un JSON valido. Riesporta i cookie e riprova.');
    process.exit(1);
  }
  const grezzi = Array.isArray(dati) ? dati : (Array.isArray(dati.cookies) ? dati.cookies : []);
  const cookie = normalizza(grezzi);
  if (cookie.length === 0) {
    console.error('Nessun cookie di Conad trovato nel file. Esportali stando su spesaonline.conad.it (loggato).');
    process.exit(1);
  }

  const { chromium } = await import('playwright');
  const contesto = await chromium.launchPersistentContext(PROFILO, {
    headless: true,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
  });
  try {
    await contesto.addCookies(cookie);
    console.log(`OK: importati ${cookie.length} cookie di Conad nel profilo dell'app.`);
    console.log('Ora riavvia l\'app e provala: apri la pagina della spesa, cerca "latte" e premi Vai.');
    console.log('Se aggiunge il prodotto, sei loggato. Controlla che negozio sia Tolentino e modalita\' ritiro.');
  } finally {
    await contesto.close();
  }
}

main().catch((e) => {
  console.error('Errore:', e.message);
  process.exit(1);
});
