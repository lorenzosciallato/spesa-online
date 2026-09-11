// Spesa — interfaccia per la famiglia.
// Detti un prodotto, stai zitto tre secondi e finisce nella lista.
// Con "Vai" l'app cerca i prodotti, li mette nel carrello Conad e si ferma:
// orario di ritiro e pagamento li fai tu sul sito.

const SILENZIO_MS = 3000;

const $ = (id) => document.getElementById(id);
const schermoLista = $('schermo-lista');
const schermoEsito = $('schermo-esito');
const elLista = $('lista');
const elVuoto = $('vuoto');
const formScrivi = $('scrivi');
const campo = $('campo');
const bottoneMic = $('microfono');
const progresso = $('progresso');
const elUltima = $('ultima');
const elAscolto = $('ascolto');
const bottoneVai = $('vai');
const bottoneSvuota = $('svuota');
const elSessione = $('sessione');

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

/* ---------- la lista ---------- */

let lista = [];
try {
  lista = JSON.parse(localStorage.getItem('spesa-lista') || '[]');
} catch { lista = []; }

function salva() {
  try { localStorage.setItem('spesa-lista', JSON.stringify(lista)); } catch { /* niente */ }
}

// "latte x6", "6 latte", "sei uova", "2 chili di pane" → nome + quantità.
const PAROLE_NUMERO = {
  uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, dodici: 12,
};
function interpreta(testo) {
  let nome = testo.trim().replace(/[.,;!?]+$/, '');
  let quantita = 1;
  let m;
  if ((m = nome.match(/^(.*?)\s*[x×per]\s*(\d{1,2})$/i))) { nome = m[1]; quantita = +m[2]; }
  else if ((m = nome.match(/^(\d{1,2})\s*(?:x|×|confezioni di|pezzi di|di)?\s+(.+)$/i))) { quantita = +m[1]; nome = m[2]; }
  else if ((m = nome.match(/^(\w+)\s+(.+)$/)) && PAROLE_NUMERO[m[1].toLowerCase()]) { quantita = PAROLE_NUMERO[m[1].toLowerCase()]; nome = m[2]; }
  nome = nome.trim();
  if (!nome) return null;
  return { nome: nome.charAt(0).toUpperCase() + nome.slice(1), quantita: Math.max(1, Math.min(99, quantita)) };
}

function aggiungi(testo) {
  // In una frase sola possono esserci più prodotti: "latte e pane", "pasta, riso".
  const pezzi = testo.split(/\s*,\s*|\s+e\s+|\s+poi\s+/i).filter(Boolean);
  let ultimoNome = '';
  for (const pezzo of pezzi) {
    const voce = interpreta(pezzo);
    if (!voce) continue;
    const doppione = lista.find((v) => v.nome.toLowerCase() === voce.nome.toLowerCase());
    if (doppione) doppione.quantita = Math.min(99, doppione.quantita + voce.quantita);
    else lista.push(voce);
    ultimoNome = voce.nome;
  }
  salva();
  disegnaLista();
  return ultimoNome;
}

function disegnaLista() {
  elLista.innerHTML = '';
  elVuoto.hidden = lista.length > 0;
  bottoneVai.disabled = lista.length === 0;

  lista.forEach((voce, i) => {
    const li = document.createElement('li');

    const nome = document.createElement('span');
    nome.className = 'nome';
    nome.textContent = voce.nome;

    const quantita = document.createElement('span');
    quantita.className = 'quantita';
    const meno = document.createElement('button');
    meno.type = 'button'; meno.textContent = '−'; meno.setAttribute('aria-label', 'Una in meno');
    const numero = document.createElement('output');
    numero.textContent = voce.quantita;
    const piu = document.createElement('button');
    piu.type = 'button'; piu.textContent = '+'; piu.setAttribute('aria-label', 'Una in più');
    meno.addEventListener('click', () => { voce.quantita = Math.max(1, voce.quantita - 1); salva(); disegnaLista(); });
    piu.addEventListener('click', () => { voce.quantita = Math.min(99, voce.quantita + 1); salva(); disegnaLista(); });
    quantita.append(meno, numero, piu);

    const togli = document.createElement('button');
    togli.type = 'button'; togli.className = 'togli'; togli.textContent = '×';
    togli.setAttribute('aria-label', `Togli ${voce.nome}`);
    togli.addEventListener('click', () => { lista.splice(i, 1); salva(); disegnaLista(); });

    li.append(nome, quantita, togli);
    elLista.append(li);
  });
}

