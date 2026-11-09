# Terre di Confine — Mini RTS medievale

Un piccolo gioco di strategia in tempo reale, in italiano, **senza librerie esterne e senza backend**. Creato con HTML5, CSS e JavaScript (Canvas 2D): si può aprire da `index.html` e pubblicare su GitHub Pages.

## Come si gioca

1. Premi **Inizia la partita**.
2. Clicca su un contadino; fai **clic destro** su un bosco (legno) o una miniera (oro) per raccogliere risorse. Il contadino torna automaticamente al castello per depositarle.
3. Seleziona un contadino e clicca **Costruisci caserma**. Clicca sulla mappa in una posizione vicina al castello e senza ostacoli. Il contadino costruirà la caserma.
4. Seleziona la caserma e clicca **Addestra soldato**; seleziona le unità e usa il clic destro per spostarle o attaccare.
5. Distruggi la fortezza rossa prima che i nemici abbattano il tuo castello.

### Controlli

| Azione | Controllo |
| --- | --- |
| Selezionare unità / edificio | Clic sinistro |
| Selezionare più unità | Trascinare il mouse |
| Dare un ordine di movimento / raccolta / attacco | Clic destro |
| Dispositivo touch | Tocca l'unità, quindi tocca la destinazione, risorsa o bersaglio |
| Muovere la telecamera | WASD o frecce, oppure minimappa |
| Centrare la telecamera sulla base | Barra spaziatrice |
| Costruire una caserma | B (con un contadino selezionato) |
| Reclutare | R (con castello o caserma selezionati) |
| Aiuto | H |
| Annullare la costruzione | Esc |

## Pubblicazione con GitHub Pages

1. Crea un repository pubblico su GitHub (ad esempio `terre-di-confine`).
2. Carica nella **radice** del repository `index.html`, `style.css` e `game.js` (e, facoltativamente, questo README).
3. Apri **Settings → Pages → Build and deployment**, seleziona **Deploy from a branch**, poi `main` e la cartella `/ (root)` e salva.
4. Una volta completata la pubblicazione, visita `https://TUO-USERNAME.github.io/terre-di-confine/`.

Il progetto usa percorsi relativi (`./style.css` e `./game.js`), quindi funziona anche sui siti Pages di progetto.

## Note tecniche

- Giocatore singolo, offline: tutto gira nel browser, non salva le partite.
- Grafica disegnata via Canvas: non sono necessari download di asset o servizi esterni.
- Prototipo volutamente semplice: movimento diretto (senza pathfinding A*), niente multiplayer, nessuna persistenza e IA basata su ondate.
- La velocità degli eventi è indipendente dal frame rate tramite `requestAnimationFrame` e delta time limitato.

## Struttura

```text
terre-di-confine/
├── index.html
├── style.css
├── game.js
└── README.md
```
