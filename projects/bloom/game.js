// Bloom
// One click. Everything it touches opens, and everything that opens touches
// something else. Each go pays pollen, pollen buys upgrades, and when a place
// has nothing left to teach you, you move on and start again somewhere
// harder - keeping a seed, which pays for ever.
//
//   1. Saved         - pollen, upgrades, which place you're in
//   2. Places        - the five of them, and what makes each harder
//   3. The shop      - everything you can buy, some of it locked away
//   4. The field     - dots, stones, and the armoured ones
//   5. Blooms        - the chain reaction itself
//   6. Scoring       - the multiplier that runs away with itself
//   7. Sound         - a note per link, climbing
//   8. Feel          - particles, slow motion, floating numbers
//   9. Drawing       - all of it, once a frame
//  10. Running       - the go, the tally, the shop, moving on

const SAVE_KEY = "bloom";

const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const now = () => performance.now() / 1000;

// Eight digits of pollen is just noise once it gets going.
function commas(n) {
  n = Math.round(n);
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toLocaleString();
}

// ===========================================================================
// 1. Saved
// ===========================================================================

const save = {
  pollen: 0,
  levels: {},
  area: 0,          // which place you're in
  seeds: 0,         // one for every place left behind, kept for ever
  goes: 0,
  bestChain: 0,
  bestGo: 0,
};

const lvl = (id) => save.levels[id] || 0;

// ===========================================================================
// 2. Places
// ===========================================================================
//
// Each is harder in a way upgrades can't simply out-scale: more of the field
// is armoured, and armour takes more than one knock. Moving on wipes the
// pollen and the upgrades and hands back a seed.

// Targets are a measured share of what each place can pay when everything in
// its shop is bought, so they're a stretch without being out of reach.
const PLACES = [
  { name: "the meadow", stone: 0.35, armour: 0, armourHits: 1, worth: 1,
    target: 2e6, blurb: "soft ground, nothing in the way" },
  { name: "the orchard", stone: 0.3, armour: 0.18, armourHits: 2, worth: 2.2,
    target: 130e6, blurb: "some of it takes two knocks", unlocks: ["pierce", "heavy"] },
  { name: "the thicket", stone: 0.26, armour: 0.34, armourHits: 2, worth: 5,
    target: 850e6, blurb: "thick with the stubborn sort", unlocks: ["pods", "echo"] },
  { name: "the cavern", stone: 0.22, armour: 0.5, armourHits: 3, worth: 12,
    target: 4e9, blurb: "half of it fights back", unlocks: ["resonance", "magnet"] },
  { name: "the canopy", stone: 0.18, armour: 0.62, armourHits: 3, worth: 30,
    target: 19e9, blurb: "the last place, and it knows it", unlocks: ["momentum", "spark"] },
];

const place = () => PLACES[Math.min(save.area, PLACES.length - 1)];

// Past the last place it keeps going, twenty times harder each time.
const targetNow = () => (save.area < PLACES.length
  ? place().target
  : place().target * 20 ** (save.area - PLACES.length + 1));

const seedBonus = () => 1 + save.seeds * 0.6;

const unlocked = (id) => {
  const needed = PLACES.findIndex((one) => (one.unlocks || []).includes(id));
  return needed === -1 || save.area >= needed;
};

// ===========================================================================
// 3. The shop
// ===========================================================================