formScrivi.addEventListener('submit', (evento) => {
  evento.preventDefault();
  if (campo.value.trim()) aggiungi(campo.value);
  campo.value = '';
});

bottoneSvuota.addEventListener('click', () => {
  if (lista.length === 0) return;
  if (!confirm('Svuoto tutta la lista?')) return;
  lista = [];
  salva();
  disegnaLista();
});

/* ---------- dettatura con rilevamento del silenzio ---------- */

const Riconoscimento = window.SpeechRecognition || window.webkitSpeechRecognition;
let riconoscimento = null;
let attivo = false;          // l'utente vuole che ascolti
let inSospeso = '';          // parole dette, in attesa dei 3 secondi
let provvisorio = '';        // parole che il browser sta ancora capendo
let ultimaVoce = 0;          // quando ho sentito l'ultima parola
let orologio = null;         // il ticchettio dell'anello

function mostraAscolto(testo, classe = '') {
  elAscolto.textContent = testo;
  elAscolto.className = `ascolto ${classe}`.trim();
}

function aggiornaAnello() {
  if (!attivo) return;
  const pendente = (inSospeso + ' ' + provvisorio).trim();
  if (!pendente) {
    progresso.style.strokeDashoffset = 289;
    mostraAscolto('Ti ascolto: di\' un prodotto', 'attivo');
  } else {
    const trascorso = Math.min(SILENZIO_MS, Date.now() - ultimaVoce);
    progresso.style.strokeDashoffset = 289 - (289 * trascorso) / SILENZIO_MS;
    mostraAscolto(`«${pendente}»`, 'attivo');
    if (trascorso >= SILENZIO_MS && inSospeso.trim()) {
      const nome = aggiungi(inSospeso);
      inSospeso = '';
      provvisorio = '';
      progresso.style.strokeDashoffset = 289;
      if (nome) {
        elUltima.textContent = `${nome} ✓`;
        elUltima.classList.add('mostra');
        setTimeout(() => elUltima.classList.remove('mostra'), 1400);
        if (navigator.vibrate) navigator.vibrate(30);
      }
    }
  }
  orologio = requestAnimationFrame(aggiornaAnello);
}

if (!Riconoscimento) {
  bottoneMic.disabled = true;
  mostraAscolto('La dettatura funziona solo con Chrome o Safari: scrivi i prodotti qui sopra.', 'errore');
} else {
  riconoscimento = new Riconoscimento();
  riconoscimento.lang = 'it-IT';
  riconoscimento.continuous = true;
  riconoscimento.interimResults = true;

  riconoscimento.addEventListener('result', (evento) => {
    let definitivo = '';
    let parziale = '';
    for (let i = evento.resultIndex; i < evento.results.length; i += 1) {
      const r = evento.results[i];
      if (r.isFinal) definitivo += ' ' + r[0].transcript;
      else parziale += ' ' + r[0].transcript;
    }
    if (definitivo.trim()) inSospeso = (inSospeso + ' ' + definitivo).trim();
    provvisorio = parziale.trim();
    ultimaVoce = Date.now();
  });

  riconoscimento.addEventListener('error', (evento) => {
    if (evento.error === 'no-speech' || evento.error === 'aborted') return; // riparte da solo
    if (evento.error === 'not-allowed' || evento.error === 'service-not-allowed') {
      mostraAscolto('Microfono negato: consentilo nelle impostazioni del browser.', 'errore');
    } else if (evento.error === 'network') {
      mostraAscolto('La dettatura ha bisogno di internet.', 'errore');
    } else {
      mostraAscolto(`Dettatura interrotta (${evento.error}).`, 'errore');
    }
    ferma(true);
  });

  // Il browser smette da solo dopo un po' di silenzio: se l'utente vuole
  // ancora ascoltare, riparto subito, senza perdere le parole in sospeso.
  riconoscimento.addEventListener('end', () => {
    if (!attivo) return;
    try { riconoscimento.start(); } catch { /* ripartirà al prossimo giro */ }
  });
}

function avvia() {
  try { riconoscimento.start(); } catch { return; }
  attivo = true;
  inSospeso = '';
  provvisorio = '';
  ultimaVoce = Date.now();
  bottoneMic.setAttribute('aria-pressed', 'true');
  bottoneMic.setAttribute('aria-label', 'Smetti di ascoltare');
  aggiornaAnello();
}

