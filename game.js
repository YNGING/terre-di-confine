/* Terre di Confine — original, dependency-free HTML5 mini RTS. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d', { alpha: false });
  const mini = $('minimap'), mctx = mini.getContext('2d');
  const TWO_PI = Math.PI * 2;
  let level = window.RTS_LEVELS[0], W = level.width, H = level.height;
  const RULES = window.RTS_RULES, COST = RULES.costs, TYPE_NAMES = RULES.names;
  const state = {
    wood: 200, gold: 110, popCap: RULES.population, time: 0, wave: 1,
    waveIn: RULES.firstWave, running: false, ended: false, mode: 'select',
    units: [], buildings: [], nodes: [], decorations: [], particles: [],
    selected: [], camera: { x: 0, y: 0 }, width: 900, height: 600,
    pointer: null, mouse: { x: 0, y: 0 }, keys: new Set(),
    toastUntil: 0, toastHeld: false, lastHud: -1, pings: [], alertAt: {}, groups: {}, lastGroup: null, lastClick: null, placing: null, lastStandDone: false, idSequence: 0, effects: [], outpost: null, outposts: [], postIndex: 0, nextLevel: false, wavePlan: null, convoy: null, controlTime: 0, survival: null,
    stats: { killed: 0, trained: 0, gathered: 0 }
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
  const playerUnits = () => state.units.filter(u => u.team === 'player' && u.hp > 0 && u.type !== 'cart');
  const alive = (item) => item && item.hp > 0;
  const fmtTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const canPay = (price) => state.wood >= price.wood && state.gold >= price.gold;
  const isUnit = (entity) => !!entity && !!RULES.units[entity.type];
  const commandable = u => isUnit(u) && u.type !== 'cart';
  const isMission = () => !!(level.convoy || level.control || level.survival);
  const activeCart = () => state.units.find(u => u.id === state.convoy?.cartId && alive(u));
  const heldSanctuaries = () => state.outposts.filter(p => p.role === 'sanctuary' && p.owner === 'player' && !p.contested).length;
  const controlRate = () => !level.control || heldSanctuaries() < level.control.required ? 0 : heldSanctuaries() === state.outposts.length ? level.control.allRate : 1;
  const reservedPopulation = () => state.buildings.filter(alive).reduce((sum, b) => sum + b.queue.length, 0);
  const canRecruit = (price) => canPay(price) && playerUnits().length + reservedPopulation() < state.popCap;
  const canTrainMage = () => level.magesUnlocked || state.outposts.some(p => p.owner === 'player' && (!p.role || ['arcane', 'checkpoint', 'sanctuary'].includes(p.role)));
  const usableDepot = p => p.owner === 'player' && !p.contested && (!p.role || ['market', 'checkpoint', 'sanctuary'].includes(p.role));
  const citadelShield = () => level.shieldPerTower ? state.outposts.filter(p => isEnemy(p.owner)).length * level.shieldPerTower : 0;
  const isEnemy = team => team === 'enemy' || team === 'enemy2';
  const teamName = team => team === 'player' ? 'Alleato' : team === 'neutral' ? 'Neutrale' : level.factionName || level.enemies.find(e => e.team === team)?.name || 'Nemico';
  const teamColor = team => team === 'player' ? '#91d6b8' : team === 'enemy2' ? '#c49aed' : team === 'enemy' ? '#e98b7b' : '#dfcb8e';
  // A wave slot is one front index, or an array of fronts that march together (pincer).
  const waveSlot = wave => {
    const i = wave - 1, intro = level.waveIntro || [], order = level.waveOrder || [0];
    return i < intro.length ? intro[i] : order[(i - intro.length) % order.length];
  };
  const waveFronts = () => [].concat(waveSlot(state.wave)).map(i => level.enemies[i]);
  const waveFront = () => waveFronts()[0];
  const isSiege = () => level.kind === 'siege';
  const citadelName = () => level.enemies[0].name;
  const shieldPct = () => Math.round((level.shieldPerTower || 0) * 100);
  const countWord = n => ['nessuna', 'una', 'due', 'tre', 'quattro', 'cinque'][n] || String(n);
  const arrowFactor = victim => RULES.units[victim.type]?.arrowArmor ?? 1;
  // Each uncontested forge adds its bonus to every unit of the team holding it.
  const forgeMultiplier = team => 1 + state.outposts
    .filter(p => p.role === 'forge' && p.owner === team && !p.contested)
    .reduce((sum, p) => sum + (p.damageBonus || 0), 0);
  const now = () => Date.now();
  const buildable = () => level.buildings || ['barracks'];
  const BUILD_TEXT = { barracks: { the: 'la caserma', key: 'B', icon: '⌂' }, depot: { the: 'il magazzino', key: 'M', icon: '▣' } };
  const priceText = c => `${c.wood} legno${c.gold ? ` · ${c.gold} oro` : ''}`;
  const frontHome = front => state.buildings.find(b => b.frontIndex === level.enemies.indexOf(front));
  const spend = (price) => { if (!canPay(price)) return false; state.wood -= price.wood; state.gold -= price.gold; return true; };
  const keep = (team) => state.buildings.find(b => b.type === 'keep' && b.team === team);
  const named = (entity) => `${entity.frontName || TYPE_NAMES[entity.type] || entity.type}${isEnemy(entity.team) ? ` · ${teamName(entity.team)}` : ''}`;

  const villages = () => state.buildings.filter(b => b.type === 'village');
  const livingVillages = () => villages().filter(alive);
  const waveEnemies = () => state.units.filter(u => alive(u) && isEnemy(u.team));
  const nextSurvivalWave = () => level.survival?.waves[state.survival?.cleared];
  const survivalTarget = u => getEntity(u.order?.targetId) || keep('player');
  function waveDescription(wave) {
    return wave ? `${wave.name} · ${wave.groups.map(g => `${level.enemies[g.entry].name} → ${livingVillages().find(v => v.villageId === g.target)?.frontName.replace('Borgo della ', '').replace('Borgo delle ', '') || 'castello'}`).join(' / ')}` : 'Tutte le ondate superate';
  }
  function startSurvivalWave() {
    if (!level.survival || !state.running || state.ended || state.survival.phase === 'active') return;
    const wave = nextSurvivalWave();
    if (!wave) return;
    state.survival.phase = 'active'; state.wave = state.survival.cleared + 1; state.waveIn = 0;
    for (const group of wave.groups) {
      const entry = level.enemies[group.entry];
      const target = livingVillages().find(b => b.villageId === group.target) || keep('player');
      let i = 0;
      for (const [type, count] of Object.entries(group.units)) for (let j = 0; j < count; j++, i++) {
        createUnit(type, 'enemy', clamp(entry.x + (i % 4 - 1.5) * 30, 18, W - 18), clamp(entry.y + Math.floor(i / 4) * 28, 18, H - 18),
          { type: 'survival', targetId: target.id, harass: type === 'knight' && group.target === 'keep' });
      }
    }
    toast(`Ondata ${state.wave}/${level.survival.waves.length}: ${waveDescription(wave)}`);
    updateHud();
  }
  function updateSurvivalClock(dt) {
    if (state.survival.phase === 'active') return;
    state.waveIn = Math.max(0, state.waveIn - dt);
    if (!state.survival.warned && state.waveIn <= 20) {
      state.survival.warned = true;
      toast(`Fra ${Math.ceil(state.waveIn)}s: ${waveDescription(nextSurvivalWave())}`);
    }
    if (state.waveIn <= 0) startSurvivalWave();
  }
  function updateSurvival() {
    const s = state.survival, rules = level.survival;
    if (!alive(keep('player'))) { finish(false); return; }
    if (level.villages && !livingVillages().length) { finish(false, 'villages'); return; }
    if (s.phase === 'active' && !waveEnemies().length) {
      const wave = rules.waves[s.cleared], reward = wave.major ? rules.majorReward : rules.reward;
      s.cleared++; state.wood += reward.wood; state.gold += reward.gold;
      for (const b of livingVillages()) {
        if (b.villageId === 'harvest') { state.wood += 30; state.gold += 20; }
        if (b.villageId === 'militia' && s.cleared % 2 === 0) b.pendingRecruits++;
      }
      if (s.cleared === rules.waves.length) { finish(true); return; }
      s.phase = 'rest'; s.warned = false; state.wave = s.cleared + 1;
      state.waveIn = wave.major ? rules.majorRest : rules.rest;
      toast(`Ondata superata! +${reward.wood} legno, +${reward.gold} oro. Tregua: ${state.waveIn}s.`);
    }
    // Reservations in training queues take priority; a saved reinforcement waits for a free place.
    for (const b of livingVillages()) {
      while (b.pendingRecruits > 0 && playerUnits().length + reservedPopulation() < state.popCap) {
        b.pendingRecruits--;
        createUnit('soldier', 'player', b.x + 80, b.y + 65, { type: 'hold' });
        state.stats.trained++;
        toast('Un armigero della milizia è pronto al villaggio.', true);
      }
    }
  }
  function focusSurvivalEnemy() {
    if (!level.survival || !state.running) return;
    const target = waveEnemies().sort((a, b) => dist(a, keep('player')) - dist(b, keep('player')))[0];
    if (target) { centerCamera(target.x, target.y); select(target); }
  }
  function focusVillage() {
    if (!level.villages || !state.running) return;
    const list = livingVillages(), selected = state.selected[0];
    const target = list[(list.indexOf(selected) + 1) % list.length];
    if (target) { centerCamera(target.x, target.y); select(target); }
  }
  function updateSurvivalHud() {
    const s = state.survival, active = s.phase === 'active', next = nextSurvivalWave();
    $('missionProgress').max = level.survival.waves.length; $('missionProgress').value = s.cleared;
    $('waveText').textContent = active ? `ONDATA ${state.wave}/${level.survival.waves.length} · ${waveEnemies().length} NEMICI` : `${s.phase === 'preparation' ? 'PREPARAZIONE' : 'TREGUA'} · ${Math.ceil(state.waveIn)}s`;
    const composition = {}, troopNames = { raider: 'predoni', archer: 'arcieri', knight: 'cavalieri', mage: 'maghi', ram: 'arieti', champion: 'campioni' };
    for (const group of next?.groups || []) for (const [type, count] of Object.entries(group.units)) composition[type] = (composition[type] || 0) + count;
    $('waveNotice').textContent = `${active ? 'In corso' : 'Prossima'}${next?.major ? ' · GRANDE ASSALTO' : ''}: ${waveDescription(next)}${next ? ' · ' + Object.entries(composition).map(([type, count]) => `${troopNames[type]} ×${count}`).join(', ') : ''}`;
    $('objectiveText').textContent = `Ondate superate ${s.cleared}/${level.survival.waves.length} · ${level.villages ? `villaggi ${livingVillages().length}/2` : 'difendi il castello'}`;
    $('missionStatus').textContent = level.villages ? villages().map(b => `${b.frontName.replace('Borgo delle ', '').replace('Borgo della ', '')}: ${alive(b) ? Math.ceil(b.hp) + ' PV' + (b.pendingRecruits ? ` · ${b.pendingRecruits} rinforzi in attesa` : '') : 'perduto'}`).join(' / ') : active ? 'Elimina tutti i nemici per ottenere la tregua.' : 'Ricostituisci l’esercito e ripara il castello.';
    $('advanceWaveBtn').disabled = !state.running || state.ended || active;
    $('focusEnemyBtn').disabled = !state.running || state.ended || !waveEnemies().length;
    $('focusVillageBtn').disabled = !state.running || state.ended;
  }

  function spawnCart() {
    const start = level.convoy.route[0];
    const cart = createUnit('cart', 'player', start.x, start.y);
    cart.routeIndex = 0; cart.waiting = true; cart.moving = false;
    state.convoy.cartId = cart.id;
    return cart;
  }
  function cartCanDepart(cart) {
    if (!cart.waiting) return true; // A manual halt along a segment can always resume.
    const stop = level.convoy.route[cart.routeIndex];
    return stop.post === undefined || usableDepot(state.outposts[stop.post]);
  }
  function convoyAction() {
    if (!level.convoy || !state.running || state.ended) return;
    let cart = activeCart();
    if (!cart) {
      if (!spend(level.convoy.replacementCost)) { toast('Risorse insufficienti per sostituire il carro.'); return; }
      cart = spawnCart(); toast('Carro sostitutivo pronto alla partenza.');
    } else if (cart.moving) {
      cart.moving = false; toast('Carro fermato. Riparti quando la strada è sicura.');
    } else if (!cartCanDepart(cart)) {
      toast('Per ripartire, conquista il presidio e libera la zona dai nemici.');
    } else {
      cart.moving = true; cart.waiting = false;
      toast(`Carro in marcia verso ${level.convoy.route[cart.routeIndex + 1].name}.`);
    }
    updateHud();
  }
  function focusCart() {
    if (!level.convoy || !state.running) return;
    const cart = activeCart(), point = cart || level.convoy.route[0];
    centerCamera(point.x, point.y); if (cart) select(cart);
  }
  function updateMissions(dt) {
    if (!state.running || state.ended) return;
    if (level.survival) { updateSurvival(); return; }
    if (level.convoy) {
      const cart = activeCart();
      if (cart?.moving && moveTo(cart, level.convoy.route[cart.routeIndex + 1], 0, dt)) {
        cart.routeIndex++; cart.moving = false; cart.waiting = true;
        if (cart.routeIndex === level.convoy.route.length - 1) {
          // Delivery retires this cart without counting as a casualty or occupying population.
          cart.hp = 0; state.convoy.cartId = null; state.convoy.delivered++;
          state.units = state.units.filter(u => u !== cart);
          if (state.convoy.delivered >= level.convoy.goal) { finish(true); return; }
          spawnCart(); toast(`Consegna ${state.convoy.delivered}/${level.convoy.goal}! Un nuovo carro gratuito ti attende alla base.`);
        } else toast(`Carro in sosta: ${level.convoy.route[cart.routeIndex].name}. Scorta e presidio pronti? Premi Riprendi.`);
      }
    }
    if (level.control) {
      state.controlTime = Math.min(level.control.goal, state.controlTime + dt * controlRate());
      if (state.controlTime >= level.control.goal - 1e-8) { state.controlTime = level.control.goal; finish(true); }
    }
  }
  function updateMissionHud() {
    if (!isMission() || level.survival) return;
    const progress = $('missionProgress');
    if (level.convoy) {
      const cart = activeCart(), ready = cart && cartCanDepart(cart);
      progress.max = level.convoy.goal; progress.value = state.convoy.delivered;
      $('missionStatus').textContent = !cart ? 'Carro perso: serve un sostituto.' : cart.moving
        ? `In marcia · ${Math.ceil(cart.hp)} PV` : cart.waiting && !ready
          ? `Conquista ${level.convoy.route[cart.routeIndex].name} per ripartire.` : `In sosta · ${Math.ceil(cart.hp)} PV`;
      $('convoyBtn').textContent = !cart ? `Sostituisci · ${priceText(level.convoy.replacementCost)}` : cart.moving ? 'Ferma carro' : ready ? 'Avvia / riprendi' : 'Presidio da liberare';
      $('convoyBtn').disabled = !state.running || state.ended || (!cart ? !canPay(level.convoy.replacementCost) : !cart.moving && !ready);
    } else {
      const rate = controlRate();
      progress.max = level.control.goal; progress.value = state.controlTime;
      $('missionStatus').textContent = `${heldSanctuaries()}/3 santuari sicuri · ${rate ? `rituale ×${String(rate).replace('.', ',')}` : 'rituale fermo'}`;
    }
  }

  function createUnit(type, team, x, y, order = null) {
    const c = RULES.units[type], u = { id: uid(), type, team, x, y, hp: c.hp, maxHp: c.hp,
      speed: c.speed, damage: c.damage, attackTime: c.attackTime, range: c.range,
      cooldown: 0, order, carry: 0, carryType: null, harvestClock: 0, facing: 1, swing: 0 };
    state.units.push(u);
    return u;
  }
  function createBuilding(type, team, x, y, progress = 1) {
    const hp = type === 'keep' ? (isEnemy(team) ? level.enemyHp : 1000) : type === 'camp' ? level.campHp
      : type === 'bastion' ? 900 : RULES.buildings[type]?.hp ?? 360;
    const b = { id: uid(), type, team, x, y, hp: Math.max(75, hp * progress),
      maxHp: hp, progress, queue: [], rally: null, cooldown: 0 };
    state.buildings.push(b);
    return b;
  }
  function addNode(type, x, y, stock) {
    const base = type === 'wood' ? 500 : 380, amount = stock ?? base, rich = amount > base;
    state.nodes.push({ id: uid(), type, x, y, r: (type === 'wood' ? 47 : 36) * (rich ? 1.2 : 1), stock: amount, rich });
  }

  function resetWorld(levelId = level.id) {
    level = window.RTS_LEVELS.find(l => l.id === levelId) || window.RTS_LEVELS[0];
    W = level.width; H = level.height;
    state.nextLevel = false; state.postIndex = 0; state.wavePlan = null;
    state.idSequence = 0; state.wood = level.start?.wood ?? 200; state.gold = level.start?.gold ?? 110; state.time = 0;
    state.wave = 1; state.waveIn = level.firstWave; state.running = false; state.ended = false;
    state.mode = 'select'; state.units = []; state.buildings = []; state.nodes = [];
    state.particles = []; state.effects = []; state.selected = []; state.toastUntil = 0; state.toastHeld = false;
    state.pings = []; state.alertAt = {}; state.groups = {}; state.lastGroup = null; state.lastClick = null;
    state.placing = null; state.lastStandDone = false; state.controlTime = 0;
    state.convoy = level.convoy ? { delivered: 0, lost: 0, cartId: null } : null;
    state.survival = level.survival ? { phase: 'preparation', cleared: 0, warned: false } : null;
    $('gameShell').dataset.mission = level.survival ? (level.villages ? 'villages' : 'survival') : level.convoy ? 'escort' : level.control ? 'control' : '';
    for (const [id, visible] of [['survivalControls', level.survival], ['focusVillageBtn', level.villages]]) {
      if (visible) $(id).classList.remove('hidden'); else $(id).classList.add('hidden');
    }
    if (isMission()) $('missionPanel').classList.remove('hidden'); else $('missionPanel').classList.add('hidden');
    if (level.convoy) $('convoyControls').classList.remove('hidden'); else $('convoyControls').classList.add('hidden');
    state.pointer = null; state.keys.clear(); state.popCap = level.population;
    state.outposts = level.posts.map((p, i) => ({ ...RULES.outpost, ...p, id: `post-${i}`,
      type: 'outpost', control: p.initialOwner ? -1 : 0, owner: p.initialOwner || 'neutral',
      capturingTeam: p.initialOwner || null, contested: false, incomeClock: 0, cooldown: 0 }));
    state.outpost = state.outposts[0]; // First post remains the level-1 diagnostic alias.
    $('dragBox').classList.add('hidden');
    state.stats = { killed: 0, trained: 0, gathered: 0 }; state.lastHud = -1;
    const [x, y] = level.player;
    createBuilding('keep', 'player', x, y);
    for (const v of level.villages || []) {
      const b = createBuilding('village', 'player', v.x, v.y);
      b.hp = b.maxHp = v.hp; b.villageId = v.id; b.frontName = v.name; b.benefit = v.benefit; b.pendingRecruits = 0;
    }
    for (const e of level.enemies) {
      if (e.spawnOnly) continue;
      const b = createBuilding(e.type || 'keep', e.team, e.x, e.y);
      if (e.hp) b.hp = b.maxHp = e.hp;
      b.frontIndex = level.enemies.indexOf(e);
      if (level.factionName) b.frontName = e.name;
      const guards = [['raider', -113, -86], ['raider', -110, 97], ['archer', -20, 55]];
      for (const [type, dx, dy] of e.type === 'camp' ? guards.slice(0, 2) : guards.concat(level.extraGuards || [])) {
        createUnit(type, e.team, e.x + dx, e.y + dy, { type: 'guard', x: e.x + dx, y: e.y + dy });
      }
    }
    for (const [bx, by] of level.bastions || []) createBuilding('bastion', level.enemies[0].team, bx, by);
    createUnit('worker', 'player', x - 100, y + 81);
    createUnit('worker', 'player', x - 12, y + 113);
    createUnit('worker', 'player', x + 85, y + 85);
    createUnit('soldier', 'player', x + 125, y - 57);
    createUnit('soldier', 'player', x + 145, y + 18);
    if (level.convoy) spawnCart();
    level.wood.forEach(p => addNode('wood', ...p));
    level.gold.forEach(p => addNode('gold', ...p));
    state.decorations = [];
    // Scatter detail in proportion to the map area (750 on the first map).
    for (let i = 0, n = Math.round(750 * W * H / (2400 * 1600)); i < n; i++) {
      const x = 35 + hash(i, 8) * (W - 70), y = 35 + hash(i, 13) * (H - 70);
      state.decorations.push({ x, y, r: hash(i, 4), kind: hash(i, 6) });
    }
    centerCamera(x + (state.width < 800 ? 20 : 230), y - 5);
    $('placementNotice').classList.add('hidden');
    $('cancelOrderBtn').classList.add('hidden');
    const roleGuide = { market: 'Mercato: oro e deposito', arcane: 'Arcana: maghi', guard: 'Guardia: frecce', forge: 'Forgia: +20% danni' };
    $('conquestGuide').textContent = level.missionGuide || (isSiege() ? `${level.posts.map(p => p.guide || roleGuide[p.role]).join('. ')}. Ogni torre sottratta al nemico riduce lo scudo della ${citadelName().toLowerCase()} del ${shieldPct()}%.${buildable().includes('depot') ? ' Magazzino: M, vicino al castello o a un punto alleato.' : ''}` : 'Costruisci la caserma (B). Armigero: R, arciere: Q, mago: E. Tieni truppe nell’avamposto per sbloccare i maghi.');
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
  // Ambient notices (a unit is ready) never cover a visible order, wave or alert message.
  function toast(text, ambient = false) {
    if (ambient && state.toastHeld && state.toastUntil > state.time) return;
    $('toast').textContent = text;
    $('toast').classList.add('visible');
    state.toastUntil = state.time + 4.1; state.toastHeld = !ambient;
  }
  function raiseAlert(victim) {
    const kind = victim.type === 'village' ? `village-${victim.id}` : ['keep', 'barracks', 'depot', 'cart'].includes(victim.type) ? victim.type : 'worker';
    if (state.time - (state.alertAt[kind] ?? -Infinity) < RULES.alertCooldown) return;
    state.alertAt[kind] = state.time;
    state.pings.push({ x: victim.x, y: victim.y, life: 3, full: 3 });
    toast(victim.type === 'village' ? `${victim.frontName} è sotto attacco!` : { keep: 'Il castello è sotto attacco!', barracks: 'Una caserma è sotto attacco!', depot: 'Un magazzino è sotto attacco!', worker: 'Contadini sotto attacco!', cart: 'Il carro è sotto attacco!' }[kind]);
  }
  function select(item, multi = false) {
    if (!multi) state.selected = [];
    if (item && (alive(item) || item.type === 'outpost') && (!multi || !state.selected.includes(item))) state.selected.push(item);
    state.mode = 'select'; $('placementNotice').classList.add('hidden');
    $('cancelOrderBtn').classList.add('hidden');
    updateHud();
  }
  function selectedAlive() {
    state.selected = state.selected.filter(item => alive(item) || item.type === 'outpost');
    return state.selected;
  }
  function commandButton(action, label, description, icon, disabled = false) {
    return `<button class="command-button" data-command="${action}" ${disabled ? 'disabled' : ''}><span><b>${label}</b><small>${description}</small></span><span class="command-symbol">${icon}</span></button>`;
  }
  function buildButtons() {
    return buildable().map(type => commandButton(type === 'barracks' ? 'build' : `build-${type}`, `Costruisci ${TYPE_NAMES[type].toLowerCase()}`,
      `${priceText(COST[type])} · ${BUILD_TEXT[type].key}`, BUILD_TEXT[type].icon, !canPay(COST[type]))).join('') + (level.repairs ? commandButton('repair', 'Ripara edificio', '1 legno → 5 PV · T', '⚒') : '');
  }
  function updateHud() {
    $('wood').textContent = state.wood;
    $('gold').textContent = state.gold;
    const reserved = reservedPopulation();
    $('population').textContent = `${playerUnits().length}${reserved ? ` +${reserved}` : ''} / ${state.popCap}`;
    $('population').title = 'Unità vive + posti prenotati in coda';
    $('timer').textContent = fmtTime(state.time);
    updateMissionHud();
    const front = waveFront(), live = waveFronts().filter(f => alive(frontHome(f)));
    $('waveText').textContent = `${level.kind !== 'outpost' ? (live.length ? live.map(f => f.name.toUpperCase()).join(' + ') : 'TREGUA') + ' · ' : ''}ONDATA ${state.wave} · ${Math.ceil(Math.max(0, state.waveIn))}s`;
    const plan = state.wavePlan, announcedPost = state.outposts.find(p => p.id === plan?.postId);
    $('waveNotice').textContent = plan && isMission() && live.length ? (level.control ? 'Assalto: ' + live.map(f => state.outposts[f.post].name).join(' + ') : live.some(f => f.troops === 'knight') ? 'Cavalieri in arrivo: proteggi il carro!' : 'Incursione verso i presidi') : plan?.counter && alive(frontHome(front)) ? `Contrattacco: ${announcedPost.name}` : plan && live.length > 1 ? `Tenaglia: ${live.map(f => f.name).join(' + ')}` : '';
    const remaining = state.buildings.filter(b => b.type === 'keep' && isEnemy(b.team) && alive(b)).length;
    const fortressTotal = level.enemies.filter(e => !e.type).length, camps = state.buildings.filter(b => b.type === 'camp');
    $('objectiveText').textContent = level.convoy ? `Carri consegnati ${state.convoy.delivered}/${level.convoy.goal} · proteggi il castello` : level.control ? `Sigilli ${Math.floor(state.controlTime)}/${level.control.goal}s · ${heldSanctuaries()}/3 sicuri` : isSiege() ? `${citadelName()} · scudo ${Math.round(citadelShield()*100)}% · campi attivi ${camps.filter(alive).length}/${camps.length}` : level.kind === 'outpost' ? 'Distruggi la fortezza nemica' : `Distruggi le fortezze rivali · ${fortressTotal - remaining}/${fortressTotal}`;
    if (level.survival) updateSurvivalHud();
    $('levelLabel').textContent = `LIVELLO ${level.id} · ${level.name.toUpperCase()}`;
    const post = state.selected.length === 1 && state.selected[0].type === 'outpost' ? state.selected[0] : state.outposts[state.postIndex];
    const ownerLabel = teamName(post.owner);
    $('outpostStatus').textContent = `${level.kind !== 'outpost' ? `${level.control ? 'Santuari' : level.convoy ? 'Presidi' : isSiege() ? 'Torri' : 'Avamposti'} ${state.outposts.filter(p => p.owner === 'player').length}/${state.outposts.length} · ${post.name.replace(/^(Avamposto|Torre|Presidio|Santuario) /, '')}` : 'Avamposto'}: ${post.contested ? 'conteso' : ownerLabel.toLowerCase()} · ${Math.round(Math.abs(post.control) * 100)}%`;
    $('outpostStatus').title = level.kind !== 'outpost' ? `Clicca per scorrere e selezionare i ${state.outposts.length} punti di controllo` : 'Centra e seleziona l’avamposto';
    $('outpostStatus').dataset.owner = post.contested ? 'contested' : post.owner;
    $('idleBtn').textContent = `⚒ Inattivi: ${playerUnits().filter(u => u.type === 'worker' && !u.order).length}`;
    const sel = selectedAlive(), first = sel[0];
    const title = $('selectionTitle'), description = $('selectionDescription');
    const stats = $('selectionStats'), actions = $('commandButtons'), hint = $('selectionHint');
    let cmd = '', badges = '';
    if (!sel.length) {
      title.textContent = 'Nessuna selezione';
      description.textContent = level.missionGuide || (isSiege() ? `Conquista le torri per indebolire lo scudo. Distruggi gli accampamenti per fermare i rinforzi.${state.outposts.some(p => p.role === 'forge') ? ' La Forgia potenzia chi la controlla.' : ''}${buildable().includes('depot') ? ' Costruisci magazzini (M) vicino ai giacimenti lontani.' : ''} La caduta della ${citadelName().toLowerCase()} conclude l’assedio.` : level.kind === 'outpost' ? 'Sviluppa la base e conquista l’avamposto centrale per ottenere oro e reclutare maghi.' : 'Conquista gli avamposti per oro e depositi. Ne basta uno per reclutare maghi. Rossi e Viola sono rivali: elimina entrambe le fortezze.');
      hint.textContent = 'Clic: seleziona · doppio clic: stesso tipo · clic destro: ordina · G: esercito · I: inattivo · Ctrl+1…5: gruppi';
    } else if (first.type === 'outpost' && sel.length === 1) {
      title.textContent = post.name;
      description.textContent = post.bonus || `Mantieni truppe nel cerchio per conquistarlo. Offre ${post.gold} oro ogni ${post.incomeTime}s, deposito risorse e accesso ai maghi.`;
      badges = `<span class="stat-pill">${ownerLabel} · ${Math.round(Math.abs(post.control) * 100)}%</span>`;
      if (post.contested) badges += `<span class="stat-pill">${post.role === 'guard' ? 'Contesa: tiro sospeso' : post.role === 'arcane' ? 'Contesa: conquista sospesa' : post.role === 'forge' ? 'Contesa: bonus sospeso' : 'Conteso: rendita e deposito sospesi'}</span>`;
      hint.textContent = isSiege() ? `Solo i combattenti conquistano: 12s per neutralizzare, poi 12s per ottenere il controllo. Ogni torre nemica riduce i danni alla ${citadelName().toLowerCase()} del ${shieldPct()}%.` : 'Solo le unità militari conquistano. Il nemico può riprenderlo; i maghi già in coda restano disponibili.';
    } else if (sel.length > 1) {
      title.textContent = `${sel.length} elementi selezionati`;
      description.textContent = 'Sposta il gruppo, avanza combattendo o mantieni la posizione.';
      const workers = sel.filter(e => e.type === 'worker' && e.team === 'player');
      const fighters = sel.filter(e => commandable(e) && e.type !== 'worker' && e.team === 'player');
      badges = `<span class="stat-pill">⚒ ${workers.length} contadini</span><span class="stat-pill">⚔ ${fighters.length} combattenti</span>`;
      if (workers.length) cmd += buildButtons();
      hint.textContent = 'Muovi permette la ritirata. Avanza ingaggia i nemici lungo il percorso.';
    } else {
      const u = first, friendly = u.team === 'player';
      title.textContent = named(u);
      badges = `<span class="stat-pill">♥ ${Math.max(0, Math.ceil(u.hp))} / ${u.maxHp} PV</span>`;
      if (isUnit(u)) {
        const descriptions = {
          worker: 'Raccoglie e deposita risorse; passa automaticamente a un giacimento dello stesso tipo quando si esaurisce.',
          soldier: 'Fanteria resistente. Protegge arcieri e maghi e assalta gli edifici.',
          archer: 'Tiro a distanza: efficace dietro la fanteria, vulnerabile in mischia. Danni ridotti agli edifici.',
          mage: 'Esplosione arcana ogni 3s: 30 danni al bersaglio e 18 ai nemici vicini. Fragile, debole contro gli edifici.',
          raider: 'Predone da mischia. Minaccia lavoratori, avamposto e castello.',
          ram: 'Ariete d’assedio: ignora le unità e sfonda gli edifici. Corazzato: frecce di arcieri, castello e torri fanno metà danni. Fermalo con armigeri e maghi.',
          knight: 'Cavaliere: velocissimo, razzia contadini e magazzini lontani dal castello. Tieni qualche armigero o arciere vicino ai raccoglitori.',
          champion: 'Campione della Guardia reale: lento ma fortissimo in mischia. Circondalo e colpiscilo da lontano.',
          cart: 'Carro della missione: non combatte, non conquista e non occupa popolazione. Segue la strada e si ferma ai presidi. Usa i pulsanti del convoglio sopra la minimappa.'
        };
        description.textContent = descriptions[u.type];
        if (u.carry) badges += `<span class="stat-pill">Trasporta ${u.carry} ${u.carryType === 'wood' ? 'legno' : 'oro'}</span>`;
        if (u.type !== 'worker' && u.type !== 'cart') badges += `<span class="stat-pill">⚔ ${u.damage} · portata ${u.range}</span>`;
        if (forgeMultiplier(u.team) > 1) badges += `<span class="stat-pill">Forgia +${Math.round((forgeMultiplier(u.team) - 1) * 100)}% danni</span>`;
        if (friendly && u.type === 'worker') cmd += buildButtons();
        hint.textContent = u.order?.type === 'repair' ? (state.wood ? 'Ripara l’edificio: 1 legno per 5 PV ogni mezzo secondo.' : 'Riparazione in attesa: raccogli legno per proseguire.') : u.type === 'cart' ? 'Usa Avvia / riprendi o Ferma carro sopra la minimappa. I normali ordini militari non cambiano il percorso.' : u.order?.type === 'hold' ? 'Mantiene la posizione: attacca solo a portata, senza inseguire.' : friendly ? 'Clic destro: ordine contestuale · F: avanza · X: mantieni · vicino al castello si cura' : 'Unità nemica: clic destro con le tue truppe per attaccarla.';
      } else {
        description.textContent = u.type === 'village' ? `${u.benefit} Deposito e basi avanzate. Riparabile dai contadini; non può essere ricostruito.` : u.type === 'camp' ? (level.enemies[u.frontIndex]?.troops === 'knight' ? 'Scuderie: inviano cavalieri contro contadini e magazzini. Distruggile per fermare le razzie.' : 'Accampamento di rinforzi. Distruggilo per eliminare le sue ondate: i suoi turni resteranno vuoti.')
          : u.type === 'bastion' ? `Bastione: frecce da ${RULES.defenses.bastion.enemyDamage} danni ogni ${String(RULES.defenses.bastion.cooldown).replace('.', ',')}s, portata ${RULES.defenses.bastion.range}. Non serve abbatterlo per vincere, ma protegge la cittadella.`
          : u.type === 'depot' ? 'Magazzino: i contadini vi depositano legno e oro. Costruiscilo vicino ai giacimenti lontani; i cavalieri nemici lo prendono di mira.' : isSiege() && u.type === 'keep' && isEnemy(u.team) ? `${citadelName()}: scudo ${Math.round(citadelShield()*100)}%. Ogni torre nemica riduce i danni del ${shieldPct()}%; neutralizzala o conquistala per indebolire la protezione.` : u.type === 'keep'
          ? (friendly ? 'Il castello difende la zona con frecce automatiche, recluta contadini e cura le unità vicine fuori combattimento. Raduno su un bosco o una miniera: i nuovi contadini raccolgono subito.' : 'Il castello difende la zona con frecce automatiche e recluta contadini.')
          : 'Recluta armigeri, arcieri e maghi. Ogni edificio può accodare fino a 5 unità.';
        if (u.progress < 1) badges += `<span class="stat-pill">Costruzione: ${Math.floor(u.progress * 100)}%</span>`;
        if (friendly && (u.type === 'keep' || u.type === 'barracks')) {
          const types = u.type === 'keep' ? ['worker'] : ['soldier', 'archer', 'mage'];
          for (const type of types) {
            const c = COST[type], shortcut = { worker: 'R', soldier: 'R', archer: 'Q', mage: 'E' }[type];
            const locked = type === 'mage' && !canTrainMage();
            cmd += commandButton(`recruit-${type}`, `Recluta ${TYPE_NAMES[type].toLowerCase()}`,
              locked ? (isSiege() ? 'Conquista la Torre arcana' : 'Conquista l’avamposto per sbloccare') : `${c.wood} legno · ${c.gold} oro · ${RULES.units[type].trainTime}s · ${shortcut}`,
              { worker: '⚒', soldier: '⚔', archer: '➶', mage: '✧' }[type],
              locked || u.progress < 1 || u.queue.length >= RULES.queueLimit || !canRecruit(c));
          }
          if (u.queue.length) {
            badges += `<span class="stat-pill">Coda ${u.queue.length}/5 · ${TYPE_NAMES[u.queue[0].type]} ${Math.ceil(u.queue[0].remaining)}s</span>`;
            badges += `<span class="queue-list">${u.queue.map(q => TYPE_NAMES[q.type]).join(' → ')}</span>`;
            cmd += commandButton('cancel-training', 'Annulla ultima unità', 'Rimborso completo e posto liberato', '↶');
          }
          cmd += commandButton('rally', 'Punto di raduno', u.rally ? 'Impostato · tocca per cambiarlo' : 'Scegli la meta delle nuove unità', '⚑');
        }
        hint.textContent = u.type === 'village' ? 'Proteggi almeno un villaggio e il castello fino all’ultima ondata. Centra villaggio scorre tra i borghi ancora vivi.' : u.type === 'depot' && friendly ? 'Clic destro con i contadini carichi per depositare qui.' : friendly ? 'Clic destro sul terreno: raduno. Il + in popolazione indica i posti prenotati.' : 'La fortezza è difesa: prepara un esercito prima dell’assalto.';
      }
    }
    if (sel.some(u => u.team === 'player' && commandable(u))) {
      cmd += '<div class="tactics">' + commandButton('move', 'Muovi', 'Ritirata senza ingaggiare', '→') +
        commandButton('attack-move', 'Avanza', 'Combatti lungo il percorso · F', '⚔') +
        commandButton('hold', 'Mantieni', 'Attacca senza inseguire · X', '◆') + '</div>';
    }
    stats.innerHTML = badges;
    // Keep live buttons stable while their labels/countdowns refresh.
    const template = document.createElement('template'); template.innerHTML = cmd;
    const oldButtons = [...actions.querySelectorAll('[data-command]')];
    const newButtons = [...template.content.querySelectorAll('[data-command]')];
    if (oldButtons.length === newButtons.length && oldButtons.every((b, i) => b.dataset.command === newButtons[i].dataset.command)) {
      oldButtons.forEach((b, i) => { b.disabled = newButtons[i].disabled; b.innerHTML = newButtons[i].innerHTML; });
    } else actions.innerHTML = cmd;
  }
  function beginBuild(type = 'barracks') {
    if (!state.running || state.ended || !buildable().includes(type)) return;
    if (!selectedAlive().some(s => s.type === 'worker' && s.team === 'player')) { toast('Seleziona prima un contadino.'); return; }
    if (!canPay(COST[type])) { toast(`Servono ${priceText(COST[type]).replace(' · ', ' e ')} per ${BUILD_TEXT[type].the}.`); return; }
    state.mode = 'place'; state.placing = type; $('placementNotice').classList.remove('hidden');
    $('cancelOrderBtn').classList.remove('hidden');
    $('placementNotice').textContent = `${BUILD_TEXT[type].icon} Scegli dove costruire ${BUILD_TEXT[type].the} · ESC annulla`;
    toast(level.forwardBuild ? 'Scegli un luogo libero vicino al castello o a un punto alleato.' : 'Scegli un luogo libero vicino al tuo castello.');
  }
  function placeBuilding(x, y) {
    const type = state.placing || 'barracks';
    const builder = selectedAlive().find(u => u.type === 'worker' && u.team === 'player');
    if (!builder) { toast('Il contadino non è più disponibile.'); cancelBuild(); return; }
    if (!validBuild(x, y, type)) { toast(level.forwardBuild ? 'Posizione non valida: costruisci vicino al castello o a un punto alleato, lontano dagli ostacoli.' : 'Posizione non valida: costruisci vicino al castello e lontano dagli ostacoli.'); return; }
    if (!spend(COST[type])) { toast('Risorse insufficienti.'); cancelBuild(); return; }
    const b = createBuilding(type, 'player', x, y, 0);
    builder.order = { type: 'build', targetId: b.id };
    cancelBuild(); select(b);
    toast(`Il contadino sta costruendo ${BUILD_TEXT[type].the}.`);
  }
  function cancelBuild() {
    state.mode = 'select'; state.placing = null; $('placementNotice').classList.add('hidden');
    $('cancelOrderBtn').classList.add('hidden');
  }
  // Forward bases: some levels also allow building around allied, uncontested posts.
  const forwardPosts = () => level.forwardBuild ? state.outposts.filter(p => p.owner === 'player' && !p.contested).concat(level.villages ? livingVillages() : []) : [];
  function validBuild(x, y, type = 'barracks') {
    const home = keep('player'), at = { x, y };
    if (!buildable().includes(type) || x < 80 || y < 105 || x > W - 80 || y > H - 95) return false;
    if (!(alive(home) && dist(at, home) <= 635) && !forwardPosts().some(p => dist(p, at) <= 380)) return false;
    return state.outposts.every(p => dist(p, at) > 150) && !state.buildings.some(b => alive(b) && dist(b, at) < (b.type === 'keep' ? 145 : 105)) &&
      !state.nodes.some(n => n.stock > 0 && dist(n, at) < n.r + 65);
  }
  function recruit(type) {
    if (!state.running || state.ended || !COST[type] || !RULES.units[type]) return;
    const b = selectedAlive()[0], expected = type === 'worker' ? 'keep' : 'barracks';
    if (!b || b.team !== 'player' || b.type !== expected || b.progress < 1) return;
    if (type === 'mage' && !canTrainMage()) { toast(isSiege() ? 'Conquista la Torre arcana per reclutare i maghi.' : 'Conquista l’avamposto per reclutare i maghi.'); return; }
    if (b.queue.length >= RULES.queueLimit) { toast('La coda di questo edificio è piena.'); return; }
    if (playerUnits().length + reservedPopulation() >= state.popCap) { toast('Popolazione al limite, inclusi i posti prenotati.'); return; }
    if (!spend(COST[type])) { toast('Non hai abbastanza risorse.'); return; }
    b.queue.push({ type, remaining: RULES.units[type].trainTime });
    updateHud(); toast(`${TYPE_NAMES[type]} aggiunto alla coda.`);
  }
  function cancelTraining() {
    const b = selectedAlive()[0];
    if (!b || b.team !== 'player' || !b.queue?.length) return;
    const job = b.queue.pop(); state.wood += COST[job.type].wood; state.gold += COST[job.type].gold;
    updateHud(); toast('Reclutamento annullato: risorse rimborsate.');
  }
  function setOrderMode(mode) {
    if (!selectedAlive().some(u => u.team === 'player' && commandable(u))) return;
    state.mode = mode;
    $('cancelOrderBtn').classList.remove('hidden');
    $('placementNotice').textContent = mode === 'repair' ? '⚒ Scegli un edificio alleato danneggiato · ESC annulla' : mode === 'attack-move' ? '⚔ Scegli dove avanzare combattendo · ESC annulla' : '→ Scegli la destinazione · ESC annulla';
    $('placementNotice').classList.remove('hidden');
  }
  function selectIdleWorker() {
    const idle = playerUnits().filter(u => u.type === 'worker' && !u.order);
    if (!idle.length) { toast('Tutti i contadini hanno un incarico.'); return; }
    const next = idle[(idle.indexOf(state.selected[0]) + 1) % idle.length];
    select(next); centerCamera(next.x, next.y);
  }
  function selectArmy() {
    state.selected = playerUnits().filter(u => u.type !== 'worker'); cancelBuild(); updateHud();
    if (!state.selected.length) toast('Non hai ancora unità militari.');
  }
  function saveGroup(n) {
    const army = selectedAlive().filter(u => u.team === 'player' && commandable(u));
    if (!army.length) { toast('Seleziona prima le unità da salvare nel gruppo.'); return; }
    state.groups[n] = army.map(u => u.id);
    toast(`Gruppo ${n}: ${army.length} ${army.length === 1 ? 'unità salvata' : 'unità salvate'}.`);
  }
  function recallGroup(n) {
    const units = playerUnits().filter(u => state.groups[n]?.includes(u.id));
    if (!units.length) { toast(`Gruppo ${n} vuoto: Ctrl+${n} o Shift+${n} per salvarlo.`); return; }
    state.selected = units; cancelBuild(); updateHud();
    // Recalling the same group twice in quick succession centers the camera on it.
    if (state.lastGroup?.n === n && now() - state.lastGroup.time < 400) {
      centerCamera(units.reduce((s, u) => s + u.x, 0) / units.length, units.reduce((s, u) => s + u.y, 0) / units.length);
    }
    state.lastGroup = { n, time: now() };
  }
  function selectSameType(unit) {
    const { x, y } = state.camera;
    state.selected = playerUnits().filter(u => u.type === unit.type &&
      u.x >= x && u.x <= x + state.width && u.y >= y && u.y <= y + state.height);
    cancelBuild(); updateHud();
  }
  function dispatchCommand(command) {
    if (!state.running || state.ended) return;
    if (command === 'convoy') { convoyAction(); return; }
    if (command === 'repair') {
      if (level.repairs && selectedAlive().some(u => u.team === 'player' && u.type === 'worker')) setOrderMode('repair');
      return;
    }
    if (command === 'build') beginBuild('barracks');
    else if (command.startsWith('build-')) beginBuild(command.slice(6));
    else if (command.startsWith('recruit-')) recruit(command.slice(8));
    else if (command === 'cancel-training') cancelTraining();
    else if (command === 'move' || command === 'attack-move') setOrderMode(command);
    else if (command === 'hold') {
      selectedAlive().filter(u => u.team === 'player' && commandable(u)).forEach(u => { u.order = { type: 'hold', x: u.x, y: u.y }; });
      cancelBuild(); updateHud(); toast('Posizione mantenuta.');
    } else if (command === 'rally') {
      $('cancelOrderBtn').classList.remove('hidden');
      state.mode = 'rally'; $('placementNotice').textContent = '⚑ Scegli il punto di raduno · ESC annulla';
      $('placementNotice').classList.remove('hidden');
    }
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
    const post = state.outposts.find(p => dist(p, { x, y }) < 50);
    if (post) return post;
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
    const click = { id: target?.id, time: now() };
    if (!multi && target && isUnit(target) && target.team === 'player' && state.lastClick?.id === target.id && click.time - state.lastClick.time < 350) {
      state.lastClick = null; selectSameType(target); return;
    }
    state.lastClick = click;
    select(target, multi);
  }
  function orderUnits(x, y, mode = 'context') {
    const selected = selectedAlive();
    const building = selected.length === 1 && selected[0].team === 'player' && ['keep', 'barracks'].includes(selected[0].type) ? selected[0] : null;
    if (building) {
      const node = building.type === 'keep' ? pick(x, y) : null;
      if (node?.stock > 0) {
        building.rally = { x: node.x, y: node.y, nodeId: node.id, resource: node.type };
        cancelBuild(); updateHud(); toast(`Raduno su ${node.type === 'wood' ? 'un bosco' : 'una miniera'}: i nuovi contadini raccoglieranno subito.`); return;
      }
      building.rally = { x: clamp(x, 18, W - 18), y: clamp(y, 18, H - 18) };
      cancelBuild(); updateHud(); toast('Punto di raduno impostato.'); return;
    }
    const army = selected.filter(u => u.team === 'player' && commandable(u));
    if (!army.length) return;
    const target = ['context', 'repair'].includes(mode) ? pick(x, y) : null;
    const repairers = army.filter(u => u.type === 'worker');
    if (level.repairs && repairers.length && target?.team === 'player' && !isUnit(target) && target.progress >= 1 && alive(target) && target.hp < target.maxHp) {
      repairers.forEach(u => { u.order = { type: 'repair', targetId: target.id, clock: 0 }; });
      toast('Contadini inviati a riparare: 1 legno per 5 PV.'); return;
    }
    if (mode === 'repair') { toast('Scegli un edificio alleato completo e danneggiato.'); return; }
    if (target?.stock > 0) {
      const workers = army.filter(u => u.type === 'worker');
      if (!workers.length) { toast('Solo i contadini possono raccogliere risorse.'); return; }
      workers.forEach(u => { u.order = { type: 'harvest', nodeId: target.id, resource: target.type, stage: u.carry ? 'return' : 'approach' }; });
      toast(target.type === 'wood' ? 'Contadini inviati a tagliare legna.' : 'Contadini inviati a estrarre oro.'); return;
    }
    if (target && isEnemy(target.team) && alive(target)) {
      army.forEach(u => { u.order = { type: 'attack', targetId: target.id }; });
      toast('Bersaglio prioritario assegnato!'); return;
    }
    if (target && target.team === 'player' && !isUnit(target) && target.progress < 1) {
      army.filter(u => u.type === 'worker').forEach(u => { u.order = { type: 'build', targetId: target.id }; });
      toast('Contadini inviati a costruire.'); return;
    }
    if ((target?.team === 'player' && (target.type === 'keep' || target.type === 'village' || (target.type === 'depot' && target.progress >= 1))) || (target?.type === 'outpost' && usableDepot(target))) {
      const carriers = army.filter(u => u.type === 'worker' && u.carry);
      carriers.forEach(u => { u.order = { type: 'deposit' }; });
      if (carriers.length === army.length) return;
    }
    const columns = Math.ceil(Math.sqrt(army.length));
    army.forEach((u, i) => {
      if (u.order?.type === 'deposit' && u.carry && target) return;
      const offX = ((i % columns) - (columns - 1) / 2) * 33;
      const offY = (Math.floor(i / columns) - (Math.ceil(army.length / columns) - 1) / 2) * 33;
      u.order = { type: mode === 'attack-move' || target?.type === 'outpost' ? 'attack-move' : 'move',
        x: clamp(x + offX, 18, W - 18), y: clamp(y + offY, 18, H - 18) };
    });
    burst(x, y, mode === 'attack-move' ? '#e79883' : '#e0cf91', 8, .55);
  }
  function moveTo(u, goal, stop, dt) {
    const dx = goal.x - u.x, dy = goal.y - u.y, d = Math.hypot(dx, dy);
    if (d <= stop + .1) return true;
    const step = Math.min(d - stop, u.speed * dt);
    u.x += dx / d * step; u.y += dy / d * step;
    u.facing = dx >= 0 ? 1 : -1;
    // Report arrival on this tick, including diagonal rounding and separation nudges.
    return step >= d - stop - .01;
  }
  function getEntity(id) {
    return state.units.find(u => u.id === id && alive(u)) || state.buildings.find(b => b.id === id && alive(b));
  }
  function getNode(id) { return state.nodes.find(n => n.id === id && n.stock > 0); }
  function targetRange(u, victim) {
    return u.range + (victim.type === 'keep' ? 45 : ['barracks', 'bastion', 'village'].includes(victim.type) ? 37 : victim.type === 'depot' ? 30 : 4);
  }
  function findThreat(u, stationary = false) {
    let best = null, nearest = stationary ? Infinity : Math.max(145, u.range + 35);
    for (const e of state.units) {
      if (e.team === u.team || !alive(e)) continue;
      const d = dist(u, e);
      if (stationary && d > targetRange(u, e)) continue;
      if (d < nearest) { nearest = d; best = e; }
    }
    return best;
  }
  function damage(victim, amount, attackerTeam = null) {
    if (!alive(victim)) return;
    if (level.shieldPerTower && victim.type === 'keep' && isEnemy(victim.team)) amount *= 1 - citadelShield();
    victim.hp = Math.max(0, victim.hp - amount); victim.lastHit = state.time;
    if (victim.team === 'player' && isEnemy(attackerTeam) && (!isUnit(victim) || victim.type === 'worker' || victim.type === 'cart')) raiseAlert(victim);
    // The citadel's last stand: the royal guard sorties once, the first time it falls below the threshold.
    const stand = level.lastStand;
    if (stand && !state.lastStandDone && alive(victim) && victim.type === 'keep' && isEnemy(victim.team) && victim.hp <= victim.maxHp * stand.at) {
      state.lastStandDone = true;
      for (const [type, dx, dy] of stand.guards) createUnit(type, victim.team, victim.x + dx, victim.y + dy, { type: 'guard', x: victim.x + dx, y: victim.y + dy });
      state.pings.push({ x: victim.x, y: victim.y, life: 3, full: 3 });
      toast(`${citadelName()}: esce la Guardia reale, guidata dal Campione!`);
    }
    if (!alive(victim)) {
      burst(victim.x, victim.y, '#f9c17a', 18, .9);
      if (attackerTeam === 'player' && isEnemy(victim.team) && isUnit(victim)) state.stats.killed++;
      if (victim.type === 'cart' && state.convoy) {
        state.convoy.cartId = null; state.convoy.lost++;
        toast('Carro distrutto! Puoi sostituirlo dalla minimappa: 80 legno e 40 oro.');
      }
      if (victim.type === 'village') {
        victim.pendingRecruits = 0;
        if (!livingVillages().length) finish(false, 'villages');
        else toast(`${victim.frontName} perduto. Proteggi il villaggio rimasto!`);
      }
      if (victim.type === 'camp') toast(`${victim.frontName} distrutto: rinforzi interrotti da questo campo!`);
      if (victim.type === 'bastion') toast('Bastione abbattuto: la via della cittadella è più libera!');
      if (victim.queue) victim.queue = []; // Destruction releases reserved population.
      if (victim.type === 'keep') {
        if (victim.team === 'player') finish(false);
        else if (!isMission() && !state.buildings.some(b => b.type === 'keep' && isEnemy(b.team) && alive(b))) finish(true);
        else toast(`Fortezza dei ${teamName(victim.team)} distrutta: niente più rinforzi da quel fronte!`);
      }
    }
  }
  function attackEffect(u, victim, kind) {
    state.effects.push({ x: u.x, y: u.y - 18, tx: victim.x, ty: victim.y - 10,
      kind, life: kind === 'magic' ? .5 : .22, full: kind === 'magic' ? .5 : .22 });
  }
  function performAttack(u, victim, dt, stationary = false) {
    if (!alive(victim)) return true;
    const stop = targetRange(u, victim);
    if (stationary) { if (dist(u, victim) > stop) return false; }
    else if (!moveTo(u, victim, stop, dt)) return false;
    if (u.cooldown > 0) return false;
    u.cooldown = u.attackTime; u.swing = .24;
    const building = !isUnit(victim);
    const forge = forgeMultiplier(u.team);
    const multiplier = (building ? (u.type === 'mage' ? .35 : u.type === 'archer' ? .45 : 1) : 1) * (u.type === 'archer' ? arrowFactor(victim) : 1);
    damage(victim, u.damage * multiplier * forge, u.team);
    if (u.type === 'mage') {
      attackEffect(u, victim, 'magic');
      // Snapshot the impact position; only enemy units take splash damage.
      for (const other of state.units) {
        if (other !== victim && other.team !== u.team && alive(other) && dist(other, victim) <= RULES.units.mage.splash) damage(other, u.damage * .6 * forge, u.team);
      }
    } else if (u.type === 'archer') attackEffect(u, victim, 'arrow');
    else burst(victim.x, victim.y - 13, isEnemy(victim.team) ? '#ed9f73' : '#ecd18e', 4, .43);
    return false;
  }
  function nearestResource(u, type) {
    return state.nodes.filter(n => n.stock > 0 && n.type === type).sort((a, b) => dist(u, a) - dist(u, b))[0];
  }
  function nearestDepot(u) {
    const destinations = state.buildings.filter(b => b.team === 'player' && alive(b) && (b.type === 'keep' || b.type === 'village' || (b.type === 'depot' && b.progress >= 1)));
    destinations.push(...state.outposts.filter(usableDepot));
    return destinations.sort((a, b) => dist(u, a) - dist(u, b))[0];
  }
  function depositCargo(u, dt) {
    const home = nearestDepot(u);
    if (!home || !moveTo(u, home, home.type === 'keep' ? 79 : home.type === 'depot' ? 50 : 52, dt)) return false;
    if (u.carry) {
      state[u.carryType] += u.carry; state.stats.gathered += u.carry;
      floating(u.x, u.y - 25, `+${u.carry}`, '#e2d08d');
      u.carry = 0; u.carryType = null;
    }
    return true;
  }
  function updateWorker(u, dt) {
    const job = u.order;
    if (!job) return;
    if (job.type === 'harvest') {
      // Deliver already collected cargo even when the source has disappeared.
      if (u.carry > 0) {
        if (depositCargo(u, dt)) job.stage = 'approach';
        return;
      }
      let node = getNode(job.nodeId);
      if (!node) {
        node = nearestResource(u, job.resource);
        if (!node) { u.order = null; toast('Risorsa esaurita: un contadino è inattivo.'); return; }
        job.nodeId = node.id;
      }
      if (moveTo(u, node, node.r - 3, dt)) {
        u.harvestClock += dt;
        if (u.harvestClock >= 2.3) {
          u.harvestClock = 0; u.carry = Math.min(RULES.carryCapacity, node.stock);
          u.carryType = node.type; node.stock -= u.carry; job.stage = 'return';
          burst(node.x, node.y - 12, node.type === 'wood' ? '#a4ba70' : '#f2cc69', 5, .55);
        }
      }
    } else if (job.type === 'deposit') {
      if (!u.carry || depositCargo(u, dt)) u.order = null;
    } else if (job.type === 'repair') {
      const b = getEntity(job.targetId), r = RULES.repair;
      if (!level.repairs || !b || b.team !== 'player' || isUnit(b) || b.progress < 1 || b.hp >= b.maxHp) { u.order = null; return; }
      if (moveTo(u, b, r.range, dt)) {
        job.clock = Math.min(r.interval, job.clock + dt);
        if (job.clock >= r.interval && state.wood >= r.wood) {
          job.clock = 0; state.wood -= r.wood; b.hp = Math.min(b.maxHp, b.hp + r.hp); u.swing = .2;
          if (b.hp >= b.maxHp) u.order = null;
        }
      }
    } else if (job.type === 'build') {
      const b = getEntity(job.targetId);
      if (!b || b.team !== 'player' || isUnit(b) || b.progress >= 1) { u.order = null; return; }
      if (moveTo(u, b, b.type === 'depot' ? 52 : 62, dt)) {
        const gain = Math.min(1 - b.progress, dt / (RULES.buildings[b.type]?.buildTime ?? 12));
        b.progress = Math.min(1, b.progress + gain); b.hp = Math.min(b.maxHp, b.hp + b.maxHp * gain);
        u.swing = .15;
        if (b.progress >= 1) { u.order = null; toast(b.type === 'depot' ? 'Magazzino completato: i contadini vicini depositano qui.' : 'Caserma completata! Recluta armigeri e arcieri.'); }
      }
    } else if (job.type === 'attack') {
      const target = getEntity(job.targetId);
      if (!target) { u.order = null; return; }
      performAttack(u, target, dt);
    } else if (job.type === 'move' || job.type === 'attack-move') {
      // Workers always prioritize reaching safety over auto-engagement.
      if (moveTo(u, job, 5, dt)) u.order = null;
    } else if (job.type === 'hold') {
      const threat = findThreat(u, true); if (threat) performAttack(u, threat, dt, true);
    }
  }
  // Rams ignore units and batter the nearest building of the player.
  function updateRam(u, dt) {
    const target = u.order?.type === 'survival' ? survivalTarget(u) : state.buildings.filter(b => alive(b) && b.team === 'player')
      .sort((a, b) => dist(u, a) - dist(u, b))[0];
    if (target) performAttack(u, target, dt);
  }
  // Knights on a raid hunt workers and depots; they only fight soldiers that block them.
  function harassTarget(u) {
    if (level.convoy && activeCart()) return activeCart();
    return state.units.filter(v => alive(v) && v.team === 'player' && v.type === 'worker')
      .concat(state.buildings.filter(b => alive(b) && b.team === 'player' && b.type === 'depot'))
      .sort((a, b) => dist(u, a) - dist(u, b))[0];
  }
  function updateFighter(u, dt) {
    if (u.type === 'ram') { updateRam(u, dt); return; }
    const job = u.order;
    if (u.type === 'knight' && (job?.type === 'raid' || (job?.type === 'survival' && job.harass))) {
      const prey = harassTarget(u);
      if (prey) {
        const blocker = state.units.find(v => alive(v) && v.team !== u.team && v.type !== 'worker' && v.type !== 'cart' && dist(u, v) <= 50);
        performAttack(u, blocker || prey, dt); return;
      }
    }
    // Explicit movement and focus-fire orders take precedence over auto-targeting.
    if (job?.type === 'move') {
      if (moveTo(u, job, 5, dt)) u.order = null;
      return;
    }
    if (job?.type === 'attack') {
      const target = getEntity(job.targetId);
      if (!target) u.order = null;
      else performAttack(u, target, dt);
      return;
    }
    const stationary = job?.type === 'hold';
    const threat = findThreat(u, stationary);
    if (threat) { performAttack(u, threat, dt, stationary); return; }
    if (stationary) {
      const target = state.buildings.find(b => b.team !== u.team && alive(b) && dist(u, b) <= targetRange(u, b));
      if (target) performAttack(u, target, dt, true);
      return;
    }
    if (job?.type === 'survival') {
      performAttack(u, survivalTarget(u), dt);
    } else if (job?.type === 'raid') {
      const post = state.outposts.find(p => p.id === job.postId) || state.outpost;
      if (job.viaOutpost && post.owner !== u.team) moveTo(u, post, 65, dt);
      else performAttack(u, getEntity(job.targetId), dt);
    } else if (job?.type === 'attack-move' || job?.type === 'guard') {
      if (job.type === 'attack-move') {
        const structure = state.buildings.find(b => b.team !== u.team && alive(b) && dist(u, b) <= targetRange(u, b));
        if (structure) { performAttack(u, structure, dt); return; }
      }
      if (moveTo(u, job, job.type === 'guard' ? 10 : 5, dt) && job.type !== 'guard') u.order = null;
    } else {
      const target = state.buildings.find(b => b.team !== u.team && alive(b) && dist(u, b) < targetRange(u, b) + 15);
      if (target) performAttack(u, target, dt);
    }
  }
  function updateTraining(dt) {
    for (const b of state.buildings) {
      if (!alive(b) || !b.queue.length) continue;
      const job = b.queue[0]; job.remaining -= dt;
      if (job.remaining > 0) continue;
      const x = clamp(b.x + 100, 15, W - 15), y = clamp(b.y + 70, 15, H - 15);
      const r = b.rally;
      const order = !r ? null : job.type === 'worker' && r.nodeId
        ? { type: 'harvest', nodeId: r.nodeId, resource: r.resource, stage: 'approach' }
        : { type: job.type === 'worker' ? 'move' : 'attack-move', x: r.x, y: r.y };
      b.queue.shift(); createUnit(job.type, 'player', x, y, order);
      state.stats.trained++; burst(x, y, '#d8cc8a', 10, .65);
      toast(`${TYPE_NAMES[job.type]} pronto!`, true);
    }
  }
  function updateOutpost(dt) {
    for (const p of state.outposts) {
      const teams = [...new Set(state.units.filter(u => alive(u) && u.type !== 'worker' && u.type !== 'ram' && u.type !== 'knight' && u.type !== 'cart' && dist(u, p) <= p.radius).map(u => u.team))];
      p.contested = teams.length > 1;
      const oldOwner = p.owner;
      if (teams.length === 1) {
        const team = teams[0], sign = team === 'player' ? 1 : -1;
        const controller = p.owner !== 'neutral' ? p.owner : p.capturingTeam;
        if (controller && controller !== team && Math.abs(p.control) > 0) {
          p.control = Math.sign(p.control) * Math.max(0, Math.abs(p.control) - dt / p.captureTime);
          if (Math.abs(p.control) < 1e-9) { p.control = 0; p.owner = 'neutral'; p.capturingTeam = null; }
        } else {
          p.capturingTeam = team;
          p.control = sign * Math.min(1, Math.abs(p.control) + dt / p.captureTime);
          if (Math.abs(p.control) >= 1) p.owner = team;
        }
      }
      if (oldOwner !== p.owner) {
        p.incomeClock = 0;
        toast(p.owner === 'player' ? (p.bonus ? `${p.name} conquistata! ${p.bonus}` : `${p.name} conquistato! Maghi sbloccati, +${p.gold} oro ogni ${p.incomeTime}s.`) : `${p.name}: ${teamName(p.owner).toLowerCase()}.`);
      }
      if (p.owner === 'player' && !p.contested && (p.gold > 0 || p.wood > 0)) {
        p.incomeClock += dt;
        if (p.incomeClock >= p.incomeTime) {
          p.incomeClock -= p.incomeTime; state.gold += p.gold || 0; state.wood += p.wood || 0;
          floating(p.x, p.y - 95, p.wood ? `+${p.wood} legno` : `+${p.gold} oro`, '#ebcc7a');
        }
      }
    }
  }
  function updateTowerDefenses(dt) {
    for (const p of state.outposts) {
      if (p.role !== 'guard') continue;
      p.cooldown = Math.max(0, p.cooldown - dt);
      if (p.contested || p.owner === 'neutral' || p.cooldown > 0) continue;
      const target = state.units.filter(u => alive(u) && u.team !== p.owner && dist(u, p) <= p.range)
        .sort((a, b) => dist(a, p) - dist(b, p))[0];
      if (!target) continue;
      p.cooldown = p.attackTime;
      damage(target, p.damage * arrowFactor(target), p.owner); attackEffect(p, target, 'arrow');
    }
  }
  function updateDefenses(dt) {
    for (const b of state.buildings) {
      const d = RULES.defenses[b.type];
      if (!alive(b) || !d) continue;
      b.cooldown = Math.max(0, b.cooldown - dt);
      if (b.cooldown > 0) continue;
      const enemies = state.units.filter(u => alive(u) && u.team !== b.team && dist(u, b) <= d.range);
      enemies.sort((a, c) => dist(a, b) - dist(c, b));
      if (!enemies.length) continue;
      b.cooldown = d.cooldown; damage(enemies[0], (isEnemy(b.team) ? d.enemyDamage : d.damage) * arrowFactor(enemies[0]), b.team); attackEffect(b, enemies[0], 'arrow');
    }
  }
  function planWave() {
    const front = waveFront();
    const held = state.outposts.filter(p => p.owner === 'player');
    // Counterattacks replace the citadel's normal wave, never add another clock.
    const counter = !!level.counterattacks && !front.type && state.wave >= 3 && held.length > 0;
    const post = counter ? held[(Math.floor(state.wave / 3) - 1) % held.length] : state.outposts[front.post];
    const viaOutpost = isMission() || counter || (level.raidPattern === 'alternate' ? state.wave % 2 === 0 : state.wave % 4 >= 2);
    return { counter, postId: post.id, viaOutpost };
  }
  function startWave() {
    const fronts = waveFronts(), plan = state.wavePlan || planWave();
    const live = fronts.filter(f => alive(frontHome(f)));
    // A defeated front leaves its scheduled slot (or its half of a pincer) empty.
    let total = 0;
    for (const front of live) {
      const home = frontHome(front), cap = front.cap ?? (front.type === 'camp' ? 5 : level.waveCap);
      const troops = Math.min(cap, 1 + state.wave), postId = plan.counter ? plan.postId : state.outposts[front.post].id;
      for (let i = 0; i < troops; i++) {
        const type = front.troops ? front.troops : !front.type && level.ramFrom && state.wave >= level.ramFrom && i === 0 ? 'ram'
          : state.wave >= 6 && front.type !== 'camp' && i === troops - 1 ? 'mage' : state.wave >= 3 && i % 3 === 2 ? 'archer' : 'raider';
        createUnit(type, front.team, home.x - 110 - (i % 3) * 25, home.y + (i - (troops - 1) / 2) * 34,
          { type: 'raid', targetId: keep('player').id, viaOutpost: plan.viaOutpost, postId, sourceId: home.id });
      }
      total += troops;
    }
    if (!live.length) toast(`${fronts.map(f => f.name).join(' e ')}: ${fronts.length > 1 ? 'fronti eliminati' : 'fronte eliminato'}, tempo per riorganizzarsi.`);
    else if (live.length > 1) toast(`Tenaglia! Ondata ${state.wave}: ${total} nemici da ${live.map(f => f.name).join(' e ')}!`);
    else {
      const target = plan.counter ? state.outposts.find(p => p.id === plan.postId) : state.outposts[live[0].post];
      const rams = live[0].troops === 'knight' ? (level.convoy ? ' Cavalieri in arrivo: proteggi il carro!' : ' Cavalieri in arrivo: proteggi contadini e magazzini!') : !live[0].type && level.ramFrom && state.wave >= level.ramFrom ? ' Attenzione: un ariete punta ai tuoi edifici!' : '';
      toast(plan.counter ? `Contrattacco della ${citadelName().toLowerCase()}: ${total} nemici verso ${target.name}!${rams}` : `Ondata ${state.wave}: ${total} nemici da ${live[0].name}, verso ${plan.viaOutpost ? target.name : 'il castello'}!${rams}`);
    }
    state.wave++; state.waveIn = Math.max(level.minWaveInterval ?? 38, 65 - state.wave * 2);
    state.wavePlan = null;
  }
  function finish(won, reason = null) {
    if (state.ended) return;
    state.ended = true; state.running = false; state.nextLevel = won && level.id < window.RTS_LEVELS.length; cancelBuild();
    $('levelPicker').classList.add('hidden');
    $('chooseLevelBtn').classList.remove('hidden');
    $('modalTitle').textContent = won ? (level.survival ? 'Hai resistito fino all’alba!' : 'Il regno è salvo!') : reason === 'villages' ? 'I villaggi sono perduti' : 'Il castello è caduto';
    $('modalSubtitle').textContent = won
      ? `Vittoria in ${fmtTime(state.time)}! ${level.survival ? `${state.survival.cleared} ondate superate${level.villages ? ` e ${livingVillages().length} villaggi salvati` : ': il castello resiste'}` : level.convoy ? 'Tre carri consegnati: la fortezza alleata è rifornita' : level.control ? 'I sigilli sono ricomposti: la frontiera è al sicuro' : `Hai distrutto ${isSiege() ? `la ${citadelName().toLowerCase()}: l’assedio è finito` : level.kind === 'outpost' ? 'la fortezza nemica' : 'entrambe le fortezze rivali'}`}. Nemici sconfitti: ${state.stats.killed}. Risorse raccolte: ${state.stats.gathered}.`
      : `${reason === 'villages' ? 'Entrambi i villaggi sono stati distrutti.' : level.survival ? 'L’orda ha abbattuto il castello.' : 'La fortezza nemica ha trionfato.'} Hai resistito ${fmtTime(state.time)} e sconfitto ${state.stats.killed} nemici. Puoi riprovare con una strategia diversa.`;
    $('modalGuide').classList.add('hidden');
    $('modalButton').innerHTML = state.nextLevel ? 'Livello successivo <span aria-hidden="true">→</span>' : 'Riprova il livello <span aria-hidden="true">↻</span>';
    $('modal').classList.remove('hidden');
  }
  function update(dt) {
    if (!state.running || state.ended) return;
    state.time += dt;
    const speed = 460 * dt;
    const k = state.keys;
    moveCamera(((k.has('d') || k.has('ArrowRight')) ? speed : 0) - ((k.has('a') || k.has('ArrowLeft')) ? speed : 0),
      ((k.has('s') || k.has('ArrowDown')) ? speed : 0) - ((k.has('w') || k.has('ArrowUp')) ? speed : 0));
    if (level.survival) updateSurvivalClock(dt);
    else {
      state.waveIn -= dt;
      if (level.warningTime && !state.wavePlan && state.waveIn <= level.warningTime) {
        state.wavePlan = planWave();
        const live = waveFronts().filter(f => alive(frontHome(f)));
        if (state.wavePlan.counter && alive(frontHome(waveFront()))) {
          const target = state.outposts.find(p => p.id === state.wavePlan.postId);
          toast(`Contrattacco fra ${Math.ceil(Math.max(0, state.waveIn))}s: difendi ${target.name}!`);
        } else if (isMission() && live.length) {
          toast(level.convoy && live.some(f => f.troops === 'knight') ? `Cavalieri fra ${Math.ceil(state.waveIn)}s: proteggete il carro!` : `Incursione fra ${Math.ceil(state.waveIn)}s: ${live.map(f => state.outposts[f.post].name).join(' e ')}.`);
        } else if (live.length > 1) toast(`Tenaglia fra ${Math.ceil(Math.max(0, state.waveIn))}s: ${live.map(f => f.name).join(' e ')} attaccheranno insieme!`);
      }
      if (state.waveIn <= 0) startWave();
    }
    updateTraining(dt);
    updateDefenses(dt);
    const home = keep('player'), heal = RULES.heal;
    for (const u of state.units) {
      if (!alive(u)) continue;
      // Friendly units out of combat slowly recover near their own castle.
      if (u.team === 'player' && u.hp < u.maxHp && alive(home) && state.time - (u.lastHit ?? -Infinity) >= heal.delay && dist(u, home) <= heal.radius) {
        u.hp = Math.min(u.maxHp, u.hp + heal.rate * dt);
        if (Math.random() < dt * 1.2) floating(u.x, u.y - 34, '+', '#9be0a8');
      }
      u.cooldown = Math.max(0, u.cooldown - dt);
      u.swing = Math.max(0, u.swing - dt);
      if (u.type === 'worker') updateWorker(u, dt);
      else if (u.type !== 'cart') updateFighter(u, dt);
      if (state.ended) return;
      u.x = clamp(u.x, 12, W - 12); u.y = clamp(u.y, 12, H - 12);
    }
    // Slight separation avoids a perfect stack of troops on the same point.
    for (let i = 0; i < state.units.length; i++) {
      const a = state.units[i]; if (!alive(a) || a.type === 'cart') continue;
      for (let j = i + 1; j < state.units.length; j++) {
        const b = state.units[j]; if (!alive(b) || b.type === 'cart' || a.team !== b.team) continue;
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
    updateOutpost(dt);
    updateTowerDefenses(dt);
    updateMissions(dt);
    if (state.ended) { updateHud(); return; }
    for (const ping of state.pings) ping.life -= dt;
    state.pings = state.pings.filter(ping => ping.life > 0);
    for (const effect of state.effects) effect.life -= dt;
    state.effects = state.effects.filter(effect => effect.life > 0);
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
    // Scenario roads show the two fronts without introducing blocking terrain.
    ctx.beginPath();
    if (level.kind === 'outpost') { ctx.moveTo(467,794);ctx.bezierCurveTo(900,699,1260,955,2045,789); }
    else {
      // Roads leave the castle, meet at the first post, then fork towards each front's post.
      const [px, py] = level.player, hub = level.posts[0];
      ctx.moveTo(px,py);ctx.lineTo(hub.x,hub.y);
      for (const front of level.enemies) {
        const p = state.outposts[front.post];
        ctx.moveTo(hub.x,hub.y);ctx.bezierCurveTo(hub.x+280,hub.y,p.x-220,p.y,p.x,p.y);ctx.lineTo(front.x,front.y);
      }
    }
    if (level.convoy) {
      level.convoy.route.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    }
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
    const {x,y} = node; const scale = (node.stock <= 0 ? .45 : 1) * (node.rich ? 1.2 : 1);
    if(node.rich)ellipse(x,y+10,66,40,'#f3df8e2e');
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
    ctx.save();
    // Rich veins are larger and glow.
    if(node.rich){ellipse(x,y+12,58,34,'#ffe7914a');ctx.translate(x,y);ctx.scale(1.2,1.2);ctx.translate(-x,-y);}
    ellipse(x,y+18,37,16,'#2f433688');
    const stones=[[-25,7,19,17],[-4,0,25,24],[21,9,17,16],[2,17,19,14]];
    for(const [ox,oy,rx,ry] of stones){
      ctx.beginPath();ctx.moveTo(x+ox-rx,y+oy+ry/2);ctx.lineTo(x+ox-rx*.7,y+oy-ry*.6);ctx.lineTo(x+ox+rx*.1,y+oy-ry);ctx.lineTo(x+ox+rx,y+oy-ry*.3);ctx.lineTo(x+ox+rx*.6,y+oy+ry*.7);ctx.closePath();
      ctx.fillStyle='#716c57';ctx.fill();ctx.strokeStyle='#afa681';ctx.lineWidth=1.5;ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+ox-rx*.7,y+oy-ry*.6);ctx.lineTo(x+ox+rx*.1,y+oy-ry);ctx.lineTo(x+ox+2,y+oy+ry*.1);ctx.closePath();ctx.fillStyle='#cdb568';ctx.fill();
      ctx.beginPath();ctx.moveTo(x+ox+2,y+oy+ry*.1);ctx.lineTo(x+ox+rx,y+oy-ry*.3);ctx.lineTo(x+ox+rx*.6,y+oy+ry*.7);ctx.closePath();ctx.fillStyle='#e2c979';ctx.fill();
    }
    ellipse(x,y+29,18,9,'#544e368a');ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.fillStyle='#ffe5a1';ctx.fillText(node.rich?'◆◆':'◆',x,y+33);
    ctx.restore();
  }
  function drawKeep(b) {
    const enemy=isEnemy(b.team), x=b.x,y=b.y;
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
    ctx.beginPath();ctx.moveTo(-57,-36);ctx.lineTo(0,-82);ctx.lineTo(57,-36);ctx.closePath();ctx.fillStyle=b.team==='enemy2'?'#684778':enemy?'#8b4138':'#386b69';ctx.fill();
    ctx.beginPath();ctx.moveTo(-56,-36);ctx.lineTo(0,-82);ctx.lineTo(-1,-36);ctx.closePath();ctx.fillStyle=b.team==='enemy2'?'#9464ad':enemy?'#aa584a':'#578b84';ctx.fill();
    ctx.strokeStyle=b.team==='enemy2'?'#493052':enemy?'#5e332f':'#23524f';ctx.lineWidth=2;ctx.stroke();
    roundedRect(-16,10,32,36,15,'#524633');roundedRect(-11,14,22,32,11,'#312d27');
    ctx.strokeStyle='#524d42';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(27,-77);ctx.lineTo(27,-124);ctx.stroke();
    ctx.beginPath();ctx.moveTo(28,-119);ctx.lineTo(66,-109);ctx.lineTo(28,-97);ctx.closePath();ctx.fillStyle=b.team==='enemy2'?'#ad79d7':enemy?'#c4674b':'#d8c289';ctx.fill();
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
  function drawDepot(b) {
    ctx.save();ctx.translate(b.x,b.y);
    ellipse(2,24,50,18,'#20382b8a');
    roundedRect(-38,-12,76,42,3,'#8a6a46');
    for(let i=-34;i<36;i+=9)roundedRect(i,-10,2,38,1,'#6f5236');
    ctx.beginPath();ctx.moveTo(-46,-10);ctx.lineTo(0,-40);ctx.lineTo(46,-10);ctx.closePath();ctx.fillStyle='#5e6b4c';ctx.fill();
    ctx.beginPath();ctx.moveTo(-46,-10);ctx.lineTo(0,-40);ctx.lineTo(0,-10);ctx.closePath();ctx.fillStyle='#788660';ctx.fill();
    roundedRect(-14,4,28,26,2,'#3f3226');
    // Crates and a sack by the door.
    roundedRect(24,12,18,16,2,'#b48c5a');ctx.strokeStyle='#7c5c37';ctx.lineWidth=1.5;ctx.strokeRect(24,12,18,16);
    roundedRect(-44,14,16,14,2,'#b48c5a');ellipse(-48,26,7,6,'#d8c08a');
    if(b.progress<1){ctx.strokeStyle='#edc787';ctx.lineWidth=3;ctx.strokeRect(-48,-42,96,76);ctx.beginPath();ctx.moveTo(-48,-42);ctx.lineTo(48,34);ctx.moveTo(48,-42);ctx.lineTo(-48,34);ctx.stroke();}
    ctx.restore();
  }
  function drawBastion(b) {
    ctx.save();ctx.translate(b.x,b.y);
    ellipse(3,34,52,20,'#152d2488');
    roundedRect(-34,-58,68,92,8,'#8f8873');
    roundedRect(-28,-64,56,92,6,'#bcb49a');
    for(let i=-28;i<=20;i+=12)roundedRect(i,-74,9,13,2,'#d3c8a8');
    for(const sy of [-38,-8])roundedRect(-3,sy,6,14,2,'#4e5048');
    roundedRect(-12,6,24,28,10,'#3b3a33');
    ctx.strokeStyle='#524d42';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(18,-72);ctx.lineTo(18,-108);ctx.stroke();
    ctx.beginPath();ctx.moveTo(19,-106);ctx.lineTo(48,-98);ctx.lineTo(19,-89);ctx.closePath();ctx.fillStyle='#c4674b';ctx.fill();
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
    if (level.shieldPerTower && b.type === 'keep' && isEnemy(b.team) && citadelShield() > 0) {
      ctx.strokeStyle = '#b9a2ed';ctx.lineWidth = 3;ctx.setLineDash([10,6]);
      ctx.beginPath();ctx.ellipse(b.x,b.y-25,105,120,0,0,TWO_PI);ctx.stroke();ctx.setLineDash([]);
    }
    if(b.type==='keep')drawKeep(b);else if(b.type==='bastion')drawBastion(b);else if(b.type==='depot')drawDepot(b);else drawBarracks(b);
    if (b.type === 'village') {
      // Warm beacons distinguish the two civilian objectives on the night map.
      const glow=ctx.createRadialGradient(b.x+42,b.y-22,2,b.x+42,b.y-22,55);
      glow.addColorStop(0,'#ffd17588');glow.addColorStop(1,'#ff9c3300');
      ctx.fillStyle=glow;ctx.fillRect(b.x-13,b.y-77,110,110);
      ctx.fillStyle='#e8a45c';ctx.fillRect(b.x+40,b.y-15,4,23);
      ellipse(b.x+42,b.y-21,5,9+Math.sin(state.time*6)*2,'#ffd583');
    }
    if (b.frontName) {
      ctx.font='bold 11px system-ui';ctx.fillStyle='#f4d5ac';ctx.textAlign='center';
      ctx.fillText(b.frontName.toUpperCase(),b.x,b.y+66);
    }
    if (b.type === 'camp') {
      ctx.strokeStyle='#c4674b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(b.x+35,b.y-35);ctx.lineTo(b.x+35,b.y-95);ctx.stroke();
      ctx.fillStyle='#c4674b';ctx.fillRect(b.x+35,b.y-95,28,17);
    }
    if(b.hp<b.maxHp || b.progress<1) drawHealth(b,b.x,b.y-({keep:138,bastion:118,depot:56}[b.type]??75),b.type==='keep'?88:70);
  }
  function drawRam(u) {
    ctx.save();ctx.translate(u.x,u.y);
    if(state.selected.includes(u)){ctx.strokeStyle='#f8e4a5';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,6,32,13,0,0,TWO_PI);ctx.stroke();}
    ellipse(2,10,30,9,'#1a342670');
    ctx.scale(u.facing,1);
    const hit=u.swing?7:0;
    // Iron-capped log swings forward when striking.
    roundedRect(-20+hit,-14,48,9,4,'#6d4a30');roundedRect(24+hit,-16,10,13,3,'#7d8584');
    roundedRect(-24,-10,44,16,3,'#82603f');
    ctx.beginPath();ctx.moveTo(-28,-8);ctx.lineTo(-2,-32);ctx.lineTo(24,-8);ctx.closePath();ctx.fillStyle='#8b4138';ctx.fill();
    ctx.beginPath();ctx.moveTo(-28,-8);ctx.lineTo(-2,-32);ctx.lineTo(-2,-8);ctx.closePath();ctx.fillStyle='#aa584a';ctx.fill();
    ctx.strokeStyle='#5e332f';ctx.lineWidth=2;ctx.stroke();
    for(const wx of [-15,11]){ellipse(wx,8,7,7,'#3f3226');ellipse(wx,8,3,3,'#b7a37a');}
    ctx.restore();
    if(u.hp<u.maxHp)drawHealth(u,u.x,u.y-44,42);
  }
  function drawKnight(u) {
    ctx.save();ctx.translate(u.x,u.y);
    if(state.selected.includes(u)){ctx.strokeStyle='#f8e4a5';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,6,26,11,0,0,TWO_PI);ctx.stroke();}
    ellipse(2,9,24,7,'#1a342670');
    ctx.scale(u.facing,1);
    const gallop=Math.sin(state.time*16+u.id)*3;
    ctx.strokeStyle='#4b3424';ctx.lineWidth=4;ctx.beginPath();
    for(const lx of [-13,-6,8,15]){ctx.moveTo(lx,0);ctx.lineTo(lx+(lx%2?gallop:-gallop),11);}ctx.stroke();
    ellipse(0,-4,19,9,'#7a5236');
    ctx.beginPath();ctx.moveTo(13,-8);ctx.lineTo(22,-22);ctx.lineTo(29,-19);ctx.lineTo(20,-4);ctx.closePath();ctx.fillStyle='#7a5236';ctx.fill();
    ctx.strokeStyle='#2f2219';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-18,-6);ctx.lineTo(-25,4);ctx.stroke();
    roundedRect(-12,-10,18,7,2,'#c76a52');
    roundedRect(-7,-26,12,17,3,'#953f39');
    ctx.beginPath();ctx.arc(-1,-31,6.5,0,TWO_PI);ctx.fillStyle='#82706c';ctx.fill();
    ctx.strokeStyle='#cdd0cd';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(-4,-14);ctx.lineTo(30+(u.swing?6:0),-24);ctx.stroke();
    ctx.restore();
    if(u.hp<u.maxHp)drawHealth(u,u.x,u.y-44,34);
  }
  function drawCart(u) {
    ctx.save(); ctx.translate(u.x,u.y);
    ellipse(0,10,32,15,'#20352d88');
    if (state.selected.includes(u)) { ctx.strokeStyle='#f4dda5';ctx.lineWidth=2;ctx.strokeRect(-34,-34,68,62); }
    for (const x of [-22,22]) for (const y of [-12,16]) {
      ellipse(x,y,8,10,'#453b2b');ellipse(x,y,4,6,'#b28b50');
    }
    roundedRect(-26,-22,52,40,4,'#92643c');
    roundedRect(-21,-32,42,39,8,'#e1c787');
    ctx.strokeStyle='#907044';ctx.lineWidth=2;
    for (const x of [-13,0,13]) {ctx.beginPath();ctx.moveTo(x,-30);ctx.lineTo(x,6);ctx.stroke();}
    ctx.fillStyle='#695333';ctx.font='bold 18px Georgia';ctx.textAlign='center';ctx.fillText('◆',0,-4);
    ctx.restore(); drawHealth(u,u.x,u.y-46,56);
  }
  function drawMissionRoute() {
    if (!level.convoy) return;
    const route=level.convoy.route, end=route[route.length-1];
    ctx.save();ctx.strokeStyle='#ecd08c99';ctx.lineWidth=3;ctx.setLineDash([12,12]);ctx.beginPath();
    route.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.setLineDash([]);
    drawKeep({x:end.x,y:end.y,team:'player'});
    ctx.fillStyle='#f4dda5';ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.fillText('FORTEZZA ALLEATA · CONSEGNA',end.x,end.y+65);
    ctx.restore();
  }
  function drawUnit(u) {
    if (u.type === 'cart') { drawCart(u); return; }
    if (u.type === 'ram') { drawRam(u); return; }
    if (u.type === 'knight') { drawKnight(u); return; }
    ctx.save();ctx.translate(u.x,u.y);
    if(u.type==='champion')ctx.scale(1.4,1.4);
    const isWorker=u.type==='worker',enemy=isEnemy(u.team);
    if(state.selected.includes(u)){
      ellipse(0,2,19,10,'#d5cb735c');
      ctx.strokeStyle='#f8e4a5';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,2,19,10,0,0,TWO_PI);ctx.stroke();
    }
    ellipse(2,6,13,6,'#1a342670');
    if (u.team === 'enemy2') ellipse(0,5,14,7,'#bd85e880');
    const stride=Math.sin(state.time*10+u.id)*1.7;
    roundedRect(-7,-1,6,14,3,enemy?'#493132':'#353b32');
    roundedRect(2,-1,6,14,3,enemy?'#493132':'#353b32');
    ctx.fillStyle=isWorker?'#806f4c':u.team==='enemy2'?'#75478e':u.type==='mage'?(enemy?'#773a66':'#685298'):u.type==='archer'?(enemy?'#884b36':'#466c3d'):enemy?'#953f39':'#386e73';
    ctx.beginPath();ctx.moveTo(-10,-12);ctx.lineTo(10,-12);ctx.lineTo(12,4);ctx.lineTo(-11,4);ctx.closePath();ctx.fill();
    roundedRect(-11,-12,22,4,2,isWorker?'#ae925c':u.team==='enemy2'?'#ba8cdd':enemy?'#c76a52':'#5c9a98');
    ctx.beginPath();ctx.arc(0,-18,8.7,0,TWO_PI);ctx.fillStyle='#deb68c';ctx.fill();
    if(isWorker){
      roundedRect(-10,-24,20,6,2,'#67513a');
      roundedRect(-8,-28,16,9,3,'#9e835b');
      // The axe doubles as a silhouette cue for gathering.
      ctx.strokeStyle='#73513b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(8,-8);ctx.lineTo(14,-25+stride);ctx.stroke();
      ctx.beginPath();ctx.moveTo(11,-25+stride);ctx.lineTo(20,-27+stride);ctx.lineTo(18,-17+stride);ctx.closePath();ctx.fillStyle='#c3c9bd';ctx.fill();
      if(u.carry) {ellipse(-9,-2,6,6,u.carryType==='gold'?'#e3bc6e':'#8b5d36');}
    } else if (u.type === 'mage') {
      // Pointed hat, long robe and glowing staff distinguish the mage at a glance.
      ctx.beginPath();ctx.moveTo(-12,-23);ctx.lineTo(0,-43);ctx.lineTo(13,-23);ctx.closePath();ctx.fillStyle=enemy?'#a2578b':'#9980d1';ctx.fill();
      roundedRect(-14,-25,28,4,2,'#d9b66a');
      ctx.beginPath();ctx.moveTo(-10,-5);ctx.lineTo(12,-5);ctx.lineTo(16,10);ctx.lineTo(-15,10);ctx.closePath();ctx.fillStyle=enemy?'#773a66':'#685298';ctx.fill();
      ctx.strokeStyle='#b39b6b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(15,7);ctx.lineTo(18,-30);ctx.stroke();
      ellipse(18,-33,7,7,'#b9a2f163');ellipse(18,-33,3.5,4,u.swing?'#ffffff':'#d6b8ff');
    } else if (u.type === 'archer') {
      ctx.beginPath();ctx.arc(0,-20,10,Math.PI,TWO_PI);ctx.lineTo(11,-15);ctx.lineTo(5,-17);ctx.lineTo(-9,-17);ctx.closePath();ctx.fillStyle=u.team==='enemy2'?'#b381cb':enemy?'#b57756':'#739157';ctx.fill();
      ctx.strokeStyle='#d4b578';ctx.lineWidth=2.5;ctx.beginPath();ctx.ellipse(13,-8,9,17,0,-Math.PI/2,Math.PI/2);ctx.stroke();
      ctx.strokeStyle='#e4dcc1';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(13,-25);ctx.lineTo(u.swing?6:13,-8);ctx.lineTo(13,9);ctx.stroke();
      ctx.beginPath();ctx.moveTo(5,-8);ctx.lineTo(28,-8);ctx.stroke();
    } else {
      ctx.beginPath();ctx.arc(0,-21,9,Math.PI,TWO_PI);ctx.lineTo(9,-19);ctx.lineTo(-9,-19);ctx.fillStyle=enemy?'#82706c':'#a7afb0';ctx.fill();
      roundedRect(-11,-23,22,4,2,enemy?'#a9998e':'#c9cbd0');
      ctx.beginPath();ctx.ellipse(-12,-4,7,10,-.20,0,TWO_PI);ctx.fillStyle=u.team==='enemy2'?'#b381cb':enemy?'#b66d49':'#d4be7b';ctx.fill();
      ctx.beginPath();ctx.ellipse(-12,-4,4,7,-.20,0,TWO_PI);ctx.fillStyle=enemy?'#6a3b35':'#476a63';ctx.fill();
      ctx.strokeStyle='#cdd0cd';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(12,-5);ctx.lineTo(16,-25-(u.swing?8:0));ctx.stroke();
      if(u.type==='champion'){
        ctx.beginPath();ctx.moveTo(-8,-29);ctx.lineTo(-8,-37);ctx.lineTo(-4,-32);ctx.lineTo(0,-39);ctx.lineTo(4,-32);ctx.lineTo(8,-37);ctx.lineTo(8,-29);ctx.closePath();
        ctx.fillStyle='#e9c35f';ctx.fill();ctx.strokeStyle='#8d6e3c';ctx.lineWidth=1;ctx.stroke();
      }
    }
    ctx.restore();
    if(u.hp<u.maxHp)drawHealth(u,u.x,u.y-(u.type==='champion'?54:36),u.type==='champion'?44:32);
  }
  function drawParticles() {
    for(const p of state.particles) {
      ctx.save();ctx.globalAlpha=clamp(p.life/p.full,0,1);
      if(p.label){ctx.fillStyle=p.color;ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.fillText(p.label,p.x,p.y);}
      else ellipse(p.x,p.y,p.size,p.size,p.color);
      ctx.restore();
    }
  }
  function drawOutpost(p) {
    const color = teamColor(p.owner);
    ctx.save();
    ctx.strokeStyle = p.contested ? '#efb45e' : color; ctx.lineWidth = 2; ctx.setLineDash([8, 9]);
    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, TWO_PI); ctx.stroke(); ctx.setLineDash([]);
    ellipse(p.x, p.y + 18, 55, 26, '#263b3077');
    roundedRect(p.x - 27, p.y - 58, 54, 81, 4, '#a59778');
    roundedRect(p.x - 20, p.y - 51, 40, 70, 3, '#cbb993');
    for (let i = -27; i <= 27; i += 18) roundedRect(p.x + i - 6, p.y - 68, 12, 18, 2, '#ddcaa0');
    roundedRect(p.x - 9, p.y - 12, 18, 35, 8, '#3b4234');
    ctx.strokeStyle = '#66533a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y - 65); ctx.lineTo(p.x, p.y - 110); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(p.x + 1, p.y - 109); ctx.lineTo(p.x + 39, p.y - 97); ctx.lineTo(p.x + 1, p.y - 86); ctx.fill();
    roundedRect(p.x - 46, p.y + 37, 92, 7, 3, '#22352d');
    roundedRect(p.x - 46, p.y + 37, 92 * Math.abs(p.control), 7, 3, teamColor(p.owner !== 'neutral' ? p.owner : p.capturingTeam));
    ctx.font = 'bold 11px system-ui'; ctx.fillStyle = '#f4e6bd'; ctx.textAlign = 'center';
    ctx.fillText(p.contested ? (p.role ? 'TORRE CONTESA' : 'AVAMPOSTO CONTESO') : p.name.toUpperCase(), p.x, p.y + 62);
    if (p.role) {
      ctx.font='bold 21px Georgia';ctx.fillStyle=color;
      ctx.fillText({market:'◆',arcane:'✧',guard:'➶',forge:'✹',checkpoint:'⚑',sanctuary:'✦'}[p.role],p.x,p.y-28);
    }
    ctx.restore();
  }
  function drawEffects() {
    for (const e of state.effects) {
      ctx.save(); ctx.globalAlpha = clamp(e.life / e.full, 0, 1);
      ctx.strokeStyle = e.kind === 'magic' ? '#ddbbff' : '#f3dfa1'; ctx.lineWidth = e.kind === 'magic' ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.tx, e.ty); ctx.stroke();
      if (e.kind === 'magic') {
        const radius = RULES.units.mage.splash * (1 - e.life / e.full);
        ellipse(e.tx, e.ty + 10, radius, radius, '#ac7fe83a');
        ctx.beginPath(); ctx.arc(e.tx, e.ty + 10, radius, 0, TWO_PI); ctx.stroke();
      } else {
        const angle = Math.atan2(e.ty - e.y, e.tx - e.x);
        ctx.beginPath(); ctx.moveTo(e.tx - 9 * Math.cos(angle - .4), e.ty - 9 * Math.sin(angle - .4));
        ctx.lineTo(e.tx, e.ty); ctx.lineTo(e.tx - 9 * Math.cos(angle + .4), e.ty - 9 * Math.sin(angle + .4)); ctx.stroke();
      }
      ctx.restore();
    }
  }
  function drawOrderLines() {
    for(const u of selectedAlive()) {
      if(u.team!=='player')continue;
      let goal=u.rally || u.order;
      if (!goal) continue;
      if(u.order?.type==='harvest')goal=u.carry ? nearestDepot(u) : getNode(u.order.nodeId);
      if(u.order?.type==='deposit')goal=nearestDepot(u);
      if(['build','attack','repair'].includes(u.order?.type))goal=getEntity(u.order.targetId);
      if(!goal)continue;
      ctx.save();ctx.setLineDash([6,6]);ctx.lineWidth=1.6;ctx.strokeStyle='#ebdba7aa';
      ctx.beginPath();ctx.moveTo(u.x,u.y);ctx.lineTo(goal.x,goal.y);ctx.stroke();ctx.restore();
      ctx.strokeStyle='#f4d797ad';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(goal.x,goal.y,12+Math.sin(state.time*4)*2,0,TWO_PI);ctx.stroke();
    }
  }
  function drawBuildGhost() {
    if(state.mode!=='place'||!state.mouse)return;
    const x=state.mouse.x+state.camera.x,y=state.mouse.y+state.camera.y,type=state.placing;
    const ok=validBuild(x,y,type);
    // Show where building is allowed: the castle's area and, if enabled, allied posts.
    ctx.save();ctx.setLineDash([6,10]);ctx.strokeStyle='#cde3b166';ctx.lineWidth=2;
    const home=keep('player');if(alive(home)){ctx.beginPath();ctx.arc(home.x,home.y,635,0,TWO_PI);ctx.stroke();}
    for(const p of forwardPosts()){ctx.beginPath();ctx.arc(p.x,p.y,380,0,TWO_PI);ctx.stroke();}
    ctx.restore();
    ctx.save();ctx.globalAlpha=.68;(type==='depot'?drawDepot:drawBarracks)({x,y,progress:1});ctx.globalAlpha=1;
    ctx.strokeStyle=ok?'#cde3b1':'#ef7d75';ctx.lineWidth=3;ctx.setLineDash([8,5]);
    ctx.strokeRect(x-57,y-55,114,110);ctx.restore();
  }
  function drawMini() {
    const mw=mini.width,mh=mini.height,sx=mw/W,sy=mh/H;
    mctx.fillStyle='#375742';mctx.fillRect(0,0,mw,mh);
    mctx.strokeStyle='#a28a6280';mctx.lineWidth=11;
    mctx.beginPath();
    if (level.kind === 'outpost') { mctx.moveTo(45,79);mctx.bezierCurveTo(90,69,130,95,204,79); }
    else {
      const [px, py] = level.player, hub = level.posts[0];
      mctx.moveTo(px*sx,py*sy);mctx.lineTo(hub.x*sx,hub.y*sy);
      for (const e of level.enemies) { const p=state.outposts[e.post];mctx.moveTo(hub.x*sx,hub.y*sy);mctx.lineTo(p.x*sx,p.y*sy);mctx.lineTo(e.x*sx,e.y*sy); }
    }
    mctx.stroke();
    for(const n of state.nodes) {
      if(n.stock<=0)continue;
      mctx.fillStyle=n.type==='wood'?(n.rich?'#a6dc8c':'#7cad72'):(n.rich?'#ffe08a':'#dab869');
      mctx.beginPath();mctx.arc(n.x*sx,n.y*sy,(n.type==='wood'?4:3)+(n.rich?2:0),0,TWO_PI);mctx.fill();
    }
    for(const b of state.buildings) {
      if(!alive(b))continue;
      mctx.fillStyle=teamColor(b.team);
      mctx.fillRect(b.x*sx-4,b.y*sy-4,8,8);
    }
    for(const u of state.units) {
      if(!alive(u))continue;
      mctx.fillStyle=u.type==='cart'?'#ffe4a1':teamColor(u.team);
      if (u.type==='cart') {mctx.fillRect(u.x*sx-3,u.y*sy-3,6,6);continue;}
      mctx.fillRect(u.x*sx-1.5,u.y*sy-1.5,3,3);
    }
    for (const p of state.outposts) {
      mctx.fillStyle = p.contested ? '#ffcd7e' : teamColor(p.owner);
      mctx.beginPath();mctx.moveTo(p.x*sx,p.y*sy-6);mctx.lineTo(p.x*sx+6,p.y*sy);mctx.lineTo(p.x*sx,p.y*sy+6);mctx.lineTo(p.x*sx-6,p.y*sy);mctx.closePath();mctx.fill();
    }
    for (const front of level.kind !== 'outpost' ? waveFronts() : []) {
      const next = frontHome(front);
      if (!alive(next)) continue;
      mctx.strokeStyle = teamColor(next.team); mctx.lineWidth = 2;
      mctx.beginPath(); mctx.arc(next.x*sx, next.y*sy, 8 + Math.sin(state.time*3)*2, 0, TWO_PI); mctx.stroke();
    }
    if (level.survival) {
      const entries = new Set((nextSurvivalWave()?.groups || []).map(g => g.entry));
      for (const i of entries) {
        const e = level.enemies[i];
        mctx.strokeStyle='#ffb577';mctx.lineWidth=2;
        mctx.beginPath();mctx.arc(e.x*sx,e.y*sy,5+Math.sin(state.time*3),0,TWO_PI);mctx.stroke();
      }
    }
    // Attack alerts pulse in red where a castle, barracks or worker was hit.
    for (const ping of state.pings) {
      const t = 1 - ping.life / ping.full;
      mctx.strokeStyle = `rgba(255,96,80,${(1 - t).toFixed(2)})`; mctx.lineWidth = 2.5;
      mctx.beginPath(); mctx.arc(ping.x*sx, ping.y*sy, 5 + (t * 3 % 1) * 14, 0, TWO_PI); mctx.stroke();
    }
    if (state.wavePlan?.counter) {
      const p = state.outposts.find(p => p.id === state.wavePlan.postId);
      mctx.strokeStyle='#ffcd7e';mctx.lineWidth=2;
      mctx.strokeRect(p.x*sx-9,p.y*sy-9,18,18);
    }
    if (level.convoy) {
      mctx.strokeStyle='#f4dda5';mctx.lineWidth=1;mctx.setLineDash([3,3]);mctx.beginPath();
      level.convoy.route.forEach((p,i)=>i?mctx.lineTo(p.x*sx,p.y*sy):mctx.moveTo(p.x*sx,p.y*sy));mctx.stroke();mctx.setLineDash([]);
      const end=level.convoy.route[level.convoy.route.length-1];mctx.strokeRect(end.x*sx-5,end.y*sy-5,10,10);
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
    if (level.villages) { ctx.fillStyle='#0d183a55';ctx.fillRect(0,0,W,H); }
    drawMissionRoute();
    state.outposts.forEach(drawOutpost);
    for(const n of state.nodes){if(n.stock>0){if(n.type==='wood')drawTree(n);else drawGold(n);}}
    for(const b of [...state.buildings].sort((a,b)=>a.y-b.y))drawBuilding(b);
    for(const u of [...state.units].sort((a,b)=>a.y-b.y))drawUnit(u);
    drawOrderLines();drawEffects();drawParticles();drawBuildGhost();
    ctx.restore();
    // Soft framing, particularly in the corners, without an expensive filter.
    const grad=ctx.createRadialGradient(state.width/2,state.height/2,Math.min(state.width,state.height)*.28,
      state.width/2,state.height/2,Math.max(state.width,state.height)*.74);
    grad.addColorStop(0,'#0b241000');grad.addColorStop(1,'#091b1466');
    ctx.fillStyle=grad;ctx.fillRect(0,0,state.width,state.height);
    drawMini();
  }

  function startGame() {
    if(state.ended)resetWorld(state.nextLevel ? level.id + 1 : level.id);
    $('levelPicker').classList.add('hidden');
    state.running=true;state.ended=false;
    $('modal').classList.add('hidden');
    canvas.focus({preventScroll:true}); updateHud();
    toast(state.time > 0 ? 'Partita ripresa.' : level.survival ? `Hai 90s per prepararti. ${level.villages ? 'Difendi castello e villaggi; ripara gli edifici con i contadini.' : 'Prepara le difese del castello e conquista Mercato e Mulino.'}` : level.convoy ? 'Prepara la scorta. Il primo carro gratuito aspetta il tuo ordine alla base.' : level.control ? 'Conquista due santuari: il rituale richiede 180 secondi di controllo sicuro.' : isSiege() ? `Le ${countWord(level.posts.filter(p => p.initialOwner).length)} torri proteggono la ${citadelName().toLowerCase()}. Conquista il Mercato per sostenere l’assedio.` : 'Raccogli risorse, prepara l’esercito e conquista l’avamposto.');
  }
  function openHelp() {
    state.running=false;state.keys.clear();
    $('levelPicker').classList.add('hidden');
    $('chooseLevelBtn').classList.remove('hidden');
    $('modalTitle').textContent='Come si gioca';
    $('modalSubtitle').textContent=isMission() ? `Partita in pausa. ${level.description}` : isSiege() ? `Partita in pausa. ${level.description} I contrattacchi sono annunciati ${level.warningTime} secondi prima sulla minimappa.` : 'Partita in pausa. Conquista almeno un avamposto per reclutare maghi e depositare risorse. Ogni avamposto alleato e non conteso produce oro. Proteggi le unità a distanza con gli armigeri.';
    $('modalGuide').classList.remove('hidden');
    $('modalButton').innerHTML='Torna alla partita <span aria-hidden="true">→</span>';
    $('modal').classList.remove('hidden');
  }
  function restart(levelId = level.id) {
    resetWorld(levelId);
    $('levelSelect').value = String(level.id);
    $('levelPicker').classList.remove('hidden');
    $('chooseLevelBtn').classList.add('hidden');
    $('modalTitle').textContent = `Livello ${level.id} · ${level.name}`;
    $('modalSubtitle').textContent = level.description;
    $('modalGuide').classList.remove('hidden');
    $('modalButton').innerHTML = 'Inizia il livello <span aria-hidden="true">→</span>';
    $('modal').classList.remove('hidden');
  }
  function setupInput() {
    $('convoyBtn').addEventListener('click', convoyAction);
    $('advanceWaveBtn').addEventListener('click', startSurvivalWave);
    $('focusEnemyBtn').addEventListener('click', focusSurvivalEnemy);
    $('focusVillageBtn').addEventListener('click', focusVillage);
    $('convoyFocusBtn').addEventListener('click', focusCart);
    $('modalButton').addEventListener('click', startGame);
    $('helpBtn').addEventListener('click', () => { if(!state.ended)openHelp(); });
    $('pauseBtn').addEventListener('click', () => { if(state.running)openHelp(); });
    $('cancelOrderBtn').addEventListener('click', cancelBuild);
    $('idleBtn').addEventListener('click', () => { if(state.running)selectIdleWorker(); });
    $('armyBtn').addEventListener('click', () => { if(state.running)selectArmy(); });
    $('outpostStatus').addEventListener('click', () => { if(state.running){const p=state.outposts[state.postIndex];centerCamera(p.x,p.y);select(p);state.postIndex=(state.postIndex+1)%state.outposts.length;} });
    $('restartBtn').addEventListener('click', () => restart());
    $('chooseLevelBtn').addEventListener('click', () => restart());
    $('levelSelect').addEventListener('change', e => restart(Number(e.target.value)));
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
      if(v.button===2){
        const mode = ['move','attack-move','repair'].includes(state.mode) ? state.mode : 'context';
        orderUnits(world.x,world.y,mode);cancelBuild();return;
      }
      if(v.button!==0)return;
      if(state.mode==='place'){placeBuilding(world.x,world.y);return;}
      if(['move','attack-move','rally','repair'].includes(state.mode)){
        orderUnits(world.x,world.y,state.mode);cancelBuild();return;
      }
      if(v.dragging){
        const p1=worldPoint({sx:Math.min(v.x,p.sx),sy:Math.min(v.y,p.sy)});
        const p2=worldPoint({sx:Math.max(v.x,p.sx),sy:Math.max(v.y,p.sy)});
        const group=state.units.filter(u=>u.team==='player'&&alive(u)&&u.x>=p1.x&&u.x<=p2.x&&u.y>=p1.y&&u.y<=p2.y);
        state.selected=group;updateHud();return;
      }
      if(v.pointerType==='touch'){
        const thing=pick(world.x,world.y);
        if(selectedAlive().some(u=>u.team==='player'&&commandable(u)) &&
          (!thing || thing.stock!==undefined || isEnemy(thing.team) || thing.type==='outpost' ||
            (thing.team==='player' && (thing.progress<1 || (level.repairs && thing.progress>=1 && thing.hp<thing.maxHp && state.selected.some(u=>u.type==='worker')))) ||
            (['keep','depot','village'].includes(thing.type) && thing.team==='player' && state.selected.some(u=>u.type==='worker'&&u.carry)))) {
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
      // Menus and form controls keep their native keys (arrows in the level picker, Space on buttons).
      if(!$('modal').classList.contains('hidden')||['SELECT','INPUT','TEXTAREA'].includes(e.target?.tagName)){
        if(key==='p'&&!e.repeat&&e.target?.tagName!=='SELECT'&&!state.running&&!state.ended&&state.time>0)startGame();
        return;
      }
      if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();
      if(e.key==='Escape'){cancelBuild();return;}
      if(key==='h'){if(state.running)openHelp();return;}
      if(key==='p'&&!e.repeat){if(state.running)openHelp();else if(!state.ended&&state.time>0)startGame();return;}
      if(!state.running||e.repeat&&['b','m','r','q','e','f','x','g','i'].includes(key))return;
      if(e.key===' '){centerCamera(keep('player').x,keep('player').y);return;}
      const group=/^Digit([1-5])$/.exec(e.code||'')?.[1];
      if(group){
        if(e.ctrlKey||e.metaKey||e.shiftKey){e.preventDefault();saveGroup(group);}
        else if(!e.altKey)recallGroup(group);
        return;
      }
      if(key==='b'){beginBuild('barracks');return;}
      if(key==='m'){beginBuild('depot');return;}
      if(key==='q'){recruit('archer');return;}
      if(key==='e'){recruit('mage');return;}
      if(key==='f'){setOrderMode('attack-move');return;}
      if(key==='x'){dispatchCommand('hold');return;}
      if(key==='t'){dispatchCommand('repair');return;}
      if(key==='i'){selectIdleWorker();return;}
      if(key==='g'){selectArmy();return;}
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
    window.addEventListener('blur',()=>{state.keys.clear();state.pointer=null;$('dragBox').classList.add('hidden');});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.running)openHelp();});
  }
  let last=0;
  function frame(now){
    const dt=Math.min((now-last)/1000||0, .055);last=now;
    update(dt);draw();requestAnimationFrame(frame);
  }
  resize();restart();setupInput();requestAnimationFrame(frame);
  // Expose a tiny read-only diagnostic surface for automated smoke tests.
  Object.defineProperty(window,'__rtsDebug',{value:{snapshot:()=>({level:level.id,survival:state.survival?{...state.survival,remaining:waveEnemies().length}:null,villages:villages().map(b=>({name:b.frontName,hp:b.hp,pendingRecruits:b.pendingRecruits})),mission:level.kind,delivered:state.convoy?.delivered??null,lostCarts:state.convoy?.lost??null,cart:activeCart()?{x:activeCart().x,y:activeCart().y,hp:activeCart().hp,moving:activeCart().moving,routeIndex:activeCart().routeIndex}:null,controlTime:state.controlTime,controlRate:controlRate(),width:W,height:H,popCap:state.popCap,shield:Math.round(citadelShield()*100),camps:state.buildings.filter(b=>b.type==='camp'&&alive(b)).length,waveIn:state.waveIn,counterTarget:state.wavePlan?.counter?state.wavePlan.postId:null,fortresses:state.buildings.filter(b=>b.type==='keep'&&isEnemy(b.team)&&alive(b)).length,outposts:state.outposts.map(p=>({name:p.name,owner:p.owner,contested:p.contested})),camera:{...state.camera},running:state.running,ended:state.ended,time:state.time,wood:state.wood,gold:state.gold,units:state.units.length,buildings:state.buildings.length,wave:state.wave,reserved:reservedPopulation(),outpost:state.outpost.owner,selected:state.selected.map(u=>u.type)})},configurable:false});
})();