const SHOP = [
  {
    group: "The field",
    items: [
      { id: "seed", name: "More dots", note: "four more dots out there", cost: 12, growth: 1.29, most: 90,
        shows: () => `${fieldSize()} dots` },
      { id: "chisel", name: "Fewer stones", note: "stones never open - clear them out", cost: 22, growth: 1.34, most: 10,
        shows: () => `${Math.round(stoneShare() * 100)}% stone` },
      { id: "gold", name: "Gold dots", note: "worth five times a plain one", cost: 70, growth: 1.55, most: 16,
        shows: () => `${Math.round(chanceOf("gold") * 100)}% gold` },
      { id: "heavy", name: "Heavy dots", note: "slow to open, but enormous", cost: 220, growth: 1.6, most: 14,
        shows: () => `${Math.round(chanceOf("heavy") * 100)}% heavy` },
      { id: "pods", name: "Seed pods", note: "burst and throw seeds, which bloom where they land", cost: 400, growth: 1.65, most: 14,
        shows: () => `${Math.round(chanceOf("pod") * 100)}% pods` },
    ],
  },
  {
    group: "The bloom",
    items: [
      { id: "wide", name: "Wider bloom", note: "every bloom reaches further", cost: 15, growth: 1.3, most: 80,
        shows: () => `${Math.round(reach("plain", 0, false))} across` },
      { id: "hold", name: "Slower to close", note: "stays open longer, so it catches more", cost: 45, growth: 1.4, most: 30,
        shows: () => `${holdTime().toFixed(2)}s open` },
      { id: "lucky", name: "Bigger first bloom", note: "the one you actually click", cost: 160, growth: 1.55, most: 12,
        shows: () => `+${lvl("lucky") * 15}% on the first` },
      { id: "pierce", name: "Sharper bloom", note: "hits armour harder, so it cracks in fewer goes", cost: 260, growth: 1.7, most: 6,
        shows: () => `${1 + lvl("pierce")} knocks a bloom` },
    ],
  },
  {
    group: "The chain",
    items: [
      { id: "step", name: "Steeper multiplier", note: "each link past the start pays more", cost: 60, growth: 1.46, most: 40,
        shows: () => `+${multStep().toFixed(2)} a link` },
      { id: "early", name: "Earlier multiplier", note: "it starts climbing sooner", cost: 300, growth: 2.1, most: 4,
        shows: () => `from link ${multFrom()}` },
      { id: "curve", name: "Runaway multiplier", note: "the longer it runs, the faster it climbs", cost: 500, growth: 1.95, most: 25,
        shows: () => `×${multiplier(30).toFixed(1)} at 30 links` },
      { id: "slow", name: "Longer slow motion", note: "more time to watch it happen", cost: 120, growth: 1.5, most: 8,
        shows: () => `${(0.55 + lvl("slow") * 0.3).toFixed(1)}s` },
    ],
  },
  {
    group: "Tricks",
    items: [
      { id: "echo", name: "Echo", note: "dots sometimes bloom twice over", cost: 350, growth: 1.8, most: 10,
        shows: () => `${Math.round(Math.min(lvl("echo") * 0.12, 0.8) * 100)}% twice` },
      { id: "magnet", name: "Magnetism", note: "dots drift towards anything open", cost: 420, growth: 1.8, most: 6,
        shows: () => (lvl("magnet") ? `pull ${lvl("magnet")}` : "off") },
      { id: "momentum", name: "Momentum", note: "every link makes the next bloom wider", cost: 650, growth: 1.9, most: 12,
        shows: () => `+${lvl("momentum") * 2}% a link` },
      { id: "resonance", name: "Resonance", note: "every tenth link opens something enormous", cost: 900, growth: 2, most: 6,
        shows: () => (lvl("resonance") ? `×${(2 + lvl("resonance") * 0.5).toFixed(1)} wide` : "off") },
      { id: "spark", name: "Spark", note: "every seventh link opens somewhere else entirely", cost: 800, growth: 2, most: 5,
        shows: () => (lvl("spark") ? `${lvl("spark")} at a time` : "off") },
      { id: "pollen", name: "Fertiliser", note: "everything pays more pollen", cost: 200, growth: 1.62, most: 40,
        shows: () => `+${lvl("pollen") * 10}% pollen` },
    ],
  },
];

const ALL = SHOP.flatMap((group) => group.items);
const itemOf = (id) => ALL.find((one) => one.id === id);
// Everything costs more in a harder place, so arriving with a seed's worth of
// income doesn't mean buying the whole shop back in three goes.
const costOf = (item) => Math.round(item.cost * item.growth ** lvl(item.id) * 8 ** save.area);

function buy(id) {
  const item = itemOf(id);
  if (!item || !unlocked(id) || lvl(id) >= item.most) return;
  const cost = costOf(item);
  if (save.pollen < cost) return;
  save.pollen -= cost;
  save.levels[id] = lvl(id) + 1;
  store();
  showShop();
}

// ===========================================================================
// 4. The field
// ===========================================================================

