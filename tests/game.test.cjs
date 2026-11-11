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
    '  globalThis.testGame = {state, createUnit, createBuilding, resetWorld, keep, select, recruit, cancelTraining, reservedPopulation, orderUnits, update, updateWorker, updateFighter, updateOutpost, updateTraining, performAttack, damage, startWave, depositCargo, dispatchCommand, startGame, restart, finish, validBuild, citadelShield, updateTowerDefenses, planWave, frontHome, waveFront};\n' + anchor), sandbox);
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
  g.damage(g.keep('enemy'), 10000, 'player'); assert.equal(s.ended, true); assert.equal(s.nextLevel, false);
  assert.equal(s.buildings.filter(b => b.type === 'camp' && b.hp > 0).length, 2);
  assert.match(g.elements.get('modalSubtitle').textContent, /cittadella/);
  g.startGame(); assert.equal(s.popCap, 28); assert.equal(g.keep('enemy').hp, 1800);
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
  assert.equal(s.nextLevel, false);
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
