// Adapter per spesaonline.conad.it, guidato da Playwright.
//
// Idea: il browser e' uno solo, con un profilo persistente sul disco, cosi'
// accesso, punto vendita (Conad di Tolentino) e modalita' (RITIRO IN NEGOZIO)
// si impostano una volta a mano (`npm run conad:login`) e restano.
//
// Tutto quello che dipende dall'HTML del sito sta in conad-selettori.js;
// tutto quello che interpreta i testi sta in conad-parse.js. Qui c'e' solo
// la coreografia: apri, chiudi i popup, cerca, leggi, aggiungi, rileggi.
//
// Non completa MAI l'ordine: gli URL di orario di ritiro, checkout e
// pagamento sono bloccati a livello di browser (vedi URL_VIETATI).

import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import * as S from './conad-selettori.js';
import { interpretaScheda, numero, leggiPrezzo } from './conad-parse.js';

export const nome = 'conad';

const PROFILO = process.env.CONAD_PROFILO || join(homedir(), '.spesa-conad', 'profilo');
const HEADLESS = process.env.CONAD_HEADLESS === '1';
const CANALE = process.env.CONAD_BROWSER || ''; // 'chrome' per usare Google Chrome installato
const ATTESA = Number(process.env.CONAD_ATTESA_MS) || 1500;
const DEBUG = process.env.CONAD_DEBUG === '1';

let contesto = null;
let pagina = null;

// Le operazioni sul browser vanno una alla volta: la pagina e' una sola.
let coda = Promise.resolve();
function inFila(lavoro) {
  const esito = coda.then(lavoro, lavoro);
  coda = esito.catch(() => {});
  return esito;
}