function ferma(tieniMessaggio = false) {
  attivo = false;
  cancelAnimationFrame(orologio);
  try { riconoscimento?.stop(); } catch { /* già fermo */ }
  // Quello che era in sospeso non va perso: lo metto in lista subito.
  if (inSospeso.trim()) aggiungi(inSospeso);
  inSospeso = '';
  provvisorio = '';
  progresso.style.strokeDashoffset = 289;
  bottoneMic.setAttribute('aria-pressed', 'false');
  bottoneMic.setAttribute('aria-label', 'Detta la lista');
  if (!tieniMessaggio) mostraAscolto('');
}

bottoneMic.addEventListener('click', () => (attivo ? ferma() : avvia()));

/* ---------- stato del sito Conad ---------- */

async function controllaSessione() {
  try {
    const stato = await (await fetch('/api/stato')).json();
    if (stato.catalogo === 'mock') {
      elSessione.textContent = 'Catalogo di prova, prodotti finti';
      elSessione.className = 'sessione';
    } else if (stato.pronto) {
      elSessione.textContent = `Conad ${stato.puntoVendita || 'Tolentino'}, ${stato.modalita || 'ritiro in negozio'}`;
      elSessione.className = 'sessione ok';
    } else {
      elSessione.textContent = 'Sito Conad non collegato: tocca per accedere';
      elSessione.className = 'sessione';
    }
    elSessione.hidden = false;
  } catch {
    elSessione.hidden = true;
  }
}
controllaSessione();

/* ---------- Vai: cerca, metti nel carrello, riepiloga ---------- */

const passoCerca = $('passo-cerca');
const passoCarrello = $('passo-carrello');
const elEsito = $('esito');
const elMessi = $('messi');
const elTotale = $('totale');
const elSaltati = $('saltati');
const elErrore = $('errore');
const bottonePaga = $('paga');
const bottoneNuova = $('nuova');
const titoloEsito = $('titolo-esito');

function testoLista() {
  return lista.map((v) => (v.quantita > 1 ? `${v.nome} x${v.quantita}` : v.nome)).join(', ');
}

