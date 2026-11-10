/* Run with node --test tests/game.test.cjs. No npm packages or browser required.
 * The VM exposes internals only inside this test harness; production stays read-only.
 * These tests exercise simulation outcomes. Browser/input/rendering need a separate smoke test.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function game() {
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
    '  globalThis.testGame = {state, createUnit, createBuilding, resetWorld, keep, select, recruit, cancelTraining, reservedPopulation, orderUnits, update, updateWorker, updateFighter, updateOutpost, updateTraining, performAttack, damage, startWave, depositCargo, dispatchCommand};\n' + anchor), sandbox);
  const g = sandbox.testGame; g.state.running = true;
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