const KINDS = {
  plain: { colour: "#7ee08a", worth: 10, size: 9 },
  stone: { colour: "#4a4a55", worth: 0, size: 10, dead: true },
  gold: { colour: "#f2c94c", worth: 50, size: 9 },
  heavy: { colour: "#6fc3df", worth: 20, size: 13, slow: true },
  pod: { colour: "#d98ae0", worth: 30, size: 9, pod: true },
  // Armour takes more than one knock. It's what stops a big chain simply
  // eating the whole field, however wide the blooms get.
  armour: { colour: "#9a96a5", worth: 40, size: 11, tough: true },
};

const fieldSize = () => 16 + lvl("seed") * 4;
const stoneShare = () => Math.max(0, place().stone - lvl("chisel") * 0.035);

const chanceOf = (kind) => ({
  gold: lvl("gold") * 0.02,
  heavy: lvl("heavy") * 0.022,
  pod: lvl("pods") * 0.02,
}[kind] || 0);

let dots = [];
let blooms = [];
let flying = [];           // seeds thrown by pods, which bloom where they land
let sparks = [];
let floaters = [];
let slowUntil = 0;
let shake = 0;
let barDirty = false;

let phase = "ready";       // ready, going, done
let combo = 0;
let bestChain = 0;
let opened = 0;
let liveAtStart = 0;
let earned = 0;

function pickKind() {
  if (Math.random() < stoneShare()) return "stone";
  if (Math.random() < place().armour) return "armour";
  for (const kind of ["gold", "heavy", "pod"]) {
    if (Math.random() < chanceOf(kind)) return kind;
  }
  return "plain";
}

function newGo() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  dots = [];
  blooms = [];
  flying = [];
  sparks = [];
  floaters = [];
  opened = 0;
  earned = 0;
  combo = 0;
  bestChain = 0;
  phase = "ready";

  for (let i = 0; i < fieldSize(); i++) {
    const kind = pickKind();
    const speed = rand(22, 50) * (KINDS[kind].slow ? 0.6 : 1);
    const angle = rand(0, Math.PI * 2);
    dots.push({
      x: rand(40, width - 40),
      y: rand(40, height - 40),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: KINDS[kind].size,
      kind,
      knocks: KINDS[kind].tough ? place().armourHits : 1,
      wobble: rand(0, Math.PI * 2),
    });
  }

  liveAtStart = dots.filter((dot) => !KINDS[dot.kind].dead).length;
  hide("tally");
  hide("shop");
  showBar();
  draw();
}

// ===========================================================================
// 5. Blooms
// ===========================================================================

const GROW = 0.5;
const CLOSE = 0.7;

const holdTime = () => 0.35 + lvl("hold") * 0.08;

function reach(kind, depth, first) {
  let wide = 52 + lvl("wide") * 5;
  if (kind === "heavy") wide *= 1.45;
  if (first) wide *= 1 + lvl("lucky") * 0.15;
  if (lvl("momentum")) wide *= 1 + Math.min(depth * 0.02 * lvl("momentum"), 1.5);
  return wide;
}

function open(x, y, kind = "plain", depth = 0, first = false, big = 1) {
  blooms.push({
    x, y, kind, depth,
    max: reach(kind, depth, first) * big,
    r: 0,
    age: 0,
    life: GROW + holdTime() + CLOSE,
    grow: kind === "heavy" ? GROW * 1.6 : GROW,
    knocked: new Set(),          // one bloom can't knock the same dot twice
  });
}

// A pod bursts and throws seeds outwards; each blooms where it lands, which
// is how a chain crosses a gap it could never reach on its own.
function throwSeeds(x, y, depth) {
  const count = 3;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + rand(-0.4, 0.4);
    const far = rand(100, 160) * (1 + lvl("pods") * 0.03);
    flying.push({
      x, y, depth,
      vx: Math.cos(angle) * far,
      vy: Math.sin(angle) * far,
      life: 1,
      age: 0,
    });
  }
}

function stepSeeds(dt) {
  for (const seed of flying) {
    seed.age += dt;
    seed.x += seed.vx * dt;
    seed.y += seed.vy * dt;
  }
  for (const seed of flying) {
    if (seed.age >= seed.life) open(seed.x, seed.y, "plain", seed.depth);
  }
  flying = flying.filter((seed) => seed.age < seed.life);
}

