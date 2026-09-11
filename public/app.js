// Interfaccia: dettatura vocale + carrello con sostituzione.
// La dettatura usa la Web Speech API del browser: nativa, gratuita,
// nessun servizio esterno e nessun audio che esce dal dispositivo.

const lista = document.getElementById('lista');
const microfono = document.getElementById('microfono');
const etichettaMicrofono = document.getElementById('etichetta-microfono');
const statoVoce = document.getElementById('stato-voce');
const bottoneElabora = document.getElementById('elabora');
const bottonePulisci = document.getElementById('pulisci');
const contenitoreRisultati = document.getElementById('risultati');
const riepilogo = document.getElementById('riepilogo');
const elementoTotale = document.getElementById('totale');
const statoSessione = document.getElementById('stato-sessione');
const sezioneInvio = document.getElementById('invio');
const bottoneCarrello = document.getElementById('metti-nel-carrello');
const rapporto = document.getElementById('rapporto');

// Stato del carrello in memoria, cosi la sostituzione non richiede
// di rifare tutta la ricerca.
let carrello = [];

const euro = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
});

/* ---------- dettatura vocale ---------- */

const Riconoscimento =
  window.SpeechRecognition || window.webkitSpeechRecognition;
let riconoscimento = null;
let inAscolto = false;
let testoPrimaDellaDettatura = '';

if (!Riconoscimento) {
  microfono.disabled = true;
  statoVoce.textContent = 'Dettatura non supportata da questo browser: usa Chrome, oppure scrivi la lista.';
} else {
  riconoscimento = new Riconoscimento();
  riconoscimento.lang = 'it-IT';
  riconoscimento.continuous = true;
  riconoscimento.interimResults = true;

  riconoscimento.addEventListener('result', (evento) => {
    let definitivo = '';
    let provvisorio = '';

    for (let i = evento.resultIndex; i < evento.results.length; i += 1) {
      const risultato = evento.results[i];
      if (risultato.isFinal) definitivo += risultato[0].transcript;
      else provvisorio += risultato[0].transcript;
    }

    if (definitivo) {
      testoPrimaDellaDettatura = unisci(testoPrimaDellaDettatura, definitivo);
    }
    lista.value = unisci(testoPrimaDellaDettatura, provvisorio);
  });

  riconoscimento.addEventListener('error', (evento) => {
    statoVoce.textContent =
      evento.error === 'not-allowed'
        ? 'Microfono negato: consentilo nelle impostazioni del browser.'
        : `Errore dettatura: ${evento.error}`;
    fermaAscolto();
  });

  riconoscimento.addEventListener('end', () => {
    if (inAscolto) fermaAscolto();
  });
}

function unisci(base, aggiunta) {
  const pulita = aggiunta.trim();
  if (!pulita) return base;
  if (!base.trim()) return pulita;
  // Le voci dettate di seguito diventano elementi separati della lista.
  return `${base.replace(/[,\s]+$/, '')}, ${pulita}`;
}

function avviaAscolto() {
  testoPrimaDellaDettatura = lista.value;
  try {
    riconoscimento.start();
  } catch {
    return; // gia in ascolto
  }
  inAscolto = true;
  microfono.classList.add('in-ascolto');
  etichettaMicrofono.textContent = 'Sto ascoltando… tocca per fermare';
  statoVoce.textContent = 'Dimmi i prodotti, anche uno dopo l’altro.';
}

function fermaAscolto() {
  inAscolto = false;
  try {
    riconoscimento?.stop();
  } catch {
    /* gia fermo */
  }
  microfono.classList.remove('in-ascolto');
  etichettaMicrofono.textContent = 'Detta la lista';
}

microfono.addEventListener('click', () => {
  if (inAscolto) {
    fermaAscolto();
    statoVoce.textContent = '';
  } else {
    avviaAscolto();
  }
});

/* ---------- elaborazione ---------- */

bottoneElabora.addEventListener('click', async () => {
  const testo = lista.value.trim();
  if (!testo) {
    statoVoce.textContent = 'Prima detta o scrivi qualcosa.';
    return;
  }

  if (inAscolto) fermaAscolto();
  bottoneElabora.disabled = true;
  bottoneElabora.textContent = 'Cerco…';

  try {
    const risposta = await fetch('/api/spesa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testo }),
    });
    const dati = await risposta.json();

    if (!risposta.ok) throw new Error(dati.errore || 'Errore del server');

    carrello = dati.risultati;
    disegna();
  } catch (errore) {
    contenitoreRisultati.innerHTML = '';
    contenitoreRisultati.append(
      creaElemento('p', { class: 'vuoto' }, `Non ha funzionato: ${errore.message}`),
    );
  } finally {
    bottoneElabora.disabled = false;
    bottoneElabora.textContent = 'Riempi il carrello';
  }
});

bottonePulisci.addEventListener('click', () => {
  lista.value = '';
  carrello = [];
  contenitoreRisultati.innerHTML = '';
  riepilogo.hidden = true;
  sezioneInvio.hidden = true;
  rapporto.hidden = true;
  rapporto.innerHTML = '';
  statoVoce.textContent = '';
});

