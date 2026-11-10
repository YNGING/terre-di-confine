# Terre di Confine — Mini RTS medievale

Un RTS in italiano, **senza librerie esterne e senza backend**. HTML5, CSS e JavaScript con Canvas 2D: apri `index.html` oppure pubblica i file su GitHub Pages.

## Come si gioca

1. Premi **Inizia la partita**. Hai tre contadini e due armigeri.
2. Seleziona i contadini e ordina la raccolta con clic destro su boschi e miniere. Trasportano fino a 18 risorse, le depositano e ripartono. A giacimento esaurito consegnano l’ultimo carico e cercano un’altra fonte dello stesso tipo.
3. Con un contadino, costruisci una **caserma** vicino al castello: 110 legno, 45 oro. Puoi riprendere un lavoro interrotto ordinando a un contadino di lavorare sulla caserma incompleta.
4. Recluta armigeri e arcieri. Le code contengono fino a cinque unità per edificio; risorse e posti di popolazione sono prenotati subito. Il contatore mostra `unità vive + prenotate / 18`.
5. Porta le truppe nel cerchio dell’**avamposto centrale**. Conquistalo per accedere ai maghi, ricevere oro e depositare risorse sul confine.
6. Difendi base e avamposto, poi prepara un esercito misto e distruggi la fortezza rossa. Entrambi i castelli sparano automaticamente ai nemici vicini: l’assalto con i soli soldati iniziali è rischioso.

### Unità

| Unità | Costo legno / oro | Addestramento | Ruolo |
| --- | --- | --- | --- |
| Contadino | 45 / 0 | 5s, castello | Raccolta e costruzione; non conquista l’avamposto |
| Armigero | 35 / 30 | 7s, caserma | Fanteria resistente; protegge le retrovie e assalta edifici |
| Arciere | 45 / 40 | 9s, caserma | Tiro a lunga distanza; fragile, infligge il 45% dei danni agli edifici |
| Mago | 60 / 100 | 18s, caserma | Sbloccato dall’avamposto: esplosioni lente contro gruppi nemici |

Il **mago** ha 58 PV e lancia automaticamente un’esplosione ogni 3 secondi: 30 danni al bersaglio, 18 alle altre unità nemiche entro un raggio di 58. Nessun fuoco amico. Infligge il 35% dei danni diretti agli edifici: proteggilo con la fanteria. La portata dell’arciere è maggiore di quella del mago.

### Avamposto e ondate

- Almeno un combattente nel cerchio avvia la conquista. Servono 12 secondi da neutrale a pieno controllo; recuperare un avamposto completamente nemico richiede prima 12 secondi per neutralizzarlo, poi 12 per conquistarlo.
- Se sono presenti truppe di entrambe le fazioni, la conquista si ferma. Rendita e deposito restano sospesi finché la zona è contesa.
- Sotto controllo alleato produce **8 oro ogni 8 secondi** e funziona da deposito per i contadini più vicini. I contadini tornano al castello se il deposito non è disponibile.
- Perdere il controllo impedisce nuovi reclutamenti di maghi. I maghi già presenti o già pagati in coda rimangono disponibili.
- La prima ondata parte dopo 75 secondi. Le successive alternano attacchi al castello e all’avamposto; introducono arcieri dalla terza ondata e maghi dalla sesta. La minimappa mostra il conto alla rovescia della prossima ondata.

### Ordini e controlli

**Muovi** dà priorità al movimento: usalo per ritirarti. **Avanza** ingaggia i nemici lungo il percorso. **Mantieni** attacca solo i bersagli già a portata, senza inseguire. Un attacco diretto assegna un bersaglio prioritario. I contadini non ingaggiano automaticamente durante gli spostamenti.

| Azione | Controllo |
| --- | --- |
| Selezionare unità / edificio | Clic sinistro |
| Selezionare un gruppo | Trascina il mouse; Shift + clic aggiunge alla selezione |
| Muovere / raccogliere / attaccare / conquistare | Clic destro sulla destinazione o sul bersaglio |
| Avanzare combattendo | Pulsante **Avanza** o F, poi clic sulla meta |
| Mantenere la posizione | Pulsante **Mantieni** o X |
| Selezionare tutto l’esercito | Pulsante **Esercito** o G |
| Scorrere i contadini inattivi | Pulsante **Inattivi** o I |
| Muovere la telecamera | WASD, frecce o minimappa |
| Tornare alla base | Spazio |
| Centrare l’avamposto | Pulsante di stato dell’avamposto |
| Costruire la caserma | B, con un contadino selezionato |
| Reclutare contadino / armigero | R, con castello / caserma selezionati |
| Reclutare arciere / mago | Q / E, con caserma selezionata |
| Punto di raduno | Clic destro con l’edificio selezionato, o pulsante dedicato e clic |
| Annullare l’ultima unità in coda | Pulsante nell’edificio; rimborso completo |
| Pausa / ripresa | P oppure pulsante pausa e **Torna alla partita** |
| Aiuto con pausa | H o pulsante ? |
| Annullare un ordine in attesa della destinazione | Esc o **Annulla ordine** |

Su **touch**, seleziona l’unità e tocca la destinazione, la risorsa o il nemico. **Esercito** seleziona tutti i combattenti; i pulsanti **Muovi**, **Avanza**, **Mantieni** e **Punto di raduno** sostituiscono le scorciatoie. Il pannello comandi è scorrevole sui piccoli schermi. Tocca la minimappa per spostare la visuale.

Le nuove unità raggiungono il punto di raduno; i combattenti avanzano ingaggiando i nemici, i contadini si muovono direttamente. Se un edificio viene distrutto, la sua coda è persa e i posti prenotati tornano liberi. Passare a un’altra scheda mette automaticamente la partita in pausa.

## Pubblicazione con GitHub Pages

1. Mantieni nella radice **`index.html`, `style.css`, `rules.js` e `game.js`**. `rules.js` deve essere caricato prima di `game.js`, come indicato nell’HTML.
2. In **Settings → Pages → Build and deployment**, seleziona **Deploy from a branch**, `main` e `/ (root)`.
3. A pubblicazione completata, visita `https://YNGING.github.io/terre-di-confine/`.

Tutti i percorsi sono relativi: il gioco funziona anche nel sottopercorso di un sito Pages. Nessun servizio esterno, asset da scaricare o compilazione necessaria.

## Sviluppo e verifiche

Per servirlo localmente:

```sh
python3 -m http.server 8000
```

Per eseguire i test di regressione, con Node.js 22 o superiore e senza installare pacchetti:

```sh
node --test tests/game.test.cjs
```

I test verificano raccolta ed esaurimento, arrivi diagonali e raccolta prolungata, prenotazione della popolazione, code e rimborsi, ritirata, mantenimento posizione, attacchi a distanza, danni ad area, conquista e perdita dell’avamposto, ondate, assalto e riavvio. Usano una simulazione accelerata in una VM; le interazioni e il disegno richiedono anche una prova nel browser.

`rules.js` raccoglie costi, statistiche e parametri dell’avamposto per facilitare il bilanciamento. `game.js` gestisce simulazione, comandi e Canvas. La diagnostica `window.__rtsDebug.snapshot()` restituisce solo un riepilogo dello stato.

Il progetto resta single-player con mappa fissa, movimento diretto e IA a ondate. Ricerca dei percorsi intorno agli ostacoli, nebbia di guerra, salvataggi e multiplayer sono sviluppi futuri. Il bilanciamento può essere ulteriormente affinato con partite reali.

```text
terre-di-confine/
├── index.html
├── style.css
├── rules.js
├── game.js
├── tests/game.test.cjs
└── README.md
```
