/* Run with node --test tests/game.test.cjs. No npm packages or browser required.
 * The VM exposes internals only inside this test harness; production stays read-only.
 * These tests exercise simulation outcomes. Browser/input/rendering need a separate smoke test.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function game(level = 1) {
  const elements = new Map();
  const context = new Proxy({}, { get: (o, k) => o[k] || (() => {}), set: (o, k, v) => (o[k] = v, true) });
  function element() {
    return { textContent: '', innerHTML: '', dataset: {}, style: {},
      classList: { add() {}, remove() {} }, addEventListener() {}, focus() {},
      getContext: () => context, querySelectorAll: () => [], content: { querySelectorAll: () => [] } };
  }
  const sandbox = { console, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener() {}, requestAnimationFrame() {},
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      createElement: element, addEventListener() {} } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const root = path.join(__dirname, '..');
  vm.runInContext(fs.readFileSync(path.join(root, 'rules.js'), 'utf8'), sandbox);
  const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
  const anchor = '  // Expose a tiny read-only diagnostic surface for automated smoke tests.';
  assert.ok(source.includes(anchor), 'test injection anchor exists');
  vm.runInContext(source.replace(anchor,
    '  globalThis.testGame = {state, createUnit, createBuilding, resetWorld, keep, select, recruit, cancelTraining, reservedPopulation, orderUnits, update, updateWorker, updateFighter, updateOutpost, updateTraining, performAttack, damage, startWave, depositCargo, dispatchCommand, startGame, restart, finish, validBuild, citadelShield, updateTowerDefenses, planWave, frontHome, waveFront, waveFronts, forgeMultiplier, updateRam, saveGroup, recallGroup, selectSameType, nearestDepot, updateDefenses, beginBuild, placeBuilding, cancelBuild, updateTowerDefenses, updateMissions, convoyAction, activeCart, controlRate, heldSanctuaries, selectArmy, playerUnits, updateHud, startSurvivalWave, updateSurvivalClock, updateSurvival, waveEnemies, livingVillages, focusVillage, focusSurvivalEnemy};\n' + anchor), sandbox);
  const g = sandbox.testGame; g.resetWorld(level); g.state.running = true; g.elements = elements;
  g.step = (seconds, fn = g.update) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) fn(1 / 60); };
  return g;
}

test('starting soldiers cannot bypass the economy and destroy the fortress', () => {
  const g = game();
  const soldiers = g.state.units.filter(u => u.type === 'soldier');
  soldiers.forEach(u => u.order = { type: 'attack', targetId: g.keep('enemy').id });
  g.step(75);
  assert.ok(g.keep('enemy').hp > 0);
  assert.ok(soldiers.every(u => u.hp === 0));
});

test('last resource load is delivered, then gathering continues at the next matching node', () => {
  const g = game(), s = g.state, worker = s.units.find(u => u.type === 'worker');
  const node = s.nodes[0], next = s.nodes[1]; node.stock = 18;
  worker.x = node.x; worker.y = node.y;
  worker.order = { type: 'harvest', nodeId: node.id, resource: 'wood' };
  g.step(2.4, dt => g.updateWorker(worker, dt));
  assert.equal(node.stock, 0); assert.equal(worker.carry, 18);
  // Leave only one alternative to make its assignment observable.
  s.nodes.filter(n => n.type === 'wood' && n !== next).forEach(n => n.stock = 0);
  for (let i = 0; i < 2000 && worker.carry; i++) g.updateWorker(worker, 1 / 60);
  assert.equal(worker.carry, 0); assert.equal(s.wood, 218);
  g.updateWorker(worker, 1 / 60); assert.equal(worker.order.nodeId, next.id);
  next.stock = 0; g.updateWorker(worker, 1 / 60); assert.equal(worker.order, null);
});

test('all buildings reserve population before accepting concurrent recruitment', () => {
  const g = game(), s = g.state;
  for (let i = 0; i < 12; i++) g.createUnit('worker', 'player', 300, 1000);
  const b = g.createBuilding('barracks', 'player', 700, 800);
  g.select(b); g.recruit('soldier');
  const wood = s.wood;
  g.select(g.keep('player')); g.recruit('worker');
  assert.equal(g.reservedPopulation(), 1); assert.equal(s.wood, wood);
  g.step(8, g.updateTraining);
  assert.equal(s.units.filter(u => u.team === 'player').length, 18);
  assert.equal(g.reservedPopulation(), 0);
});

test('several workers keep gathering after diagonal arrivals and separation nudges', () => {
  const g = game(), s = g.state;
  const workers = s.units.filter(u => u.type === 'worker');
  workers.forEach(u => { g.select(u); g.orderUnits(975, 565); });
  // No hostile interference: this specifically checks sustained movement/harvesting.
  s.units = s.units.filter(u => u.team === 'player'); s.waveIn = 1000;
  g.step(60); const first = s.stats.gathered;
  g.step(60); assert.ok(s.stats.gathered > first + 54);
  assert.ok(workers.every(u => u.order?.type === 'harvest'));
});

test('queues preserve order, honor rally points, cap at five and refund cancellations', () => {
  const g = game(), s = g.state; s.wood = s.gold = 1000;
  const b = g.createBuilding('barracks', 'player', 700, 800); g.select(b);
  g.orderUnits(950, 1000); g.recruit('archer'); g.recruit('soldier');
  const funds = [s.wood, s.gold]; g.cancelTraining();
  assert.equal(s.wood, funds[0] + 35); assert.equal(s.gold, funds[1] + 30);
  g.step(9.1, g.updateTraining);
  const archer = s.units.find(u => u.team === 'player' && u.type === 'archer');
  assert.ok(archer); assert.equal(archer.order.type, 'attack-move'); assert.equal(archer.order.x, 950);
  for (let i = 0; i < 6; i++) g.recruit('soldier');
  assert.equal(b.queue.length, 5); assert.equal(g.reservedPopulation(), 5);
  g.damage(b, b.hp); assert.equal(g.reservedPopulation(), 0);
});

test('movement permits retreat; hold attacks in range without chasing; focus fire is respected', () => {
  const g = game(), s = g.state, soldier = s.units.find(u => u.type === 'soldier');
  const enemy = g.createUnit('raider', 'enemy', soldier.x + 50, soldier.y), x = soldier.x;
  soldier.order = { type: 'move', x: x - 200, y: soldier.y };
  g.updateFighter(soldier, 1 / 60); assert.ok(soldier.x < x); assert.equal(enemy.hp, enemy.maxHp);
  soldier.order = { type: 'hold', x: soldier.x, y: soldier.y };
  const holdX = soldier.x; g.updateFighter(soldier, 1); assert.equal(soldier.x, holdX);
  enemy.x = soldier.x + 25; g.updateFighter(soldier, 1 / 60); assert.ok(enemy.hp < enemy.maxHp);
  const target = g.createUnit('raider', 'enemy', soldier.x - 25, soldier.y);
  soldier.cooldown = 0; soldier.order = { type: 'attack', targetId: target.id };
  const oldHp = enemy.hp; g.updateFighter(soldier, 1 / 60);
  assert.equal(enemy.hp, oldHp); assert.ok(target.hp < target.maxHp);
});

test('archers attack at range; mage splash affects nearby enemies only and obeys cooldown', () => {
  const g = game();
  const archer = g.createUnit('archer', 'player', 1000, 400);
  const target = g.createUnit('raider', 'enemy', 1150, 400);
  g.performAttack(archer, target, 1 / 60);
  assert.equal(archer.x, 1000); assert.equal(target.hp, target.maxHp - 12);
  const mage = g.createUnit('mage', 'player', 1000, 600);
  const victim = g.createUnit('raider', 'enemy', 1100, 600);
  const splash = g.createUnit('raider', 'enemy', 1120, 600);
  const far = g.createUnit('raider', 'enemy', 1200, 600);
  const friendly = g.createUnit('soldier', 'player', 1110, 600);
  g.performAttack(mage, victim, 1 / 60);
  assert.equal(victim.hp, victim.maxHp - 30); assert.equal(splash.hp, splash.maxHp - 18);
  assert.equal(far.hp, far.maxHp); assert.equal(friendly.hp, friendly.maxHp);
  g.performAttack(mage, victim, 1 / 60); assert.equal(victim.hp, victim.maxHp - 30);
  const b = g.createBuilding('barracks', 'enemy', 1100, 600); mage.cooldown = 0;
  g.performAttack(mage, b, 1 / 60); assert.equal(b.hp, b.maxHp - 10.5);
});

test('military capture unlocks magi; contest pauses control/income; losing control locks new recruitment', () => {
  const g = game(), s = g.state, p = s.outpost; s.wood = s.gold = 1000;
  const b = g.createBuilding('barracks', 'player', 700, 800); g.select(b); g.recruit('mage');
  assert.equal(b.queue.length, 0);
  const worker = g.createUnit('worker', 'player', p.x, p.y);
  g.step(13, g.updateOutpost); assert.equal(p.owner, 'neutral');
  const soldier = g.createUnit('soldier', 'player', p.x, p.y);
  g.step(12.1, g.updateOutpost); assert.equal(p.owner, 'player');
  g.recruit('mage'); assert.equal(b.queue.length, 1);
  const gold = s.gold; g.step(8, g.updateOutpost); assert.equal(s.gold, gold + 8);
  const enemy = g.createUnit('raider', 'enemy', p.x + 100, p.y);
  const control = p.control, contestedGold = s.gold;
  g.step(15, g.updateOutpost); assert.equal(p.control, control); assert.equal(s.gold, contestedGold);
  soldier.x = 500; worker.x = 500;
  g.step(24.2, g.updateOutpost); assert.equal(p.owner, 'enemy');
  g.recruit('mage'); assert.equal(b.queue.length, 1);
  g.step(18.1, g.updateTraining); assert.ok(s.units.some(u => u.team === 'player' && u.type === 'mage'));
  assert.ok(enemy.hp > 0);
});

test('cargo can use a controlled outpost and falls back to the castle when it is lost', () => {
  const g = game(), p = g.state.outpost, u = g.createUnit('worker', 'player', p.x, p.y);
  p.owner = 'player'; u.carry = 18; u.carryType = 'gold';
  assert.equal(g.depositCargo(u, 1 / 60), true); assert.equal(g.state.gold, 128);
  u.carry = 18; u.carryType = 'wood'; p.owner = 'enemy';
  const x = u.x; assert.equal(g.depositCargo(u, 1 / 60), false); assert.ok(u.x < x); assert.equal(u.carry, 18);
});

test('later waves mix unit roles and alternate pressure on the outpost', () => {
  const g = game(); g.state.wave = 6; g.startWave();
  const raid = g.state.units.filter(u => u.order?.type === 'raid');
  assert.ok(raid.some(u => u.type === 'mage')); assert.ok(raid.some(u => u.type === 'archer'));
  assert.ok(raid.every(u => u.order.viaOutpost));
});

test('an army within the population cap can win a prepared assault', () => {
  const g = game(), s = g.state;
  s.units = s.units.filter(u => u.team !== 'player' || u.type === 'worker');
  for (const [type, count] of [['soldier', 8], ['archer', 4], ['mage', 2]]) {
    for (let i = 0; i < count; i++) g.createUnit(type, 'player', 1500 - (type === 'soldier' ? 0 : 120), 680 + i * 32,
      { type: 'attack-move', x: 2040, y: 795 });
  }
  assert.equal(s.units.filter(u => u.team === 'player').length, 17);
  g.step(180); assert.equal(g.keep('enemy').hp, 0); assert.equal(s.ended, true);
});

test('terminal results freeze simulation and restart clears orders, queues and transient state', () => {
  const g = game(), s = g.state;
  s.mode = 'attack-move'; s.keys.add('w'); s.effects.push({ life: 1 });
  g.select(g.keep('player')); g.recruit('worker');
  g.damage(g.keep('player'), 10000); const time = s.time;
  g.step(2); assert.equal(s.time, time); assert.equal(s.running, false);
  g.resetWorld(); assert.equal(s.ended, false); assert.equal(s.mode, 'select');
  assert.equal(g.reservedPopulation(), 0); assert.equal(s.keys.size, 0); assert.equal(s.effects.length, 0);
  assert.equal(s.outpost.owner, 'neutral'); assert.equal(s.popCap, 18);
});


test('level two has a larger map, independent rivals and more resources; switching restores level one', () => {
  const g = game(2), s = g.state;
  assert.equal(s.popCap, 24); assert.equal(s.outposts.length, 3);
  assert.equal(s.nodes.filter(n => n.type === 'wood').length, 15);
  assert.equal(s.nodes.filter(n => n.type === 'gold').length, 8);
  assert.ok(g.keep('enemy')); assert.ok(g.keep('enemy2'));
  assert.equal(s.wood, 200); assert.equal(s.gold, 110); assert.equal(s.waveIn, 75);
  assert.equal(s.units.filter(u => u.team === 'player').length, 5);
  g.resetWorld(1);
  assert.equal(s.popCap, 18); assert.equal(s.outposts.length, 1);
  assert.equal(s.nodes.length, 14); assert.equal(g.keep('enemy2'), undefined);
  assert.equal(g.keep('enemy').hp, 1400);
});

test('any owned post unlocks magi, contest is local, and rival-to-rival capture neutralizes first', () => {
  const g = game(2), s = g.state, [west, north, south] = s.outposts;
  s.wood = s.gold = 1000;
  const b = g.createBuilding('barracks', 'player', 700, 1000);
  const northSoldier = g.createUnit('soldier', 'player', north.x, north.y);
  g.createUnit('soldier', 'player', south.x, south.y);
  g.step(12.1, g.updateOutpost);
  assert.equal(west.owner, 'neutral'); assert.equal(north.owner, 'player'); assert.equal(south.owner, 'player');
  g.select(b); g.recruit('mage'); assert.equal(b.queue.length, 1);
  const gold = s.gold; g.step(8.1, g.updateOutpost); assert.equal(s.gold, gold + 12);
  const red = g.createUnit('raider', 'enemy', north.x, north.y);
  const beforeContest = s.gold; g.step(8, g.updateOutpost);
  assert.equal(north.contested, true); assert.equal(south.contested, false); assert.equal(s.gold, beforeContest + 6);
  northSoldier.x = 100; g.step(24.2, g.updateOutpost); assert.equal(north.owner, 'enemy');
  const purple = g.createUnit('raider', 'enemy2', north.x, north.y);
  const control = north.control; g.step(2, g.updateOutpost);
  assert.equal(north.contested, true); assert.equal(north.control, control);
  red.x = 100; g.step(12.05, g.updateOutpost); assert.equal(north.owner, 'neutral');
  g.step(12.1, g.updateOutpost); assert.equal(north.owner, 'enemy2');
  g.recruit('mage'); assert.equal(b.queue.length, 2, 'south still unlocks magi');
  south.owner = 'neutral'; g.recruit('mage'); assert.equal(b.queue.length, 2);
  assert.ok(purple.hp > 0);
});

test('workers use the nearest safe post and reroute when it is contested', () => {
  const g = game(2), [west, north] = g.state.outposts;
  west.owner = north.owner = 'player';
  const worker = g.createUnit('worker', 'player', north.x, north.y);
  worker.carry = 18; worker.carryType = 'gold';
  assert.equal(g.depositCargo(worker, 1 / 60), true); assert.equal(g.state.gold, 128);
  north.contested = true; worker.carry = 18; worker.carryType = 'wood';
  const oldX = worker.x;
  assert.equal(g.depositCargo(worker, 1 / 60), false); assert.ok(worker.x < oldX);
  for (let i = 0; i < 1800 && worker.carry; i++) g.depositCargo(worker, 1 / 60);
  assert.equal(worker.carry, 0); assert.equal(g.state.wood, 218);
  assert.ok(Math.hypot(worker.x-west.x, worker.y-west.y) < 53);
});

test('rivals arrive on one shared wave clock and destroyed fronts stop spawning', () => {
  const g = game(2), s = g.state;
  g.startWave(); g.startWave();
  assert.ok(s.units.filter(u => u.order?.type === 'raid').every(u => u.team === 'enemy'));
  g.startWave();
  const purple = s.units.filter(u => u.order?.type === 'raid' && u.team === 'enemy2');
  assert.equal(purple.length, 4); assert.ok(purple.every(u => u.order.postId === s.outposts[2].id));
  g.damage(g.keep('enemy'), 10000); assert.equal(s.ended, false);
  const count = s.units.length; g.startWave();
  assert.equal(s.units.length, count); assert.equal(s.wave, 5); assert.ok(s.waveIn > 0);
  g.startWave(); assert.equal(s.units.length, count + 6);
  g.damage(g.keep('enemy2'), 10000); assert.equal(s.ended, true); assert.equal(s.nextLevel, true);
});

test('the player can focus the purple rival; rivals fight each other including splash damage', () => {
  const g = game(2), s = g.state;
  const soldier = s.units.find(u => u.team === 'player' && u.type === 'soldier');
  g.select(soldier); const purpleKeep = g.keep('enemy2'); g.orderUnits(purpleKeep.x, purpleKeep.y);
  assert.equal(soldier.order.type, 'attack'); assert.equal(soldier.order.targetId, purpleKeep.id);
  const red = g.createUnit('mage', 'enemy', 1300, 1000);
  const purple = g.createUnit('raider', 'enemy2', 1400, 1000);
  const ally = g.createUnit('raider', 'enemy', 1410, 1000);
  g.updateFighter(red, 1 / 60);
  assert.equal(purple.hp, purple.maxHp - 30); assert.equal(ally.hp, ally.maxHp);
});

test('population 24 includes reservations across buildings and cannot be exceeded', () => {
  const g = game(2), s = g.state; s.wood = s.gold = 10000;
  for (let i = 0; i < 18; i++) g.createUnit('worker', 'player', 350, 1000);
  const b = g.createBuilding('barracks', 'player', 700, 1000);
  g.select(b); g.recruit('archer');
  g.select(g.keep('player')); g.recruit('worker');
  assert.equal(g.reservedPopulation(), 1);
  g.step(10, g.updateTraining);
  assert.equal(s.units.filter(u => u.team === 'player').length, 24);
});

test('campaign advances after level-one victory; defeat and restart retain the selected level', () => {
  const g = game();
  g.damage(g.keep('enemy'), 10000); assert.equal(g.state.nextLevel, true);
  g.startGame(); assert.equal(g.state.popCap, 24); assert.equal(g.state.running, true);
  g.damage(g.keep('player'), 10000); assert.equal(g.state.nextLevel, false);
  g.startGame(); assert.equal(g.state.popCap, 24); assert.equal(g.state.time, 0);
  g.state.outposts[2].owner = 'player'; g.state.wave = 9;
  g.restart(); assert.equal(g.state.popCap, 24); assert.equal(g.state.running, false);
  assert.equal(g.state.wave, 1); assert.ok(g.state.outposts.every(p => p.owner === 'neutral'));
  g.restart(1); assert.equal(g.state.popCap, 18);
});

test('a prepared level-two army can destroy both fortresses without exceeding the cap', () => {
  const g = game(2), s = g.state;
  s.units = s.units.filter(u => u.team !== 'player' || u.type === 'worker');
  for (const [type, count] of [['soldier', 12], ['archer', 6], ['mage', 3]]) {
    for (let i = 0; i < count; i++) g.createUnit(type, 'player', 2100 - (type === 'soldier' ? 0 : 120), 440 + i * 28,
      { type: 'attack-move', x: 2540, y: 560 });
  }
  assert.equal(s.units.filter(u => u.team === 'player').length, 24);
  g.step(65); assert.equal(g.keep('enemy').hp, 0); assert.equal(s.ended, false);
  for (const u of s.units.filter(u => u.team === 'player' && u.type !== 'worker')) {
    u.order = { type: 'attack-move', x: 2540, y: 1450 };
  }
  g.step(120); assert.equal(g.keep('enemy2').hp, 0); assert.equal(s.ended, true);
});

test('the defeat count credits player attacks, not fighting between rivals', () => {
  const g = game(2), s = g.state;
  const red = g.createUnit('raider', 'enemy', 1300, 500);
  const purple = g.createUnit('raider', 'enemy2', 1310, 500);
  purple.hp = 1; g.performAttack(red, purple, 1 / 60);
  assert.equal(s.stats.killed, 0);
  const soldier = g.createUnit('soldier', 'player', 1310, 500);
  red.hp = 1; g.performAttack(soldier, red, 1 / 60);
  assert.equal(s.stats.killed, 1);
});

test('siege starts with three enemy towers, two camps and a protected citadel', () => {
  const g = game(3), s = g.state;
  assert.equal(s.popCap, 28); assert.equal(s.wood, 200); assert.equal(s.gold, 110);
  assert.equal(s.buildings.filter(b => b.type === 'camp').length, 2);
  assert.equal(s.buildings.filter(b => b.type === 'keep' && b.team === 'enemy').length, 1);
  assert.ok(s.outposts.every(p => p.owner === 'enemy' && p.control === -1));
  assert.ok(Math.abs(g.citadelShield() - .6) < 1e-9);
  assert.equal(g.keep('enemy').hp, 1800);
  assert.equal(s.nodes.filter(n => n.type === 'wood').length, 16);
  assert.equal(s.nodes.filter(n => n.type === 'gold').length, 9);
});

test('each hostile tower protects the citadel, never camps or the player castle', () => {
  const g = game(3), s = g.state, citadel = g.keep('enemy');
  const hit = expected => { const hp = citadel.hp; g.damage(citadel, 100, 'player'); assert.ok(Math.abs(hp - citadel.hp - expected) < 1e-8); };
  hit(40);
  s.outposts[0].contested = true; hit(40); // Enemy ownership persists during a contest.
  s.outposts[0].owner = 'neutral'; hit(60);
  s.outposts[1].owner = 'player'; hit(80);
  s.outposts[2].owner = 'player'; hit(100);
  s.outposts[0].owner = 'enemy'; hit(80);
  const camp = s.buildings.find(b => b.type === 'camp'), home = g.keep('player');
  const hp = camp.hp; g.damage(camp, 100, 'player'); assert.equal(camp.hp, hp - 100);
  g.damage(home, 100, 'enemy'); assert.equal(home.hp, 900);
});

test('neutralizing a siege tower removes its shield before the full capture finishes', () => {
  const g = game(3), p = g.state.outposts[0];
  g.createUnit('soldier', 'player', p.x, p.y);
  g.step(12.1, g.updateOutpost); assert.equal(p.owner, 'neutral');
  assert.ok(Math.abs(g.citadelShield() - .4) < 1e-8);
  g.step(12.1, g.updateOutpost); assert.equal(p.owner, 'player');
});

test('tower bonuses are distinct: only market deposits and income, only arcane magi', () => {
  const g = game(3), s = g.state, [market, arcane, guard] = s.outposts;
  const b = g.createBuilding('barracks', 'player', 650, 1000); s.wood = s.gold = 1000;
  market.owner = guard.owner = 'player';
  g.select(b); g.recruit('mage'); assert.equal(b.queue.length, 0);
  arcane.owner = 'player'; g.recruit('mage'); assert.equal(b.queue.length, 1);
  const gold = s.gold; g.step(8.1, g.updateOutpost); assert.equal(s.gold, gold + 12);
  market.contested = true;
  const worker = g.createUnit('worker', 'player', arcane.x, arcane.y);
  worker.carry = 18; worker.carryType = 'gold';
  assert.equal(g.depositCargo(worker, 1 / 60), false); assert.equal(worker.carry, 18);
  market.contested = false; worker.x = market.x; worker.y = market.y;
  assert.equal(g.depositCargo(worker, 1 / 60), true);
  arcane.owner = 'enemy'; g.recruit('mage'); assert.equal(b.queue.length, 1);
  g.step(18.1, g.updateTraining); assert.ok(s.units.some(u => u.type === 'mage' && u.team === 'player'));
});

test('guard tower targets opponents only, obeys cooldown and stops when contested or neutral', () => {
  const g = game(3), p = g.state.outposts[2];
  const player = g.createUnit('soldier', 'player', p.x + 180, p.y);
  const enemy = g.createUnit('raider', 'enemy', p.x - 180, p.y);
  g.updateTowerDefenses(.1); assert.equal(player.hp, player.maxHp - 12); assert.equal(enemy.hp, enemy.maxHp);
  g.updateTowerDefenses(.1); assert.equal(player.hp, player.maxHp - 12);
  p.contested = true; g.updateTowerDefenses(3); assert.equal(player.hp, player.maxHp - 12);
  p.contested = false; p.owner = 'neutral'; g.updateTowerDefenses(3); assert.equal(player.hp, player.maxHp - 12);
  p.owner = 'player'; g.updateTowerDefenses(.1); assert.equal(enemy.hp, enemy.maxHp - 12);
  assert.equal(player.hp, player.maxHp - 12);
  // Presence is recalculated before the tower fires, even with zero cooldown.
  player.x = enemy.x = p.x; p.cooldown = 0;
  g.updateOutpost(.1); g.updateTowerDefenses(.1);
  assert.equal(p.contested, true); assert.equal(enemy.hp, enemy.maxHp - 12);
});

test('camps have separate wave slots, small reinforcements, and stop permanently on destruction', () => {
  const g = game(3), s = g.state, camps = s.buildings.filter(b => b.type === 'camp');
  g.startWave(); assert.equal(s.units.filter(u => u.order?.sourceId === camps[0].id).length, 2);
  g.startWave(); assert.equal(s.units.filter(u => u.order?.sourceId === camps[1].id).length, 3);
  g.startWave(); assert.equal(s.units.filter(u => u.order?.sourceId === g.keep('enemy').id).length, 4);
  g.damage(camps[0], 10000, 'player'); assert.equal(s.ended, false);
  let count = s.units.length; g.startWave(); assert.equal(s.units.length, count);
  s.wave = 20; count = s.units.length; g.startWave(); assert.equal(s.units.length, count + 5);
  g.damage(camps[1], 10000, 'player'); s.wave = 23;
  count = s.units.length; g.startWave(); assert.equal(s.units.length, count);
  assert.equal(s.ended, false); assert.ok(g.keep('enemy').hp > 0);
});

test('counterattack announces and retains its target, replacing a normal wave; pause freezes it', () => {
  const g = game(3), s = g.state, p = s.outposts[0];
  p.owner = 'player'; p.control = 1; s.wave = 3; s.waveIn = 20.01;
  g.step(.04); assert.equal(s.wavePlan.counter, true); assert.equal(s.wavePlan.postId, p.id);
  assert.match(g.elements.get('waveNotice').textContent, /Torre del mercato/);
  s.outposts[1].owner = 'player'; // A later capture must not silently change the announced target.
  s.running = false; const remaining = s.waveIn; g.step(10); assert.equal(s.waveIn, remaining);
  s.running = true; const count = s.units.length; g.step(20);
  assert.equal(s.wave, 4); assert.equal(s.units.length, count + 4);
  const raid = s.units.filter(u => u.order?.type === 'raid');
  assert.ok(raid.every(u => u.order.postId === p.id && u.order.viaOutpost));
  assert.equal(s.wavePlan, null);
  g.resetWorld(3); assert.equal(s.wavePlan, null); assert.equal(s.wave, 1);
});

test('a counterattack can recapture a tower and restore the citadel protection', () => {
  const g = game(3), s = g.state, p = s.outposts[0];
  p.owner = 'player'; p.control = 1;
  g.createUnit('raider', 'enemy', p.x, p.y);
  g.step(24.2, g.updateOutpost);
  assert.equal(p.owner, 'enemy'); assert.ok(Math.abs(g.citadelShield() - .6) < 1e-8);
});

test('siege reserves population up to 28 across buildings', () => {
  const g = game(3), s = g.state; s.wood = s.gold = 10000;
  for (let i = 0; i < 22; i++) g.createUnit('worker', 'player', 350, 1000);
  const b = g.createBuilding('barracks', 'player', 650, 1000);
  g.select(b); g.recruit('soldier'); g.select(g.keep('player')); g.recruit('worker');
  assert.equal(g.reservedPopulation(), 1); g.step(8, g.updateTraining);
  assert.equal(s.units.filter(u => u.team === 'player').length, 28);
});

test('level two advances to the siege; destroying the citadel wins even with camps standing', () => {
  const g = game(2), s = g.state;
  g.damage(g.keep('enemy'), 10000); g.damage(g.keep('enemy2'), 10000);
  assert.equal(s.nextLevel, true); g.startGame(); assert.equal(s.popCap, 28);
  g.damage(g.keep('enemy'), 10000, 'player'); assert.equal(s.ended, true); assert.equal(s.nextLevel, true);
  assert.equal(s.buildings.filter(b => b.type === 'camp' && b.hp > 0).length, 2);
  assert.match(g.elements.get('modalSubtitle').textContent, /cittadella/);
  g.restart(3); g.startGame(); assert.equal(s.popCap, 28); assert.equal(g.keep('enemy').hp, 1800);
  g.damage(g.keep('player'), 10000); assert.equal(s.ended, true); assert.equal(s.nextLevel, false);
  g.restart(1); assert.equal(s.popCap, 18); assert.equal(s.buildings.some(b => b.type === 'camp'), false);
  assert.equal(g.citadelShield(), 0); assert.equal(s.outposts[0].owner, 'neutral');
});

test('starting soldiers cannot rush the shielded citadel', () => {
  const g = game(3), s = g.state;
  const soldiers = s.units.filter(u => u.type === 'soldier' && u.team === 'player');
  soldiers.forEach(u => u.order = { type: 'attack', targetId: g.keep('enemy').id });
  g.step(100);
  assert.ok(g.keep('enemy').hp > 0); assert.ok(soldiers.every(u => u.hp === 0));
});

test('a prepared army within 28 population can win after capturing the towers', () => {
  const g = game(3), s = g.state;
  s.outposts.forEach(p => { p.owner = 'player'; p.control = 1; });
  s.units = s.units.filter(u => u.team !== 'player' || u.type === 'worker');
  for (const [type, count] of [['soldier', 15], ['archer', 7], ['mage', 3]]) {
    for (let i = 0; i < count; i++) g.createUnit(type, 'player', 2220 - (type === 'soldier' ? 0 : 120), 840 + i * 25,
      { type: 'attack-move', x: 2650, y: 1000 });
  }
  assert.equal(s.units.filter(u => u.team === 'player').length, 28);
  g.step(100); assert.equal(g.keep('enemy').hp, 0); assert.equal(s.ended, true);
  assert.equal(s.nextLevel, true);
});

test('capturing after the announcement window cannot create an unannounced counterattack', () => {
  const g = game(3), s = g.state;
  s.wave = 3; s.waveIn = 20; g.update(.02);
  assert.equal(s.wavePlan.counter, false);
  s.outposts[1].owner = 'player'; s.outposts[1].control = 1;
  const planned = s.wavePlan.postId; g.step(20);
  assert.equal(s.wave, 4);
  assert.ok(s.units.filter(u => u.order?.type === 'raid').every(u => u.order.postId === planned));
});

test('level four: four hostile towers, 60% shield, two camps, population 30 and a leaner start', () => {
  const g = game(4), s = g.state;
  assert.equal(s.popCap, 30); assert.equal(s.wood, 180); assert.equal(s.gold, 80);
  assert.equal(s.outposts.length, 4); assert.ok(s.outposts.every(p => p.owner === 'enemy'));
  assert.ok(Math.abs(g.citadelShield() - .6) < 1e-8);
  assert.equal(s.buildings.filter(b => b.type === 'camp').length, 2); assert.equal(g.keep('enemy').hp, 2200);
  assert.equal(s.nodes.filter(n => n.type === 'gold').length, 7);
  s.outposts[3].owner = 'neutral';
  assert.ok(Math.abs(g.citadelShield() - .45) < 1e-8);
  g.damage(g.keep('enemy'), 100, 'player'); assert.ok(Math.abs(g.keep('enemy').hp - 2145) < 1e-8);
});

test('level three victory leads to level four, and level four to level five', () => {
  const g = game(3), s = g.state;
  g.damage(g.keep('enemy'), 10000, 'player'); assert.equal(s.nextLevel, true);
  g.startGame(); assert.equal(s.popCap, 30); assert.equal(s.running, true);
  g.damage(g.keep('enemy'), 10000, 'player'); assert.equal(s.ended, true); assert.equal(s.nextLevel, true);
  assert.match(g.elements.get('modalSubtitle').textContent, /fortezza di ferro/);
  g.startGame(); assert.equal(s.popCap, 36);
});

test('the forge boosts whoever holds it, pauses when contested and changes hands on capture', () => {
  const g = game(4), s = g.state, forge = s.outposts.find(p => p.role === 'forge');
  assert.ok(Math.abs(g.forgeMultiplier('enemy') - 1.2) < 1e-8); assert.equal(g.forgeMultiplier('player'), 1);
  const raider = g.createUnit('raider', 'enemy', 300, 300), target = g.createUnit('soldier', 'player', 320, 300);
  g.performAttack(raider, target, 1 / 60); assert.ok(Math.abs(target.hp - (125 - 12)) < 1e-8);
  forge.contested = true; assert.equal(g.forgeMultiplier('enemy'), 1); forge.contested = false;
  // Clear the forge guards: a lone soldier neutralizes, then captures.
  const soldier = g.createUnit('soldier', 'player', forge.x, forge.y);
  s.units = s.units.filter(u => u === soldier || u.team === 'player');
  g.step(24.2, g.updateOutpost);
  assert.equal(forge.owner, 'player'); assert.ok(Math.abs(g.forgeMultiplier('player') - 1.2) < 1e-8);
  assert.equal(g.forgeMultiplier('enemy'), 1);
  const mage = g.createUnit('mage', 'player', 300, 300), foe = g.createUnit('raider', 'enemy', 320, 300), near = g.createUnit('raider', 'enemy', 330, 310);
  g.performAttack(mage, foe, 1 / 60);
  assert.ok(Math.abs(foe.hp - (90 - 36)) < 1e-8); assert.ok(Math.abs(near.hp - (90 - 18 * 1.2)) < 1e-8);
});

test('every fourth wave is a pincer from both camps; a destroyed camp leaves only its half empty', () => {
  const g = game(4), s = g.state;
  s.wave = 4; assert.equal(g.waveFronts().length, 2);
  let count = s.units.length; g.startWave();
  const camps = s.buildings.filter(b => b.type === 'camp');
  const raid = s.units.slice(count);
  assert.equal(raid.length, 10);
  for (const camp of camps) assert.equal(raid.filter(u => u.order.sourceId === camp.id).length, 5);
  assert.ok(raid.some(u => u.order.postId === s.outposts[1].id) && raid.some(u => u.order.postId === s.outposts[2].id));
  s.wave = 16; g.damage(camps[0], 10000, 'player'); count = s.units.length; g.startWave();
  assert.equal(s.units.length, count + 5);
  assert.ok(s.units.slice(count).every(u => u.order.sourceId === camps[1].id));
  assert.equal(s.waveIn, 36);
});

test('pincer waves are announced before they start', () => {
  const g = game(4), s = g.state;
  s.wave = 4; s.waveIn = 20.01; g.step(.04);
  assert.ok(s.wavePlan); assert.equal(s.wavePlan.counter, false);
  assert.match(g.elements.get('waveNotice').textContent, /Tenaglia: Campo nord \+ Campo sud/);
  assert.match(g.elements.get('waveText').textContent, /CAMPO NORD \+ CAMPO SUD/);
});

test('fortress waves bring a ram from wave five; rams ignore units and batter buildings', () => {
  const g = game(4), s = g.state;
  s.wave = 3; let count = s.units.length; g.startWave();
  assert.ok(!s.units.slice(count).some(u => u.type === 'ram'));
  s.wave = 7; count = s.units.length; g.startWave();
  const wave = s.units.slice(count);
  assert.equal(wave.length, 8); assert.equal(wave.filter(u => u.type === 'ram').length, 1);
  assert.equal(wave.filter(u => u.type === 'mage').length, 1);
  const ram = g.createUnit('ram', 'enemy', 1000, 1100), soldier = g.createUnit('soldier', 'player', 1010, 1100);
  const barracks = g.createBuilding('barracks', 'player', 1150, 1100);
  for (let i = 0; i < 600; i++) g.updateFighter(ram, 1 / 60), ram.cooldown = Math.max(0, ram.cooldown - 1 / 60);
  assert.equal(soldier.hp, 125); assert.ok(barracks.hp < 360);
});

test('rams halve arrow damage, cannot capture towers, and trigger a throttled alert', () => {
  const g = game(4), s = g.state;
  const ram = g.createUnit('ram', 'enemy', 300, 300), archer = g.createUnit('archer', 'player', 450, 300);
  g.performAttack(archer, ram, 1 / 60, true); assert.equal(ram.hp, 320 - 6);
  const soldier = g.createUnit('soldier', 'player', 320, 300);
  g.performAttack(soldier, ram, 1 / 60); assert.equal(ram.hp, 320 - 6 - 16);
  const home = g.keep('player'); ram.x = home.x + 60; ram.y = home.y; home.cooldown = 0;
  s.units = s.units.filter(u => u === ram); const before = ram.hp; g.updateDefenses(.01);
  assert.equal(ram.hp, before - 5);
  const market = s.outposts[0]; market.owner = 'player'; market.control = 1;
  s.units = [g.createUnit('ram', 'enemy', market.x, market.y)];
  g.step(30, g.updateOutpost); assert.equal(market.owner, 'player');
  // Alerts: one toast and minimap ping per kind every 10 seconds.
  s.time = 50; g.damage(home, 5, 'enemy'); g.damage(home, 5, 'enemy');
  assert.equal(s.pings.length, 1); assert.match(g.elements.get('toast').textContent, /castello è sotto attacco/);
  g.damage(home, 5, 'enemy2'); assert.equal(s.pings.length, 1);
  s.time = 61; g.damage(home, 5, 'enemy'); assert.equal(s.pings.length, 2);
  g.damage(home, 5, 'player'); assert.equal(s.pings.length, 2);
});

test('ambient notices do not overwrite wave announcements', () => {
  const g = game(1), s = g.state;
  s.time = 10; g.startWave(); const text = g.elements.get('toast').textContent;
  assert.match(text, /Ondata 1/);
  const b = g.createBuilding('barracks', 'player', 700, 800);
  b.queue.push({ type: 'soldier', remaining: 0 }); g.updateTraining(1 / 60);
  assert.equal(g.elements.get('toast').textContent, text);
  s.time = 15; b.queue.push({ type: 'soldier', remaining: 0 }); g.updateTraining(1 / 60);
  assert.match(g.elements.get('toast').textContent, /Armigero pronto/);
});

test('units heal slowly near their castle only after a few seconds out of combat', () => {
  const g = game(1), s = g.state, home = g.keep('player');
  s.units = s.units.filter(u => u.team === 'player'); s.waveIn = 1000;
  const near = g.createUnit('soldier', 'player', home.x + 150, home.y - 120, { type: 'hold', x: home.x + 150, y: home.y - 120 });
  const far = g.createUnit('soldier', 'player', home.x + 600, home.y, { type: 'hold', x: home.x + 600, y: home.y });
  g.damage(near, 60, 'enemy'); g.damage(far, 60, 'enemy');
  g.step(3); assert.equal(near.hp, 65);
  g.step(3); assert.ok(near.hp > 65 && near.hp < 75); assert.equal(far.hp, 65);
  g.step(30); assert.equal(near.hp, 125); assert.equal(far.hp, 65);
});

test('a castle rally on a resource sends new workers straight to harvest', () => {
  const g = game(1), s = g.state, home = g.keep('player'), node = s.nodes[0];
  g.select(home); g.orderUnits(node.x, node.y);
  assert.equal(home.rally.nodeId, node.id);
  home.queue.push({ type: 'worker', remaining: 0 }); g.updateTraining(1 / 60);
  const worker = s.units[s.units.length - 1];
  assert.equal(worker.order.type, 'harvest'); assert.equal(worker.order.nodeId, node.id);
  g.orderUnits(home.x + 300, home.y); assert.equal(home.rally.nodeId, undefined);
  home.queue.push({ type: 'worker', remaining: 0 }); g.updateTraining(1 / 60);
  assert.equal(s.units[s.units.length - 1].order.type, 'move');
});

test('control groups store and recall living units; double click picks visible units of one type', () => {
  const g = game(1), s = g.state;
  const soldiers = s.units.filter(u => u.type === 'soldier' && u.team === 'player');
  s.selected = [...soldiers, s.units.find(u => u.team === 'enemy')]; g.saveGroup('1');
  assert.equal(s.groups['1'].length, 2);
  const ids = () => [...s.selected].map(u => u.id);
  s.selected = []; g.recallGroup('1'); assert.deepEqual(ids(), [soldiers[0].id, soldiers[1].id]);
  soldiers[0].hp = 0; g.recallGroup('1'); assert.deepEqual(ids(), [soldiers[1].id]);
  g.recallGroup('2'); assert.deepEqual(ids(), [soldiers[1].id]);
  const workers = s.units.filter(u => u.type === 'worker');
  g.selectSameType(workers[0]); assert.equal(s.selected.length, workers.length);
  assert.ok(s.selected.every(u => u.type === 'worker'));
});

test('workers deliver to the nearest usable depot', () => {
  const g = game(2), s = g.state, post = s.outposts[0], w = s.units.find(u => u.type === 'worker');
  w.x = post.x + 40; w.y = post.y;
  assert.equal(g.nearestDepot(w), g.keep('player'));
  post.owner = 'player'; assert.equal(g.nearestDepot(w), post);
});

test('starting soldiers cannot rush the iron fortress', () => {
  const g = game(4), s = g.state;
  const soldiers = s.units.filter(u => u.type === 'soldier' && u.team === 'player');
  soldiers.forEach(u => u.order = { type: 'attack', targetId: g.keep('enemy').id });
  g.step(110);
  assert.ok(g.keep('enemy').hp > 0); assert.ok(soldiers.every(u => u.hp === 0));
});

test('a prepared army within 30 population can win level four after taking the towers', () => {
  const g = game(4), s = g.state;
  s.outposts.forEach(p => { p.owner = 'player'; p.control = 1; });
  s.units = s.units.filter(u => u.team !== 'player' || u.type === 'worker');
  for (const [type, count] of [['soldier', 16], ['archer', 8], ['mage', 3]]) {
    for (let i = 0; i < count; i++) g.createUnit(type, 'player', 2570 - (type === 'soldier' ? 0 : 120), 880 + i * 25,
      { type: 'attack-move', x: 3000, y: 1100 });
  }
  assert.equal(s.units.filter(u => u.team === 'player').length, 30);
  g.step(110); assert.equal(g.keep('enemy').hp, 0); assert.equal(s.ended, true);
  assert.equal(s.nextLevel, true);
});

test('level five: a vast map, five posts with a neutral mill, bastions, three camps and rich deposits', () => {
  const g = game(5), s = g.state;
  assert.equal(s.popCap, 36); assert.equal(s.wood, 220); assert.equal(s.gold, 100);
  assert.equal(s.decorations.length, Math.round(750 * 4200 * 2800 / (2400 * 1600)));
  assert.equal(s.outposts.length, 5);
  assert.equal(s.outposts.filter(p => p.owner === 'enemy').length, 4);
  assert.equal(s.outposts[4].owner, 'neutral'); assert.equal(s.outposts[4].name, 'Mulino');
  assert.ok(Math.abs(g.citadelShield() - .6) < 1e-8);
  assert.equal(g.keep('enemy').hp, 2600);
  const camps = s.buildings.filter(b => b.type === 'camp');
  assert.equal(camps.length, 3); assert.equal(camps.find(b => b.frontName === 'Scuderie').hp, 700);
  const bastions = s.buildings.filter(b => b.type === 'bastion');
  assert.equal(bastions.length, 2); assert.ok(bastions.every(b => b.hp === 900 && b.team === 'enemy'));
  const rich = s.nodes.filter(n => n.rich);
  assert.equal(rich.length, 4);
  assert.equal(rich.map(n => `${n.type}:${n.stock}`).sort().join(), 'gold:900,gold:900,gold:900,wood:1000');
  assert.equal(s.nodes.filter(n => n.type === 'wood').length, 24); assert.equal(s.nodes.filter(n => n.type === 'gold').length, 12);
  // Resources never sit on top of buildings or inside capture circles.
  for (const n of s.nodes) {
    assert.ok(s.buildings.every(b => Math.hypot(b.x - n.x, b.y - n.y) > 150), `node ${n.x},${n.y} near a building`);
    assert.ok(s.outposts.every(p => Math.hypot(p.x - n.x, p.y - n.y) > p.radius + n.r), `node ${n.x},${n.y} inside a post`);
  }
});

test('level five advances to the convoy mission', () => {
  const g = game(5), s = g.state;
  g.damage(g.keep('enemy'), 100000, 'player');
  assert.equal(s.ended, true); assert.equal(s.nextLevel, true);
  assert.match(g.elements.get('modalSubtitle').textContent, /usurpatore/);
});

test('depots are only buildable where the level allows them', () => {
  for (const level of [1, 2, 3, 4]) {
    const g = game(level), s = g.state, home = g.keep('player');
    g.select(s.units.find(u => u.type === 'worker')); g.beginBuild('depot');
    assert.equal(s.mode, 'select'); assert.equal(g.validBuild(home.x + 250, home.y + 300, 'depot'), false);
  }
});

test('a depot costs 80 wood, builds in 8 seconds and then receives cargo', () => {
  const g = game(5), s = g.state, worker = s.units.find(u => u.type === 'worker');
  s.units = s.units.filter(u => u.team === 'player'); s.waveIn = 1000;
  g.select(worker); g.beginBuild('depot');
  assert.equal(s.mode, 'place'); assert.equal(s.placing, 'depot');
  g.placeBuilding(800, 1700);
  const depot = s.buildings.find(b => b.type === 'depot');
  assert.ok(depot); assert.equal(s.wood, 140); assert.equal(s.gold, 100); assert.equal(depot.progress, 0);
  assert.equal(s.mode, 'select');
  const w = worker; w.x = depot.x - 52; w.y = depot.y;
  g.step(7.5, dt => g.updateWorker(w, dt)); assert.ok(depot.progress < 1);
  g.step(.6, dt => g.updateWorker(w, dt)); assert.equal(depot.progress, 1); assert.equal(w.order, null);
  w.carry = 18; w.carryType = 'gold';
  assert.equal(g.nearestDepot(w), depot);
  for (let i = 0; i < 600 && w.carry; i++) g.updateWorker(w, 1 / 60);
  w.order = { type: 'deposit' }; for (let i = 0; i < 600 && w.carry; i++) g.updateWorker(w, 1 / 60);
  assert.equal(w.carry, 0); assert.equal(s.gold, 118);
  // An unfinished depot is not a drop-off point.
  const site = g.createBuilding('depot', 'player', 700, 1100, 0); w.x = site.x; w.y = site.y;
  assert.notEqual(g.nearestDepot(w), site);
});

test('forward building is allowed around allied, uncontested towers only', () => {
  const g = game(5), s = g.state, arcane = s.outposts[1];
  const spot = { x: arcane.x, y: arcane.y + 300 };
  assert.equal(g.validBuild(spot.x, spot.y, 'depot'), false);
  arcane.owner = 'player';
  assert.equal(g.validBuild(spot.x, spot.y, 'depot'), true);
  assert.equal(g.validBuild(spot.x, spot.y, 'barracks'), true);
  assert.equal(g.validBuild(arcane.x, arcane.y + 100, 'depot'), false);
  arcane.contested = true; assert.equal(g.validBuild(spot.x, spot.y, 'depot'), false);
  arcane.contested = false;
  s.wood = s.gold = 1000; g.select(s.units.find(u => u.type === 'worker'));
  g.beginBuild('barracks'); g.placeBuilding(spot.x, spot.y);
  assert.ok(s.buildings.some(b => b.type === 'barracks' && b.x === spot.x && b.progress === 0));
  // Level four keeps the castle-only rule.
  const g4 = game(4); g4.state.outposts[0].owner = 'player';
  const m = g4.state.outposts[0];
  assert.equal(g4.validBuild(m.x, m.y + 300, 'barracks'), false);
});

test('the stables send only knights, at most four, on their own wave slots', () => {
  const g = game(5), s = g.state;
  const names = [1, 2, 3, 4, 5, 6].map(w => { s.wave = w; return g.waveFronts().map(f => f.name).join('+'); });
  assert.deepEqual([...names], ['Scuderie', 'Campo nord', 'Campo sud', 'Cittadella dell’usurpatore', 'Scuderie', 'Campo nord+Campo sud']);
  s.wave = 1; let count = s.units.length; g.startWave();
  assert.deepEqual(s.units.slice(count).map(u => u.type).join(), 'knight,knight');
  s.wave = 7; count = s.units.length; g.startWave();
  assert.equal(s.units.slice(count).length, 4); assert.ok(s.units.slice(count).every(u => u.type === 'knight'));
  s.wave = 20; g.startWave(); assert.equal(s.waveIn, 34);
});

test('knights hunt workers and depots, fight only blockers and fall back to the castle', () => {
  const g = game(5), s = g.state, home = g.keep('player');
  s.units = [];
  const order = () => ({ type: 'raid', targetId: home.id, viaOutpost: false, postId: s.outposts[0].id });
  const knight = g.createUnit('knight', 'enemy', 1000, 1000, order());
  const soldier = g.createUnit('soldier', 'player', 1150, 1000, { type: 'hold', x: 1150, y: 1000 });
  const worker = g.createUnit('worker', 'player', 1000, 1300);
  const before = Math.hypot(knight.x - worker.x, knight.y - worker.y);
  g.step(.5, dt => g.updateFighter(knight, dt));
  assert.ok(Math.hypot(knight.x - worker.x, knight.y - worker.y) < before - 50);
  for (let i = 0; i < 180; i++) { knight.cooldown = Math.max(0, knight.cooldown - 1 / 60); g.updateFighter(knight, 1 / 60); }
  assert.ok(worker.hp < 55); assert.equal(soldier.hp, 125);
  // A soldier in contact gets attacked instead.
  soldier.x = knight.x + 30; soldier.y = knight.y; knight.cooldown = 0; g.updateFighter(knight, 1 / 60);
  assert.ok(soldier.hp < 125);
  // Depots are prey too; without prey the knight rides for the castle.
  worker.hp = 0; soldier.hp = 0; s.units = s.units.filter(u => u.hp > 0);
  const depot = g.createBuilding('depot', 'player', 1500, 1000);
  knight.cooldown = 0;
  for (let i = 0; i < 400; i++) { knight.cooldown = Math.max(0, knight.cooldown - 1 / 60); g.updateFighter(knight, 1 / 60); }
  assert.ok(depot.hp < 300);
  depot.hp = 0; const far = Math.hypot(knight.x - home.x, knight.y - home.y);
  g.step(1, dt => g.updateFighter(knight, dt));
  assert.ok(Math.hypot(knight.x - home.x, knight.y - home.y) < far - 100);
  // Knights never capture posts.
  const market = s.outposts[0]; market.owner = 'player'; market.control = 1;
  s.units = [g.createUnit('knight', 'enemy', market.x, market.y)];
  g.step(30, g.updateOutpost); assert.equal(market.owner, 'player');
});

test('bastions shoot nearby opponents on their own rhythm and stop once destroyed', () => {
  const g = game(5), s = g.state, bastion = s.buildings.find(b => b.type === 'bastion');
  s.units = [];
  const soldier = g.createUnit('soldier', 'player', bastion.x, bastion.y + 200);
  g.updateDefenses(.01); assert.equal(soldier.hp, 125 - 16);
  g.updateDefenses(1.5); assert.equal(soldier.hp, 125 - 16);
  g.updateDefenses(.2); assert.equal(soldier.hp, 125 - 32);
  g.damage(bastion, 10000, 'player'); bastion.cooldown = 0; g.updateDefenses(2);
  assert.equal(soldier.hp, 125 - 32);
});

test('the royal guard sorties once when the citadel falls below half', () => {
  const g = game(5), s = g.state, citadel = g.keep('enemy');
  s.outposts.forEach(p => { p.owner = 'player'; });
  g.damage(citadel, 1200, 'player'); assert.equal(s.units.filter(u => u.type === 'champion').length, 0);
  g.damage(citadel, 200, 'player');
  assert.equal(s.units.filter(u => u.type === 'champion').length, 1); assert.equal(s.lastStandDone, true);
  const count = s.units.length; g.damage(citadel, 200, 'player'); assert.equal(s.units.length, count);
  assert.match(g.elements.get('toast').textContent, /Guardia reale/);
  g.resetWorld(5); assert.equal(s.lastStandDone, false);
  assert.equal(s.units.filter(u => u.type === 'champion').length, 0);
});

test('starting soldiers cannot rush the usurper citadel', () => {
  const g = game(5), s = g.state;
  const soldiers = s.units.filter(u => u.type === 'soldier' && u.team === 'player');
  soldiers.forEach(u => { u.x += 2800; u.order = { type: 'attack', targetId: g.keep('enemy').id }; });
  g.step(90);
  assert.ok(g.keep('enemy').hp > 0); assert.ok(soldiers.every(u => u.hp === 0));
});

test('a prepared army within 36 population can take the citadel past bastions and royal guard', () => {
  const g = game(5), s = g.state;
  s.outposts.forEach(p => { p.owner = 'player'; p.control = 1; });
  s.units = s.units.filter(u => u.team !== 'player' || u.type === 'worker');
  for (const [type, count] of [['soldier', 18], ['archer', 10], ['mage', 5]]) {
    for (let i = 0; i < count; i++) g.createUnit(type, 'player', 3050 - (type === 'soldier' ? 0 : 120), 1060 + i * 22,
      { type: 'attack-move', x: 3800, y: 1400 });
  }
  assert.equal(s.units.filter(u => u.team === 'player').length, 36);
  g.step(150);
  assert.equal(s.lastStandDone, true);
  assert.equal(g.keep('enemy').hp, 0); assert.equal(s.ended, true); assert.equal(s.nextLevel, true);
});

test('convoy scenario starts with a free waiting cart outside the population limit', () => {
  const g = game(6), s = g.state, cart = g.activeCart();
  assert.equal(s.popCap, 38); assert.equal(s.convoy.delivered, 0); assert.equal(cart.type, 'cart');
  assert.equal(cart.moving, false); assert.equal(cart.hp, 480); assert.equal(g.playerUnits().length, 5);
  assert.equal(s.buildings.filter(b => b.type === 'camp').length, 3);
  g.selectArmy(); assert.equal(s.selected.length, 2); assert.ok(!s.selected.includes(cart));
  g.select(cart); g.orderUnits(3550, 1100); g.dispatchCommand('hold');
  assert.equal(cart.order, null); assert.equal(cart.moving, false);
  g.saveGroup(1); assert.equal(s.groups[1], undefined);
});

test('cart follows the route, can halt midway, and requires an uncontested checkpoint to depart', () => {
  const g = game(6), s = g.state, cart = g.activeCart();
  g.convoyAction(); g.step(3, g.updateMissions); const x = cart.x;
  assert.ok(x > 650 && x < 1400); g.convoyAction(); g.step(5, g.updateMissions); assert.equal(cart.x, x);
  g.convoyAction(); g.step(20, g.updateMissions);
  assert.equal(cart.routeIndex, 1); assert.equal(cart.x, 1400); assert.equal(cart.y, 900); assert.equal(cart.moving, false);
  g.convoyAction(); assert.equal(cart.moving, false);
  s.outposts[0].owner = 'player'; s.outposts[0].contested = true;
  g.convoyAction(); assert.equal(cart.moving, false);
  s.outposts[0].contested = false; g.convoyAction(); assert.equal(cart.moving, true);
  g.step(30, g.updateMissions); assert.equal(cart.routeIndex, 2); assert.equal(cart.x, 2450); assert.equal(cart.y, 1350);
});

test('cart cannot capture or contest a checkpoint even alongside enemy military', () => {
  const g = game(6), p = g.state.outposts[0], cart = g.activeCart();
  cart.x = p.x; cart.y = p.y;
  g.step(30, g.updateOutpost); assert.equal(p.owner, 'enemy');
  g.createUnit('raider', 'enemy', p.x, p.y); g.updateOutpost(.1); assert.equal(p.contested, false);
  g.createUnit('soldier', 'player', p.x, p.y); g.updateOutpost(.1); assert.equal(p.contested, true);
});

test('three actual route deliveries win; replacement carts for successful deliveries are free', () => {
  const g = game(6), s = g.state; s.outposts.forEach(p => { p.owner = 'player'; p.control = 1; });
  for (let delivered = 1; delivered <= 3; delivered++) {
    const id = g.activeCart().id;
    for (const seconds of [20, 25, 25]) { g.convoyAction(); g.step(seconds, g.updateMissions); }
    assert.equal(s.convoy.delivered, delivered); assert.equal(s.wood, 240); assert.equal(s.gold, 120);
    assert.equal(s.units.some(u => u.id === id), false);
    if (delivered < 3) { assert.equal(s.ended, false); assert.equal(g.activeCart().moving, false); }
  }
  assert.equal(s.ended, true); assert.equal(s.nextLevel, true); assert.equal(s.convoy.lost, 0);
  assert.match(g.elements.get('modalSubtitle').textContent, /Tre carri consegnati/);
});

test('a destroyed cart does not lose the mission and requires affordable replacement at the start', () => {
  const g = game(6), s = g.state;
  g.damage(g.activeCart(), 1000, 'enemy'); assert.equal(s.ended, false); assert.equal(s.convoy.lost, 1);
  assert.equal(g.activeCart(), undefined); s.wood = 79; const gold = s.gold;
  g.convoyAction(); assert.equal(g.activeCart(), undefined); assert.equal(s.gold, gold);
  s.wood = 80; s.gold = 40; g.convoyAction();
  assert.equal(s.wood, 0); assert.equal(s.gold, 0); assert.equal(g.activeCart().x, 650);
  assert.equal(g.activeCart().routeIndex, 0); assert.equal(g.activeCart().moving, false);
  assert.equal(s.convoy.delivered, 0);
});

test('knights prioritize the convoy but engage a military escort blocking their path', () => {
  const g = game(6), s = g.state, cart = g.activeCart(); cart.x = 1900; cart.y = 1000;
  const worker = g.createUnit('worker', 'player', 1680, 1000);
  const knight = g.createUnit('knight', 'enemy', 1700, 1000, { type: 'raid', targetId: g.keep('player').id });
  g.updateFighter(knight, .1); assert.ok(knight.x > 1700); assert.equal(worker.hp, 55);
  knight.x = cart.x - 20; knight.cooldown = 0; g.updateFighter(knight, .1); assert.ok(cart.hp < 480);
  const hp = cart.hp, soldier = g.createUnit('soldier', 'player', knight.x - 10, knight.y);
  knight.cooldown = 0; g.updateFighter(knight, .1); assert.ok(soldier.hp < 125); assert.equal(cart.hp, hp);
});

test('convoy warnings identify cavalry and destroying all camps does not deliver supplies', () => {
  const g = game(6), s = g.state; s.waveIn = 20; g.update(.05); g.updateHud();
  assert.match(g.elements.get('waveNotice').textContent, /Cavalieri/);
  const camps = s.buildings.filter(b => b.type === 'camp'); camps.forEach(b => g.damage(b, 10000, 'player'));
  assert.equal(s.ended, false); const count = s.units.length;
  for (let i = 0; i < 6; i++) g.startWave(); assert.equal(s.units.length, count);
  assert.equal(s.convoy.delivered, 0);
});

test('convoy population reservations exclude the cart at the 38-unit limit', () => {
  const g = game(6), s = g.state; s.wood = s.gold = 10000;
  for (let i = 0; i < 32; i++) g.createUnit('worker', 'player', 350, 1100);
  const b = g.createBuilding('barracks', 'player', 700, 1200); g.select(b); g.recruit('soldier');
  g.select(g.keep('player')); g.recruit('worker'); assert.equal(g.reservedPopulation(), 1);
  g.step(8, g.updateTraining); assert.equal(g.playerUnits().length, 38); assert.ok(g.activeCart());
});

test('checkpoints and sanctuaries support magi, deposits and forward construction', () => {
  for (const level of [6, 7]) {
    const g = game(level), s = g.state, p = s.outposts[0]; s.wood = s.gold = 1000;
    p.owner = 'player'; p.control = 1;
    const worker = g.createUnit('worker', 'player', p.x, p.y); worker.carry = 18; worker.carryType = 'gold';
    assert.equal(g.depositCargo(worker, .1), true);
    const b = g.createBuilding('barracks', 'player', p.x + 200, p.y); g.select(b); g.recruit('mage');
    assert.equal(b.queue.length, 1); assert.equal(g.validBuild(p.x, p.y + 220, 'depot'), true);
    p.contested = true; assert.equal(g.validBuild(p.x, p.y + 220, 'depot'), false);
  }
});

test('two safe sanctuaries accumulate ritual time; losses and contests pause without resetting', () => {
  const g = game(7), s = g.state;
  assert.equal(s.popCap, 40); assert.equal(s.controlTime, 0);
  assert.equal(s.outposts.filter(p => p.owner === 'neutral').length, 2);
  s.outposts[0].owner = 'player'; g.step(10, g.updateMissions); assert.equal(s.controlTime, 0);
  s.outposts[2].owner = 'player'; g.step(20, g.updateMissions); assert.ok(Math.abs(s.controlTime - 20) < 1e-6);
  const progress = s.controlTime; s.outposts[2].contested = true; g.step(20, g.updateMissions); assert.equal(s.controlTime, progress);
  s.outposts[2].contested = false; s.outposts[2].owner = 'enemy'; g.step(20, g.updateMissions); assert.equal(s.controlTime, progress);
  s.outposts[2].owner = 'player'; g.step(10, g.updateMissions); assert.ok(Math.abs(s.controlTime - 30) < 1e-6);
});

test('all three sanctuaries accelerate the ritual to 1.5 and victory requires 180 accumulated seconds', () => {
  const g = game(7), s = g.state; s.outposts.forEach(p => { p.owner = 'player'; p.control = 1; });
  assert.equal(g.controlRate(), 1.5); g.step(60, g.updateMissions); assert.ok(Math.abs(s.controlTime - 90) < 1e-6);
  assert.equal(s.ended, false); g.step(60, g.updateMissions);
  assert.equal(s.controlTime, 180); assert.equal(s.ended, true); assert.equal(s.nextLevel, true);
  assert.match(g.elements.get('modalSubtitle').textContent, /sigilli sono ricomposti/);
});

test('actual military presence contests a sanctuary before the ritual can tick', () => {
  const g = game(7), s = g.state;
  for (const p of s.outposts.slice(0, 2)) { p.owner = 'player'; p.control = 1; }
  const p = s.outposts[0]; g.createUnit('soldier', 'player', p.x - 80, p.y);
  g.createUnit('raider', 'enemy', p.x + 80, p.y); g.update(.02);
  assert.equal(p.contested, true); assert.equal(s.controlTime, 0);
});

test('sanctuary waves target their advertised posts and preserve split pincer destinations', () => {
  const g = game(7), s = g.state; s.wave = 4; s.waveIn = 20; g.update(.02); g.updateHud();
  assert.match(g.elements.get('waveNotice').textContent, /alba/); assert.match(g.elements.get('waveNotice').textContent, /crepuscolo/);
  g.startWave(); const raid = s.units.filter(u => u.order?.type === 'raid');
  assert.ok(raid.every(u => u.order.viaOutpost)); assert.deepEqual([...new Set(raid.map(u => u.order.postId))].sort(), ['post-0', 'post-2']);
  s.buildings.filter(b => b.type === 'camp').forEach(b => g.damage(b, 10000)); assert.equal(s.ended, false);
});

test('pause freezes missions and reset clears cargo losses, ritual progress and mission UI', () => {
  const g = game(6), s = g.state; g.convoyAction(); const cart = g.activeCart();
  s.running = false; g.step(20); g.step(20, g.updateMissions); g.convoyAction(); assert.equal(cart.x, 650);
  s.running = true; g.damage(cart, 1000); g.restart(6); assert.equal(s.convoy.lost, 0); assert.equal(g.activeCart().moving, false);
  g.restart(7); s.running = true; s.outposts.forEach(p => { p.owner = 'player'; p.control = 1; });
  g.step(10, g.updateMissions); const t = s.controlTime; s.running = false; g.step(10, g.updateMissions); assert.equal(s.controlTime, t);
  g.restart(1); assert.equal(s.controlTime, 0); assert.equal(s.convoy, null); assert.equal(g.activeCart(), undefined);
  assert.equal(g.elements.get('gameShell').dataset.mission, ''); assert.equal(s.popCap, 18);
});

test('campaign progresses 5 to 6 to 7; castle destruction still loses both objective missions', () => {
  const g = game(5), s = g.state; g.damage(g.keep('enemy'), 100000); g.startGame(); assert.equal(s.popCap, 38);
  s.outposts.forEach(p => { p.owner = 'player'; p.control = 1; });
  for (let delivery = 0; delivery < 3; delivery++) for (const time of [20, 25, 25]) { g.convoyAction(); g.step(time, g.updateMissions); }
  g.startGame(); assert.equal(s.popCap, 40); assert.equal(s.convoy, null); assert.equal(s.controlTime, 0);
  for (const level of [6, 7]) { g.restart(level); s.running = true; g.damage(g.keep('player'), 10000); assert.equal(s.ended, true); assert.equal(s.nextLevel, false); }
});

test('a prepared escort and checkpoint garrisons can deliver all carts under live enemy waves', () => {
  const g = game(6), s = g.state;
  s.units = s.units.filter(u => u.team !== 'player' || u.type === 'worker' || u.type === 'cart');
  s.outposts.forEach(p => { p.owner = 'player'; p.control = 1; });
  for (const p of s.outposts) {
    for (const [type, count] of [['soldier', 10], ['archer', 5], ['mage', 2]]) {
      for (let i = 0; i < count; i++) g.createUnit(type, 'player', p.x + (type === 'soldier' ? 40 : -40), p.y - 90 + i * 18,
        { type: 'hold', x: p.x, y: p.y });
    }
  }
  assert.equal(g.playerUnits().length, 37);
  for (let delivered = 1; delivered <= 3; delivered++) {
    for (const time of [20, 25, 25]) { g.convoyAction(); g.step(time); }
    assert.equal(s.convoy.delivered, delivered);
  }
  assert.equal(s.ended, true); assert.equal(s.nextLevel, true); assert.equal(s.convoy.lost, 0);
});

test('a prepared distributed army can hold the sanctuaries through late waves and a pincer', () => {
  const g = game(7), s = g.state;
  s.units = s.units.filter(u => u.team !== 'player' || u.type === 'worker');
  s.wave = 8; s.waveIn = 5; s.time = 350;
  s.outposts.forEach((p, index) => {
    p.owner = 'player'; p.control = 1;
    for (const [type, count] of [['soldier', 5], ['archer', index === 1 ? 4 : 5], ['mage', index === 1 ? 2 : 3]]) {
      for (let i = 0; i < count; i++) g.createUnit(type, 'player', p.x + (type === 'soldier' ? 40 : -40), p.y - 60 + i * 24,
        { type: 'hold', x: p.x, y: p.y });
    }
  });
  assert.equal(g.playerUnits().length, 40);
  g.step(180); assert.equal(s.controlTime, 180); assert.equal(s.ended, true); assert.equal(s.nextLevel, true);
  assert.ok(g.keep('player').hp > 0);
});

test('finite-wave missions start safely without destroyable enemy spawners', () => {
  for (const id of [8, 9]) {
    const g = game(id), s = g.state;
    assert.equal(s.survival.phase, 'preparation'); assert.equal(s.waveIn, 90);
    assert.equal(g.waveEnemies().length, 0);
    assert.equal(s.buildings.filter(b => b.team !== 'player').length, 0);
    assert.equal(s.popCap, id === 8 ? 40 : 42);
    assert.equal(g.livingVillages().length, id === 9 ? 2 : 0);
    g.step(89); assert.equal(s.survival.phase, 'preparation');
    g.step(2); assert.equal(s.survival.phase, 'active'); assert.equal(g.waveEnemies().length, 4);
    assert.equal(s.ended, false);
  }
});

test('waves cannot overlap, rewards happen once, and major waves grant longer rests', () => {
  const g = game(8), s = g.state;
  for (let n = 1; n <= 4; n++) {
    g.startSurvivalWave(); const count = g.waveEnemies().length;
    g.startSurvivalWave(); assert.equal(g.waveEnemies().length, count);
    g.step(100, dt => { g.updateSurvivalClock(dt); g.updateMissions(dt); });
    assert.equal(s.survival.phase, 'active'); assert.equal(s.wave, n);
    const wood = s.wood, gold = s.gold;
    for (const u of g.waveEnemies()) g.damage(u, 10000, 'player');
    g.updateMissions(0);
    assert.equal(s.survival.cleared, n); assert.equal(s.survival.phase, 'rest');
    assert.equal(s.waveIn, n === 4 ? 60 : 35);
    assert.equal(s.wood, wood + (n === 4 ? 100 : 60));
    assert.equal(s.gold, gold + (n === 4 ? 70 : 45));
    g.updateMissions(10); assert.equal(s.wood, wood + (n === 4 ? 100 : 60));
  }
});

test('victory requires every wave and its last survivor; level 8 advances to 9', () => {
  for (const id of [8, 9]) {
    const g = game(id), s = g.state, total = id === 8 ? 12 : 10;
    if (id === 9) g.damage(g.livingVillages()[0], 10000, 'enemy');
    for (let i = 0; i < total; i++) {
      g.startSurvivalWave();
      const enemies = g.waveEnemies(), last = enemies.pop();
      for (const u of enemies) g.damage(u, 10000, 'player');
      g.updateMissions(0); assert.equal(s.ended, false); assert.equal(s.survival.cleared, i);
      g.damage(last, 10000, 'player'); g.updateMissions(0);
      assert.equal(s.ended, i === total - 1);
    }
    assert.equal(s.nextLevel, id === 8); assert.equal(s.survival.cleared, total);
    assert.match(g.elements.get('modalSubtitle').textContent, new RegExp(`${total} ondate`));
    if (id === 8) { g.startGame(); assert.equal(g.livingVillages().length, 2); assert.equal(s.survival.cleared, 0); }
  }
});

test('castle loss ends either survival mission and losing both villages ends level 9', () => {
  const g = game(9), s = g.state;
  const [a, b] = g.livingVillages(); g.damage(a, 10000, 'enemy'); assert.equal(s.ended, false);
  g.damage(b, 10000, 'enemy'); assert.equal(s.ended, true); assert.equal(s.nextLevel, false);
  assert.equal(g.elements.get('modalTitle').textContent, 'I villaggi sono perduti');
  for (const id of [8, 9]) { g.resetWorld(id); s.running = true; g.damage(g.keep('player'), 10000, 'enemy'); assert.equal(s.ended, true); assert.equal(s.nextLevel, false); }
});

test('pause freezes wave timing, combat, village rewards and repairs', () => {
  const g = game(9), s = g.state, home = g.keep('player'), worker = s.units[0];
  home.hp = 500; worker.x = home.x - 60; worker.y = home.y;
  g.select(worker); g.orderUnits(home.x, home.y); s.running = false;
  const before = JSON.stringify({ wood: s.wood, gold: s.gold, hp: home.hp, waveIn: s.waveIn });
  g.startSurvivalWave(); g.step(120); g.updateMissions(120);
  assert.equal(JSON.stringify({ wood: s.wood, gold: s.gold, hp: home.hp, waveIn: s.waveIn }), before);
  s.running = true; g.startSurvivalWave(); assert.equal(s.survival.phase, 'active');
});

test('repairs consume wood only at the building and stop at full health or destruction', () => {
  const g = game(8), s = g.state, home = g.keep('player'), worker = s.units[0];
  home.hp = 980; worker.x = home.x - 500; worker.y = home.y;
  g.select(worker); g.dispatchCommand('repair'); assert.equal(s.mode, 'repair');
  g.orderUnits(home.x, home.y, 'repair'); assert.equal(worker.order.type, 'repair');
  const wood = s.wood; g.step(1, dt => g.updateWorker(worker, dt));
  assert.equal(s.wood, wood); assert.equal(home.hp, 980);
  worker.x = home.x - 65; g.step(3, dt => g.updateWorker(worker, dt));
  assert.equal(home.hp, 1000); assert.equal(s.wood, wood - 4); assert.equal(worker.order, null);
  home.hp = 999; g.orderUnits(home.x, home.y); g.step(1, dt => g.updateWorker(worker, dt));
  assert.equal(home.hp, 1000); assert.equal(s.wood, wood - 5);
  const b = g.createBuilding('depot', 'player', worker.x + 40, worker.y); b.hp = 100;
  g.orderUnits(b.x, b.y); g.damage(b, 10000); g.step(1, dt => g.updateWorker(worker, dt));
  assert.equal(b.hp, 0); assert.equal(s.wood, wood - 5); assert.equal(worker.order, null);
});

test('repairs wait for wood and cannot repair units, enemies, or unfinished buildings', () => {
  const g = game(9), s = g.state, worker = s.units[0], village = g.livingVillages()[0];
  worker.x = village.x - 60; worker.y = village.y; village.hp = 900; s.wood = 0;
  g.select(worker); g.orderUnits(village.x, village.y); g.step(2, dt => g.updateWorker(worker, dt));
  assert.equal(village.hp, 900); assert.equal(s.wood, 0);
  s.wood = 1; g.step(1, dt => g.updateWorker(worker, dt)); assert.equal(village.hp, 905); assert.equal(s.wood, 0);
  for (const target of [g.createUnit('soldier', 'player', 1000, 1000), g.createBuilding('barracks', 'enemy', 1200, 1000), g.createBuilding('depot', 'player', 1400, 1000, .5)]) {
    worker.order = null; target.hp -= 10; g.orderUnits(target.x, target.y, 'repair'); assert.equal(worker.order, null);
  }
  g.resetWorld(7); s.running = true; g.select(s.units.find(u => u.team === 'player' && u.type === 'worker')); g.dispatchCommand('repair'); assert.equal(s.mode, 'select');
});

test('mill and market yield renewable resources only while safely held', () => {
  const g = game(8), s = g.state, [market, mill] = s.outposts;
  for (const p of s.outposts) { p.owner = 'player'; p.control = 1; }
  const wood = s.wood, gold = s.gold; g.step(8.1, g.updateOutpost);
  assert.equal(s.wood, wood + 12); assert.equal(s.gold, gold + 10);
  g.createUnit('soldier', 'player', mill.x, mill.y); g.createUnit('raider', 'enemy', mill.x + 30, mill.y);
  g.step(9, g.updateOutpost); assert.equal(mill.contested, true); assert.equal(s.wood, wood + 12);
  market.owner = 'enemy'; market.control = -1; const heldGold = s.gold;
  g.step(9, g.updateOutpost); assert.equal(s.gold, heldGold);
});

test('villages grant distinct bonuses and militia respects population reservations', () => {
  const g = game(9), s = g.state, [harvest, militia] = g.livingVillages();
  const clear = () => { g.startSurvivalWave(); for (const u of g.waveEnemies()) g.damage(u, 10000, 'player'); g.updateMissions(0); };
  const wood = s.wood, gold = s.gold; clear();
  assert.equal(s.wood, wood + 90); assert.equal(s.gold, gold + 65);
  while (g.playerUnits().length < s.popCap - 1) g.createUnit('soldier', 'player', 1600, 1100);
  const home = g.keep('player'); g.select(home); g.recruit('worker'); assert.equal(g.reservedPopulation(), 1);
  clear(); assert.equal(militia.pendingRecruits, 1); assert.equal(g.playerUnits().length, s.popCap - 1);
  g.updateMissions(0); assert.equal(militia.pendingRecruits, 1);
  g.cancelTraining(); g.updateMissions(0); assert.equal(militia.pendingRecruits, 0); assert.equal(g.playerUnits().length, s.popCap);
  g.damage(harvest, 10000, 'enemy'); const afterWood = s.wood; clear(); assert.equal(s.wood, afterWood + 60);
  clear(); assert.equal(militia.pendingRecruits, 1);
  g.damage(militia, 10000, 'enemy'); assert.equal(militia.pendingRecruits, 0); assert.equal(s.ended, true);
});

test('survival enemies honor village targets and redirect to the castle if one is destroyed', () => {
  const g = game(9), s = g.state, village = g.livingVillages()[0], home = g.keep('player');
  // No defenders distract the attackers in this targeting check.
  s.units = [];
  for (const type of ['raider', 'knight', 'ram']) {
    const u = g.createUnit(type, 'enemy', village.x + 60, village.y, { type: 'survival', targetId: village.id });
    const hp = village.hp; g.updateFighter(u, 1); assert.ok(village.hp < hp, type + ' hits village');
    u.cooldown = 0;
  }
  g.damage(village, 10000, 'enemy'); g.updateHud();
  assert.match(g.elements.get('waveNotice').textContent, /Nord → castello/);
  for (const u of g.waveEnemies()) {
    u.x = home.x + 50; u.y = home.y;
    const hp = home.hp; g.updateFighter(u, 1); assert.ok(home.hp < hp, u.type + ' redirects to castle');
  }
});

test('village bases allow construction and deposits but cannot train units', () => {
  const g = game(9), s = g.state, village = g.livingVillages()[0];
  s.nodes = [];
  assert.equal(g.validBuild(village.x + 180, village.y, 'barracks'), true);
  const worker = s.units[0]; worker.x = village.x + 50; worker.y = village.y; worker.carry = 18; worker.carryType = 'wood';
  assert.equal(g.nearestDepot(worker).id, village.id);
  const wood = s.wood; g.depositCargo(worker, 1); assert.equal(s.wood, wood + 18);
  g.select(village); g.recruit('worker'); assert.equal(village.queue.length, 0);
  g.damage(village, 10000); assert.equal(g.validBuild(village.x + 180, village.y, 'barracks'), false);
});

test('mages are available from the start of both survival missions', () => {
  for (const id of [8, 9]) {
    const g = game(id), b = g.createBuilding('barracks', 'player', 1800, 1100);
    g.select(b); g.recruit('mage'); assert.equal(b.queue[0]?.type, 'mage');
  }
});

test('prepared armies within the population caps can repel both final assaults in real combat', () => {
  for (const id of [8, 9]) {
    const g = game(id), s = g.state;
    s.units = [];
    const centers = id === 8 ? [g.keep('player')] : [g.keep('player'), ...g.livingVillages()];
    for (const c of centers) for (let i = 0, count = id === 8 ? 32 : 12; i < count; i++) {
      const type = i % 6 < 3 ? 'soldier' : i % 6 < 5 ? 'archer' : 'mage';
      const angle = i * Math.PI * 2 / count, radius = type === 'soldier' ? 110 : 70;
      g.createUnit(type, 'player', c.x + Math.cos(angle) * radius, c.y + Math.sin(angle) * radius);
    }
    assert.ok(g.playerUnits().length + 3 <= s.popCap, 'room for at least three workers');
    s.survival.cleared = id === 8 ? 11 : 9;
    g.startSurvivalWave();
    assert.ok(g.waveEnemies().some(u => u.type === 'champion'));
    assert.ok(g.waveEnemies().some(u => u.type === 'ram'));
    for (let i = 0; i < 180 && !s.ended; i++) g.step(1);
    assert.equal(s.ended, true); assert.ok(g.keep('player').hp > 0);
    assert.equal(s.survival.cleared, id === 8 ? 12 : 10);
    assert.equal(g.waveEnemies().length, 0);
    if (id === 9) assert.equal(g.livingVillages().length, 2);
  }
});

test('each village has its own attack alert, and restarting clears survival progress', () => {
  const g = game(9), s = g.state;
  for (const b of g.livingVillages()) {
    g.damage(b, 20, 'enemy'); assert.match(g.elements.get('toast').textContent, new RegExp(b.frontName));
  }
  g.startSurvivalWave(); for (const u of g.waveEnemies()) g.damage(u, 10000, 'player'); g.updateMissions(0);
  assert.equal(s.survival.cleared, 1);
  g.restart(8); assert.equal(s.survival.cleared, 0); assert.equal(s.waveIn, 90); assert.equal(g.livingVillages().length, 0);
  g.restart(1); assert.equal(s.survival, null); assert.equal(s.popCap, 18);
});