/* ---------- stato della sessione sul sito ---------- */

// Chiede al server se sul sito siamo loggati, sul Conad di Tolentino e in
// ritiro in negozio. Non blocca nulla: mostra solo un avviso.
async function controllaSessione() {
  try {
    const risposta = await fetch('/api/stato');
    const stato = await risposta.json();
    if (stato.catalogo === 'mock') {
      statoSessione.textContent = 'Catalogo di prova: i prodotti sono finti. Avvia con CATALOGO=conad per il sito vero.';
      statoSessione.classList.remove('ok');
      statoSessione.hidden = false;
      return;
    }
    if (stato.pronto) {
      statoSessione.textContent = `Sito pronto: ${stato.puntoVendita || 'Tolentino'}, ${stato.modalita || 'ritiro in negozio'}.`;
      statoSessione.classList.add('ok');
    } else {
      statoSessione.textContent = `Controlla la sessione sul sito (${stato.problemi.join('; ')}). Esegui "npm run conad:login".`;
      statoSessione.classList.remove('ok');
    }
    statoSessione.hidden = false;
  } catch {
    statoSessione.hidden = true;
  }
}

controllaSessione();

/* ---------- invio al carrello del sito ---------- */

bottoneCarrello.addEventListener('click', async () => {
  const voci = carrello
    .filter((r) => r.stato === 'ok')
    .map((r) => ({ prodotto: r.scelta.prodotto, quantita: r.scelta.quantita }));
  if (voci.length === 0) return;

  bottoneCarrello.disabled = true;
  bottoneCarrello.textContent = 'Aggiungo…';
  rapporto.hidden = false;
  rapporto.innerHTML = '';
  rapporto.append(creaElemento('p', { class: 'vuoto' }, 'Sto mettendo i prodotti nel carrello del sito, ci vuole qualche secondo per ciascuno.'));

  try {
    const risposta = await fetch('/api/carrello', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voci }),
    });
    const dati = await risposta.json();
    if (!risposta.ok) throw new Error(dati.errore || 'Errore del server');
    disegnaRapporto(dati);
  } catch (errore) {
    rapporto.innerHTML = '';
    rapporto.append(creaElemento('p', { class: 'vuoto' }, `Non ha funzionato: ${errore.message}`));
  } finally {
    bottoneCarrello.disabled = false;
    bottoneCarrello.textContent = 'Metti nel carrello Conad';
  }
});

// Il rapporto finale: cosa c'e' nel carrello, il totale, cosa e' stato saltato.
function disegnaRapporto(dati) {
  rapporto.innerHTML = '';

  const messi = creaElemento('article', { class: 'voce' }, creaElemento('h2', {}, 'Nel carrello'));
  const righe = dati.carrello && dati.carrello.righe ? dati.carrello.righe : null;
  if (righe && righe.length > 0) {
    messi.append(
      creaElemento('ul', {}, righe.map((r) => creaElemento(
        'li', {},
        `${r.nome}${r.marca ? ` · ${r.marca}` : ''} × ${r.quantita} — ${euro.format(r.prezzo)}`,
      ))),
      creaElemento('p', { class: 'totale-rapporto' }, `Totale: ${euro.format(dati.carrello.totale)}`),
    );
  } else if (dati.aggiunti.length > 0) {
    messi.append(
      creaElemento('ul', {}, dati.aggiunti.map((a) => creaElemento(
        'li', {},
        `${a.prodotto.nome}${a.prodotto.marca ? ` · ${a.prodotto.marca}` : ''} × ${a.quantita}`,
      ))),
      creaElemento('p', { class: 'dettagli' }, dati.carrello && dati.carrello.errore
        ? `Non sono riuscito a rileggere il carrello del sito: ${dati.carrello.errore}`
        : 'Totale non letto dal sito.'),
    );
  } else {
    messi.append(creaElemento('p', { class: 'dettagli' }, 'Niente aggiunto.'));
  }
  rapporto.append(messi);

  const saltati = [
    ...carrello.filter((r) => r.stato !== 'ok').map((r) => `${r.voce.grezzo}: ${r.messaggio}`),
    ...dati.falliti.map((f) => `${f.prodotto.nome} × ${f.quantita}: ${f.motivo}`),
  ];
  if (saltati.length > 0) {
    rapporto.append(creaElemento(
      'article', { class: 'voce saltata' },
      creaElemento('h2', {}, 'Saltati'),
      creaElemento('ul', {}, saltati.map((t) => creaElemento('li', {}, t))),
    ));
  }

  rapporto.append(creaElemento(
    'p', { class: 'nota' },
    'Mi fermo qui: orario di ritiro e pagamento li scegli tu sul sito.',
  ));
}

/* ---------- rendering ---------- */

