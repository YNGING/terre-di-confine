# Terre di Confine — Mini RTS medievale

Un RTS in italiano, **senza librerie esterne e senza backend**. HTML5, CSS e JavaScript con Canvas 2D: apri `index.html` oppure pubblica i file su GitHub Pages.

## Sette livelli

Il selettore iniziale permette di giocare tutti e sette i livelli. Vincendo uno dei primi sei appare **Livello successivo**; dopo una sconfitta si riprova il livello corrente. **Ricomincia** azzera il livello corrente e riapre il selettore. Da pausa o fine partita, **Scegli livello · abbandona la partita** torna al selettore azzerando la partita in corso. Non sono richiesti sblocco o salvataggi.

| | Livello 1 · Terre di Confine | Livello 2 · La frontiera contesa | Livello 3 · L’assedio delle tre torri | Livello 4 · La marca di ferro | Livello 5 · La corona usurpata |
| --- | --- | --- | --- | --- | --- |
| Mappa | 2400 × 1600 | 3000 × 2000 | 3000 × 2000, nuova disposizione | 3400 × 2200 | 4200 × 2800 |
| Popolazione massima, incluse le code | 18 | 24 | 28 | 30 | 36 |
| Risorse iniziali (legno / oro) | 200 / 110 | 200 / 110 | 200 / 110 | 180 / 80 | 220 / 100 |
| Boschi / miniere | 9 / 5 | 15 / 8 | 16 / 9 | 16 / 7 | 24 / 12, di cui 4 ricchi |
| Punti di controllo | 1 avamposto neutrale | 3 avamposti neutrali | 3 torri inizialmente nemiche | 4 torri nemiche, Forgia inclusa | 4 torri nemiche e il Mulino neutrale |
| Nemici | Rossi, fortezza da 1400 PV | Rossi e Viola, fortezze da 1200 PV | Guarnigione, cittadella da 1800 PV e due accampamenti da 650 PV | Legione di ferro, fortezza da 2200 PV e due accampamenti da 800 PV, arieti | Corona usurpata, cittadella da 2600 PV, due bastioni, due accampamenti da 850 PV, Scuderie da 700 PV, arieti, cavalieri e Guardia reale |
| Ondate | Prima a 75s, intervallo minimo 38s | Prima a 75s, minimo 38s | Prima a 75s, minimo 42s | Prima a 65s, minimo 36s, tenaglie | Prima a 65s, minimo 34s, cavalleria e tenaglie |
| Vittoria | Distruggi la fortezza rossa | Distruggi entrambe le fortezze | Distruggi la cittadella | Distruggi la fortezza di ferro | Distruggi la cittadella dell’usurpatore |

Costi e statistiche delle unità sono condivisi; la dotazione iniziale è di tre contadini e due armigeri. Il primo livello conserva mappa e bilanciamento originali.

### La frontiera contesa

- L’avamposto di ponente è vicino alla base; quelli del nord e del sud sono più esposti, vicini a risorse e fortezze rivali. Le strade indicano i due fronti e non bloccano il movimento.
- Basta controllare **almeno un avamposto** per reclutare maghi. Ogni avamposto gestisce conquista, rendita e deposito in modo indipendente. I contadini scelgono il deposito disponibile più vicino e cambiano destinazione se diventa conteso o viene perso.
- Rossi e Viola sono due fazioni distinte, ostili al giocatore e fra loro. La presenza di combattenti di più fazioni ferma conquista, rendita e deposito. Anche il passaggio da Rossi a Viola richiede prima la neutralizzazione, poi la conquista: circa 24 secondi complessivi.
- Un solo calendario regola le ondate: prima partenza a 75 secondi, prime due ondate rosse, Viola dalla terza (circa 195 secondi). Poi i fronti si alternano. Le ondate crescono fino a 10 unità, con arcieri dalla terza e maghi dalla sesta, e alternano castello e avamposti come obiettivi.
- Distruggere una fortezza lascia vuoti i suoi successivi turni di attacco: il fronte superstite non riceve ondate aggiuntive. Le truppe già presenti restano in campo. La partita termina quando entrambe le fortezze sono distrutte, oppure quando cade il castello del giocatore.
- La minimappa distingue i colori delle fazioni ed evidenzia la fortezza da cui partirà la prossima ondata. La scritta **TREGUA** indica il turno di un fronte già sconfitto. Clic ripetuti sul pulsante degli avamposti centrano e selezionano ponente, nord e sud.

