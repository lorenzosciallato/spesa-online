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
const PORTA = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);

const catalogo = await caricaCatalogo();

// Se l'app sta su un server raggiungibile da internet, una password
// (SPESA_PASSWORD) protegge tutto: pagine, API e finestra sul browser.
const PASSWORD = process.env.SPESA_PASSWORD || '';

function autorizzato(req) {
  if (!PASSWORD) return true;
  const intestazione = req.headers.authorization || '';
  if (!intestazione.startsWith('Basic ')) return false;
  const decodificato = Buffer.from(intestazione.slice(6), 'base64').toString('utf8');
  const data = decodificato.slice(decodificato.indexOf(':') + 1);
  return data === PASSWORD;
}

async function caricaCatalogo() {
  const scelto = process.env.CATALOGO || 'mock';
  if (!/^[a-z]+$/.test(scelto)) throw new Error(`Catalogo non valido: ${scelto}`);
  const modulo = await import(`./adapters/${scelto}.js`);
  console.log(`Catalogo attivo: ${modulo.nome}`);
  return modulo;
}

// Alla chiusura spengo anche il browser dell'adapter, se c'e'.
for (const segnale of ['SIGINT', 'SIGTERM']) {
  process.once(segnale, async () => {
    await catalogo.chiudi?.().catch(() => {});
    process.exit(0);
  });
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

// Stato della sessione sul sito: loggato? Tolentino? ritiro in negozio?
async function gestisciStato(res) {
  if (!catalogo.stato) {
    return inviaJson(res, 200, { catalogo: catalogo.nome, pronto: true, problemi: [] });
  }
  try {
    inviaJson(res, 200, { catalogo: catalogo.nome, ...(await catalogo.stato()) });
  } catch (errore) {
    inviaJson(res, 200, {
      catalogo: catalogo.nome,
      pronto: false,
      problemi: [`non riesco ad aprire il sito: ${errore.message}`],
    });
  }
}

// Mette nel carrello del sito le scelte confermate dall'interfaccia.
// Si ferma qui: niente orario di ritiro, niente pagamento.
async function gestisciCarrello(req, res) {
  const corpo = await leggiCorpo(req);
  const voci = Array.isArray(corpo.voci) ? corpo.voci : [];
  if (voci.length === 0) return inviaJson(res, 400, { errore: 'Niente da aggiungere' });

  const aggiunti = [];
  const falliti = [];
  // Uno alla volta: l'adapter reale guida un solo browser.
  for (const { prodotto, quantita } of voci) {
    if (!prodotto || !prodotto.nome) continue;
    try {
      const esito = await catalogo.aggiungiAlCarrello(prodotto, quantita);
      if (esito.ok) aggiunti.push({ prodotto, quantita: esito.quantita, nota: esito.nota });
      else falliti.push({ prodotto, quantita, motivo: esito.motivo || `nel carrello ne risultano ${esito.quantita}` });
    } catch (errore) {
      falliti.push({ prodotto, quantita, motivo: errore.message });
    }
  }

  let carrello = null;
  try {
    carrello = catalogo.leggiCarrello ? await catalogo.leggiCarrello() : null;
  } catch (errore) {
    carrello = { errore: errore.message };
  }

  inviaJson(res, 200, { catalogo: catalogo.nome, aggiunti, falliti, carrello });
}

// Finestra sul browser del server: screenshot e comandi.
async function gestisciSchermo(res) {
  if (!catalogo.schermo) return inviaJson(res, 404, { errore: 'Il catalogo attivo non ha un browser' });
  const { immagine, url, larghezza, altezza } = await catalogo.schermo();
  res.writeHead(200, {
    'Content-Type': 'image/jpeg',
    'Content-Length': immagine.length,
    'Cache-Control': 'no-store',
    'X-Url': encodeURI(url),
    'X-Larghezza': larghezza,
    'X-Altezza': altezza,
  });
  res.end(immagine);
}

async function gestisciAzione(req, res) {
  if (!catalogo.azione) return inviaJson(res, 404, { errore: 'Il catalogo attivo non ha un browser' });
  const corpo = await leggiCorpo(req);
  try {
    inviaJson(res, 200, await catalogo.azione(corpo));
  } catch (errore) {
    inviaJson(res, 400, { errore: errore.message });
  }
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

  if (!autorizzato(req)) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Spesa", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    });
    return res.end('Serve la password');
  }

  try {
    if (req.method === 'POST' && url.pathname === '/api/spesa') {
      return await gestisciSpesa(req, res);
    }
    if (req.method === 'GET' && url.pathname === '/api/cerca') {
      return await gestisciRicerca(req, res, url);
    }
    if (req.method === 'GET' && url.pathname === '/api/stato') {
      return await gestisciStato(res);
    }
    if (req.method === 'POST' && url.pathname === '/api/carrello') {
      return await gestisciCarrello(req, res);
    }
    if (req.method === 'GET' && url.pathname === '/api/browser/schermo') {
      return await gestisciSchermo(res);
    }
    if (req.method === 'POST' && url.pathname === '/api/browser/azione') {
      return await gestisciAzione(req, res);
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
  console.log(`Spesa in ascolto su http://localhost:${server.address().port}`);
});
