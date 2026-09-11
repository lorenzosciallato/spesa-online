// Apre il browser con il profilo persistente dell'app, cosi' fai una volta
// sola: accesso, punto vendita Conad di Tolentino, modalita' RITIRO IN
// NEGOZIO. Da quel momento l'app riusa la sessione.
//
//   npm run conad:login

process.env.CONAD_HEADLESS = '0';

const conad = await import('../src/adapters/conad.js');
const { BASE_URL } = await import('../src/adapters/conad-selettori.js');

console.log(`
Apro ${BASE_URL} in una finestra del browser.

Nella finestra:
  1. accedi con il tuo account Conad;
  2. scegli il punto vendita: Conad di Tolentino;
  3. scegli la modalita': RITIRO IN NEGOZIO (mai consegna a casa);
  4. chiudi eventuali finestre di cookie e promozioni.

Quando hai finito, torna qui e premi INVIO. Il profilo resta salvato in
${process.env.CONAD_PROFILO || '~/.spesa-conad/profilo'}.
`);

await conad._interno.vaiA('/');

await new Promise((ok) => {
  process.stdin.resume();
  process.stdin.once('data', ok);
});

const stato = await conad.stato();
console.log('\nStato della sessione:', JSON.stringify(stato, null, 2));
if (!stato.pronto) {
  console.log('\nAttenzione: qualcosa non torna. Riapri con `npm run conad:login` e ricontrolla.');
}

await conad.chiudi();
process.exit(0);