### L’assedio delle tre torri

La terza mappa introduce un assedio con obiettivi intermedi. Le tre torri iniziano sotto controllo della **Guarnigione**, la stessa fazione che difende cittadella e accampamenti. Ogni torre offre un beneficio diverso:

| Torre | Beneficio sotto controllo alleato |
| --- | --- |
| Mercato, a ponente | **12 oro ogni 8 secondi** e deposito per i contadini; entrambi sospesi se contesa |
| Arcana, a nord | Sblocca il reclutamento dei maghi finché alleata; maghi vivi e unità già pagate in coda restano disponibili dopo la perdita |
| Guardia, a sud | Frecce automatiche: **12 danni ogni 2 secondi**, portata 220, contro le unità avversarie; difende chi la controlla e non spara se neutrale o contesa |

La Torre arcana e la Torre di guardia **non producono oro e non sono depositi**. I contadini possono depositare solo al castello o al Mercato alleato e non conteso. Solo la Torre arcana sblocca i maghi, anche se il Mercato è già conquistato.

**Scudo della cittadella:** ciascuna torre ancora nemica riduce i danni alla cittadella di 20 punti percentuali, fino al 60% iniziale. Per esempio, un colpo da 100 danni ne infligge 40 con tutte le torri nemiche, 60 con due, 80 con una e 100 senza torri nemiche. Lo scudo non rende mai invulnerabile la cittadella e non protegge gli accampamenti. Il suo valore è visibile nell’obiettivo e selezionando la cittadella; l’alone viola indica che è attivo.

Per sottrarre una torre al nemico occorrono circa 12 secondi di neutralizzazione e altri 12 di conquista con almeno un combattente nel cerchio. Lo scudo diminuisce già alla neutralizzazione; se il nemico riconquista una torre, la sua quota di protezione ritorna. La presenza di fazioni avversarie ferma la conquista. Una torre ancora nemica e contesa continua a contribuire allo scudo fino alla neutralizzazione.

**Un solo calendario di ondate:** prima partenza a 75 secondi, poi si alternano Campo nord, Campo sud e Cittadella. Gli accampamenti inviano al massimo 5 predoni/arcieri; la cittadella arriva gradualmente a 10 combattenti, con maghi dalla sesta ondata. Gli intervalli diminuiscono fino a 42 secondi. Distruggere un accampamento elimina le sue successive ondate lasciandone vuoti i turni, senza trasferire rinforzi agli altri fronti; i soldati già usciti dal campo restano attivi.

Nei turni della cittadella, dalla terza ondata, può essere annunciato un **contrattacco** contro una torre alleata: avviso 20 secondi prima, nome del bersaglio sopra la minimappa e riquadro dorato sulla torre. Il bersaglio annunciato resta fisso per quell’ondata. Il contrattacco sostituisce l’attacco normale, senza aggiungere un secondo flusso di nemici. Se il bersaglio è già tornato nemico, le truppe proseguono verso il castello. La pausa ferma anche il conto alla rovescia.

Gli accampamenti e le torri sono obiettivi strategici, non requisiti obbligatori: **distruggere la cittadella basta per vincere**, anche con accampamenti ancora attivi. Perdere il proprio castello termina la partita. Dopo la vittoria si passa al quarto livello.

### La marca di ferro

Il quarto livello riprende l’assedio del terzo e lo rende più duro. Si parte con meno risorse (180 legno, 80 oro) e sulla mappa ci sono solo 7 miniere. La **Legione di ferro** schiera una fortezza da 2200 PV, difesa da due guardie in più, e due accampamenti da 800 PV.

- **Quattro torri, 15% di scudo ciascuna** (60% all’inizio): Mercato (10 oro ogni 8s e deposito), Arcana (maghi), Guardia (frecce) e la nuova **Forgia**, vicina alla fortezza.
- **Forgia:** finché non è contesa, dà **+20% di danni** a tutte le unità della fazione che la controlla, compresa l’esplosione ad area dei maghi. All’inizio è nemica: le ondate colpiscono più forte finché non la strappi alla Legione. Il bonus attivo compare nella scheda dell’unità.
- **Tenaglia:** il calendario è Campo nord, Campo sud, Fortezza, poi **entrambi i campi insieme**, e così via. La tenaglia è annunciata 20 secondi prima («Tenaglia: Campo nord + Campo sud») e i due campi sono evidenziati sulla minimappa. Se un campo è distrutto, arriva solo la metà dell’altro.
- **Ariete:** dalla quinta ondata ogni ondata della fortezza include un ariete (320 PV, lento, 55 danni ogni 2,4s). Ignora le unità e punta all’edificio alleato più vicino. È **corazzato**: frecce di arcieri, castello e Torre di guardia gli fanno metà danni. Non conquista torri. Fermalo con armigeri e maghi.
- Ondate fino a 12 unità dalla fortezza, intervallo minimo 36 secondi, prima ondata a 65 secondi, contrattacchi annunciati come nel terzo livello.

