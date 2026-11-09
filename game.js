/* Terre di Confine — original, dependency-free HTML5 mini RTS. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d', { alpha: false });
  const mini = $('minimap'), mctx = mini.getContext('2d');
  const W = 2400, H = 1600, TWO_PI = Math.PI * 2;
  const COST = { barracks: { wood: 110, gold: 45 }, worker: { wood: 45, gold: 0 }, soldier: { wood: 35, gold: 30 } };
  const TYPE_NAMES = { worker: 'Contadino', soldier: 'Armigero', raider: 'Predone', keep: 'Castello', barracks: 'Caserma' };
  const state = {
    wood: 200, gold: 110, popCap: 18, time: 0, wave: 1,
    waveIn: 58, running: false, ended: false, mode: 'select',
    units: [], buildings: [], nodes: [], decorations: [], particles: [],
    selected: [], camera: { x: 0, y: 0 }, width: 900, height: 600,
    pointer: null, mouse: { x: 0, y: 0 }, keys: new Set(),
    toastUntil: 0, lastHud: -1, idSequence: 0, stats: { killed: 0, trained: 0, gathered: 0 }
  };
  const uid = () => ++state.idSequence;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const hash = (x, y, s = 0) => {
    let v = Math.imul(x + 71 + s * 27, 374761393) ^ Math.imul(y + 19 + s * 59, 668265263);
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
  };
  const pos = (x, y) => ({ x, y });
  const playerUnits = () => state.units.filter(u => u.team === 'player' && u.hp > 0);
  const alive = (item) => item && item.hp > 0;
  const fmtTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const canPay = (price) => state.wood >= price.wood && state.gold >= price.gold;
  const canRecruit = (price) => canPay(price) && playerUnits().length < state.popCap;
  const spend = (price) => { if (!canPay(price)) return false; state.wood -= price.wood; state.gold -= price.gold; return true; };
  const keep = (team) => state.buildings.find(b => b.type === 'keep' && b.team === team);
  const named = (entity) => `${TYPE_NAMES[entity.type] || entity.type}${entity.team === 'enemy' ? ' nemico' : ''}`;

  function createUnit(type, team, x, y, order = null) {
    const configs = {
      worker: { hp: 55, speed: 86, damage: 4, attackTime: 1.35, range: 22 },
      soldier: { hp: 104, speed: 95, damage: 16, attackTime: 0.86, range: 30 },
      raider: { hp: 74, speed: 86, damage: 10, attackTime: 1.16, range: 29 }
    };
    const c = configs[type], u = { id: uid(), type, team, x, y, hp: c.hp, maxHp: c.hp,
      speed: c.speed, damage: c.damage, attackTime: c.attackTime, range: c.range,
      cooldown: 0, order, carry: 0, carryType: null, harvestClock: 0, facing: 1, swing: 0 };
    state.units.push(u);
    return u;
  }
  function createBuilding(type, team, x, y, progress = 1) {
    const hp = type === 'keep' ? (team === 'enemy' ? 590 : 750) : 360;
    const b = { id: uid(), type, team, x, y, hp: Math.max(75, hp * progress),
      maxHp: hp, progress, training: 0, trainingType: null, trainDuration: 0 };
    state.buildings.push(b);
    return b;
  }
  function addNode(type, x, y) {
    state.nodes.push({ id: uid(), type, x, y, r: type === 'wood' ? 47 : 36,
      stock: type === 'wood' ? 500 : 380 });
  }

  function resetWorld() {
    state.idSequence = 0; state.wood = 200; state.gold = 110; state.time = 0;
    state.wave = 1; state.waveIn = 58; state.running = false; state.ended = false;
    state.mode = 'select'; state.units = []; state.buildings = []; state.nodes = [];
    state.particles = []; state.selected = []; state.toastUntil = 0;
    state.stats = { killed: 0, trained: 0, gathered: 0 }; state.lastHud = -1;
    createBuilding('keep', 'player', 450, 795);
    createBuilding('keep', 'enemy', 2040, 795);
    createUnit('worker', 'player', 350, 876);
    createUnit('worker', 'player', 438, 908);
    createUnit('worker', 'player', 535, 880);
    createUnit('soldier', 'player', 575, 738);
    createUnit('soldier', 'player', 595, 813);
    createUnit('raider', 'enemy', 1927, 709, { type: 'guard', x: 1927, y: 709 });
    createUnit('raider', 'enemy', 1930, 892, { type: 'guard', x: 1930, y: 892 });
    [ [790,425], [975,565], [710,1200], [1250,350], [1290,1090],
      [1480,1300], [1710,440], [2010,330], [2040,1240] ].forEach(p => addNode('wood', ...p));
    [ [850,925], [1120,1280], [1405,495], [1680,1100], [2170,1100] ].forEach(p => addNode('gold', ...p));
    state.decorations = [];
    for (let i = 0; i < 750; i++) {
      const x = 35 + hash(i, 8) * (W - 70), y = 35 + hash(i, 13) * (H - 70);
      state.decorations.push({ x, y, r: hash(i, 4), kind: hash(i, 6) });
    }
    centerCamera(state.width < 800 ? 470 : 680, 790);
    $('placementNotice').classList.add('hidden');
    updateHud();
  }
  function centerCamera(x, y) {
    state.camera.x = clamp(x - state.width / 2, 0, Math.max(0, W - state.width));
    state.camera.y = clamp(y - state.height / 2, 0, Math.max(0, H - state.height));
  }
  function moveCamera(dx, dy) {
    state.camera.x = clamp(state.camera.x + dx, 0, Math.max(0, W - state.width));
    state.camera.y = clamp(state.camera.y + dy, 0, Math.max(0, H - state.height));
  }
  function resize() {
    const centerX = state.camera.x + state.width / 2;
    const centerY = state.camera.y + state.height / 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = window.innerWidth; state.height = window.innerHeight;
    canvas.width = Math.round(state.width * dpr); canvas.height = Math.round(state.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    centerCamera(centerX, centerY);
  }
  function toast(text) {
    $('toast').textContent = text;
    $('toast').classList.add('visible');
    state.toastUntil = state.time + 4.1;
  }
  function select(item, multi = false) {
    if (!multi) state.selected = [];
    if (item && alive(item) && (!multi || !state.selected.some(s => s.id === item.id))) state.selected.push(item);
    state.mode = 'select'; $('placementNotice').classList.add('hidden');
    updateHud();
  }
  function selectedAlive() {
    state.selected = state.selected.filter(alive);
    return state.selected;
  }
  function commandButton(action, label, description, icon, disabled = false) {
    return `<button class="command-button" data-command="${action}" ${disabled ? 'disabled' : ''}><span><b>${label}</b><small>${description}</small></span><span class="command-symbol">${icon}</span></button>`;
  }
  function updateHud() {
    $('wood').textContent = state.wood;
    $('gold').textContent = state.gold;
    $('population').textContent = `${playerUnits().length} / ${state.popCap}`;
    $('timer').textContent = fmtTime(state.time);
    $('waveText').textContent = `ONDATA ${String(state.wave).padStart(2, '0')}`;
    const sel = selectedAlive();
    const title = $('selectionTitle'), description = $('selectionDescription');
    const stats = $('selectionStats'), actions = $('commandButtons'), hint = $('selectionHint');
    let cmd = '', badges = '';
    if (!sel.length) {
      title.textContent = 'Nessuna selezione';
      description.textContent = 'Seleziona un contadino, un soldato o il castello per vedere i comandi.';
      hint.textContent = 'Clic sinistro: seleziona · clic destro: ordina';
    } else if (sel.length > 1) {
      const workers = sel.filter(e => e.type === 'worker' && e.team === 'player');
      const fighters = sel.filter(e => e.type === 'soldier' && e.team === 'player');
      title.textContent = `${sel.length} unità selezionate`;
      description.textContent = 'Impartisci un ordine di movimento o di attacco a tutto il gruppo.';
      badges = `<span class="stat-pill">⚒ ${workers.length} contadini</span><span class="stat-pill">⚔ ${fighters.length} soldati</span>`;
      if (workers.length) cmd += commandButton('build', 'Costruisci caserma', '110 legno · 45 oro · tasto B', '⌂', !canPay(COST.barracks));
      hint.textContent = 'Clic destro su un bersaglio per attaccare, sul terreno per muoverti.';
    } else {
      const s = sel[0], friendly = s.team === 'player';
      title.textContent = named(s);
      badges = `<span class="stat-pill">♥ <strong>${Math.max(0,Math.ceil(s.hp))}</strong> / ${s.maxHp} PV</span>`;
      if (s.type === 'worker') {
        description.textContent = friendly ? 'Raccoglie legno e oro e costruisce gli edifici del regno.' : 'Unità lavoratrice.';
        if (s.carry) badges += `<span class="stat-pill">⌂ Trasporta ${s.carry} ${s.carryType === 'wood' ? 'legno' : 'oro'}</span>`;
        if (friendly) cmd = commandButton('build', 'Costruisci caserma', '110 legno · 45 oro · tasto B', '⌂', !canPay(COST.barracks));
        hint.textContent = 'Clic destro su boschi o miniere per raccogliere automaticamente.';
      } else if (s.type === 'soldier' || s.type === 'raider') {
        description.textContent = friendly ? 'Fanteria da mischia: attacca i nemici e difende il castello.' : 'Un predone che minaccia i tuoi possedimenti.';
        badges += `<span class="stat-pill">⚔ ${s.damage} danni</span>`;
        hint.textContent = friendly ? 'Clic destro sul nemico per attaccare o sul terreno per avanzare.' : 'Un nemico va fermato prima che raggiunga la tua base.';
      } else if (s.type === 'keep') {
        description.textContent = friendly ? 'Il cuore del regno. Addestra nuovi contadini e proteggilo dai predoni.' : 'La fortezza rivale. Distruggila per vincere la partita.';
        if (friendly) cmd = commandButton('recruit-worker', 'Recluta contadino', s.training ? `In addestramento · ${Math.ceil(s.training)}s` : '45 legno · tasto R', '⚒', !!s.training || !canRecruit(COST.worker));
        hint.textContent = friendly ? 'I nuovi contadini servono a raccogliere risorse più in fretta.' : 'Invia gli armigeri con clic destro sulla fortezza.';
      } else if (s.type === 'barracks') {
        description.textContent = 'La caserma addestra armigeri da mandare in battaglia.';
        badges += `<span class="stat-pill">⌂ ${Math.floor(s.progress * 100)}% costruita</span>`;
        if (friendly) cmd = commandButton('recruit-soldier', 'Addestra armigero', s.progress < 1 ? 'Prima completa la costruzione' : s.training ? `In addestramento · ${Math.ceil(s.training)}s` : '35 legno · 30 oro · tasto R', '⚔', s.progress < 1 || !!s.training || !canRecruit(COST.soldier));
        hint.textContent = 'Addestra unità e attacca la fortezza nemica.';
      }
    }
    stats.innerHTML = badges; actions.innerHTML = cmd;
  }
  function beginBuild() {
    if (!state.running || state.ended) return;
    if (!selectedAlive().some(s => s.type === 'worker' && s.team === 'player')) { toast('Seleziona prima un contadino.'); return; }
    if (!canPay(COST.barracks)) { toast('Servono 110 legno e 45 oro per la caserma.'); return; }
    state.mode = 'place-barracks'; $('placementNotice').classList.remove('hidden');
    toast('Scegli un luogo libero vicino al tuo castello.');
  }
  function placeBarracks(x, y) {
    const builder = selectedAlive().find(u => u.type === 'worker' && u.team === 'player');
    if (!builder) { toast('Il contadino non è più disponibile.'); cancelBuild(); return; }
    if (!validBuild(x, y)) { toast('Posizione non valida: costruisci vicino al castello e lontano dagli ostacoli.'); return; }
    if (!spend(COST.barracks)) { toast('Risorse insufficienti.'); cancelBuild(); return; }
    const b = createBuilding('barracks', 'player', x, y, 0);
    builder.order = { type: 'build', targetId: b.id };
    cancelBuild(); select(b);
    toast('Il contadino sta costruendo la caserma.');
  }
  function cancelBuild() {
    state.mode = 'select'; $('placementNotice').classList.add('hidden');
  }
  function validBuild(x, y) {
    const home = keep('player');
    if (x < 80 || y < 105 || x > W - 80 || y > H - 95 || dist(pos(x,y),home) > 635) return false;
    return !state.buildings.some(b => dist(b, {x,y}) < (b.type === 'keep' ? 145 : 105)) &&
      !state.nodes.some(n => n.stock > 0 && dist(n, {x,y}) < n.r + 65);
  }
  function recruit(type) {
    if (!state.running || state.ended) return;
    const b = selectedAlive()[0];
    const expected = type === 'worker' ? 'keep' : 'barracks';
    if (!b || b.team !== 'player' || b.type !== expected || b.progress < 1 || b.training) return;
    if (playerUnits().length >= state.popCap) { toast('Hai raggiunto il limite di popolazione.'); return; }
    if (!spend(COST[type])) { toast('Non hai abbastanza risorse.'); return; }
    b.trainingType = type; b.training = type === 'worker' ? 5 : 6.5;
    b.trainDuration = b.training; updateHud();
    toast(type === 'worker' ? 'Un nuovo contadino è in addestramento.' : 'Un armigero è in addestramento.');
  }
  function dispatchCommand(command) {
    if (command === 'build') beginBuild();
    else if (command === 'recruit-worker') recruit('worker');
    else if (command === 'recruit-soldier') recruit('soldier');
  }

  function pick(x, y) {
    let result = null, best = Infinity;
    for (const u of state.units) {
      if (!alive(u)) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < 23 && d < best) { result = u; best = d; }
    }
    if (result) return result;
    for (const b of state.buildings) {
      if (!alive(b)) continue;
      if (Math.abs(b.x - x) < (b.type === 'keep' ? 63 : 50) && Math.abs(b.y - y) < (b.type === 'keep' ? 55 : 43)) return b;
    }
    for (const n of state.nodes) if (n.stock > 0 && dist(n, {x,y}) < n.r + 11) return n;
    return null;
  }
  function screenPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { sx: event.clientX - rect.left, sy: event.clientY - rect.top };
  }
  function worldPoint(screen) { return { x: screen.sx + state.camera.x, y: screen.sy + state.camera.y }; }
  function selectAt(x, y, multi = false) {
    const target = pick(x, y);
    if (target?.stock !== undefined) return; // A resource is not a selectable army unit.
    select(target, multi);
  }
  function orderUnits(x, y) {
    const army = selectedAlive().filter(u => u.team === 'player' && (u.type === 'worker' || u.type === 'soldier'));
    if (!army.length) return;
    const target = pick(x, y);
    if (target && target.stock !== undefined && target.stock > 0) {
      const workers = army.filter(u => u.type === 'worker');
      if (!workers.length) { toast('Solo i contadini possono raccogliere risorse.'); return; }
      workers.forEach(u => { u.order = { type: 'harvest', nodeId: target.id, stage: u.carry ? 'return' : 'approach' }; });
      toast(target.type === 'wood' ? 'Contadini inviati a tagliare legna.' : 'Contadini inviati a estrarre oro.');
      return;
    }
    if (target && target.team === 'enemy' && alive(target)) {
      army.forEach(u => { u.order = { type: 'attack', targetId: target.id }; });
      toast('Ordine di attacco impartito!');
      return;
    }
    if (target && target.type === 'barracks' && target.team === 'player' && target.progress < 1) {
      const workers = army.filter(u => u.type === 'worker');
      workers.forEach(u => { u.order = { type: 'build', targetId: target.id }; });
      if (workers.length) toast('Contadini inviati a costruire.');
      return;
    }
    const columns = Math.ceil(Math.sqrt(army.length));
    army.forEach((u, i) => {
      const offX = ((i % columns) - (columns - 1) / 2) * 33;
      const offY = (Math.floor(i / columns) - (Math.ceil(army.length / columns) - 1) / 2) * 33;
      u.order = { type: 'move', x: clamp(x + offX, 18, W - 18), y: clamp(y + offY, 18, H - 18) };
    });
    burst(x, y, '#e0cf91', 8, 0.55);
  }
  function moveTo(u, goal, stop, dt) {
    const dx = goal.x - u.x, dy = goal.y - u.y, d = Math.hypot(dx, dy);
    if (d <= stop) return true;
    const step = Math.min(d - stop, u.speed * dt);
    u.x += dx / d * step; u.y += dy / d * step;
    u.facing = dx >= 0 ? 1 : -1;
    return false;
  }
  function getEntity(id) {
    return state.units.find(u => u.id === id && alive(u)) || state.buildings.find(b => b.id === id && alive(b));
  }
  function getNode(id) { return state.nodes.find(n => n.id === id && n.stock > 0); }
  function findThreat(u) {
    if (u.type === 'worker') return null;
    let best = null, nearest = 117;
    for (const e of state.units) {
      if (e.team === u.team || !alive(e)) continue;
      const d = dist(u,e);
      if (d < nearest) { nearest = d; best = e; }
    }
    return best;
  }
  function performAttack(u, victim, dt) {
    if (!victim || !alive(victim)) return true;
    const stop = u.range + (victim.type === 'keep' ? 45 : victim.type === 'barracks' ? 37 : 4);
    if (!moveTo(u, victim, stop, dt)) return false;
    if (u.cooldown <= 0) {
      u.cooldown = u.attackTime; u.swing = .24;
      victim.hp -= u.damage;
      burst(victim.x + (hash(u.id, Math.floor(state.time)) - .5) * 16,
        victim.y - 13, victim.team === 'enemy' ? '#ed9f73' : '#ecd18e', 4, .43);
      if (victim.hp <= 0) {
        victim.hp = 0;
        burst(victim.x, victim.y, '#f9c17a', 22, 1.15);
        if (victim.team === 'enemy') state.stats.killed++;
        if (victim.type === 'keep') finish(victim.team === 'enemy');
      }
    }
    return false;
  }
  function updateWorker(u, dt) {
    const job = u.order;
    if (!job) return;
    if (job.type === 'harvest') {
      const node = getNode(job.nodeId), home = keep('player');
      if (!node || !home || !alive(home)) { u.order = null; return; }
      if (u.carry > 0) job.stage = 'return';
      if (job.stage === 'return') {
        if (moveTo(u, home, 79, dt)) {
          state[u.carryType] += u.carry;
          state.stats.gathered += u.carry;
          const amount = u.carry;
          u.carry = 0; u.carryType = null; job.stage = 'approach';
          burst(u.x, u.y - 10, '#e6cd7f', 4, .65);
          floating(u.x, u.y - 25, `+${amount}`, '#e2d08d');
        }
      } else if (moveTo(u, node, node.r - 3, dt)) {
        u.harvestClock += dt;
        if (u.harvestClock >= 2.3) {
          u.harvestClock = 0;
          u.carry = Math.min(12, node.stock);
          u.carryType = node.type;
          node.stock -= u.carry;
          job.stage = 'return';
          burst(node.x, node.y - 12, node.type === 'wood' ? '#a4ba70' : '#f2cc69', 5, .55);
        }
      }
    } else if (job.type === 'build') {
      const b = getEntity(job.targetId);
      if (!b || b.type !== 'barracks' || b.progress >= 1) { u.order = null; return; }
      if (moveTo(u, b, 62, dt)) {
        b.progress = Math.min(1, b.progress + dt / 12);
        b.hp = Math.max(b.hp, b.maxHp * b.progress);
        u.swing = .15;
        if (Math.random() < dt * 2) burst(b.x, b.y - 15, '#d9bb79', 3, .5);
        if (b.progress >= 1) { u.order = null; b.hp = b.maxHp; toast('Caserma completata! Ora puoi addestrare armigeri.'); }
      }
    } else if (job.type === 'attack') {
      const target = getEntity(job.targetId);
      if (!target) { u.order = null; return; }
      performAttack(u, target, dt);
    } else if (job.type === 'move') {
      if (moveTo(u, job, 5, dt)) u.order = null;
    }
  }
  function updateFighter(u, dt) {
    const job = u.order;
    // Soldiers react to nearby enemies even while marching to another target.
    const threat = findThreat(u);
    if (threat) { performAttack(u, threat, dt); return; }
    if (job?.type === 'attack') {
      const target = getEntity(job.targetId);
      if (!target) { u.order = null; return; }
      performAttack(u, target, dt);
    } else if (job?.type === 'move' || job?.type === 'guard') {
      if (moveTo(u, job, job.type === 'guard' ? 10 : 5, dt) && job.type === 'move') u.order = null;
    } else {
      // If an enemy building is very close, engage without further orders.
      for (const b of state.buildings) {
        if (b.team !== u.team && alive(b) && dist(u, b) < 90) { performAttack(u, b, dt); break; }
      }
    }
  }
  function updateTraining(dt) {
    for (const b of state.buildings) {
      if (!alive(b) || !b.training) continue;
      b.training -= dt;
      if (b.training <= 0) {
        const unitType = b.trainingType;
        const angle = hash(b.id, Math.floor(state.time)) * TWO_PI;
        const x = clamp(b.x + Math.cos(angle) * 101, 15, W - 15);
        const y = clamp(b.y + Math.sin(angle) * 93, 15, H - 15);
        createUnit(unitType, 'player', x, y);
        state.stats.trained++;
        b.training = 0; b.trainingType = null;
        burst(x,y,'#d8cc8a',10,.65);
        toast(unitType === 'worker' ? 'Un nuovo contadino è pronto!' : 'Un nuovo armigero è pronto!');
      }
    }
  }
  function startWave() {
    const home = keep('enemy');
    if (!alive(home)) return;
    const troops = Math.min(5, 1 + state.wave);
    for (let i = 0; i < troops; i++) {
      createUnit('raider', 'enemy', home.x - 110 - (i % 3) * 25, home.y + (i - (troops - 1) / 2) * 34,
        { type: 'attack', targetId: keep('player').id });
    }
    toast(`Attenzione! Ondata ${state.wave}: ${troops} predoni in marcia!`);
    state.wave++; state.waveIn = Math.max(30, 57 - state.wave * 2);
  }
  function finish(won) {
    if (state.ended) return;
    state.ended = true; state.running = false; cancelBuild();
    $('modalTitle').textContent = won ? 'Il regno è salvo!' : 'Il castello è caduto';
    $('modalSubtitle').textContent = won
      ? `Vittoria in ${fmtTime(state.time)}! Hai distrutto la fortezza nemica. Nemici sconfitti: ${state.stats.killed}. Risorse raccolte: ${state.stats.gathered}.`
      : `La fortezza nemica ha trionfato. Hai resistito ${fmtTime(state.time)} e sconfitto ${state.stats.killed} nemici. Puoi riprovare con una strategia diversa.`;
    $('modalGuide').classList.add('hidden');
    $('modalButton').innerHTML = 'Gioca ancora <span aria-hidden="true">↻</span>';
    $('modal').classList.remove('hidden');
  }
  function update(dt) {
    if (!state.running || state.ended) return;
    state.time += dt;
    const speed = 460 * dt;
    const k = state.keys;
    moveCamera(((k.has('d') || k.has('ArrowRight')) ? speed : 0) - ((k.has('a') || k.has('ArrowLeft')) ? speed : 0),
      ((k.has('s') || k.has('ArrowDown')) ? speed : 0) - ((k.has('w') || k.has('ArrowUp')) ? speed : 0));
    state.waveIn -= dt;
    if (state.waveIn <= 0) startWave();
    updateTraining(dt);
    for (const u of state.units) {
      if (!alive(u)) continue;
      u.cooldown = Math.max(0, u.cooldown - dt);
      u.swing = Math.max(0, u.swing - dt);
      if (u.type === 'worker') updateWorker(u, dt);
      else updateFighter(u, dt);
      u.x = clamp(u.x, 12, W - 12); u.y = clamp(u.y, 12, H - 12);
    }
    // Slight separation avoids a perfect stack of troops on the same point.
    for (let i = 0; i < state.units.length; i++) {
      const a = state.units[i]; if (!alive(a)) continue;
      for (let j = i + 1; j < state.units.length; j++) {
        const b = state.units[j]; if (!alive(b) || a.team !== b.team) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 440 && d2 > .1) {
          const d = Math.sqrt(d2), push = (21 - d) * Math.min(1, dt * 3);
          a.x -= dx / d * push * .5; a.y -= dy / d * push * .5;
          b.x += dx / d * push * .5; b.y += dy / d * push * .5;
        }
      }
    }
    state.units = state.units.filter(u => alive(u));
    for (const p of state.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.vy += (p.label ? -7 : 55) * dt; }
    state.particles = state.particles.filter(p => p.life > 0);
    if (state.toastUntil < state.time) $('toast').classList.remove('visible');
    if (Math.floor(state.time * 5) !== state.lastHud) { state.lastHud = Math.floor(state.time * 5); updateHud(); }
  }
  function burst(x,y,color,count=6,duration=.6) {
    for (let i=0;i<count;i++) {
      const a = Math.random()*TWO_PI, vel = 24+Math.random()*88;
      state.particles.push({x,y,vx:Math.cos(a)*vel,vy:Math.sin(a)*vel-20,life:duration,full:duration,color,size:1.6+Math.random()*3.5});
    }
  }
  function floating(x,y,label,color) {
    state.particles.push({x,y,vx:0,vy:-26,life:1.2,full:1.2,color,label,size:13});
  }

  // Draw all world assets directly in Canvas; no third-party sprites or fonts.
  function roundedRect(x,y,w,h,r,fill) {
    ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fillStyle=fill; ctx.fill();
  }
  function ellipse(x,y,rx,ry,fill) {
    ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TWO_PI);ctx.fillStyle=fill;ctx.fill();
  }
  function ground() {
    ctx.fillStyle='#617b50';ctx.fillRect(0,0,W,H);
    const tile=92, sx=Math.max(0,Math.floor(state.camera.x/tile)-1), sy=Math.max(0,Math.floor(state.camera.y/tile)-1);
    const ex=Math.min(Math.ceil(W/tile),Math.ceil((state.camera.x+state.width)/tile)+1);
    const ey=Math.min(Math.ceil(H/tile),Math.ceil((state.camera.y+state.height)/tile)+1);
    const colors=['#617b50','#667e51','#60774b','#6b8153','#637b4f','#5d764b','#698055'];
    for(let y=sy;y<=ey;y++)for(let x=sx;x<=ex;x++) {
      const xx=x*tile,yy=y*tile;
      ctx.fillStyle=colors[Math.floor(hash(x,y)*colors.length)];ctx.fillRect(xx,yy,tile+1,tile+1);
      ctx.fillStyle='#e0df9e12';ctx.fillRect(xx+hash(x,y,2)*56,yy+hash(x,y,3)*64,22,9);
      ctx.strokeStyle='#34553c26';ctx.lineWidth=1;
      for(let i=0;i<5;i++){
        const gx=xx+hash(x+i*9,y,5)*tile,gy=yy+hash(x,y+i*11,3)*tile;
        ctx.beginPath();ctx.moveTo(gx,gy+4);ctx.lineTo(gx-2,gy-3);ctx.moveTo(gx,gy+4);ctx.lineTo(gx+3,gy-4);ctx.stroke();
      }
    }
    // A winding, pebbly road visually joins the two castles.
    ctx.beginPath();ctx.moveTo(467,794);ctx.bezierCurveTo(900,699,1260,955,2045,789);
    ctx.strokeStyle='#a5946e';ctx.lineWidth=93;ctx.lineCap='round';ctx.stroke();
    ctx.strokeStyle='#b5a37c';ctx.lineWidth=77;ctx.stroke();
    ctx.strokeStyle='#cfba8c38';ctx.lineWidth=67;ctx.stroke();
    ctx.save();ctx.setLineDash([5,18]);ctx.strokeStyle='#6d684b6a';ctx.lineWidth=2;ctx.stroke();ctx.restore();
    ctx.lineWidth=1;ctx.lineCap='butt'; // Reset the wide, rounded road stroke before drawing grass.
    // Gentle borders and scattered accents make the world less sterile.
    for(const d of state.decorations){
      if(d.x<state.camera.x-20||d.x>state.camera.x+state.width+20||d.y<state.camera.y-20||d.y>state.camera.y+state.height+20)continue;
      if(d.kind>.92){ellipse(d.x,d.y,2.6,1.7,'#e6d6a5b8');ellipse(d.x+3,d.y-2,1.7,1.7,'#d5bf8c');}
      else if(d.kind>.78){ctx.strokeStyle='#354f3980';ctx.beginPath();ctx.moveTo(d.x,d.y+5);ctx.lineTo(d.x-3,d.y-4);ctx.moveTo(d.x,d.y+5);ctx.lineTo(d.x+4,d.y-2);ctx.stroke();}
      else if(d.kind<.10){ellipse(d.x,d.y,2.5,1.6,'#546350');}
    }
  }
  function drawTree(node, tick) {
    const {x,y} = node; const scale = node.stock <= 0 ? .45 : 1;
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
    ellipse(0,22,55,20,'#263e2b71');
    for (let i=0;i<5;i++) {
      const a=i*TWO_PI/5+.1, ox=Math.cos(a)*25,oy=Math.sin(a)*18;
      roundedRect(ox-5,oy-3,11,30,2,'#6a4c33');
      ellipse(ox,oy-19,26,22,i%2?'#244e3a':'#346445');
      ellipse(ox-6,oy-25,19,15,i%2?'#3e7850':'#427b4f');
      ellipse(ox-12,oy-33,8,5,'#81a76561');
    }
    ellipse(0,-25,22,17,'#315f40');ellipse(-5,-30,16,12,'#4b8553');
    if(node.stock>0){ellipse(0,34,18,10,'#203f2eaf');ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.fillStyle='#f1e6bd';ctx.fillText('♣',0,38);}
    ctx.restore();
  }
  function drawGold(node) {
    const {x,y}=node;
    ellipse(x,y+18,37,16,'#2f433688');
    const stones=[[-25,7,19,17],[-4,0,25,24],[21,9,17,16],[2,17,19,14]];
    for(const [ox,oy,rx,ry] of stones){
      ctx.beginPath();ctx.moveTo(x+ox-rx,y+oy+ry/2);ctx.lineTo(x+ox-rx*.7,y+oy-ry*.6);ctx.lineTo(x+ox+rx*.1,y+oy-ry);ctx.lineTo(x+ox+rx,y+oy-ry*.3);ctx.lineTo(x+ox+rx*.6,y+oy+ry*.7);ctx.closePath();
      ctx.fillStyle='#716c57';ctx.fill();ctx.strokeStyle='#afa681';ctx.lineWidth=1.5;ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+ox-rx*.7,y+oy-ry*.6);ctx.lineTo(x+ox+rx*.1,y+oy-ry);ctx.lineTo(x+ox+2,y+oy+ry*.1);ctx.closePath();ctx.fillStyle='#cdb568';ctx.fill();
      ctx.beginPath();ctx.moveTo(x+ox+2,y+oy+ry*.1);ctx.lineTo(x+ox+rx,y+oy-ry*.3);ctx.lineTo(x+ox+rx*.6,y+oy+ry*.7);ctx.closePath();ctx.fillStyle='#e2c979';ctx.fill();
    }
    ellipse(x,y+29,18,9,'#544e368a');ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.fillStyle='#ffe5a1';ctx.fillText('◆',x,y+33);
  }
  function drawKeep(b) {
    const enemy=b.team==='enemy', x=b.x,y=b.y;
    ctx.save();ctx.translate(x,y);
    ellipse(3,41,81,39,'#152d2488');
    roundedRect(-58,-28,116,79,7,'#827f6a');
    roundedRect(-51,-38,102,79,5,'#c1b9a0');
    ctx.strokeStyle='#867f6b';ctx.lineWidth=2;
    for(let i=-33;i<34;i+=22){ctx.beginPath();ctx.moveTo(i,-20);ctx.lineTo(i+16,-20);ctx.moveTo(i,8);ctx.lineTo(i+16,8);ctx.stroke();}
    for(const sx of [-60,60]){
      roundedRect(sx-17,-44,34,94,3,'#918a73');
      roundedRect(sx-15,-52,30,91,3,'#bcb49a');
      for(let i=-15;i<=15;i+=12)roundedRect(sx+i-6,-61,11,17,2,'#d3c8a8');
      roundedRect(sx-5,-19,10,15,2,'#4e5048');
    }
    ctx.beginPath();ctx.moveTo(-57,-36);ctx.lineTo(0,-82);ctx.lineTo(57,-36);ctx.closePath();ctx.fillStyle=enemy?'#8b4138':'#386b69';ctx.fill();
    ctx.beginPath();ctx.moveTo(-56,-36);ctx.lineTo(0,-82);ctx.lineTo(-1,-36);ctx.closePath();ctx.fillStyle=enemy?'#aa584a':'#578b84';ctx.fill();
    ctx.strokeStyle=enemy?'#5e332f':'#23524f';ctx.lineWidth=2;ctx.stroke();
    roundedRect(-16,10,32,36,15,'#524633');roundedRect(-11,14,22,32,11,'#312d27');
    ctx.strokeStyle='#524d42';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(27,-77);ctx.lineTo(27,-124);ctx.stroke();
    ctx.beginPath();ctx.moveTo(28,-119);ctx.lineTo(66,-109);ctx.lineTo(28,-97);ctx.closePath();ctx.fillStyle=enemy?'#c4674b':'#d8c289';ctx.fill();
    ctx.fillStyle=enemy?'#eac79f':'#3e5f50';ctx.font='bold 15px Georgia';ctx.textAlign='center';ctx.fillText('✦',43,-105);
    ctx.restore();
  }
  function drawBarracks(b) {
    const x=b.x,y=b.y;
    ctx.save();ctx.translate(x,y);
    ellipse(2,31,65,25,'#20382b8a');
    roundedRect(-47,-21,94,69,4,'#a99a7d');
    roundedRect(-41,-24,82,60,2,'#d2c09c');
    for(let i=-32;i<40;i+=20)roundedRect(i,1,9,17,2,'#637064');
    ctx.beginPath();ctx.moveTo(-56,-20);ctx.lineTo(0,-60);ctx.lineTo(56,-20);ctx.closePath();ctx.fillStyle='#6f5143';ctx.fill();
    ctx.beginPath();ctx.moveTo(-56,-20);ctx.lineTo(0,-60);ctx.lineTo(0,-20);ctx.closePath();ctx.fillStyle='#97725a';ctx.fill();
    ctx.strokeStyle='#b48c65';ctx.lineWidth=2;ctx.stroke();
    roundedRect(-13,12,26,34,2,'#594c3c');
    ctx.strokeStyle='#887356';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-51,33);ctx.lineTo(52,33);ctx.stroke();
    if(b.progress<1){
      ctx.globalAlpha=.95;
      ctx.strokeStyle='#edc787';ctx.lineWidth=4;
      ctx.strokeRect(-56,-51,112,102);
      ctx.beginPath();ctx.moveTo(-56,-50);ctx.lineTo(56,50);ctx.moveTo(56,-50);ctx.lineTo(-56,50);ctx.stroke();
    }
    ctx.restore();
  }
  function drawHealth(entity, x,y,width=36) {
    if(entity.hp >= entity.maxHp && entity.progress === undefined) return;
    if(entity.hp>=entity.maxHp && entity.progress===1) return;
    roundedRect(x-width/2,y,width,5,2,'#2d3028d9');
    roundedRect(x-width/2,y,width*clamp(entity.hp/entity.maxHp,0,1),5,2,entity.team==='player'?'#8dd6a4':'#e48173');
  }
  function drawBuilding(b) {
    if(!alive(b)) return;
    if(state.selected.includes(b)) {
      ellipse(b.x,b.y+10,b.type==='keep'?80:65,b.type==='keep'?50:44,'#e2cb7670');
      ellipse(b.x,b.y+10,b.type==='keep'?74:60,b.type==='keep'?46:40,'#3c6f4b79');
    }
    if(b.type==='keep')drawKeep(b);else drawBarracks(b);
    if(b.hp<b.maxHp || b.progress<1) drawHealth(b,b.x,b.y-(b.type==='keep'?138:75),b.type==='keep'?88:70);
  }
  function drawUnit(u) {
    ctx.save();ctx.translate(u.x,u.y);
    const isWorker=u.type==='worker',enemy=u.team==='enemy';
    if(state.selected.includes(u)){
      ellipse(0,2,19,10,'#d5cb735c');
      ctx.strokeStyle='#f8e4a5';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,2,19,10,0,0,TWO_PI);ctx.stroke();
    }
    ellipse(2,6,13,6,'#1a342670');
    const stride=Math.sin(state.time*10+u.id)*1.7;
    roundedRect(-7,-1,6,14,3,enemy?'#493132':'#353b32');
    roundedRect(2,-1,6,14,3,enemy?'#493132':'#353b32');
    ctx.fillStyle=isWorker?'#806f4c':enemy?'#953f39':'#386e73';
    ctx.beginPath();ctx.moveTo(-10,-12);ctx.lineTo(10,-12);ctx.lineTo(12,4);ctx.lineTo(-11,4);ctx.closePath();ctx.fill();
    roundedRect(-11,-12,22,4,2,isWorker?'#ae925c':enemy?'#c76a52':'#5c9a98');
    ctx.beginPath();ctx.arc(0,-18,8.7,0,TWO_PI);ctx.fillStyle='#deb68c';ctx.fill();
    if(isWorker){
      roundedRect(-10,-24,20,6,2,'#67513a');
      roundedRect(-8,-28,16,9,3,'#9e835b');
      // The axe doubles as a silhouette cue for gathering.
      ctx.strokeStyle='#73513b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(8,-8);ctx.lineTo(14,-25+stride);ctx.stroke();
      ctx.beginPath();ctx.moveTo(11,-25+stride);ctx.lineTo(20,-27+stride);ctx.lineTo(18,-17+stride);ctx.closePath();ctx.fillStyle='#c3c9bd';ctx.fill();
      if(u.carry) {ellipse(-9,-2,6,6,u.carryType==='gold'?'#e3bc6e':'#8b5d36');}
    } else {
      ctx.beginPath();ctx.arc(0,-21,9,Math.PI,TWO_PI);ctx.lineTo(9,-19);ctx.lineTo(-9,-19);ctx.fillStyle=enemy?'#82706c':'#a7afb0';ctx.fill();
      roundedRect(-11,-23,22,4,2,enemy?'#a9998e':'#c9cbd0');
      ctx.beginPath();ctx.ellipse(-12,-4,7,10,-.20,0,TWO_PI);ctx.fillStyle=enemy?'#b66d49':'#d4be7b';ctx.fill();
      ctx.beginPath();ctx.ellipse(-12,-4,4,7,-.20,0,TWO_PI);ctx.fillStyle=enemy?'#6a3b35':'#476a63';ctx.fill();
      ctx.strokeStyle='#cdd0cd';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(12,-5);ctx.lineTo(16,-25-(u.swing?8:0));ctx.stroke();
    }
    ctx.restore();
    if(u.hp<u.maxHp)drawHealth(u,u.x,u.y-36,32);
  }
  function drawParticles() {
    for(const p of state.particles) {
      ctx.save();ctx.globalAlpha=clamp(p.life/p.full,0,1);
      if(p.label){ctx.fillStyle=p.color;ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.fillText(p.label,p.x,p.y);}
      else ellipse(p.x,p.y,p.size,p.size,p.color);
      ctx.restore();
    }
  }
  function drawOrderLines() {
    for(const u of selectedAlive()) {
      if(u.team!=='player'||!u.order)continue;
      let goal=u.order;
      if(u.order.type==='harvest')goal=getNode(u.order.nodeId);
      if(u.order.type==='build'||u.order.type==='attack')goal=getEntity(u.order.targetId);
      if(!goal)continue;
      ctx.save();ctx.setLineDash([6,6]);ctx.lineWidth=1.6;ctx.strokeStyle='#ebdba7aa';
      ctx.beginPath();ctx.moveTo(u.x,u.y);ctx.lineTo(goal.x,goal.y);ctx.stroke();ctx.restore();
      ctx.strokeStyle='#f4d797ad';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(goal.x,goal.y,12+Math.sin(state.time*4)*2,0,TWO_PI);ctx.stroke();
    }
  }
  function drawBuildGhost() {
    if(state.mode!=='place-barracks'||!state.mouse)return;
    const x=state.mouse.x+state.camera.x,y=state.mouse.y+state.camera.y;
    const ok=validBuild(x,y);
    ctx.save();ctx.globalAlpha=.68;drawBarracks({x,y,progress:1});ctx.globalAlpha=1;
    ctx.strokeStyle=ok?'#cde3b1':'#ef7d75';ctx.lineWidth=3;ctx.setLineDash([8,5]);
    ctx.strokeRect(x-57,y-55,114,110);ctx.restore();
  }
  function drawMini() {
    const mw=mini.width,mh=mini.height,sx=mw/W,sy=mh/H;
    mctx.fillStyle='#375742';mctx.fillRect(0,0,mw,mh);
    mctx.strokeStyle='#a28a6280';mctx.lineWidth=11;
    mctx.beginPath();mctx.moveTo(45,79);mctx.bezierCurveTo(90,69,130,95,204,79);mctx.stroke();
    for(const n of state.nodes) {
      if(n.stock<=0)continue;
      mctx.fillStyle=n.type==='wood'?'#7cad72':'#dab869';
      mctx.beginPath();mctx.arc(n.x*sx,n.y*sy,n.type==='wood'?4:3,0,TWO_PI);mctx.fill();
    }
    for(const b of state.buildings) {
      if(!alive(b))continue;
      mctx.fillStyle=b.team==='player'?'#a8d2c6':'#e68b78';
      mctx.fillRect(b.x*sx-4,b.y*sy-4,8,8);
    }
    for(const u of state.units) {
      if(!alive(u))continue;
      mctx.fillStyle=u.team==='player'?'#e4e2b8':'#f17e65';
      mctx.fillRect(u.x*sx-1.5,u.y*sy-1.5,3,3);
    }
    mctx.strokeStyle='#f4e6b8';mctx.lineWidth=1.5;
    mctx.strokeRect(state.camera.x*sx,state.camera.y*sy,Math.min(mw,state.width*sx),Math.min(mh,state.height*sy));
  }
  function draw() {
    const dpr=Math.min(window.devicePixelRatio||1,2);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#4e6b4a';ctx.fillRect(0,0,state.width,state.height);
    ctx.save();ctx.translate(-state.camera.x,-state.camera.y);
    ground();
    for(const n of state.nodes){if(n.stock>0){if(n.type==='wood')drawTree(n);else drawGold(n);}}
    for(const b of [...state.buildings].sort((a,b)=>a.y-b.y))drawBuilding(b);
    for(const u of [...state.units].sort((a,b)=>a.y-b.y))drawUnit(u);
    drawOrderLines();drawParticles();drawBuildGhost();
    ctx.restore();
    // Soft framing, particularly in the corners, without an expensive filter.
    const grad=ctx.createRadialGradient(state.width/2,state.height/2,Math.min(state.width,state.height)*.28,
      state.width/2,state.height/2,Math.max(state.width,state.height)*.74);
    grad.addColorStop(0,'#0b241000');grad.addColorStop(1,'#091b1466');
    ctx.fillStyle=grad;ctx.fillRect(0,0,state.width,state.height);
    drawMini();
  }

  function startGame() {
    if(state.ended)resetWorld();
    state.running=true;state.ended=false;
    $('modal').classList.add('hidden');
    canvas.focus({preventScroll:true});
    toast('Seleziona un contadino e invialo a un bosco o a una miniera.');
  }
  function openHelp() {
    state.running=false;state.keys.clear();
    $('modalTitle').textContent='Come si gioca';
    $('modalSubtitle').textContent='Raccogli legno e oro con i contadini; costruisci una caserma, poi addestra armigeri per conquistare il castello rosso.';
    $('modalGuide').classList.remove('hidden');
    $('modalButton').innerHTML='Torna alla partita <span aria-hidden="true">→</span>';
    $('modal').classList.remove('hidden');
  }
  function restart() {
    resetWorld();
    $('modalTitle').textContent='Terre di Confine';
    $('modalSubtitle').textContent='Le tue terre sono minacciate. Raccogli risorse, costruisci una caserma, addestra soldati e conquista la fortezza rivale.';
    $('modalGuide').classList.remove('hidden');
    $('modalButton').innerHTML='Inizia la partita <span aria-hidden="true">→</span>';
    $('modal').classList.remove('hidden');
  }
  function setupInput() {
    $('modalButton').addEventListener('click', startGame);
    $('helpBtn').addEventListener('click', () => { if(!state.ended)openHelp(); });
    $('restartBtn').addEventListener('click', restart);
    $('commandButtons').addEventListener('click',e=>{
      const button=e.target.closest('button[data-command]');if(button&&!button.disabled)dispatchCommand(button.dataset.command);
    });
    window.addEventListener('resize',resize);
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('pointerdown',e=>{
      if(!state.running)return;
      canvas.setPointerCapture(e.pointerId);
      const p=screenPoint(e);
      state.pointer={ x:p.sx,y:p.sy,button:e.button, pointerType:e.pointerType,dragging:false, id:e.pointerId };
      state.mouse={x:p.sx,y:p.sy};
    });
    canvas.addEventListener('pointermove',e=>{
      const p=screenPoint(e);state.mouse={x:p.sx,y:p.sy};
      const v=state.pointer;
      if(!v||e.pointerId!==v.id||v.button!==0||v.pointerType==='touch')return;
      if(Math.hypot(p.sx-v.x,p.sy-v.y)>9 && state.mode==='select') {
        v.dragging=true;
        const bx=Math.min(v.x,p.sx),by=Math.min(v.y,p.sy);
        const box=$('dragBox');box.classList.remove('hidden');
        Object.assign(box.style,{left:`${bx}px`,top:`${by}px`,width:`${Math.abs(p.sx-v.x)}px`,height:`${Math.abs(p.sy-v.y)}px`});
      }
    });
    canvas.addEventListener('pointerup',e=>{
      const v=state.pointer;state.pointer=null;$('dragBox').classList.add('hidden');
      if(!v||!state.running||e.pointerId!==v.id)return;
      const p=screenPoint(e), world=worldPoint(p);
      if(v.button===2){orderUnits(world.x,world.y);return;}
      if(v.button!==0)return;
      if(state.mode==='place-barracks'){placeBarracks(world.x,world.y);return;}
      if(v.dragging){
        const p1=worldPoint({sx:Math.min(v.x,p.sx),sy:Math.min(v.y,p.sy)});
        const p2=worldPoint({sx:Math.max(v.x,p.sx),sy:Math.max(v.y,p.sy)});
        const group=state.units.filter(u=>u.team==='player'&&alive(u)&&u.x>=p1.x&&u.x<=p2.x&&u.y>=p1.y&&u.y<=p2.y);
        state.selected=group;updateHud();return;
      }
      if(v.pointerType==='touch'){
        const thing=pick(world.x,world.y);
        if(selectedAlive().some(u=>u.team==='player'&&(u.type==='worker'||u.type==='soldier')) &&
          (!thing || thing.stock!==undefined || thing.team==='enemy')) {
          orderUnits(world.x,world.y);return;
        }
      }
      selectAt(world.x,world.y,e.shiftKey);
    });
    canvas.addEventListener('pointercancel',()=>{state.pointer=null;$('dragBox').classList.add('hidden');});
    mini.addEventListener('pointerdown',e=>{
      if(!state.running)return;
      const r=mini.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*W,y=(e.clientY-r.top)/r.height*H;
      centerCamera(x,y);
    });
    window.addEventListener('keydown',e=>{
      const key=e.key.toLowerCase();
      if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();
      if(e.key==='Escape'){cancelBuild();return;}
      if(key==='h'){if(state.running)openHelp();return;}
      if(!state.running||e.repeat&&['b','r'].includes(key))return;
      if(e.key===' '){centerCamera(keep('player').x,keep('player').y);return;}
      if(key==='b'){beginBuild();return;}
      if(key==='r'){
        const s=selectedAlive()[0];
        if(s?.type==='keep')recruit('worker');
        if(s?.type==='barracks')recruit('soldier');
        return;
      }
      state.keys.add(key==='arrowup'?'ArrowUp':key==='arrowdown'?'ArrowDown':key==='arrowleft'?'ArrowLeft':key==='arrowright'?'ArrowRight':key);
    });
    window.addEventListener('keyup',e=>{
      const key=e.key.toLowerCase();state.keys.delete(key==='arrowup'?'ArrowUp':key==='arrowdown'?'ArrowDown':key==='arrowleft'?'ArrowLeft':key==='arrowright'?'ArrowRight':key);
    });
    window.addEventListener('blur',()=>state.keys.clear());
  }
  let last=0;
  function frame(now){
    const dt=Math.min((now-last)/1000||0, .055);last=now;
    update(dt);draw();requestAnimationFrame(frame);
  }
  resize();resetWorld();setupInput();requestAnimationFrame(frame);
  // Expose a tiny read-only diagnostic surface for automated smoke tests.
  Object.defineProperty(window,'__rtsDebug',{value:{snapshot:()=>({running:state.running,time:state.time,wood:state.wood,gold:state.gold,units:state.units.length,buildings:state.buildings.length,wave:state.wave,selected:state.selected.map(u=>u.type)})},configurable:false});
})();
