// Server locale, zero dipendenze: solo moduli nativi di Node.
// Serve l'interfaccia in /public ed espone due endpoint JSON.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analizzaLista } from './parser.js';
import { scegliMigliore } from './scoring.js';

const RADICE = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(RADICE, 'public');
const PORTA = Number(process.env.PORT) || 3000;

const catalogo = await caricaCatalogo();

async function caricaCatalogo() {
  const scelto = process.env.CATALOGO || 'mock';
  const modulo = await import(`./adapters/${scelto}.js`);
  console.log(`Catalogo attivo: ${modulo.nome}`);
  return modulo;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function inviaJson(res, stato, dati) {
  const corpo = JSON.stringify(dati);
  res.writeHead(stato, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(corpo),
  });
  res.end(corpo);
}

function leggiCorpo(req) {
  return new Promise((risolvi, rifiuta) => {
    const pezzi = [];
    let dimensione = 0;
    req.on('data', (pezzo) => {
      dimensione += pezzo.length;
      if (dimensione > 1e6) {
        rifiuta(new Error('Richiesta troppo grande'));
        req.destroy();
        return;
      }
      pezzi.push(pezzo);
    });
    req.on('end', () => {
      try {
        risolvi(JSON.parse(Buffer.concat(pezzi).toString('utf8') || '{}'));
      } catch {
        rifiuta(new Error('JSON non valido'));
      }
    });
    req.on('error', rifiuta);
  });
}

// Elabora una singola voce: cerca, sceglie, prepara le alternative.
async function elaboraVoce(voce) {
  let prodotti = [];
  try {
    prodotti = await catalogo.cerca(voce.nome);
  } catch (errore) {
    return { voce, stato: 'errore', messaggio: errore.message };
  }

  if (prodotti.length === 0) {
    // Regola del progetto: se non esiste, non si sostituisce. Si salta.
    return { voce, stato: 'saltato', messaggio: 'nessun prodotto trovato' };
  }

  const { scelta, alternative } = scegliMigliore(prodotti, voce);
  if (!scelta) {
    return { voce, stato: 'saltato', messaggio: 'nessun prodotto disponibile' };
  }

  return { voce, stato: 'ok', scelta, alternative };
}

async function gestisciSpesa(req, res) {
  const corpo = await leggiCorpo(req);
  const testo = String(corpo.testo || '').trim();
  if (!testo) return inviaJson(res, 400, { errore: 'Lista vuota' });

  const voci = analizzaLista(testo);
  const risultati = await Promise.all(voci.map(elaboraVoce));

  const totale = risultati
    .filter((r) => r.stato === 'ok')
    .reduce((somma, r) => somma + r.scelta.totale, 0);

  inviaJson(res, 200, {
    catalogo: catalogo.nome,
    risultati,
    totale: Math.round(totale * 100) / 100,
  });
}

// Ricerca libera: serve al pulsante "cerca altro" quando le alternative
// proposte non vanno bene.
async function gestisciRicerca(req, res, url) {
  const query = url.searchParams.get('q') || '';
  const quantita = Number(url.searchParams.get('quantita')) || 1;
  if (!query.trim()) return inviaJson(res, 400, { errore: 'Query vuota' });

  const prodotti = await catalogo.cerca(query);
  const { scelta, alternative } = scegliMigliore(prodotti, {
    quantita,
    categoria: 'generico',
  });

  inviaJson(res, 200, {
    opzioni: [scelta, ...alternative].filter(Boolean),
  });
}

async function serviStatico(res, percorso) {
  const relativo = percorso === '/' ? '/index.html' : percorso;
  // normalize + controllo prefisso: niente uscite da /public con "..".
  const file = normalize(join(PUBLIC, relativo));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403).end('Vietato');
    return;
  }

  try {
    const contenuto = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] || 'application/octet-stream',
    });
    res.end(contenuto);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Non trovato');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'POST' && url.pathname === '/api/spesa') {
      return await gestisciSpesa(req, res);
    }
    if (req.method === 'GET' && url.pathname === '/api/cerca') {
      return await gestisciRicerca(req, res, url);
    }
    if (req.method === 'GET') {
      return await serviStatico(res, url.pathname);
    }
    inviaJson(res, 405, { errore: 'Metodo non consentito' });
  } catch (errore) {
    console.error(errore);
    inviaJson(res, 500, { errore: errore.message });
  }
});

server.listen(PORTA, () => {
  console.log(`Spesa in ascolto su http://localhost:${PORTA}`);
});