Dopo la vittoria si passa al quinto livello.

### La corona usurpata

Il quinto livello si gioca sulla mappa più grande: 4200 × 2800, popolazione 36, partenza con 220 legno e 100 oro. La **Corona usurpata** difende la sua cittadella da 2600 PV con quattro torri (Mercato, Arcana, Guardia e Forgia, 15% di scudo ciascuna) e con un secondo anello di difese.

- **Magazzino** (disponibile dal livello 5): 80 legno, tasto **M** o pulsante del contadino, costruzione in 8 secondi. Una volta completato, i contadini vi depositano legno e oro come al castello. Il deposito più vicino viene scelto da solo.
- **Basi avanzate:** caserme e magazzini si possono costruire vicino al castello **oppure** fra 150 e 380 di distanza da una torre alleata e non contesa. Durante il posizionamento le aree consentite sono tratteggiate.
- **Giacimenti ricchi:** quattro giacimenti più grandi e luminosi (legno 1000, oro 900, contro 500 e 380), anche sulla minimappa. Si trovano nelle zone contese: vicino al Mulino, sotto la Torre di guardia e fra i due campi.
- **Mulino:** un quinto punto di controllo, **neutrale** all’inizio, a sud-ovest. Dà 8 oro ogni 8 secondi e fa da deposito. Non conta per lo scudo.
- **Scuderie e cavalieri:** le Scuderie mandano fino a 4 **cavalieri** (110 PV, velocissimi). Inseguono contadini e magazzini, combattono solo chi li blocca da vicino e, senza prede, puntano al castello. Non conquistano torri.
- **Bastioni:** due torrioni da 900 PV sulla via della cittadella, con frecce da 16 danni ogni 1,6 secondi e portata 240. Non serve abbatterli per vincere.
- **Guardia reale:** la prima volta che la cittadella scende sotto metà vita esce un **Campione** (650 PV, 30 danni) con quattro predoni. L’avviso compare in alto e sulla minimappa.
- **Ondate:** Scuderie, Campo nord, Campo sud, Cittadella, Scuderie, poi i due campi a tenaglia, e così via. Arieti dalla quinta ondata, contrattacchi annunciati, intervallo minimo 34 secondi.

Dopo la vittoria si passa al sesto livello, La via dei rifornimenti.

### La via dei rifornimenti

Il livello 6 cambia obiettivo: **consegna tre carri di rifornimenti** alla fortezza alleata sul lato orientale, mantenendo in vita il tuo castello. Mappa 4000 × 2200, popolazione 38, 240 legno e 120 oro iniziali. Caserme e magazzini possono essere costruiti anche vicino ai presidi alleati non contesi.

- **Un carro alla volta**, con 480 PV e velocità 60. Il primo è gratuito e attende alla base; dopo ogni consegna riuscita ne appare gratuitamente un altro, sempre fermo alla partenza. Non c’è un limite di tempo globale.
- I pulsanti **Avvia / riprendi**, **Ferma carro** e **Centra carro**, sopra la minimappa, comandano il convoglio. Puoi fermarlo anche a metà strada. Segue il percorso tratteggiato, senza deviazioni comandabili con gli ordini militari.
- Le soste sono **Presidio del guado** e **Presidio delle colline**. Il carro si ferma automaticamente a ciascuna e aspetta un ordine; per ripartire il presidio deve essere **alleato e non conteso**. Può arrivare a un presidio ancora nemico, ma serviranno le truppe per conquistarlo. Il presidio perso dopo la partenza non interrompe il tratto già iniziato.
- I presidi partono nemici. Una volta conquistati danno **8 oro ogni 8s**, deposito, accesso ai maghi e spazio per basi avanzate. Oro e deposito si fermano nelle zone contese.
- Il carro **non combatte, non conquista, non occupa popolazione e non entra nei gruppi militari**. È bersagliabile dai nemici e riceve l’avviso di attacco sulla minimappa. Come le unità alleate, può recuperare vita vicino al castello fuori combattimento.
- Perdere un carro **non termina la missione**: il pulsante **Sostituisci** costa **80 legno e 40 oro** e prepara un nuovo carro fermo alla base. Le consegne già completate restano valide. L’oro dei presidi aiuta a finanziare eventuali sostituzioni.
- Le **Scuderie dei predoni** inviano fino a 3 cavalieri, che danno priorità al carro ma combattono la scorta che li intercetta da vicino. Gli altri due campi attaccano i presidi. Prima ondata a 80s, intervallo minimo 42s; calendario Scuderie, Campo nord, Campo sud, Scuderie, tenaglia dei due campi. Le incursioni sono annunciate 20s prima.
- Distruggere un campo lascia vuoti i suoi turni successivi; le truppe già presenti restano attive. Eliminare tutti i nemici non sostituisce le tre consegne.