async function browser() {
  if (pagina && !pagina.isClosed()) return pagina;

  const { chromium } = await import('playwright');
  await mkdir(PROFILO, { recursive: true });

  contesto = await chromium.launchPersistentContext(PROFILO, {
    headless: HEADLESS,
    channel: CANALE || undefined,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  // Rete di sicurezza: le pagine di checkout, orario e pagamento non si
  // aprono proprio, qualunque cosa faccia il resto del codice.
  await contesto.route('**/*', (route) => {
    const url = route.request().url().toLowerCase();
    const percorso = url.replace(/^https?:\/\/[^/]+/, '');
    const vietato = S.URL_VIETATI.some((pezzo) => percorso.includes(pezzo));
    if (vietato && route.request().resourceType() === 'document') {
      console.warn(`[conad] bloccata navigazione vietata: ${url}`);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });

  pagina = contesto.pages()[0] || (await contesto.newPage());
  pagina.setDefaultTimeout(15000);
  contesto.on('close', () => {
    pagina = null;
    contesto = null;
  });
  return pagina;
}

export async function chiudi() {
  if (contesto) await contesto.close().catch(() => {});
  contesto = null;
  pagina = null;
}

function urlDi(percorso) {
  return percorso.startsWith('http') ? percorso : `${S.BASE_URL}${percorso}`;
}

async function vaiA(percorso) {
  const p = await browser();
  const destinazione = urlDi(percorso);
  const attuale = p.url();
  if (attuale !== destinazione) {
    await p.goto(destinazione, { waitUntil: 'domcontentloaded' });
  }
  await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await chiudiPopup(p);
  return p;
}

// Chiude cookie e promozioni: prova ogni selettore, clicca cio' che e' visibile.
async function chiudiPopup(p) {
  for (let giro = 0; giro < 2; giro += 1) {
    let chiuso = false;
    for (const selettore of S.POPUP) {
      const bottone = p.locator(selettore).first();
      try {
        if (await bottone.isVisible({ timeout: 150 })) {
          await bottone.click({ timeout: 2000 });
          chiuso = true;
          await p.waitForTimeout(300);
        }
      } catch {
        /* non c'e' o non e' cliccabile: avanti */
      }
    }
    if (!chiuso) break;
  }
}

// Selettori usabili dentro page.evaluate (solo CSS puro).
function soloCss(lista) {
  return lista.filter((s) => !s.includes(':has-text') && !s.startsWith('text='));
}

const SELETTORI_ESTRAZIONE = {
  scheda: soloCss(S.SCHEDA),
  dentro: Object.fromEntries(
    Object.entries(S.DENTRO_SCHEDA).map(([k, v]) => [k, soloCss(v)]),
  ),
  esaurito: S.TESTI.esaurito.source,
};

// Gira nel browser: trova le schede e tira fuori i testi grezzi.
function estraiSchede(sel) {
  const testoDi = (el) => (el ? (el.innerText || el.textContent || '').trim() : '');
  const primo = (radice, lista) => {
    for (const s of lista) {
      const el = radice.querySelector(s);
      if (el && testoDi(el)) return el;
    }
    return null;
  };
  const tutti = (radice, lista) => {
    const out = [];
    for (const s of lista) {
      for (const el of radice.querySelectorAll(s)) {
        const t = testoDi(el);
        if (t && !out.includes(t)) out.push(t);
      }
    }
    return out;
  };

  let schede = [];
  let selettoreUsato = null;
  for (const s of sel.scheda) {
    const trovate = [...document.querySelectorAll(s)].filter((el) => {
      const t = testoDi(el);
      return t.length > 5 && /€/.test(t) && el.getBoundingClientRect().height > 40;
    });
    // Tengo solo le schede "foglia": niente contenitori che ne includono altre.
    const foglie = trovate.filter((el) => !trovate.some((altro) => altro !== el && el.contains(altro)));
    if (foglie.length > 0) {
      schede = foglie;
      selettoreUsato = s;
      break;
    }
  }

  const reEsaurito = new RegExp(sel.esaurito, 'i');
  const risultati = schede.map((scheda) => {
    const nomeEl = primo(scheda, sel.dentro.nome);
    const link = scheda.querySelector('a[href*="/p/"]') || scheda.querySelector('a[href]');
    const img = scheda.querySelector('img');
    const bottone = scheda.querySelector('button');
    const esauritoEl = sel.dentro.esaurito.some((s) => scheda.querySelector(s));
    return {
      pid: scheda.getAttribute('data-pid') || scheda.dataset?.productId || scheda.dataset?.id || (link && link.getAttribute('data-pid')) || '',
      href: link ? link.href : '',
      nome: testoDi(nomeEl) || (link && (link.getAttribute('title') || testoDi(link))) || '',
      marca: testoDi(primo(scheda, sel.dentro.marca)),
      prezzi: tutti(scheda, sel.dentro.prezzo),
      prezziPieni: tutti(scheda, sel.dentro.prezzoPieno),
      formato: testoDi(primo(scheda, sel.dentro.formato)),
      promo: tutti(scheda, sel.dentro.promo),
      esaurito: esauritoEl || reEsaurito.test(testoDi(scheda).replace(testoDi(nomeEl), '')) || (bottone ? bottone.disabled : false),
      immagine: img ? img.currentSrc || img.src : '',
      testo: testoDi(scheda),
    };
  });

  return { selettoreUsato, schede: risultati };
}

async function salvaDebug(p, etichetta) {
  if (!DEBUG) return;
  const cartella = join(process.cwd(), 'ispezione');
  await mkdir(cartella, { recursive: true });
  const base = join(cartella, `${Date.now()}-${etichetta.replace(/[^a-z0-9]+/gi, '-')}`);
  await p.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
  await writeFile(`${base}.html`, await p.content()).catch(() => {});
}

/**
 * Cerca sul sito. Restituisce i prodotti nella forma attesa da scoring.js,
 * con in piu' `ricerca`, `pid` e `url` che servono poi ad aggiungerli.
 */
export function cerca(query) {
  return inFila(async () => {
    const p = await vaiA(S.PAGINE.ricerca(query));
    await p.waitForTimeout(ATTESA);
    await salvaDebug(p, `ricerca-${query}`);

    const { schede } = await p.evaluate(estraiSchede, SELETTORI_ESTRAZIONE);
    return schede
      .map(interpretaScheda)
      .filter(Boolean)
      .map((prodotto) => ({ ...prodotto, ricerca: query }));
  });
}

// Diagnostica per lo script di ispezione: cosa vede il browser.
export function ispeziona(query) {
  return inFila(async () => {
    const p = await vaiA(S.PAGINE.ricerca(query));
    await p.waitForTimeout(ATTESA);
    const esito = await p.evaluate(estraiSchede, SELETTORI_ESTRAZIONE);
    return { ...esito, prodotti: esito.schede.map(interpretaScheda), url: p.url() };
  });
}

// Primo elemento VISIBILE tra tutti quelli che combaciano. Non il primo del
// DOM: sul sito Conad lo stesso testo ("Conferma il negozio", "Accedi"...)
// compare piu' volte dentro modali chiuse, e il primo e' quasi sempre nascosto.
async function trovaVisibile(radice, selettore, massimo = 25) {
  const tutti = radice.locator(selettore);
  const n = Math.min(await tutti.count().catch(() => 0), massimo);
  for (let i = 0; i < n; i += 1) {
    const el = tutti.nth(i);
    if (await el.isVisible().catch(() => false)) return el;
  }
  return null;
}

async function cliccaVisibile(radice, selettore) {
  const el = await trovaVisibile(radice, selettore);
  if (!el) return false;
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await el.click({ timeout: 5000 });
  return true;
}

function testoSicuro(t) {
  return String(t || '').replace(/["\\]/g, '').trim().slice(0, 60);
}

async function primoVisibile(radice, selettori, timeout = 200) {
  for (const s of selettori) {
    const el = radice.locator(s).first();
    try {
      if (await el.isVisible({ timeout })) return el;
    } catch {
      /* avanti */
    }
  }
  return null;
}

// Trova la scheda del prodotto nella pagina dei risultati.
async function trovaScheda(p, prodotto) {
  const candidati = [];
  if (prodotto.pid) candidati.push(p.locator(`[data-pid="${prodotto.pid}"]`).first());
  if (prodotto.url) {
    const percorso = prodotto.url.replace(/^https?:\/\/[^/]+/, '');
    for (const s of S.SCHEDA) candidati.push(p.locator(s).filter({ has: p.locator(`a[href$="${percorso}"]`) }).first());
  }
  for (const s of S.SCHEDA) candidati.push(p.locator(s).filter({ hasText: prodotto.nome }).first());

  for (const c of candidati) {
    try {
      if (await c.isVisible({ timeout: 300 })) return c;
    } catch {
      /* avanti */
    }
  }
  return null;
}

// Quantita' di QUESTO prodotto nel carrello, letta dallo stepper della scheda.
// Lo stepper e' visibile solo se il prodotto e' davvero nel carrello: se non
// c'e' (o e' nascosto) `primoVisibile` torna null e la quantita' e' 0.
async function quantitaNellaScheda(scheda) {
  const campo = await primoVisibile(scheda, S.DENTRO_SCHEDA.quantita);
  if (!campo) return 0;
  const tag = await campo.evaluate((el) => el.tagName.toLowerCase());
  const valore = tag === 'input' || tag === 'select' ? await campo.inputValue() : await campo.innerText();
  return Math.round(numero(valore) || 0);
}

// Numero di articoli nel carrello secondo lo STATO REALE del sito: prima la
// variabile globale del carrello (sito vero), poi il contatore in alto a
// destra. Torna null se non riesce a leggerlo (es. da sloggato non c'e').
async function contaCarrello(p) {
  return p.evaluate((selettori) => {
    const num = (t) => {
      const m = String(t == null ? '' : t).replace(/\s/g, '').match(/(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    };
    try {
      const c = window.cart;
      if (c && typeof c === 'object') {
        for (const k of ['totalUnitCount', 'totalQuantity', 'totalItems', 'numberOfItems', 'productsQuantity', 'itemsQuantity', 'numItems']) {
          if (typeof c[k] === 'number') return c[k];
        }
        for (const k of ['items', 'products', 'entries', 'orderItems']) {
          if (Array.isArray(c[k])) return c[k].reduce((s, it) => s + (Number(it.quantity ?? it.qty ?? it.amount) || 1), 0);
        }
      }
    } catch {
      /* variabile non accessibile: uso il contatore visibile */
    }
    for (const s of selettori) {
      const el = document.querySelector(s);
      if (el) {
        const n = num(el.getAttribute('data-quantity') || el.textContent);
        if (n != null) return n;
      }
    }
    return null;
  }, S.CONTATORE);
}

// Il sito, invece di aggiungere, apre un pannello? Da sloggato manca la scelta
// del negozio/servizio; puo' anche comparire una modale di avviso. In quei
// casi il click non aggiunge nulla e va segnalato, non contato come successo.
// ATTENZIONE: NON usare window.interactionCondition per capire se manca il
// negozio: su Conad vale "REQUIRE_SERVICE_CHOICE" SEMPRE, anche a negozio
// gia' scelto. Il segnale vero e' window.pointOfService (l'oggetto del punto
// vendita) e window.typeOfService. Un pannello modale aperto blocca comunque.
async function motivoBlocco(p) {
  const stato = await p.evaluate(() => {
    const g = (k) => { try { return window[k]; } catch { return undefined; } };
    const pos = g('pointOfService');
    return {
      negozio: pos && typeof pos === 'object' ? Boolean(pos.name || pos.uid || pos.address) : Boolean(pos),
      loggato: Boolean(g('user')),
    };
  }).catch(() => ({ negozio: true, loggato: true }));

  if (!stato.negozio) {
    return stato.loggato
      ? 'sei loggato ma manca la scelta del negozio: apri "Accesso Conad", scegli Tolentino + ritiro e premi il tasto arancione'
      : 'non risulti loggato: importa i cookie in "Accesso Conad" e scegli Tolentino + ritiro';
  }
  const modale = await primoVisibile(p, S.MODALE_BLOCCANTE, 200);
  if (modale) {
    const testo = (await modale.innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 160);
    return `il sito ha aperto un pannello che blocca l'aggiunta${testo ? `: "${testo}"` : ''}`;
  }
  return null;
}

/**
 * Aggiunge `quantita` confezioni del prodotto al carrello del sito.
 * Si ferma qui: niente orario di ritiro, niente pagamento.
 */
export function aggiungiAlCarrello(prodotto, quantita) {
  return inFila(async () => {
    const voluta = Math.max(1, Math.round(quantita || 1));
    const p = await vaiA(S.PAGINE.ricerca(prodotto.ricerca || prodotto.nome));
    await p.waitForTimeout(ATTESA);

    let scheda = await trovaScheda(p, prodotto);
    if (!scheda && prodotto.url) {
      // Ripiego: la pagina del prodotto.
      await vaiA(prodotto.url);
      scheda = p.locator('main').first();
    }
    if (!scheda) throw new Error(`scheda non trovata per "${prodotto.nome}"`);

    await scheda.scrollIntoViewIfNeeded().catch(() => {});

    const giaNelCarrello = await quantitaNellaScheda(scheda);
    if (giaNelCarrello >= voluta) {
      return { ok: true, quantita: giaNelCarrello, nota: 'gia nel carrello' };
    }

    // Contatore del carrello PRIMA: serve a verificare l'aggiunta guardando
    // lo stato reale del carrello, non un campo della scheda.
    const primaContatore = await contaCarrello(p);

    // Primo click: "Aggiungi". Poi "+" finche' non arrivo alla quantita'.
    let attuale = giaNelCarrello;
    if (attuale === 0) {
      const aggiungi = await primoVisibile(scheda, S.DENTRO_SCHEDA.aggiungi, 400);
      if (!aggiungi) throw new Error(`bottone "Aggiungi" non trovato per "${prodotto.nome}"`);
      await aggiungi.click();
      await p.waitForTimeout(ATTESA);
      attuale = await quantitaNellaScheda(scheda);

      // Verifica reale: lo stepper mostra >=1, oppure il contatore e' salito.
      const dopoContatore = await contaCarrello(p);
      const contatoreSalito = primaContatore != null && dopoContatore != null && dopoContatore > primaContatore;
      if (attuale < 1 && !contatoreSalito) {
        const motivo = (await motivoBlocco(p)) || 'il click su "Aggiungi" non ha aggiunto nulla (nessuno stepper, contatore invariato)';
        await salvaDebug(p, `fallita-${prodotto.nome}`);
        return { ok: false, quantita: 0, motivo };
      }
      if (attuale < 1) attuale = 1; // stepper non leggibile ma il carrello e' salito
    }

    for (let tentativi = 0; attuale < voluta && tentativi < voluta + 3; tentativi += 1) {
      const piu = await primoVisibile(scheda, S.DENTRO_SCHEDA.piu, 400);
      if (!piu) {
        // Nessuno stepper: provo a scrivere la quantita' nel campo.
        const campo = await primoVisibile(scheda, S.DENTRO_SCHEDA.quantita);
        if (!campo) break;
        await campo.fill(String(voluta));
        await campo.press('Enter');
        await p.waitForTimeout(ATTESA);
        const letta = await quantitaNellaScheda(scheda);
        if (letta > attuale) attuale = letta;
        break;
      }
      await piu.click();
      await p.waitForTimeout(Math.max(400, ATTESA / 2));
      const letta = await quantitaNellaScheda(scheda);
      if (letta > attuale) {
        attuale = letta;
      } else {
        // Il "+" non ha avuto effetto: mi fermo e riporto la quantita' vera.
        break;
      }
    }

    await salvaDebug(p, `aggiunto-${prodotto.nome}`);
    if (attuale >= voluta) return { ok: true, quantita: attuale };
    return {
      ok: false,
      quantita: attuale,
      motivo: `nel carrello ne risultano ${attuale} invece di ${voluta}`,
    };
  });
}

// Legge il carrello del sito: righe e totale, per il riepilogo finale.
export function leggiCarrello() {
  return inFila(async () => {
    const p = await vaiA(S.PAGINE.carrello);
    await p.waitForTimeout(ATTESA);
    await salvaDebug(p, 'carrello');

    const grezzo = await p.evaluate((sel) => {
      const testoDi = (el) => (el ? (el.innerText || el.textContent || '').trim() : '');
      const primo = (radice, lista) => {
        for (const s of lista) {
          const el = radice.querySelector(s);
          if (el) return el;
        }
        return null;
      };
      let righe = [];
      for (const s of sel.riga) {
        righe = [...document.querySelectorAll(s)];
        if (righe.length) break;
      }
      const totaleEl = primo(document, sel.totale);
      return {
        righe: righe.map((r) => {
          const q = primo(r, sel.quantita);
          return {
            nome: testoDi(primo(r, sel.nome)),
            marca: testoDi(primo(r, sel.marca)),
            quantita: q ? (q.value ?? testoDi(q)) : '',
            prezzo: testoDi(primo(r, sel.prezzoRiga)),
          };
        }),
        totale: testoDi(totaleEl),
        testo: document.body.innerText,
      };
    }, {
      riga: soloCss(S.CARRELLO.riga),
      nome: soloCss(S.CARRELLO.nome),
      marca: soloCss(S.CARRELLO.marca),
      quantita: soloCss(S.CARRELLO.quantita),
      prezzoRiga: soloCss(S.CARRELLO.prezzoRiga),
      totale: soloCss(S.CARRELLO.totale),
    });

    const righe = grezzo.righe
      .filter((r) => r.nome)
      .map((r) => ({
        nome: r.nome,
        marca: r.marca,
        quantita: Math.round(numero(r.quantita) || 1),
        prezzo: leggiPrezzo(r.prezzo) ?? 0,
      }));

    let totale = leggiPrezzo(grezzo.totale);
    if (totale == null) {
      const m = grezzo.testo.match(/total[e]?[^€\d]{0,40}(?:€\s*)?(\d{1,4}[.,]\d{2})/i);
      totale = m ? numero(m[1]) : righe.reduce((s, r) => s + r.prezzo, 0);
    }

    return { righe, totale: Math.round(totale * 100) / 100, url: p.url() };
  });
}

// Chi sono e dove ritiro. Non blocca niente: serve a mostrare un avviso.
export function stato() {
  return inFila(async () => {
    const p = await vaiA(S.PAGINE.home);
    const letto = await p.evaluate((sel) => {
      const testoDi = (el) => (el ? (el.innerText || el.textContent || '').trim() : '');
      const primo = (lista) => {
        for (const s of lista) {
          for (const el of document.querySelectorAll(s)) {
            const t = testoDi(el);
            if (t) return t;
          }
        }
        return '';
      };
      const intestazione = document.querySelector('header') || document.body;
      return {
        utente: primo(sel.utente),
        accedi: primo(sel.accedi),
        puntoVendita: primo(sel.puntoVendita),
        modalita: primo(sel.modalita),
        intestazione: testoDi(intestazione),
      };
    }, {
      utente: soloCss(S.SESSIONE.utente),
      accedi: soloCss(S.SESSIONE.accedi),
      puntoVendita: soloCss(S.SESSIONE.puntoVendita),
      modalita: soloCss(S.SESSIONE.modalita),
    });

    // Lo stato "pronto" dipende SOLO dal negozio scelto (Tolentino + ritiro):
    // il login NON serve per riempire il carrello, si fa alla fine per pagare.
    // Il segnale vero e' window.pointOfService/typeOfService.
    const g = await p.evaluate(() => {
      const get = (k) => { try { return window[k]; } catch { return undefined; } };
      const pos = get('pointOfService');
      return {
        citta: pos && pos.address ? (pos.address.town || pos.address.city || '') : '',
        haNegozio: Boolean(pos && typeof pos === 'object' && (pos.name || pos.uid || pos.address)),
        servizio: String(get('typeOfService') || ''),
      };
    }).catch(() => ({}));

    const testo = `${letto.puntoVendita} ${letto.modalita} ${letto.intestazione} ${g.citta}`;
    const puntoVendita = g.haNegozio ? S.TESTI.puntoVendita.test(`${g.citta} ${testo}`) : S.TESTI.puntoVendita.test(testo);
    const ritiro = /ORDER_AND_COLLECT|RITIR/i.test(g.servizio) || (S.TESTI.ritiro.test(testo) && !S.TESTI.consegna.test(letto.modalita || ''));
    const problemi = [];
    if (!g.haNegozio && !puntoVendita) problemi.push('manca la scelta del negozio: apri "Imposta negozio" e scegli Tolentino');
    else if (!puntoVendita) problemi.push('il negozio scelto non sembra Tolentino');

    return {
      pronto: problemi.length === 0,
      loggato: true, // non richiesto qui: il login si fa al pagamento
      puntoVendita: g.citta || letto.puntoVendita || (puntoVendita ? 'Tolentino' : ''),
      modalita: /ORDER_AND_COLLECT/i.test(g.servizio) ? 'ritiro in negozio' : (letto.modalita || (ritiro ? 'ritiro in negozio' : '')),
      problemi,
      url: p.url(),
    };
  });
}

// ---- finestra remota: vedere e guidare il browser del server ----
// Serve a fare il login a Conad e a scegliere il punto vendita quando l'app
// gira su un server senza schermo. Le pagine vietate restano bloccate.

export function schermo() {
  return inFila(async () => {
    const p = await browser();
    if (p.url() === 'about:blank') {
      await p.goto(urlDi(S.PAGINE.home), { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    const immagine = await p.screenshot({ type: 'jpeg', quality: 60 });
    const vp = p.viewportSize();
    return { immagine, url: p.url(), larghezza: vp.width, altezza: vp.height };
  });
}

// Normalizza i cookie esportati (Cookie-Editor/EditThisCookie o Playwright)
// nel formato di addCookies, tenendo solo quelli del dominio conad.
function normalizzaCookie(grezzi) {
  const sameSite = (v, secure) => {
    const s = String(v || '').toLowerCase();
    if (s === 'strict') return 'Strict';
    if (s === 'no_restriction' || s === 'none') return secure ? 'None' : 'Lax';
    return 'Lax';
  };
  const out = [];
  for (const c of grezzi || []) {
    if (!c || !c.name || c.value == null) continue;
    const dominio = String(c.domain || '');
    if (!/conad/i.test(dominio)) continue;
    const secure = Boolean(c.secure);
    const cookie = {
      name: String(c.name),
      value: String(c.value),
      domain: dominio,
      path: c.path ? String(c.path) : '/',
      httpOnly: Boolean(c.httpOnly),
      secure,
      sameSite: sameSite(c.sameSite, secure),
    };
    const scad = c.expirationDate ?? c.expires;
    cookie.expires = (typeof scad === 'number' && scad > 0) ? Math.round(scad) : -1;
    out.push(cookie);
  }
  return out;
}

export function azione(a) {
  return inFila(async () => {
    const p = await browser();
    switch (a.tipo) {
      case 'click':
        await p.mouse.click(Number(a.x), Number(a.y));
        break;
      case 'scrivi':
        await p.keyboard.type(String(a.testo || ''), { delay: 20 });
        break;
      case 'tasto':
        if (!/^[A-Za-z0-9]{1,12}$/.test(String(a.tasto))) throw new Error('tasto non valido');
        await p.keyboard.press(String(a.tasto));
        break;
      case 'scorri':
        await p.mouse.wheel(0, Number(a.dy) || 400);
        break;
      case 'vai':
        await p.goto(urlDi(String(a.url || '/')), { waitUntil: 'domcontentloaded' }).catch((e) => {
          throw new Error(/BLOCKED_BY_CLIENT/.test(e.message)
            ? 'pagina bloccata: da qui non si arriva a orario, pagamento o conferma'
            : `pagina non raggiungibile: ${e.message.split('\n')[0]}`);
        });
        break;
      case 'indietro':
        await p.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
        break;
      case 'popup':
        await chiudiPopup(p);
        break;
      case 'login-conad': {
        // Fa tutto da solo: se serve va alla pagina di login, chiude i cookie,
        // compila email e password e preme Accedi. Niente click sulla foto.
        const email = String(a.email || '');
        const password = String(a.password || '');
        if (!email || !password) throw new Error('scrivi prima email e password qui sopra');

        const selEmail = 'input[type="email"], input[name*="mail" i], input[id*="mail" i], input[placeholder*="mail" i], input[name*="user" i], input[autocomplete="username"]';
        const selPwd = 'input[type="password"], input[name*="pass" i], input[id*="pass" i], input[autocomplete="current-password"]';
        const visibile = async (sel) => {
          try { return await p.locator(sel).first().isVisible({ timeout: 500 }); } catch { return false; }
        };

        await chiudiPopup(p).catch(() => {});

        // 1) Se il modulo di login non c'e', raggiungilo: clic su "Accedi",
        //    poi in ripiego gli indirizzi noti di accesso.
        if (!(await visibile(selEmail))) {
          const linkAccedi = p.locator(
            'a:has-text("Accedi"), button:has-text("Accedi"), a[href*="login" i], a[href*="entry" i], a[href*="my.conad" i]'
          ).first();
          try {
            if (await linkAccedi.isVisible({ timeout: 2000 })) {
              await linkAccedi.click({ timeout: 5000 });
              await p.waitForLoadState('domcontentloaded').catch(() => {});
              await p.waitForTimeout(1500);
            }
          } catch { /* nessun link: provo gli indirizzi diretti */ }
          await chiudiPopup(p).catch(() => {});

          if (!(await visibile(selEmail))) {
            for (const u of ['https://my.conad.it/login', `${S.BASE_URL}/entry`, `${S.BASE_URL}/login`]) {
              await p.goto(u, { waitUntil: 'domcontentloaded' }).catch(() => {});
              await p.waitForTimeout(1200);
              await chiudiPopup(p).catch(() => {});
              if (await visibile(selEmail)) break;
            }
          }
        }

        // 2) Aspetta la casella email; se non arriva, dillo chiaro.
        try {
          await p.locator(selEmail).first().waitFor({ state: 'visible', timeout: 15000 });
        } catch {
          throw new Error('non trovo la pagina di accesso di Conad: clicca "Accedi" sulla foto e riprova');
        }
        await p.locator(selEmail).first().fill(email, { timeout: 8000 });

        // 3) Password: se non c'e' subito, forse serve un passaggio "Continua".
        if (!(await visibile(selPwd))) {
          const avanti = p.locator(
            'button:has-text("Continua"), button:has-text("Avanti"), button:has-text("Prosegui"), button[type="submit"]'
          ).first();
          try {
            if (await avanti.isVisible({ timeout: 1500 })) { await avanti.click({ timeout: 4000 }); await p.waitForTimeout(1500); }
          } catch { /* avanti */ }
        }
        try {
          await p.locator(selPwd).first().waitFor({ state: 'visible', timeout: 10000 });
        } catch {
          throw new Error('trovata la email ma non la casella password: la pagina di Conad e\' cambiata');
        }
        await p.locator(selPwd).first().fill(password, { timeout: 8000 });

        // 4) Premi Accedi / Entra.
        const accedi = p.locator(
          'button:has-text("Accedi"), button:has-text("Entra"), button:has-text("Login"), input[type="submit"][value*="Accedi" i], button[type="submit"]'
        ).first();
        await accedi.click({ timeout: 8000 });
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await p.waitForTimeout(1500);
        break;
      }
      case 'cookie': {
        // Importa nel browser dell'app i cookie di Conad incollati dall'utente
        // (presi dal suo browser normale, gia' loggato): salta login e reCAPTCHA.
        let grezzi = a.dati;
        if (typeof grezzi === 'string') {
          let parsed;
          try {
            parsed = JSON.parse(grezzi);
          } catch {
            throw new Error('i cookie incollati non sono validi: riesportali con Cookie-Editor (Export as JSON)');
          }
          grezzi = Array.isArray(parsed) ? parsed : parsed.cookies;
        } else if (grezzi && Array.isArray(grezzi.cookies)) {
          grezzi = grezzi.cookies;
        }
        const cookie = normalizzaCookie(grezzi);
        if (cookie.length === 0) {
          throw new Error('nessun cookie di Conad trovato: esportali stando su spesaonline.conad.it da loggato');
        }
        await contesto.addCookies(cookie);
        await p.goto(urlDi(S.PAGINE.home), { waitUntil: 'domcontentloaded' }).catch(() => {});
        await p.waitForTimeout(1500);

        // Clona anche la MEMORIA del sito (localStorage/sessionStorage): e' li'
        // che Conad tiene la scelta del negozio, che i cookie non contengono.
        let chiaviMemoria = 0;
        if (a.memoria) {
          let mem = a.memoria;
          if (typeof mem === 'string') {
            try {
              mem = JSON.parse(mem);
            } catch {
              throw new Error('la "memoria del sito" incollata non e\' valida: rifai copia dallo snippet');
            }
          }
          const local = (mem && (mem.local || mem.localStorage)) || {};
          const session = (mem && (mem.session || mem.sessionStorage)) || {};
          chiaviMemoria = Object.keys(local).length + Object.keys(session).length;
          await p.evaluate(({ local, session }) => {
            try { for (const [k, v] of Object.entries(local)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* niente */ }
            try { for (const [k, v] of Object.entries(session)) sessionStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* niente */ }
          }, { local, session }).catch(() => {});
          // Ricarico cosi' il sito rilegge cookie + memoria e ricostruisce tutto.
          await p.goto(urlDi(S.PAGINE.home), { waitUntil: 'domcontentloaded' }).catch(() => {});
          await p.waitForTimeout(2500);
        } else {
          await p.waitForTimeout(1000);
        }
        await chiudiPopup(p).catch(() => {});
        // Diagnostica: cosa vede il robot adesso? (login e NEGOZIO vero,
        // cioe' window.pointOfService, non interactionCondition).
        const diag = await p.evaluate(() => {
          const g = (k) => { try { return window[k]; } catch { return undefined; } };
          const pos = g('pointOfService');
          const u = g('user');
          const citta = pos && pos.address && (pos.address.town || pos.address.city);
          return {
            negozio: pos && typeof pos === 'object' ? (citta || pos.name || pos.uid || 'sì') : '',
            servizio: String(g('typeOfService') || ''),
            loggato: Boolean(u) || Boolean(pos),
          };
        }).catch(() => ({}));
        const ok = Boolean(diag.negozio);
        return {
          url: p.url(),
          messaggio: `importati ${cookie.length} cookie${chiaviMemoria ? ` + ${chiaviMemoria} voci di memoria` : ''} — loggato:${diag.loggato ? 'si' : 'no'} negozio:"${diag.negozio || '(nessuno)'}" servizio:"${diag.servizio || '(nessuno)'}"${ok ? ' ✅ pronto: fai la spesa!' : ' ⚠ manca il negozio'}`,
        };
      }
      case 'clic-conad': {
        // Preme il "tasto arancione" della schermata cercandolo per TESTO e
        // prendendo il primo VISIBILE (non a coordinate, non il primo del DOM).
        // Prima i selettori precisi del sito, poi i testi piu' comuni.
        const candidati = [
          ['Conferma il negozio', '#modal-onboarding .btn-conferma-pdv button, .btn-conferma-pdv button, button:has-text("Conferma il negozio")'],
          ['Procedi', 'button:has-text("Procedi")'],
          ['Conferma', 'button:has-text("Conferma")'],
          ['Verifica', '#verificaButton, button.submitButton, button:has-text("Verifica")'],
          ['Seleziona', 'button:has-text("Seleziona")'],
          ['Continua', 'button:has-text("Continua"), button:has-text("Prosegui")'],
          ['Scegli', 'button:has-text("Scegli")'],
          ['Accedi', 'button:has-text("Accedi"), button:has-text("Entra")'],
        ];
        for (const [nome, sel] of candidati) {
          if (await cliccaVisibile(p, sel)) {
            await p.waitForLoadState('domcontentloaded').catch(() => {});
            await p.waitForTimeout(1000);
            return { url: p.url(), messaggio: `premuto "${nome}"` };
          }
        }
        throw new Error('nessun tasto visibile riconosciuto: scrivi il testo del tasto in "Clicca per nome"');
      }
      case 'clic-testo': {
        // Clicca QUALSIASI tasto/link per il testo che si legge nella foto.
        const testo = testoSicuro(a.testo);
        if (!testo) throw new Error('scrivi il testo del tasto da premere');
        const sel = `button:has-text("${testo}"), a:has-text("${testo}"), [role="button"]:has-text("${testo}"), li:has-text("${testo}"), label:has-text("${testo}")`;
        if (!(await cliccaVisibile(p, sel))) throw new Error(`nessun tasto visibile con il testo "${testo}"`);
        await p.waitForLoadState('domcontentloaded').catch(() => {});
        await p.waitForTimeout(800);
        return { url: p.url(), messaggio: `premuto "${testo}"` };
      }
      case 'scegli-negozio': {
        // Sceglie da solo "Ordina e ritira" + Spazio Conad Tolentino usando i
        // selettori reali della modale di onboarding di Conad. Se un passo
        // fallisce dice QUALE, cosi' si finisce a mano con "Clicca per nome".
        const passo = async (nome, fn) => {
          try {
            await fn();
          } catch (e) {
            throw new Error(`scelta negozio, passo "${nome}": ${String(e.message).split('\n')[0]}. Finisci a mano con "Clicca per nome".`);
          }
        };
        await p.goto(urlDi(S.PAGINE.home), { waitUntil: 'domcontentloaded' }).catch(() => {});
        await p.waitForTimeout(1500);
        await chiudiPopup(p).catch(() => {});

        // 1) La casella dell'indirizzo: nella landing (senza negozio) o nella
        //    modale, che apro da "Modifica" se serve.
        const selIndirizzo = '#googleInputLPOnboardingLine1, #googleInputOnboardingStep0Line1, input.google-input-line1';
        let indirizzo = await trovaVisibile(p, selIndirizzo);
        if (!indirizzo) {
          await cliccaVisibile(p, 'button[aria-label="Modifica indirizzo"], button[aria-label="Modifica servizio"]');
          await p.waitForTimeout(1500);
          indirizzo = await trovaVisibile(p, selIndirizzo);
        }
        await passo('casella indirizzo', async () => {
          if (!indirizzo) throw new Error('non la trovo in questa schermata');
        });

        // 2) Scrivo l'indirizzo e prendo il suggerimento di Google.
        await passo('indirizzo', async () => {
          await indirizzo.click({ timeout: 5000 });
          await indirizzo.fill('');
          // Indirizzo esatto del punto vendita: cosi' Google lo geolocalizza
          // preciso e la lista negozi propone subito Spazio Conad Tolentino.
          await indirizzo.type('Contrada Cisterna, 62029 Tolentino MC', { delay: 80 });
          // Aspetta i suggerimenti di Google e clicca il primo VERO (non
          // "Rileva la mia posizione"): questo valida l'indirizzo e chiude la
          // tendina, cosi' "Verifica" diventa cliccabile.
          const sugg = p.locator('.pac-container .pac-item, .pac-item').filter({ hasNotText: 'Rileva' });
          try {
            await sugg.first().waitFor({ state: 'visible', timeout: 7000 });
            await sugg.first().click({ timeout: 4000 });
          } catch {
            await indirizzo.press('Enter').catch(() => {});
          }
          await p.waitForTimeout(1800);
        });

        // 3) Verifica: forzo il click (la tendina di Google puo' coprirlo) e,
        //    in ultima spiaggia, lancio il click via DOM.
        await passo('Verifica', async () => {
          const v = await trovaVisibile(p, '#verificaButton, .lp-onboarding button.submitButton, .google-input button.submitButton, button.submitButton, button:has-text("Verifica")');
          if (v) {
            await v.click({ timeout: 4000, force: true }).catch(async () => {
              await v.evaluate((el) => el.click()).catch(() => {});
            });
          }
          await p.waitForTimeout(3500);
        });

        // 4) Servizio: Ordina e ritira.
        await passo('Ordina e ritira', async () => {
          const ok = await cliccaVisibile(p, '#ordina-e-ritira button.uk-button-primary, #ordina-e-ritira button:has-text("Seleziona")');
          if (!ok) throw new Error('tasto "Seleziona" di Ordina e ritira non trovato');
          await p.waitForTimeout(3000);
        });

        // Il negozio e' scelto SOLO quando window.pointOfService e' valorizzato.
        // Il tasto "Conferma il negozio" ha onclick vuoto: il suo comando lo
        // arma il sito DOPO che clicchi la RIGA del negozio nella lista. Quindi:
        // clicca la riga -> Conferma -> (eventuale Procedi) -> verifica; ritenta.
        const negozioScelto = async () => p.evaluate(() => {
          const pos = window.pointOfService;
          if (!pos || typeof pos !== 'object') return '';
          return (pos.address && (pos.address.town || pos.address.city)) || pos.name || 'sì';
        }).catch(() => '');

        let negozio = await negozioScelto();
        for (let tentativo = 0; !negozio && tentativo < 3; tentativo += 1) {
          // a) accendo il negozio cliccando la sua riga (o un tasto dentro).
          await passo('scelta del negozio nella lista', async () => {
            const riga = await trovaVisibile(
              p,
              '.lista-negozi-section li:has-text("CISTERNA"), .lista-negozi-section li:has-text("TOLENTINO"), .lista-negozi-section li:has-text("Spazio Conad"), li:has-text("CISTERNA"), li:has-text("TOLENTINO")',
            );
            if (!riga) throw new Error('Spazio Conad Tolentino non compare nella lista');
            // prima un eventuale tasto interno (Seleziona/Scegli), poi la riga.
            if (!(await cliccaVisibile(riga, 'button:has-text("Seleziona"), button:has-text("Scegli"), button'))) {
              await riga.click({ timeout: 5000 });
            }
            await p.waitForTimeout(1500);
          });

          // b) Conferma (ora armato) + eventuale Procedi della modale d'avviso.
          await passo('Conferma il negozio', async () => {
            const ok = await cliccaVisibile(p, '.btn-conferma-pdv button, #modal-onboarding .btn-conferma-pdv button, button:has-text("Conferma il negozio")');
            if (!ok) throw new Error('tasto non trovato');
            await p.waitForTimeout(2000);
            await cliccaVisibile(p, '#modalModificaNegozio button:has-text("Procedi"), button:has-text("Procedi")');
            await p.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
            await p.waitForTimeout(2000);
          });

          negozio = await negozioScelto();
        }
        return {
          url: p.url(),
          messaggio: negozio ? `negozio scelto: ${negozio} ✅ ora fai la spesa` : 'fatto, ma non vedo ancora il negozio: premi Aggiorna e guarda in alto nella foto',
        };
      }
      default:
        throw new Error(`azione sconosciuta: ${a.tipo}`);
    }
    await p.waitForLoadState('domcontentloaded').catch(() => {});
    await p.waitForTimeout(250);
    return { url: p.url() };
  });
}

// Usato dagli script e dai test.
export const _interno = { vaiA, browser, chiudiPopup, contaCarrello, motivoBlocco };
