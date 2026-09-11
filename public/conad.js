// Finestra sul browser del server: mostra uno screenshot che si aggiorna e
// manda click, testo e tasti alla pagina Playwright.

const immagine = document.getElementById('immagine');
const schermo = document.getElementById('schermo');
const indirizzo = document.getElementById('indirizzo');
const stato = document.getElementById('stato');
const testo = document.getElementById('testo');

let larghezza = 1280;
let altezza = 900;
let occupato = false;
let timer = null;

async function aggiorna() {
  if (occupato) return;
  try {
    const risposta = await fetch(`/api/browser/schermo?t=${Date.now()}`);
    if (!risposta.ok) {
      const dati = await risposta.json().catch(() => ({}));
      stato.textContent = dati.errore || 'Il browser non risponde.';
      return;
    }
    larghezza = Number(risposta.headers.get('X-Larghezza')) || larghezza;
    altezza = Number(risposta.headers.get('X-Altezza')) || altezza;
    indirizzo.textContent = decodeURI(risposta.headers.get('X-Url') || '');
    const blob = await risposta.blob();
    const url = URL.createObjectURL(blob);
    const precedente = immagine.src;
    immagine.src = url;
    if (precedente.startsWith('blob:')) URL.revokeObjectURL(precedente);
  } catch (errore) {
    stato.textContent = `Errore: ${errore.message}`;
  }
}

async function azione(corpo) {
  occupato = true;
  stato.textContent = '…';
  try {
    const risposta = await fetch('/api/browser/azione', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dati = await risposta.json();
    stato.textContent = risposta.ok ? '' : dati.errore || 'Non ha funzionato';
  } catch (errore) {
    stato.textContent = `Errore: ${errore.message}`;
  } finally {
    occupato = false;
    await aggiorna();
  }
}

schermo.addEventListener('click', (evento) => {
  const r = schermo.getBoundingClientRect();
  const x = Math.round(((evento.clientX - r.left) / r.width) * larghezza);
  const y = Math.round(((evento.clientY - r.top) / r.height) * altezza);
  azione({ tipo: 'click', x, y });
});

document.getElementById('invia').addEventListener('click', async () => {
  if (!testo.value) return;
  await azione({ tipo: 'scrivi', testo: testo.value });
  testo.value = '';
});
testo.addEventListener('keydown', (evento) => {
  if (evento.key === 'Enter') document.getElementById('invia').click();
});

const tasti = { invio: 'Enter', tab: 'Tab', cancella: 'Backspace' };
for (const [id, tasto] of Object.entries(tasti)) {
  document.getElementById(id).addEventListener('click', () => azione({ tipo: 'tasto', tasto }));
}

document.getElementById('home').addEventListener('click', () => azione({ tipo: 'vai', url: '/' }));
document.getElementById('indietro').addEventListener('click', () => azione({ tipo: 'indietro' }));
document.getElementById('popup').addEventListener('click', () => azione({ tipo: 'popup' }));
document.getElementById('scorri-su').addEventListener('click', () => azione({ tipo: 'scorri', dy: -500 }));
document.getElementById('scorri-giu').addEventListener('click', () => azione({ tipo: 'scorri', dy: 500 }));
document.getElementById('aggiorna').addEventListener('click', aggiorna);

function avviaAggiornamento() {
  clearInterval(timer);
  timer = setInterval(aggiorna, 1500);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearInterval(timer);
  else avviaAggiornamento();
});

aggiorna();
avviaAggiornamento();
