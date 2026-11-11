/* Balance data shared by the game and its regression tests. No build step. */
(() => {
  'use strict';
  window.RTS_RULES = {
    costs: {
      barracks: { wood: 110, gold: 45 }, worker: { wood: 45, gold: 0 },
      soldier: { wood: 35, gold: 30 }, archer: { wood: 45, gold: 40 }, mage: { wood: 60, gold: 100 },
      depot: { wood: 80, gold: 0 }
    },
    units: {
      worker: { hp: 55, speed: 86, damage: 4, attackTime: 1.35, range: 22, trainTime: 5 },
      soldier: { hp: 125, speed: 95, damage: 16, attackTime: .86, range: 30, trainTime: 7 },
      archer: { hp: 65, speed: 90, damage: 12, attackTime: 1.25, range: 175, trainTime: 9 },
      mage: { hp: 58, speed: 76, damage: 30, attackTime: 3, range: 150, trainTime: 18, splash: 58 },
      raider: { hp: 90, speed: 86, damage: 10, attackTime: 1.16, range: 29 },
      // Siege engine: ignores units, batters buildings, armored against arrows.
      ram: { hp: 320, speed: 46, damage: 55, attackTime: 2.4, range: 34, arrowArmor: .5 },
      // Fast raiders that hunt workers and depots far from the castle.
      knight: { hp: 110, speed: 150, damage: 13, attackTime: 1, range: 28 },
      champion: { hp: 650, speed: 70, damage: 30, attackTime: 1.2, range: 32 }
    },
    // Player constructions; a level lists the ones it allows (default: barracks only).
    buildings: {
      barracks: { hp: 360, buildTime: 12 },
      depot: { hp: 300, buildTime: 8 }
    },
    // Structures that shoot arrows automatically at nearby opponents.
    defenses: {
      keep: { range: 235, cooldown: 1.5, damage: 10, enemyDamage: 14 },
      bastion: { range: 240, cooldown: 1.6, damage: 16, enemyDamage: 16 }
    },
    heal: { radius: 260, delay: 4, rate: 3 }, alertCooldown: 10,
    population: 18, queueLimit: 5, firstWave: 75, carryCapacity: 18,
    outpost: { x: 1200, y: 795, radius: 135, captureTime: 12, incomeTime: 8, gold: 8 },
    names: { worker: 'Contadino', soldier: 'Armigero', archer: 'Arciere', mage: 'Mago',
      raider: 'Predone', ram: 'Ariete', knight: 'Cavaliere', champion: 'Campione', depot: 'Magazzino', bastion: 'Bastione', keep: 'Castello', barracks: 'Caserma', outpost: 'Avamposto' }
  };
  // Each scenario owns its map and pacing; unit balance is shared.
  window.RTS_LEVELS = [
    {
      id: 1, name: 'Terre di Confine', kind: 'outpost', width: 2400, height: 1600, population: 18,
      firstWave: 75, waveCap: 9, enemyHp: 1400, minWaveInterval: 38, raidPattern: 'alternate',
      description: 'Conquista l’avamposto centrale, recluta maghi e distruggi la fortezza rossa. Popolazione: 18.',
      player: [450, 795], enemies: [{ team: 'enemy', name: 'Rossi', x: 2040, y: 795, post: 0 }],
      posts: [{ name: 'Avamposto del confine', x: 1200, y: 795, gold: 8 }],
      wood: [[790,425], [975,565], [710,1200], [1250,350], [1290,1090], [1480,1300], [1710,440], [2010,330], [2040,1240]],
      gold: [[850,925], [1120,1280], [1405,495], [1680,1100], [2170,1100]]
    },
    {
      id: 2, name: 'La frontiera contesa', kind: 'rivals', width: 3000, height: 2000, population: 24,
      firstWave: 75, waveCap: 10, enemyHp: 1200, minWaveInterval: 38,
      // Two red waves, then the fronts alternate (purple first).
      waveIntro: [0, 0], waveOrder: [1, 0],
      description: 'Due fortezze rivali, tre avamposti e popolazione 24. I Viola attaccano dalla terza ondata; i due avversari si combattono se si incontrano. Distruggi entrambe le fortezze per vincere.',
      player: [450, 1000],
      enemies: [{ team: 'enemy', name: 'Rossi', x: 2540, y: 560, post: 1 },
        { team: 'enemy2', name: 'Viola', x: 2540, y: 1450, post: 2 }],
      posts: [{ name: 'Avamposto di ponente', x: 1050, y: 1000, gold: 6 },
        { name: 'Avamposto del nord', x: 1750, y: 580, gold: 6 },
        { name: 'Avamposto del sud', x: 1750, y: 1430, gold: 6 }],
      wood: [[750,650], [780,1320], [1050,420], [1120,1570], [1330,750], [1340,1220],
        [1550,260], [1580,1770], [1960,330], [2030,920], [1990,1730], [2320,250],
        [2360,1770], [2800,850], [2800,1240]],
      gold: [[810,1060], [1300,480], [1300,1510], [1760,960], [2030,700], [2070,1290], [2780,370], [2780,1640]]
    },
    {
      id: 3, name: 'L’assedio delle tre torri', kind: 'siege', width: 3000, height: 2000, population: 28,
      firstWave: 75, waveCap: 10, enemyHp: 1800, campHp: 650, minWaveInterval: 42,
      shieldPerTower: .2, warningTime: 20, waveOrder: [1, 2, 0], factionName: 'Guarnigione', counterattacks: true,
      description: 'Conquista le torri: Mercato per oro e deposito, Arcana per i maghi, Guardia per il tiro difensivo. Ogni torre nemica protegge la cittadella del 20%. Elimina gli accampamenti per fermare i rinforzi e distruggi la cittadella. Popolazione: 28.',
      player: [450, 1000],
      enemies: [{ team: 'enemy', name: 'Cittadella', x: 2650, y: 1000, post: 0 },
        { team: 'enemy', type: 'camp', name: 'Campo nord', x: 2160, y: 460, post: 1 },
        { team: 'enemy', type: 'camp', name: 'Campo sud', x: 2150, y: 1580, post: 2 }],
      posts: [{ name: 'Torre del mercato', role: 'market', x: 1050, y: 1000, gold: 12, initialOwner: 'enemy',
          bonus: '12 oro ogni 8s e deposito risorse quando alleata e non contesa.' },
        { name: 'Torre arcana', role: 'arcane', x: 1600, y: 620, gold: 0, initialOwner: 'enemy',
          bonus: 'Sblocca i maghi finché alleata. I maghi già reclutati o in coda restano disponibili.' },
        { name: 'Torre di guardia', role: 'guard', x: 1680, y: 1400, gold: 0, initialOwner: 'enemy',
          damage: 12, range: 220, attackTime: 2,
          bonus: 'Freccia automatica: 12 danni ogni 2s, portata 220. Difende chi la controlla; tace se contesa.' }],
      wood: [[750,650], [750,1330], [1060,400], [1100,1580], [1320,810], [1340,1220],
        [1500,260], [1550,1780], [1880,350], [1970,930], [1920,1750], [2400,270],
        [2410,1760], [2800,630], [2810,1390], [1300,1850]],
      gold: [[810,1060], [1250,510], [1250,1510], [1760,940], [1850,700], [1920,1210],
        [2500,500], [2550,1570], [2800,1840]]
    },
    {
      id: 4, name: 'La marca di ferro', kind: 'siege', width: 3400, height: 2200, population: 30,
      firstWave: 65, waveCap: 12, enemyHp: 2200, campHp: 800, minWaveInterval: 36,
      start: { wood: 180, gold: 80 }, shieldPerTower: .15, warningTime: 20, counterattacks: true,
      // Every fourth wave is a pincer: both camps march at once.
      waveOrder: [1, 2, 0, [1, 2]], ramFrom: 5, factionName: 'Legione di ferro',
      extraGuards: [['raider', -150, 5], ['archer', -30, -75]],
      description: 'La Legione di ferro presidia quattro torri: ognuna protegge la fortezza del 15%. La Forgia dà +20% di danni a chi la controlla, e all’inizio è nemica. Ogni quarta ondata i due campi attaccano a tenaglia; dalla quinta la fortezza manda arieti contro i tuoi edifici. Meno oro, ondate più rapide. Popolazione: 30.',
      player: [450, 1100],
      enemies: [{ team: 'enemy', name: 'Fortezza di ferro', x: 3000, y: 1100, post: 3 },
        { team: 'enemy', type: 'camp', name: 'Campo nord', x: 2450, y: 420, post: 1 },
        { team: 'enemy', type: 'camp', name: 'Campo sud', x: 2450, y: 1780, post: 2 }],
      posts: [{ name: 'Torre del mercato', role: 'market', x: 1100, y: 1100, gold: 10, initialOwner: 'enemy',
          bonus: '10 oro ogni 8s e deposito risorse quando alleata e non contesa.' },
        { name: 'Torre arcana', role: 'arcane', x: 1800, y: 560, gold: 0, initialOwner: 'enemy',
          bonus: 'Sblocca i maghi finché alleata. I maghi già reclutati o in coda restano disponibili.' },
        { name: 'Torre di guardia', role: 'guard', x: 1800, y: 1640, gold: 0, initialOwner: 'enemy',
          damage: 12, range: 220, attackTime: 2,
          bonus: 'Freccia automatica: 12 danni ogni 2s, portata 220. Difende chi la controlla; tace se contesa.' },
        { name: 'Forgia', role: 'forge', x: 2350, y: 1100, gold: 0, initialOwner: 'enemy', damageBonus: .2,
          bonus: '+20% di danni a tutte le unità di chi la controlla, finché non è contesa.' }],
      wood: [[760,700], [760,1500], [1080,430], [1120,1780], [1380,860], [1400,1360],
        [1520,250], [1560,1960], [2000,380], [2050,960], [2000,1820], [2700,300],
        [2700,1900], [3200,650], [3200,1550], [1300,2050]],
      gold: [[850,1180], [1300,560], [1300,1640], [2050,1250], [2650,760], [2650,1450], [3250,2050]]
    },
    {
      id: 5, name: 'La corona usurpata', kind: 'siege', width: 4200, height: 2800, population: 36,
      firstWave: 65, waveCap: 14, enemyHp: 2600, campHp: 850, minWaveInterval: 34,
      start: { wood: 220, gold: 100 }, shieldPerTower: .15, warningTime: 20, counterattacks: true,
      // Cavalry twice per cycle, then a pincer of both camps.
      waveOrder: [3, 1, 2, 0, 3, [1, 2]], ramFrom: 5, factionName: 'Corona usurpata',
      buildings: ['barracks', 'depot'], forwardBuild: true,
      extraGuards: [['raider', -150, 5], ['archer', -30, -75], ['archer', -30, 90]],
      bastions: [[3350, 1150], [3350, 1650]],
      lastStand: { at: .5, guards: [['champion', -150, 0], ['raider', -120, -70], ['raider', -120, 70], ['raider', -60, -115], ['raider', -60, 115]] },
      description: 'Il regno è nelle mani dell’usurpatore. La sua cittadella è protetta da quattro torri, da due bastioni e, quando vacilla, dalla Guardia reale. Le Scuderie mandano cavalieri a razziare contadini e magazzini. Mappa vastissima: costruisci magazzini (M) e caserme vicino alle torri conquistate e sfrutta i giacimenti ricchi. Popolazione: 36.',
      player: [500, 1400],
      enemies: [{ team: 'enemy', name: 'Cittadella dell’usurpatore', x: 3800, y: 1400, post: 3 },
        { team: 'enemy', type: 'camp', name: 'Campo nord', x: 3000, y: 520, post: 1 },
        { team: 'enemy', type: 'camp', name: 'Campo sud', x: 3000, y: 2280, post: 2 },
        { team: 'enemy', type: 'camp', name: 'Scuderie', x: 3550, y: 330, post: 1, hp: 700, troops: 'knight', cap: 4 }],
      posts: [{ name: 'Torre del mercato', role: 'market', x: 1350, y: 1400, gold: 10, initialOwner: 'enemy',
          bonus: '10 oro ogni 8s e deposito risorse quando alleata e non contesa.' },
        { name: 'Torre arcana', role: 'arcane', x: 2100, y: 650, gold: 0, initialOwner: 'enemy',
          bonus: 'Sblocca i maghi finché alleata. I maghi già reclutati o in coda restano disponibili.' },
        { name: 'Torre di guardia', role: 'guard', x: 2100, y: 2150, gold: 0, initialOwner: 'enemy',
          damage: 12, range: 220, attackTime: 2,
          bonus: 'Freccia automatica: 12 danni ogni 2s, portata 220. Difende chi la controlla; tace se contesa.' },
        { name: 'Forgia', role: 'forge', x: 2950, y: 1400, gold: 0, initialOwner: 'enemy', damageBonus: .2,
          bonus: '+20% di danni a tutte le unità di chi la controlla, finché non è contesa.' },
        { name: 'Mulino', role: 'market', x: 1100, y: 2350, gold: 8, guide: 'Mulino (neutrale): oro e deposito',
          bonus: '8 oro ogni 8s e deposito risorse. Neutrale all’inizio: non protegge la cittadella.' }],
      // A third value marks a rich deposit with a larger stock.
      wood: [[850,750], [820,2050], [1250,420], [1050,1050], [1700,1000], [1650,1800],
        [1600,300], [1500,2650], [2050,1300], [2450,420], [2500,2600], [2350,1600],
        [2800,850], [2800,1950], [3200,180], [3400,2600], [3900,700], [3900,2100],
        [600,450], [600,2450], [1900,2450], [3150,800], [1400,2050], [900,2560,1000]],
      gold: [[900,1600], [1400,850], [1450,1950], [1850,1450], [2400,950], [2650,500],
        [2700,2350], [3600,800], [3600,2000], [1300,2560,900], [2350,2400,900], [2600,1750,900]]
    }
  ];
})();