function creaElemento(tag, attributi = {}, ...figli) {
  const elemento = document.createElement(tag);
  for (const [chiave, valore] of Object.entries(attributi)) {
    if (valore === undefined || valore === false) continue;
    elemento.setAttribute(chiave, valore === true ? '' : valore);
  }
  for (const figlio of figli.flat()) {
    if (figlio == null) continue;
    elemento.append(figlio);
  }
  return elemento;
}

function descriviOpzione(opzione) {
  const parti = [];
  if (opzione.quantita > 1) parti.push(`${opzione.quantita} confezioni`);
  if (opzione.prodotto.formato) {
    const f = opzione.prodotto.formato;
    parti.push(`${f.valore} ${f.unita}`);
  }
  if (opzione.prezzoUnitario) {
    parti.push(
      `${opzione.prezzoUnitario.valore.toFixed(2)} €/${opzione.prezzoUnitario.unita}`,
    );
  }
  return parti.join(' · ');
}

function disegnaProdotto(opzione) {
  const offerta = opzione.prodotto.offerta;
  return creaElemento(
    'div',
    { class: 'prodotto' },
    creaElemento(
      'div',
      {},
      creaElemento(
        'div',
        { class: 'nome-prodotto' },
        opzione.prodotto.nome,
        creaElemento('span', { class: 'marca' }, ` · ${opzione.prodotto.marca}`),
        offerta ? creaElemento('span', { class: 'badge' }, offerta.etichetta) : null,
      ),
      creaElemento('p', { class: 'dettagli' }, descriviOpzione(opzione)),
    ),
    creaElemento('div', { class: 'prezzo-voce' }, euro.format(opzione.totale)),
  );
}

function disegnaVoce(risultato, indice) {
  if (risultato.stato !== 'ok') {
    return creaElemento(
      'article',
      { class: 'voce saltata' },
      creaElemento('div', { class: 'richiesta' }, risultato.voce.grezzo),
      creaElemento('p', { class: 'dettagli' }, `Saltato: ${risultato.messaggio}`),
    );
  }

  const voce = creaElemento(
    'article',
    { class: 'voce' },
    creaElemento(
      'div',
      { class: 'intestazione-voce' },
      creaElemento(
        'span',
        { class: 'richiesta' },
        `${risultato.voce.nome} × ${risultato.voce.quantita}`,
      ),
    ),
    disegnaProdotto(risultato.scelta),
    creaElemento('p', { class: 'dettagli' }, risultato.scelta.motivo),
  );

  if (risultato.alternative.length > 0) {
    const bottone = creaElemento(
      'button',
      { class: 'link-sostituisci', type: 'button' },
      `Non mi va bene — mostra ${risultato.alternative.length} alternative`,
    );

    const elenco = creaElemento('div', { class: 'alternative', hidden: true });
    for (const alternativa of risultato.alternative) {
      const scelta = creaElemento(
        'button',
        { class: 'alternativa', type: 'button' },
        creaElemento(
          'span',
          {},
          creaElemento(
            'span',
            { class: 'nome-prodotto' },
            `${alternativa.prodotto.nome} `,
            creaElemento('span', { class: 'marca' }, alternativa.prodotto.marca),
          ),
          creaElemento('p', { class: 'dettagli' }, descriviOpzione(alternativa)),
        ),
        creaElemento('span', { class: 'prezzo-voce' }, euro.format(alternativa.totale)),
      );

      scelta.addEventListener('click', () => sostituisci(indice, alternativa));
      elenco.append(scelta);
    }

    bottone.addEventListener('click', () => {
      elenco.hidden = !elenco.hidden;
      bottone.textContent = elenco.hidden
        ? `Non mi va bene — mostra ${risultato.alternative.length} alternative`
        : 'Nascondi alternative';
    });

    voce.append(bottone, elenco);
  }

  return voce;
}

// Scambia la scelta con un'alternativa: quella scartata torna fra le opzioni,
// cosi si puo sempre tornare indietro.
function sostituisci(indice, alternativa) {
  const risultato = carrello[indice];
  const precedente = risultato.scelta;

  risultato.scelta = alternativa;
  risultato.alternative = [
    precedente,
    ...risultato.alternative.filter((a) => a.prodotto.id !== alternativa.prodotto.id),
  ];

  disegna();
}

function disegna() {
  contenitoreRisultati.innerHTML = '';

  if (carrello.length === 0) {
    contenitoreRisultati.append(
      creaElemento('p', { class: 'vuoto' }, 'Niente da mostrare.'),
    );
    riepilogo.hidden = true;
    sezioneInvio.hidden = true;
    return;
  }

  carrello.forEach((risultato, indice) => {
    contenitoreRisultati.append(disegnaVoce(risultato, indice));
  });

  const totale = carrello
    .filter((r) => r.stato === 'ok')
    .reduce((somma, r) => somma + r.scelta.totale, 0);

  elementoTotale.textContent = euro.format(totale);
  riepilogo.hidden = false;
  sezioneInvio.hidden = !carrello.some((r) => r.stato === 'ok');
}