La fortezza alleata di destinazione è il punto di consegna, non una seconda base da gestire. La barra sopra la minimappa misura le consegne; il contatore dei PV e lo stato indicano la situazione del carro. Dopo la terza consegna si passa al livello 7.

### I sigilli della frontiera

Il livello 7 conclude la campagna con il **controllo territoriale**: accumula **180 secondi di rituale** possedendo almeno due santuari non contesi. Mappa 4200 × 2800, popolazione 40, partenza con 240 legno e 120 oro.

| Situazione | Progresso del rituale |
| --- | --- |
| Meno di due santuari alleati non contesi | Fermo; il progresso già accumulato rimane |
| Due santuari alleati non contesi | 1 secondo di progresso per secondo di partita |
| Tutti e tre alleati non contesi | 1,5 secondi di progresso per secondo: completamento in 120s se mantenuti sempre |

- **Santuario dell’alba** a nord e **Santuario del crepuscolo** a sud partono neutrali; il **Santuario del meriggio** a est parte nemico.
- Ogni santuario alleato offre **6 oro ogni 8s**, deposito, maghi e costruzioni avanzate. I santuari contesi non contano per il rituale, non producono oro e non ricevono risorse. È sufficiente mantenerne la proprietà: non serve una guarnigione per attivare il conteggio, ma difenderli resta necessario.
- Tre accampamenti attaccano i rispettivi santuari e, dopo averli conquistati, proseguono verso il castello. Il Campo orientale arriva a 7 unità, gli altri a 5. Prima ondata a 75s, intervallo minimo 38s; calendario nord, sud, est, tenaglia nord+sud, est. Gli obiettivi sono annunciati 20s prima.
- Gli accampamenti sono distruttibili per ridurre la pressione, ma **la vittoria dipende dal rituale**, non dalla loro eliminazione. La barra e l’obiettivo mostrano progresso, santuari validi e velocità corrente.
- Perdere il castello comporta la sconfitta. La pausa ferma il rituale e le ondate. Ricominciare azzera il progresso; dopo la vittoria puoi rigiocare il settimo livello o tornare al selettore.

## Come si gioca (livello 1)

1. Premi **Inizia il livello**. Hai tre contadini e due armigeri.
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

### Aiuti al comando

- **Cura al castello:** le unità alleate entro 260 dal proprio castello, se non subiscono danni da 4 secondi, recuperano 3 PV al secondo.
- **Avvisi d’attacco:** quando un nemico colpisce castello, caserma o contadini compare un avviso («Il castello è sotto attacco!») e un cerchio rosso pulsa sulla minimappa. Ogni tipo di avviso si ripete al massimo ogni 10 secondi.
- **Messaggi:** gli avvisi «unità pronta» non coprono più gli annunci di ondata, contrattacco o attacco ancora visibili.
- **Raduno su risorse:** con il castello selezionato, clic destro su un bosco o una miniera: i nuovi contadini iniziano subito a raccogliere.
- **Gruppi:** Ctrl+1…5 (oppure Shift+1…5) salva le unità selezionate; 1…5 le riseleziona, premendo due volte di fila la telecamera le inquadra. Il **doppio clic** su un’unità seleziona tutte quelle dello stesso tipo visibili sullo schermo.

### Ordini e controlli

