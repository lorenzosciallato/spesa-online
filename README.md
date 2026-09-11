# Spesa

Web app per dettare a voce la lista della spesa e farsi riempire il carrello
con i prodotti piu convenienti, potendo sostituire ogni scelta con alternative
simili.

Riferimento: Conad di Tolentino, modalita **ritiro in negozio**.
L'ordine non viene mai completato: niente scelta dell'orario, niente pagamento.

## Avvio

```bash
npm start            # http://localhost:3000
npm test             # 15 test su parser e motore di scelta
```

Nessuna dipendenza da installare: solo moduli nativi di Node (serve Node 18+).

La dettatura vocale usa la **Web Speech API** del browser — funziona su Chrome,
e' gratuita e non manda audio a servizi esterni. Senza microfono la lista si
puo sempre scrivere a mano.

## Come e' fatta

```
src/parser.js          lista dettata -> voci strutturate (nome, quantita, categoria)
src/scoring.js         sceglie il prodotto piu conveniente
src/server.js          server HTTP + API
src/adapters/mock.js   catalogo finto per sviluppare senza il sito Conad
src/adapters/conad.js  catalogo reale — DA IMPLEMENTARE
public/                interfaccia: dettatura, carrello, sostituzione
```

Il punto chiave e' l'**adapter**: il catalogo e' isolato dietro una sola
interfaccia (`cerca`, `aggiungiAlCarrello`). Parser, motore di scelta e
interfaccia sono gia completi e funzionano sul catalogo finto; per collegare
Conad basta implementare `src/adapters/conad.js`, senza toccare il resto.

```bash
CATALOGO=mock npm start     # default, dati finti
CATALOGO=conad npm start    # quando l'adapter reale sara pronto
```

## Niente IA costosa

Per scelta, nel percorso normale non gira nessun modello:

| Pezzo | Come e' risolto |
|---|---|
| Dettatura | Web Speech API del browser, nativa |
| Capire "latte x6, 2 kg di pane" | Regex e dizionario in `parser.js` |
| Scelta del piu conveniente | Aritmetica in `scoring.js` |
| Alternative | Gli altri risultati della stessa ricerca, in ordine di convenienza |

Un modello piccolo servirebbe solo per le richieste davvero ambigue
("quel sugo buono"), ed e' un'aggiunta opzionale.

## Regole di scelta implementate

1. Vince il prezzo piu basso **a confezione**, ignorando il prezzo al chilo/litro.
2. Le offerte (3x2, 2x1, sconti, "2 a 1,80 €") sono calcolate davvero: se con
   l'offerta il prezzo a pezzo scende **sotto la confezione singola piu
   economica**, si prende la quantita dell'offerta.
3. Senza quantita indicata si prende 1 confezione. "latte x6" ne prende 6.
4. Se un prodotto non esiste o e' esaurito viene **saltato**, mai sostituito
   d'ufficio: la sostituzione la decidi tu dall'interfaccia.
5. Eccezione per i prodotti della casa (carta igienica, detersivi, tabs
   lavastoviglie): li' vince il **prezzo unitario**, non la confezione piu
   economica.

Le regole 1-4 sono verificate dai test; la 5 pure.

## Da fare

- [ ] Ispezionare spesaonline.conad.it e decidere fra endpoint JSON interni
      (veloci, robusti) e Playwright headless (sempre possibile, fragile).
- [ ] Implementare `src/adapters/conad.js`.
- [ ] Gestire la sessione loggata, il punto vendita di Tolentino e il ritiro
      in negozio.
- [ ] Aggiungere davvero i prodotti al carrello Conad, fermandosi prima di
      orario di ritiro e pagamento.