function radiusOf(bloom) {
  const hold = holdTime();
  if (bloom.age < bloom.grow) {
    const t = bloom.age / bloom.grow;
    return bloom.max * (1 - (1 - t) ** 3);          // ease out: quick, then settles
  }
  if (bloom.age < bloom.grow + hold) return bloom.max;
  const t = (bloom.age - bloom.grow - hold) / CLOSE;
  return bloom.max * (1 - t * t);                    // ease in on the way back
}

function stepBlooms(dt) {
  for (const bloom of blooms) {
    bloom.age += dt;
    bloom.r = radiusOf(bloom);
  }
  blooms = blooms.filter((bloom) => bloom.age < bloom.life);

  for (const bloom of blooms) {
    if (bloom.age > bloom.life - CLOSE * 0.5) continue;   // closing blooms don't catch
    for (let i = dots.length - 1; i >= 0; i--) {
      const dot = dots[i];
      if (KINDS[dot.kind].dead) continue;                 // a stone just sits there
      if (bloom.knocked.has(dot)) continue;
      if (Math.hypot(dot.x - bloom.x, dot.y - bloom.y) > bloom.r + dot.r) continue;

      bloom.knocked.add(dot);
      dot.knocks -= 1 + lvl("pierce");
      if (dot.knocks > 0) {
        burst(dot.x, dot.y, "#9a96a5", 5);               // armour, still holding
        shake = Math.min(shake + 1, 14);
      } else {
        catchDot(bloom, i);
      }
    }
  }
}

function pullDots(dt) {
  if (!lvl("magnet") || !blooms.length) return;
  for (const dot of dots) {
    let closest = null;
    let near = Infinity;
    for (const bloom of blooms) {
      const gap = Math.hypot(dot.x - bloom.x, dot.y - bloom.y);
      if (gap < near) { near = gap; closest = bloom; }
    }
    if (!closest || near > 300) continue;
    const pull = 34 * lvl("magnet") * dt;
    dot.vx += ((closest.x - dot.x) / near) * pull;
    dot.vy += ((closest.y - dot.y) / near) * pull;
  }
}

// ===========================================================================
// 6. Scoring
// ===========================================================================

const multFrom = () => Math.max(2, 6 - lvl("early"));
const multStep = () => 0.12 + lvl("step") * 0.06;
const multCurve = () => lvl("curve") * 0.004;

function multiplier(links) {
  const over = Math.max(0, links - multFrom());
  return 1 + over * multStep() + over * over * multCurve();
}

const payFor = (kind, links) => Math.max(1, Math.round(
  KINDS[kind].worth * place().worth * multiplier(links) * (1 + lvl("pollen") * 0.1) * seedBonus()));

function catchDot(bloom, index) {
  const dot = dots[index];
  dots.splice(index, 1);
  opened++;
  combo++;
  bestChain = Math.max(bestChain, combo);

  const mult = multiplier(combo);
  const paid = payFor(dot.kind, combo);
  earned += paid;

  open(dot.x, dot.y, dot.kind, bloom.depth + 1);
  if (KINDS[dot.kind].pod) throwSeeds(dot.x, dot.y, bloom.depth + 1);
  if (lvl("echo") && Math.random() < Math.min(lvl("echo") * 0.12, 0.8)) {
    open(dot.x, dot.y, "plain", bloom.depth + 1);
  }
  if (lvl("spark") && combo % 7 === 0) {
    for (let i = 0; i < lvl("spark") && dots.length; i++) {
      const far = pick(dots);
      if (!KINDS[far.kind].dead) open(far.x, far.y, "plain", bloom.depth + 1);
    }
  }
  if (lvl("resonance") && combo % 10 === 0) {
    open(dot.x, dot.y, "plain", bloom.depth + 1, false, 2 + lvl("resonance") * 0.5);
    shake = Math.min(shake + 8, 18);
  }

  burst(dot.x, dot.y, KINDS[dot.kind].colour, dot.kind === "gold" ? 26 : 14);
  float(dot.x, dot.y, `+${commas(paid)}`, mult > 1.05 ? "#f2c94c" : KINDS[dot.kind].colour);
  note(combo);
  barDirty = true;
  shake = Math.min(shake + (dot.kind === "gold" ? 5 : 2.2), 14);
  if (combo >= multFrom() + 2) slowUntil = now() + 0.55 + lvl("slow") * 0.3;
}

// ===========================================================================
// 7. Sound
// ===========================================================================

let audio = null;
let sound = true;

