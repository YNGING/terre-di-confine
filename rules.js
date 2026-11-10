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
})();
