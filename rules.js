/* Balance data shared by the game and its regression tests. No build step. */
(() => {
  'use strict';
  window.RTS_RULES = {
    costs: {
      barracks: { wood: 110, gold: 45 }, worker: { wood: 45, gold: 0 },
      soldier: { wood: 35, gold: 30 }, archer: { wood: 45, gold: 40 }, mage: { wood: 60, gold: 100 }
    },
    units: {
      worker: { hp: 55, speed: 86, damage: 4, attackTime: 1.35, range: 22, trainTime: 5 },
      soldier: { hp: 125, speed: 95, damage: 16, attackTime: .86, range: 30, trainTime: 7 },
      archer: { hp: 65, speed: 90, damage: 12, attackTime: 1.25, range: 175, trainTime: 9 },
      mage: { hp: 58, speed: 76, damage: 30, attackTime: 3, range: 150, trainTime: 18, splash: 58 },
      raider: { hp: 90, speed: 86, damage: 10, attackTime: 1.16, range: 29 }
    },
    population: 18, queueLimit: 5, firstWave: 75, carryCapacity: 18,
    outpost: { x: 1200, y: 795, radius: 135, captureTime: 12, incomeTime: 8, gold: 8 },
    names: { worker: 'Contadino', soldier: 'Armigero', archer: 'Arciere', mage: 'Mago',
      raider: 'Predone', keep: 'Castello', barracks: 'Caserma', outpost: 'Avamposto' }
  };
  // Each scenario owns its map and pacing; unit balance is shared.
  window.RTS_LEVELS = [
    {
      id: 1, name: 'Terre di Confine', width: 2400, height: 1600, population: 18,
      firstWave: 75, waveCap: 9, enemyHp: 1400,
      description: 'Conquista l’avamposto centrale, recluta maghi e distruggi la fortezza rossa. Popolazione: 18.',
      player: [450, 795], enemies: [{ team: 'enemy', name: 'Rossi', x: 2040, y: 795, post: 0 }],
      posts: [{ name: 'Avamposto del confine', x: 1200, y: 795, gold: 8 }],
      wood: [[790,425], [975,565], [710,1200], [1250,350], [1290,1090], [1480,1300], [1710,440], [2010,330], [2040,1240]],
      gold: [[850,925], [1120,1280], [1405,495], [1680,1100], [2170,1100]]
    },
    {
      id: 2, name: 'La frontiera contesa', width: 3000, height: 2000, population: 24,
      firstWave: 75, waveCap: 10, enemyHp: 1200,
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
    }
  ];
})();