const STEPS = [0, 2, 4, 7, 9];   // pentatonic: no wrong notes, however long the chain

function tone(setup) {
  if (!sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.connect(gain).connect(audio.destination);
    setup(osc, gain, audio.currentTime);
    osc.start();
    osc.stop(audio.currentTime + 0.6);
  } catch (e) {
    sound = false;   // no audio here; the game is fine without it
  }
}

const note = (n) => tone((osc, gain, at) => {
  const step = STEPS[(n - 1) % STEPS.length] + 12 * Math.floor((n - 1) / STEPS.length);
  osc.frequency.value = 261.6 * 2 ** (Math.min(step, 38) / 12);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.16, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
});

const thud = () => tone((osc, gain, at) => {
  osc.frequency.setValueAtTime(180, at);
  osc.frequency.exponentialRampToValueAtTime(60, at + 0.25);
  gain.gain.setValueAtTime(0.2, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
});

// ===========================================================================
// 8. Feel
// ===========================================================================

function burst(x, y, colour, count) {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(40, 260);
    sparks.push({
      x, y, colour,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.3, 0.8),
      age: 0,
      size: rand(1.5, 3.5),
    });
  }
}

const float = (x, y, text, colour) => floaters.push({ x, y, text, colour, age: 0, life: 0.9 });

function stepFeel(dt) {
  for (const spark of sparks) {
    spark.age += dt;
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vx *= 1 - 2.4 * dt;
    spark.vy *= 1 - 2.4 * dt;
  }
  sparks = sparks.filter((spark) => spark.age < spark.life);

  for (const one of floaters) {
    one.age += dt;
    one.y -= 34 * dt;
  }
  floaters = floaters.filter((one) => one.age < one.life);

  shake = Math.max(0, shake - 34 * dt);
}

const WORDS = [
  [4, "nice"], [8, "lovely"], [14, "chain!"], [22, "unstoppable"],
  [32, "absurd"], [45, "ludicrous"], [60, "stop it"], [80, "you monster"],
];

const wordFor = (n) => {
  let word = "";
  for (const [mark, text] of WORDS) if (n >= mark) word = text;
  return word;
};

// ===========================================================================
// 9. Drawing
// ===========================================================================