**Muovi** dà priorità al movimento: usalo per ritirarti. **Avanza** ingaggia i nemici lungo il percorso. **Mantieni** attacca solo i bersagli già a portata, senza inseguire. Un attacco diretto assegna un bersaglio prioritario. I contadini non ingaggiano automaticamente durante gli spostamenti.

| Azione | Controllo |
| --- | --- |
| Selezionare unità / edificio | Clic sinistro |
| Selezionare un gruppo | Trascina il mouse; Shift + clic aggiunge alla selezione |
| Selezionare le unità visibili dello stesso tipo | Doppio clic su un’unità |
| Salvare / richiamare un gruppo | Ctrl (o Shift) + 1…5 / 1…5; due volte per centrare |
| Muovere / raccogliere / attaccare / conquistare | Clic destro sulla destinazione o sul bersaglio |
| Avanzare combattendo | Pulsante **Avanza** o F, poi clic sulla meta |
| Mantenere la posizione | Pulsante **Mantieni** o X |
| Selezionare tutto l’esercito | Pulsante **Esercito** o G |
| Scorrere i contadini inattivi | Pulsante **Inattivi** o I |
| Muovere la telecamera | WASD, frecce o minimappa |
| Tornare alla base | Spazio |
| Centrare l’avamposto | Pulsante di stato dell’avamposto |
| Costruire la caserma | B, con un contadino selezionato |
| Costruire un magazzino (livelli 5–7) | M, con un contadino selezionato |
| Reclutare contadino / armigero | R, con castello / caserma selezionati |
| Reclutare arciere / mago | Q / E, con caserma selezionata |
| Punto di raduno | Clic destro con l’edificio selezionato, o pulsante dedicato e clic; dal castello, su una risorsa per la raccolta automatica |
| Annullare l’ultima unità in coda | Pulsante nell’edificio; rimborso completo |
| Avviare, fermare, riprendere o centrare il carro (livello 6) | Pulsanti sopra la minimappa |
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

I test verificano raccolta ed esaurimento, arrivi diagonali e raccolta prolungata, prenotazione della popolazione, code e rimborsi, ritirata, mantenimento posizione, attacchi a distanza, danni ad area, conquista e perdita dell’avamposto, ondate, assalto e riavvio. I test dei livelli successivi coprono inoltre conquista fra tre fazioni, depositi multipli, limite 24 con prenotazioni, attacchi fra rivali, ondate alternate, eliminazione dei fronti e passaggio fra livelli. Per l’assedio verificano anche bonus distinti delle torri, scudo dinamico, tiro della Guardia, contrattacchi annunciati, limite 28 e vittoria con un esercito preparato. Per la marca di ferro verificano scudo da quattro torri, Forgia, tenaglie, arieti corazzati, limite 30 e passaggio dal terzo livello; per la corona usurpata mappa e risorse, magazzini e basi avanzate, cavalieri, bastioni, Guardia reale e assalto con 36 unità; per gli aiuti al comando cura, avvisi, messaggi, raduno su risorse, gruppi e depositi. Per i livelli 6–7 coprono inoltre percorso e soste del convoglio, sostituzioni, popolazione, cavalieri contro la scorta, consegne, santuari contesi, progresso persistente, accelerazione del rituale e passaggio fra missioni. Usano una simulazione accelerata in una VM; le interazioni e il disegno richiedono anche una prova nel browser.

`rules.js` raccoglie costi, statistiche e le configurazioni `RTS_LEVELS` (mappe, popolazione, risorse iniziali, avamposti, fortezze e calendario delle ondate) per facilitare il bilanciamento. Il comportamento di ogni livello dipende dai suoi campi (`kind`, `waveIntro`/`waveOrder` con tenaglie, `minWaveInterval`, `shieldPerTower`, `counterattacks`, `ramFrom`, `buildings`, `forwardBuild`, `bastions`, `lastStand`, `convoy`, `control`…), quindi un nuovo livello si aggiunge soprattutto come configurazione. `game.js` gestisce simulazione, comandi e Canvas. La diagnostica `window.__rtsDebug.snapshot()` restituisce solo un riepilogo dello stato.

Il progetto resta single-player con sette mappe fisse, movimento diretto e IA a ondate. Ricerca dei percorsi intorno agli ostacoli, nebbia di guerra, salvataggi e multiplayer sono sviluppi futuri. Il bilanciamento può essere ulteriormente affinato con partite reali.

```text
terre-di-confine/
├── index.html
├── style.css
├── rules.js
├── game.js
├── tests/game.test.cjs
└── README.md
```