async function chiedi(percorso, corpo) {
  const risposta = await fetch(percorso, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const dati = await risposta.json();
  if (!risposta.ok) throw new Error(dati.errore || 'Errore del server');
  return dati;
}

bottoneVai.addEventListener('click', async () => {
  if (lista.length === 0) return;
  if (attivo) ferma();

  schermoLista.hidden = true;
  schermoEsito.hidden = false;
  window.scrollTo(0, 0);
  titoloEsito.textContent = 'Preparo la spesa';
  $('passi').hidden = false;
  passoCerca.className = 'in-corso';
  passoCarrello.className = '';
  elEsito.hidden = true;
  elMessi.innerHTML = '';
  elTotale.hidden = true;
  elSaltati.hidden = true;
  elErrore.hidden = true;
  bottonePaga.hidden = true;
  bottoneNuova.hidden = true;

  const saltati = [];
  let risultati = [];

  try {
    const ricerca = await chiedi('/api/spesa', { testo: testoLista() });
    risultati = ricerca.risultati;
    passoCerca.className = 'fatto';
    for (const r of risultati) {
      if (r.stato !== 'ok') saltati.push({ nome: r.voce.grezzo, motivo: r.messaggio });
    }

    const voci = risultati
      .filter((r) => r.stato === 'ok')
      .map((r) => ({ prodotto: r.scelta.prodotto, quantita: r.scelta.quantita }));

    if (voci.length === 0) {
      passoCarrello.className = 'fallito';
      mostraEsito({ aggiunti: [], falliti: [], carrello: null }, risultati, saltati);
      return;
    }

    passoCarrello.className = 'in-corso';
    const esito = await chiedi('/api/carrello', { voci });
    passoCarrello.className = 'fatto';
    for (const f of esito.falliti) saltati.push({ nome: `${f.prodotto.nome} × ${f.quantita}`, motivo: f.motivo });
    mostraEsito(esito, risultati, saltati);
  } catch (errore) {
    if (passoCerca.className === 'in-corso') passoCerca.className = 'fallito';
    if (passoCarrello.className === 'in-corso') passoCarrello.className = 'fallito';
    titoloEsito.textContent = 'Non ha funzionato';
    elEsito.hidden = false;
    elErrore.hidden = false;
    elErrore.textContent = `${errore.message}. La lista è ancora qui: riprova, o controlla che il sito Conad sia collegato.`;
    bottoneNuova.hidden = false;
    bottoneNuova.textContent = 'Torna alla lista';
  }
});

function mostraEsito(esito, risultati, saltati) {
  $('passi').hidden = true;
  elEsito.hidden = false;

  // Preferisco quello che il sito dice davvero di avere nel carrello;
  // se non è leggibile, mostro quello che ho aggiunto io.
  const righe = esito.carrello && esito.carrello.righe;
  const nelCarrello = (righe && righe.length > 0)
    ? righe.map((r) => ({ nome: r.nome, marca: r.marca, quantita: r.quantita, prezzo: r.prezzo, offerta: null }))
    : esito.aggiunti.map((a) => {
      const scelta = risultati.find((r) => r.stato === 'ok' && r.scelta.prodotto.id === a.prodotto.id);
      return {
        nome: a.prodotto.nome, marca: a.prodotto.marca, quantita: a.quantita,
        prezzo: scelta ? scelta.scelta.totale : null,
        offerta: a.prodotto.offerta ? a.prodotto.offerta.etichetta : null,
      };
    });

  if (nelCarrello.length > 0) {
    titoloEsito.textContent = 'Carrello pronto';
    for (const p of nelCarrello) {
      const li = document.createElement('li');
      const cosa = document.createElement('span');
      cosa.className = 'cosa';
      const strong = document.createElement('strong');
      strong.textContent = p.nome;
      if (p.offerta) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = p.offerta;
        strong.append(badge);
      }
      const small = document.createElement('small');
      small.textContent = [p.marca, p.quantita > 1 ? `× ${p.quantita}` : ''].filter(Boolean).join(' ');
      cosa.append(strong, small);
      const prezzo = document.createElement('span');
      prezzo.className = 'prezzo';
      prezzo.textContent = p.prezzo != null ? euro.format(p.prezzo) : '';
      li.append(cosa, prezzo);
      elMessi.append(li);
    }
    const totale = (esito.carrello && esito.carrello.totale != null)
      ? esito.carrello.totale
      : nelCarrello.reduce((s, p) => s + (p.prezzo || 0), 0);
    elTotale.hidden = false;
    elTotale.innerHTML = '';
    elTotale.append('Totale', document.createTextNode(' '), Object.assign(document.createElement('span'), { textContent: euro.format(totale) }));
    bottonePaga.hidden = false;
    // Il carrello è sul tuo account Conad: sul sito lo trovi già pieno.
    lista = [];
    salva();
    disegnaLista();
  } else {
    titoloEsito.textContent = 'Niente nel carrello';
  }

  if (saltati.length > 0) {
    elSaltati.hidden = false;
    const ul = elSaltati.querySelector('ul');
    ul.innerHTML = '';
    for (const s of saltati) {
      const li = document.createElement('li');
      li.textContent = s.nome;
      const small = document.createElement('small');
      small.textContent = s.motivo;
      li.append(small);
      ul.append(li);
    }
  }

  bottoneNuova.hidden = false;
  bottoneNuova.textContent = 'Nuova spesa';
}

bottoneNuova.addEventListener('click', () => {
  schermoEsito.hidden = true;
  schermoLista.hidden = false;
  window.scrollTo(0, 0);
  disegnaLista();
  controllaSessione();
});

disegnaLista();

// --- Imposta negozio (una volta): sceglie Conad Tolentino come ospite. ---
// Niente login: il carrello si riempie da ospite, l'accesso si fa al pagamento.
(function () {
  const btn = document.getElementById('imposta-negozio-btn');
  if (!btn) return;
  const stato = document.getElementById('negozio-stato');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Imposto il negozio… (20-30 s)';
    if (stato) stato.textContent = 'Sto scegliendo Conad Tolentino con ritiro…';
    try {
      const r = await fetch('/api/browser/azione', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'scegli-negozio' }),
      });
      const d = await r.json().catch(() => ({}));
      if (stato) stato.textContent = r.ok ? (d.messaggio || 'Fatto.') : (d.errore || 'Non ha funzionato.');
    } catch (e) {
      if (stato) stato.textContent = 'Errore: ' + e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  });
})();