function fit() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * ratio;
  canvas.height = canvas.clientHeight * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.save();
  if (shake > 0.2) ctx.translate(rand(-shake, shake) * 0.3, rand(-shake, shake) * 0.3);
  ctx.clearRect(-20, -20, width + 40, height + 40);

  for (const dot of dots) {
    const kind = KINDS[dot.kind];
    const wobble = Math.sin(now() * 2 + dot.wobble) * 1.2;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r + wobble, 0, Math.PI * 2);
    ctx.fillStyle = kind.colour;
    ctx.globalAlpha = kind.dead ? 0.5 : 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;

    // armour wears a ring for every knock it has left
    if (kind.tough) {
      for (let i = 0; i < dot.knocks; i++) {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r + 4 + i * 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = "#9a96a5";
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    if (kind.pod) {
      ctx.strokeStyle = "#16161a";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  for (const seed of flying) {
    ctx.beginPath();
    ctx.arc(seed.x, seed.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#d98ae0";
    ctx.fill();
  }

  for (const bloom of blooms) {
    const kind = KINDS[bloom.kind] || KINDS.plain;
    const fade = Math.min(1, (bloom.life - bloom.age) / 0.4);
    ctx.beginPath();
    ctx.arc(bloom.x, bloom.y, Math.max(0, bloom.r), 0, Math.PI * 2);
    ctx.fillStyle = kind.colour;
    ctx.globalAlpha = 0.14 * fade;
    ctx.fill();
    ctx.globalAlpha = 0.85 * fade;
    ctx.strokeStyle = kind.colour;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  for (const spark of sparks) {
    ctx.globalAlpha = 1 - spark.age / spark.life;
    ctx.fillStyle = spark.colour;
    ctx.fillRect(spark.x, spark.y, spark.size, spark.size);
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  for (const one of floaters) {
    ctx.globalAlpha = 1 - one.age / one.life;
    ctx.fillStyle = one.colour;
    ctx.font = "700 15px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(one.text, one.x, one.y);
  }
  ctx.globalAlpha = 1;

  // The word sits a full line above the count and the multiplier a line
  // below, both measured from the count's own size, so however big the
  // numbers get they never land on each other.
  if (combo > 1 && phase === "going") {
    const mult = multiplier(combo);
    const size = Math.min(34 + combo * 2.2, 92);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#f1ede4";
    ctx.font = `800 ${size}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(combo, width / 2, height / 2);

    if (mult > 1.05) {
      const shown = mult >= 10 ? Math.round(mult) : mult.toFixed(1);
      ctx.fillStyle = "#f2c94c";
      ctx.font = `800 ${Math.min(20 + mult * 1.6, 46)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(`×${shown}`, width / 2, height / 2 + size * 0.72);
    }

    const word = wordFor(combo);
    if (word) {
      ctx.font = "600 17px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = "#7ee08a";
      ctx.fillText(word, width / 2, height / 2 - size * 0.95);
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ===========================================================================
// 10. Running
// ===========================================================================

const bar = {
  place: document.getElementById("place"),
  pollen: document.getElementById("pollen"),
  thisGo: document.getElementById("this-go"),
  chain: document.getElementById("chain"),
  target: document.getElementById("target"),
};

const show = (id) => { document.getElementById(id).hidden = false; };
const hide = (id) => { document.getElementById(id).hidden = true; };

function showBar() {
  bar.place.textContent = place().name;
  bar.pollen.textContent = commas(save.pollen);
  bar.thisGo.textContent = commas(earned);
  bar.chain.textContent = combo > 1 ? combo : bestChain;
  bar.target.textContent = `${commas(save.bestGo)} / ${commas(targetNow())}`;
  bar.target.parentElement.classList.toggle("met", save.bestGo >= targetNow());
  document.getElementById("hint").hidden = phase !== "ready";
}

// What the go was worth, said properly, before anything else happens.
function showTally(full, bonus) {
  const panel = document.getElementById("tally");
  const ready = save.bestGo >= targetNow();
  panel.innerHTML = `
    ${full ? '<p class="full-clear">full clear!</p>' : ""}
    <p class="tally-pollen">+${commas(earned)}</p>
    <p class="tally-line">a chain of ${bestChain}${full ? ` &middot; +${commas(bonus)} for leaving nothing standing` : ""}</p>
    <div class="tally-buttons">
      <button class="pill strong" id="tally-again">go again</button>
      <button class="pill" id="tally-shop">shop</button>
      ${ready ? `<button class="pill gold" id="tally-move">leave ${place().name}</button>` : ""}
    </div>`;
  panel.hidden = false;
  document.getElementById("tally-again").addEventListener("click", newGo);
  document.getElementById("tally-shop").addEventListener("click", () => { hide("tally"); showShop(); });
  if (ready) document.getElementById("tally-move").addEventListener("click", showMove);
}

function showShop() {
  const panel = document.getElementById("shop");
  panel.innerHTML = `
    <div class="shop-head">
      <div>
        <h2>${commas(save.pollen)} pollen</h2>
        <p class="sub">${place().name} &middot; ${place().blurb}${save.seeds
          ? ` &middot; ${save.seeds} seed${save.seeds === 1 ? "" : "s"}, so everything pays ×${seedBonus().toFixed(1)}`
          : ""}</p>
      </div>
      <button class="pill strong" id="go-again">go again</button>
    </div>
    <p class="chase">best go here ${commas(save.bestGo)} &middot; ${commas(targetNow())} to move on</p>
    ${SHOP.map((group) => {
      const items = group.items.filter((item) => unlocked(item.id));
      if (!items.length) return "";
      return `<section class="group">
        <h3>${group.group}</h3>
        <div class="items">${items.map((item) => {
          const at = lvl(item.id);
          const maxed = at >= item.most;
          const cost = costOf(item);
          const can = !maxed && save.pollen >= cost;
          return `<button class="item${can ? " can" : ""}${maxed ? " maxed" : ""}" data-id="${item.id}"${maxed || !can ? " disabled" : ""}>
            <span class="item-name">${item.name}</span>
            <span class="item-cost">${maxed ? "done" : commas(cost)}</span>
            <span class="item-note">${item.note}</span>
            <span class="item-now">${item.shows()}</span>
            <span class="item-bar"><span style="width:${(at / item.most) * 100}%"></span></span>
          </button>`;
        }).join("")}</div>
      </section>`;
    }).join("")}
    ${save.area + 1 < PLACES.length ? `<p class="locked">There's more of this in ${PLACES[save.area + 1].name}.</p>` : ""}`;

  panel.hidden = false;
  hide("tally");
  document.getElementById("go-again").addEventListener("click", newGo);
  showBar();
}

// Leaving costs everything except the seed, which is the point of leaving.
function showMove() {
  const next = PLACES[Math.min(save.area + 1, PLACES.length - 1)];
  const gets = save.area + 1 < PLACES.length ? next.unlocks || [] : [];
  const panel = document.getElementById("tally");
  panel.innerHTML = `
    <p class="full-clear">${place().name} is done with you</p>
    <p class="tally-line">Leaving takes every upgrade and all your pollen with it.
      You keep a seed, and everything pays ×${(1 + (save.seeds + 1) * 0.6).toFixed(1)} from here on.</p>
    <p class="tally-line">Next: ${next.name} &mdash; ${next.blurb}.
      ${gets.length ? `New in the shop: ${gets.map((id) => itemOf(id).name.toLowerCase()).join(", ")}.` : ""}</p>
    <div class="tally-buttons">
      <button class="pill gold" id="do-move">move on</button>
      <button class="pill" id="stay">stay a while</button>
    </div>`;
  panel.hidden = false;
  document.getElementById("do-move").addEventListener("click", moveOn);
  document.getElementById("stay").addEventListener("click", newGo);
}

function moveOn() {
  save.area++;
  save.seeds++;
  save.pollen = 0;
  save.levels = {};
  save.bestGo = 0;
  store();
  newGo();
}

function endGo() {
  phase = "done";
  save.goes++;

  // Nothing left standing pays half as much again.
  const full = liveAtStart > 0 && opened >= liveAtStart;
  const bonus = full ? Math.round(earned * 0.5) : 0;
  earned += bonus;
  if (full) shake = 16;

  save.pollen += earned;
  save.bestGo = Math.max(save.bestGo, earned);
  save.bestChain = Math.max(save.bestChain, bestChain);
  store();
  showTally(full, bonus);
  showBar();
}

let last = now();

function frame() {
  const time = now();
  let dt = Math.min(time - last, 0.05);
  last = time;
  if (time < slowUntil) dt *= 0.35;      // everything drags out on a big chain

  if (phase !== "done") {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    pullDots(dt);
    for (const dot of dots) {
      dot.x += dot.vx * dt;
      dot.y += dot.vy * dt;
      if (dot.x < dot.r || dot.x > width - dot.r) dot.vx *= -1;
      if (dot.y < dot.r || dot.y > height - dot.r) dot.vy *= -1;
      dot.x = Math.max(dot.r, Math.min(width - dot.r, dot.x));
      dot.y = Math.max(dot.r, Math.min(height - dot.r, dot.y));
    }
  }

  if (phase === "going") {
    stepSeeds(dt);
    stepBlooms(dt);
    if (!blooms.length && !flying.length) {
      combo = 0;
      endGo();
      showBar();
    }
  }

  stepFeel(dt);
  if (barDirty) {
    showBar();
    barDirty = false;
  }
  draw();
  requestAnimationFrame(frame);
}

canvas.addEventListener("pointerdown", (e) => {
  if (phase !== "ready") return;
  const box = canvas.getBoundingClientRect();
  phase = "going";
  combo = 0;
  open(e.clientX - box.left, e.clientY - box.top, "plain", 0, true);
  thud();
  shake = 4;
  showBar();
});

document.getElementById("shop").addEventListener("click", (e) => {
  const item = e.target.closest("[data-id]");
  if (item) buy(item.dataset.id);
});

document.getElementById("shop-btn").addEventListener("click", () => {
  if (document.getElementById("shop").hidden) showShop();
  else hide("shop");
});

document.getElementById("sound-btn").addEventListener("click", (e) => {
  sound = !sound;
  e.currentTarget.textContent = sound ? "sound on" : "sound off";
});

function store() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (e) {
    // private browsing - it still plays, it just won't be remembered
  }
}

function load() {
  try {
    Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)) || {});
  } catch (e) {
    // nothing saved yet
  }
  save.levels = save.levels || {};
}

window.addEventListener("resize", () => { fit(); draw(); });

load();
fit();
newGo();
requestAnimationFrame(frame);
