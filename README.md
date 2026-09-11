# Spesa

## Per la famiglia: come si usa

L'app da usare dal telefono e dal Chromebook e la pagina `index.html` di
questa cartella (online all'indirizzo della pagina GitHub del progetto).

1. Tocca il microfono e detta la lista, oppure scrivila: "latte x6, pasta, pane".
2. Tocca **Prepara la lista**: esce una riga per prodotto con la quantita.
3. Per ogni riga tocca **Cerca**: si apre Conad gia sul prodotto. Tocca
   **Aggiungi** su quello che costa meno a confezione, torna alla lista e
   spunta la riga.
4. Alla fine controlla il carrello su Conad, scegli l'orario di ritiro e paga.

La prima volta sul telefono bisogna entrare su spesaonline.conad.it con il
proprio account e scegliere Conad Tolentino con ritiro in negozio. Poi resta.

Tutto quello che segue e la versione automatica, che sceglie da sola il
prodotto piu conveniente e riempie il carrello: serve un computer sempre
acceso (un VPS va benissimo) che la faccia girare.

## Metterla su un VPS con Docker

```bash
git clone https://github.com/lorenzosciallato/spesa-online.git
cd spesa-online
SPESA_PASSWORD=una-password-tua docker compose up -d --build
```

Poi dal telefono o dal Chromebook si apre `http://INDIRIZZO-DEL-VPS:3000`
(chiede la password scelta). La prima volta:

1. l'avviso in alto dice che sul sito Conad non si e loggati: clicca
   **Apri il sito Conad da qui**;
2. si vede il browser del server: clicca su Accedi, scrivi email e password
   nella casella in basso e premi Invia, scegli Conad Tolentino e Ritiro in
   negozio;
3. torna alla pagina della spesa: l'avviso diventa verde. Da li in poi la
   sessione resta salvata nel volume `spesa-dati`.

Se il sito Conad usa un indirizzo di ricerca diverso da `/search?query=...`,
passalo cosi: `CONAD_URL_RICERCA='/ricerca?testo={q}' docker compose up -d`.

---

## Versione automatica

Web app per dettare a voce la lista della spesa e farsi riempire il carrello
di spesaonline.conad.it con i prodotti piu convenienti, potendo sostituire
ogni scelta con alternative simili.

Riferimento: Conad di Tolentino, modalita **ritiro in negozio**.
L'ordine non viene mai completato: niente scelta dell'orario, niente pagamento.

## Avvio

```bash
npm install                  # solo Playwright
npx playwright install chromium   # una volta, se non hai Chrome
npm test                     # 34 test: parser, scelta, adapter Conad (su un sito finto), API

npm start                    # http://localhost:3000 con il catalogo finto
CATALOGO=conad npm start     # http://localhost:3000 sul sito Conad vero
```

La dettatura vocale usa la **Web Speech API** del browser: funziona su Chrome,
e gratuita e non manda audio a servizi esterni. Senza microfono la lista si
puo sempre scrivere a mano.

## Collegarsi al sito Conad

L'adapter guida un Chromium con Playwright e un **profilo persistente**
(`~/.spesa-conad/profilo`), cosi accesso, punto vendita e modalita si
impostano una volta sola:

```bash
npm run conad:login
```

Si apre una finestra: accedi, scegli **Conad di Tolentino** e **RITIRO IN
NEGOZIO**, chiudi i popup, torna nel terminale e premi INVIO. Lo script stampa
lo stato riconosciuto (loggato, punto vendita, modalita). Da quel momento
`CATALOGO=conad npm start` riusa la sessione; l'interfaccia mostra in alto un
avviso se qualcosa non torna.

Variabili utili:

| Variabile | Effetto |
|---|---|
| `CONAD_BROWSER=chrome` | usa Google Chrome installato invece del Chromium di Playwright |
| `CONAD_HEADLESS=1` | browser invisibile (di default si vede, cosi si capisce cosa fa) |
| `CONAD_DEBUG=1` | salva screenshot e HTML di ogni pagina in `./ispezione/` |
| `CONAD_ATTESA_MS=1500` | pausa dopo ogni caricamento, da alzare se il sito e lento |
| `CONAD_PROFILO=...` | cartella del profilo del browser |

### Se il sito cambia (o i selettori non lo riconoscono)

Tutto quello che dipende dall'HTML del sito sta in un file solo,
`src/adapters/conad-selettori.js`: liste di selettori CSS provati in ordine
per le schede prodotto, prezzo, marca, formato, offerte, bottone "Aggiungi",
stepper della quantita, righe e totale del carrello. Per calibrarli:

```bash
npm run conad:ispeziona -- latte
```

apre la ricerca sul sito vero, salva screenshot, HTML e JSON in `./ispezione/`
e stampa cosa ha riconosciuto (quale selettore ha trovato le schede, quanti
prodotti, prezzi, formati, offerte). Se manca qualcosa, si guarda l'HTML
salvato e si aggiunge il selettore giusto alla lista. Il sito non era
raggiungibile dall'ambiente in cui e stato scritto il codice, quindi la prima
calibrazione va fatta con questo comando.

## Come e fatta

```
src/parser.js                    lista dettata -> voci strutturate (nome, quantita, categoria)
src/scoring.js                   sceglie il prodotto piu conveniente
src/server.js                    server HTTP + API
src/adapters/mock.js             catalogo finto con carrello in memoria
src/adapters/conad.js            catalogo reale: Playwright su spesaonline.conad.it
src/adapters/conad-selettori.js  selettori CSS e URL del sito (unico file da toccare se cambia)
src/adapters/conad-parse.js      interpreta prezzi, formati e offerte letti dalle schede
scripts/conad-login.js           accesso e scelta del punto vendita, una volta sola
scripts/conad-ispeziona.js       diagnostica per calibrare i selettori
test/sito-finto/                 finto spesaonline per collaudare l'adapter con un vero browser
public/                          interfaccia: dettatura, carrello, sostituzione, rapporto finale
```

Il catalogo e isolato dietro una sola interfaccia:

| Funzione | Cosa fa |
|---|---|
| `cerca(query)` | risultati di ricerca nella forma attesa dal motore di scelta |
| `aggiungiAlCarrello(prodotto, quantita)` | mette nel carrello del sito la quantita richiesta |
| `leggiCarrello()` | righe e totale del carrello del sito |
| `stato()` | loggato? punto vendita? modalita? |

## Flusso

1. Detti o scrivi la lista ("latte x6, pasta, 2 kg di pane").
2. **Riempi il carrello**: per ogni voce l'app cerca sul sito, sceglie il piu
   conveniente e mostra le alternative; puoi sostituire ogni scelta.
3. **Metti nel carrello Conad**: aggiunge le scelte al carrello del sito, uno
   alla volta, poi rilegge il carrello e mostra il rapporto finale: cosa c'e
   (prodotto, marca, quantita, prezzo), il totale, cosa e stato saltato e
   perche.
4. Si ferma. Orario di ritiro e pagamento li scegli tu sul sito.

## Regole di scelta implementate

1. Vince il prezzo piu basso **a confezione**, ignorando il prezzo al chilo/litro
   (che l'adapter riconosce e scarta: "1,29 €/kg", "al litro"...).
2. Le offerte (3x2, 2x1, "prendi 3 paghi 2", 1+1, "2 a 1,80 €", "50% sul
   secondo") sono calcolate davvero: se con l'offerta il prezzo a pezzo scende
   **sotto la confezione singola piu economica**, si prende la quantita
   dell'offerta. Uno sconto percentuale ("-30%") e solo informativo perche il
   prezzo in scheda e gia quello scontato.
3. Senza quantita indicata si prende 1 confezione. "latte x6" ne prende 6.
4. Se un prodotto non esiste o e esaurito viene **saltato**, mai sostituito
   d'ufficio: la sostituzione la decidi tu dall'interfaccia.
5. Eccezione per i prodotti della casa (carta igienica, detersivi, tabs
   lavastoviglie): li vince il **prezzo unitario**, non la confezione piu
   economica.

## Sicurezza: mai un ordine

Oltre a fermarsi prima dell'orario di ritiro, l'adapter **blocca a livello di
browser** ogni navigazione verso pagine di checkout, fasce orarie e pagamento
(`URL_VIETATI` in `conad-selettori.js`). Un test lo verifica: chiedere al
browser di aprire `/checkout` fallisce e il sito finto non riceve la richiesta.

## Niente IA costosa

Nel percorso normale non gira nessun modello:

| Pezzo | Come e risolto |
|---|---|
| Dettatura | Web Speech API del browser, nativa |
| Capire "latte x6, 2 kg di pane" | Regex e dizionario in `parser.js` |
| Scelta del piu conveniente | Aritmetica in `scoring.js` |
| Prezzi e offerte dal sito | Regex in `conad-parse.js` |
| Alternative | Gli altri risultati della stessa ricerca, in ordine di convenienza |
