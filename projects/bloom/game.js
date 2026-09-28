// Bloom
// One click. Everything it touches opens, and everything that opens touches
// something else. Each go pays pollen, pollen buys upgrades, and when a place
// has nothing left to teach you, you move on and start again somewhere
// harder - keeping a seed, which pays for ever.
//
//   1. Saved         - pollen, upgrades, which place you're in
//   2. Places        - the five of them, and what makes each harder
//   3. The shop      - everything you can buy, some of it locked away
//   4. The plot      - the fixed patch of ground everyone plays on
//   5. The field     - dots, stones, armour, and the ground they grow back from
//   6. Blooms        - the chain reaction itself
//   7. Scoring       - the multiplier that runs away with itself
//   8. Sound         - a note per link, climbing
//   9. Feel          - particles, slow motion, floating numbers
//  10. Drawing       - all of it, once a frame
//  11. Running       - the go, the tally, the shop, moving on

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
    soil: 5, regrow: 1, target: 200e6, blurb: "soft ground, nothing in the way" },
  { name: "the orchard", stone: 0.3, armour: 0.18, armourHits: 2, worth: 2.2,
    soil: 5.5, regrow: 1, target: 1e9, blurb: "some of it takes two knocks", unlocks: ["pierce", "heavy"] },
  { name: "the thicket", stone: 0.26, armour: 0.34, armourHits: 2, worth: 5,
    soil: 6, regrow: 1.05, target: 4e9, blurb: "thick with the stubborn sort", unlocks: ["pods", "echo"] },
  { name: "the cavern", stone: 0.22, armour: 0.5, armourHits: 3, worth: 12,
    soil: 6.5, regrow: 1.05, target: 15e9, blurb: "half of it fights back", unlocks: ["resonance", "magnet"] },
  { name: "the canopy", stone: 0.18, armour: 0.62, armourHits: 3, worth: 30,
    soil: 7, regrow: 1.1, target: 50e9, blurb: "the last place, and it knows it", unlocks: ["momentum", "spark"] },
];

const place = () => PLACES[Math.min(save.area, PLACES.length - 1)];

// Past the last place it keeps going. Takings there rise with the seeds you're
// carrying, so the bar rises the same way, plus a little each time.
const targetNow = () => {
  if (save.area < PLACES.length) return place().target;
  const atLast = 1 + (PLACES.length - 1) * 0.6;
  const extra = save.area - PLACES.length + 1;
  return place().target * (seedBonus() / atLast) * 1.4 ** extra;
};

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
      { id: "seed", name: "More dots", note: "four more standing on the plot at once", cost: 12, growth: 1.34, most: 18,
        shows: () => `${fieldSize()} dots` },
      { id: "soil", name: "Richer ground", note: "more under the plot, and it comes up faster", cost: 90, growth: 1.56, most: 10,
        shows: () => `${soilFor()} in the ground` },
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
      // Short ladders on purpose, and cheap. Everything in this group is about
      // getting a chain to carry in the first place, and a chain reaction either
      // carries or it doesn't - so once it does, another fifty levels of reach
      // would buy you nothing at all. What makes the numbers grow after that is
      // the ground, the dots and the multiplier, and those are priced to match.
      { id: "wide", name: "Wider bloom", note: "every bloom reaches further, so the chain gets going at all", cost: 15, growth: 1.5, most: 8,
        shows: () => `${Math.round(reach("plain", 0, false))} across` },
      { id: "hold", name: "Slower to close", note: "hangs about over bare ground, catching what comes up under it", cost: 45, growth: 1.44, most: 8,
        shows: () => `${holdTime().toFixed(2)}s open` },
      { id: "lucky", name: "Bigger first bloom", note: "the one you actually click", cost: 160, growth: 1.6, most: 6,
        shows: () => `+${lvl("lucky") * 15}% on the first` },
      { id: "air", name: "Room in the air", note: "more blooms open at once, so the chain covers more ground", cost: 70, growth: 1.5, most: 12,
        shows: () => `${airCap()} at once` },
      { id: "pierce", name: "Sharper bloom", note: "hits armour harder, so it cracks in fewer goes", cost: 260, growth: 1.7, most: 6,
        shows: () => `${1 + lvl("pierce")} knocks a bloom` },
    ],
  },
  {
    group: "The chain",
    items: [
      { id: "step", name: "Steeper multiplier", note: "each link past the start pays more", cost: 60, growth: 1.48, most: 26,
        shows: () => `+${multStep().toFixed(2)} a link` },
      { id: "early", name: "Earlier multiplier", note: "it starts climbing sooner", cost: 300, growth: 2.1, most: 4,
        shows: () => `from link ${multFrom()}` },
      { id: "curve", name: "Runaway multiplier", note: "the longer it runs, the faster it climbs", cost: 500, growth: 1.95, most: 18,
        shows: () => `×${multiplier(30).toFixed(1)} at 30 links` },
      { id: "slow", name: "Longer slow motion", note: "every tenth link drops into slow motion - this holds it there", cost: 120, growth: 1.5, most: 8,
        shows: () => `${(0.4 + lvl("slow") * 0.12).toFixed(2)}s a time` },
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
      { id: "pollen", name: "Fertiliser", note: "everything pays more pollen", cost: 200, growth: 1.62, most: 30,
        shows: () => `+${lvl("pollen") * 10}% pollen` },
    ],
  },
];

const ALL = SHOP.flatMap((group) => group.items);
const itemOf = (id) => ALL.find((one) => one.id === id);
// Prices rise with a place exactly as its takings do, so every place is climbed
// at the same pace - and arriving with a pocketful of seeds doesn't mean buying
// the whole shop back in three goes.
const costOf = (item) => Math.round(
  item.cost * item.growth ** lvl(item.id) * place().worth * seedBonus());

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
// 4. The plot
// ===========================================================================
//
// The plot is the same size for everyone, always. The canvas is only a window
// onto it: whatever shape the window is, the plot is scaled to fit and centred
// inside it. A big monitor gets a bigger picture of exactly the same ground,
// and dragging the window narrow no longer herds the dots into a huddle -
// which used to be the cheapest trick in the game.

const PLOT = { w: 840, h: 540 };
const view = { scale: 1, ox: 0, oy: 0 };

function fitView() {
  view.scale = Math.min(canvas.clientWidth / PLOT.w, canvas.clientHeight / PLOT.h) || 1;
  view.ox = (canvas.clientWidth - PLOT.w * view.scale) / 2;
  view.oy = (canvas.clientHeight - PLOT.h * view.scale) / 2;
}

// screen -> plot
const toPlot = (x, y) => ({ x: (x - view.ox) / view.scale, y: (y - view.oy) / view.scale });

// ===========================================================================
// 5. The field
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

const fieldSize = () => 28 + lvl("seed") * 4;
const stoneShare = () => Math.max(0, place().stone - lvl("chisel") * 0.035);

// How much the ground has to give over a whole go. It doesn't hand it over on
// demand: it gives quickly at first and slower and slower after that, and it
// stops altogether once the go has run its course.
//
// That's the point of the whole thing. A chain lives only while a bloom keeps
// landing on something, so as the ground slows down the chain has to work
// harder to stay alive - and a bloom that reaches further, or hangs about
// longer, or throws off more blooms, is exactly what keeps it going. There's
// no amount of upgrading that just eats the lot, because what you take is
// decided by how long you last, not by what's down there.
const soilFor = () => Math.round(fieldSize() * (place().soil + lvl("soil") * 0.6));

const GROUND_SECONDS = 22;    // after this the ground has nothing left
const GROUND_FADE = 5;        // how sharply it slows down
const FADE_TOTAL = GROUND_FADE * Math.log(1 + GROUND_SECONDS / GROUND_FADE);

// Dots a second, right now. Sustain the chain for the whole go and the total
// comes to everything the ground had.
function groundRate() {
  if (goTime >= GROUND_SECONDS) return 0;
  return (soilFor() / FADE_TOTAL) / (1 + goTime / GROUND_FADE) * place().regrow;
}

const chanceOf = (kind) => ({
  gold: lvl("gold") * 0.02,
  heavy: lvl("heavy") * 0.022,
  pod: lvl("pods") * 0.02,
}[kind] || 0);

let dots = [];
let soil = 0;              // still under the ground, waiting to sprout
let sownAt = 0;            // how much of the next one has come up
let goTime = 0;            // how long this go has been running
let blooms = [];
let flying = [];           // seeds thrown by pods, which bloom where they land
let sparks = [];
let floaters = [];
let slowUntil = 0;
let shake = 0;
let barDirty = false;

let phase = "ready";       // ready, going, done
let combo = 0;
let nextSlow = 10;         // the next chain length worth slowing down for
let bestChain = 0;
let opened = 0;
let liveAtStart = 0;
let sownTotal = 0;
let lasted = 0;
let offered = 0;
let earned = 0;

function pickKind() {
  if (Math.random() < stoneShare()) return "stone";
  if (Math.random() < place().armour) return "armour";
  for (const kind of ["gold", "heavy", "pod"]) {
    if (Math.random() < chanceOf(kind)) return kind;
  }
  return "plain";
}

// One dot, anywhere on the plot. `up` is how far through coming up it is:
// a sprouted one pushes through the ground rather than blinking into being,
// and can't be caught until it's most of the way out.
function makeDot(up = 1) {
  const kind = pickKind();
  const speed = rand(22, 50) * (KINDS[kind].slow ? 0.6 : 1);
  const angle = rand(0, Math.PI * 2);
  return {
    x: rand(40, PLOT.w - 40),
    y: rand(40, PLOT.h - 40),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: KINDS[kind].size,
    kind,
    knocks: KINDS[kind].tough ? place().armourHits : 1,
    wobble: rand(0, Math.PI * 2),
    up,
    // What comes up mid-chain doesn't wait around. Miss it and it's gone, which
    // is why a wider bloom that covers more ground is worth having however
    // much else you've bought. What was standing when you clicked never wilts.
    wilt: up < 1 ? WILT : Infinity,
  };
}

function newGo() {
  dots = [];
  blooms = [];
  flying = [];
  sparks = [];
  floaters = [];
  opened = 0;
  earned = 0;
  combo = 0;
  arp = 0;
  nextSlow = Math.max(10, multFrom() + 4);
  bestChain = 0;
  phase = "ready";

  for (let i = 0; i < fieldSize(); i++) dots.push(makeDot());

  soil = soilFor();
  sownTotal = soil;
  sownAt = 0;
  goTime = 0;
  liveAtStart = dots.filter((dot) => !KINDS[dot.kind].dead).length;
  hide("tally");
  hide("shop");
  showBar();
  draw();
}

// While a chain is running the ground keeps giving dots back, faster the
// emptier the plot is, until the soil runs out. That's what a chain feeds on
// once it has eaten everything that was standing at the start.
//
function sow(dt) {
  goTime += dt;
  if (soil <= 0) return;
  sownAt -= dt * groundRate();
  sownAt = Math.max(sownAt, -3);          // a full plot doesn't bank a backlog
  while (sownAt <= 0 && soil > 0 && dots.length < 500) {
    dots.push(makeDot(0));
    soil--;
    sownAt += 1;
    barDirty = true;
  }
}

const WILT = 2.5;           // seconds a sprouted dot stands before it goes

function growDots(dt) {
  for (const dot of dots) if (dot.up < 1) dot.up = Math.min(1, dot.up + dt * 3.2);
  if (phase !== "going") return;
  for (const dot of dots) dot.wilt -= dt;
  dots = dots.filter((dot) => dot.wilt > -0.7);
}

// ===========================================================================
// 6. Blooms
// ===========================================================================

const GROW = 0.5;
const CLOSE = 0.7;

const holdTime = () => 0.35 + lvl("hold") * 0.12;

function reach(kind, depth, first) {
  let wide = 56 + lvl("wide") * 8;
  if (kind === "heavy") wide *= 1.45;
  if (first) wide *= 1 + lvl("lucky") * 0.15;
  if (lvl("momentum")) wide *= 1 + Math.min(depth * 0.02 * lvl("momentum"), 1.5);
  return wide;
}

// The air only holds so many blooms at once. Without that ceiling the chain
// just makes more and more of them until they cover the whole plot between
// them, and then how far any one of them reaches stops mattering at all -
// which is what made half the shop pointless. A new bloom crowds out the
// oldest one, so the chain still carries; it just can't blanket the place.
const airCap = () => 4 + lvl("air");

function open(x, y, kind = "plain", depth = 0, first = false, big = 1) {
  if (blooms.length >= airCap()) {
    let oldest = 0;
    for (let i = 1; i < blooms.length; i++) if (blooms[i].age > blooms[oldest].age) oldest = i;
    blooms.splice(oldest, 1);
  }
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
    if (seed.age >= seed.life) {
      open(Math.max(0, Math.min(PLOT.w, seed.x)), Math.max(0, Math.min(PLOT.h, seed.y)),
        "plain", seed.depth);
    }
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
      if (dot.up < 0.7) continue;                         // still coming up
      if (bloom.knocked.has(dot)) continue;
      if (Math.hypot(dot.x - bloom.x, dot.y - bloom.y) > bloom.r + dot.r) continue;

      bloom.knocked.add(dot);
      dot.knocks -= 1 + lvl("pierce");
      if (dot.knocks > 0) {
        burst(dot.x, dot.y, "#9a96a5", 5);               // armour, still holding
        knock();
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
// 7. Scoring
// ===========================================================================

const multFrom = () => Math.max(2, 6 - lvl("early"));
const multStep = () => 0.12 + lvl("step") * 0.06;
const multCurve = () => lvl("curve") * 0.004;

// The curve is what makes a long chain feel like it's getting away from you.
// It's quadratic up to a point and merely steep after it - without that ceiling
// a chain in the hundreds pays hundreds of thousands of times over, and the
// whole ladder gets bought out in an afternoon.
const CURVE_TOP = 200;

function multiplier(links) {
  const over = Math.max(0, links - multFrom());
  return 1 + over * multStep() + over * Math.min(over, CURVE_TOP) * multCurve();
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
  note(combo, dot.kind);
  barDirty = true;
  shake = Math.min(shake + (dot.kind === "gold" ? 5 : 2.2), 14);
  // Slow motion is punctuation, not a setting. It lands when the chain doubles
  // - 10, 20, 40, 80 - so a chain of a thousand gets about seven of them, not a
  // hundred. Left latched on it turned every good go into a minute of syrup.
  if (combo >= nextSlow) {
    nextSlow *= 2;
    slowUntil = now() + 0.4 + lvl("slow") * 0.12;
  }
}

// ===========================================================================
// 8. Sound
// ===========================================================================

let audio = null;
let master = null;
let sound = true;
let lastNote = 0;          // when the last note actually sounded
let lastKnock = 0;
let arp = 0;               // how far along the run we are

// Four chords, each given a run of eight notes up two octaves before the next
// one takes over. One scale going round and round was still the same riff
// arriving again every ten notes; a progression goes somewhere and comes back,
// so a long chain wanders through thirty-two notes before it repeats, turning
// over onto a new chord about once a second on the way.
const CHORDS = [
  [0, 4, 7, 11],     // I
  [9, 12, 16, 19],   // vi
  [5, 9, 12, 16],    // IV
  [7, 11, 14, 17],   // V
];

const RUN = 8;             // notes before the chord turns over
const ROOT = 130.8;        // C3, the bottom of the whole thing

// A chain can open forty dots a second. Nobody can hear forty notes a second -
// it just arrives as noise - so notes are spaced out and the ones in between
// pass quietly. What's left is an arpeggio rolling along under the chain.
const NOTE_GAP = 0.07;
const KNOCK_GAP = 0.12;

function wake() {
  if (!sound) return null;
  try {
    if (!audio) {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      // Everything goes through a compressor, so a hundred overlapping notes
      // lean on each other instead of piling up into a wall.
      const squash = audio.createDynamicsCompressor();
      squash.threshold.value = -24;
      squash.knee.value = 12;
      squash.ratio.value = 12;
      squash.attack.value = 0.004;
      squash.release.value = 0.25;
      master = audio.createGain();
      master.gain.value = 0.85;
      master.connect(squash).connect(audio.destination);
    }
    if (audio.state === "suspended") audio.resume();
    return audio;
  } catch (e) {
    sound = false;   // no audio here; the game is fine without it
    return null;
  }
}

// One oscillator, struck and left to die away.
function voice(ctx, type, freq, level, at, length, out) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain).connect(out);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), at + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

// A struck note: the fundamental, an octave over it, and a filter that shuts
// as it decays. That closing filter is the whole difference between something
// plucked and a tone being held at you.
function pluck(ctx, freq, level, at, bright = 0) {
  const soften = ctx.createBiquadFilter();
  soften.type = "lowpass";
  soften.frequency.setValueAtTime(Math.min(8000, freq * (5 + bright * 5)), at);
  soften.frequency.exponentialRampToValueAtTime(Math.max(300, freq * 1.5), at + 0.34);
  soften.connect(master);

  voice(ctx, "sine", freq, level, at, 0.4, soften);
  voice(ctx, "sine", freq * 2, level * (0.2 + bright * 0.3), at, 0.24, soften);
  if (bright) voice(ctx, "sine", freq * 3, level * 0.18 * bright, at, 0.18, soften);
}

function note(n, kind) {
  const ctx = wake();
  if (!ctx) return;
  const at = ctx.currentTime;
  if (at - lastNote < NOTE_GAP) return;
  lastNote = at;

  const chord = CHORDS[Math.floor(arp / RUN) % CHORDS.length];
  const along = arp % RUN;
  const step = chord[along % chord.length] + 12 * Math.floor(along / chord.length);
  arp++;

  // Softer the longer the chain runs, so a good go swells rather than shouts,
  // and the note the chord turns on gets leant on a little.
  const level = 0.1 * (0.45 + 0.55 / (1 + n * 0.012)) * (along === 0 ? 1.5 : 1);
  pluck(ctx, ROOT * 2 ** ((step + 12) / 12), level, at, kind === "gold" ? 1 : 0);

  // the root underneath, each time the chord turns over
  if (along === 0) {
    voice(ctx, "triangle", ROOT * 2 ** ((chord[0] - 12) / 12), level * 0.45, at, 1, master);
  }
}

// Armour holding: a dull knock, not a note. It isn't a link in the chain and
// shouldn't sound like one.
function knock() {
  const ctx = wake();
  if (!ctx) return;
  const at = ctx.currentTime;
  if (at - lastKnock < KNOCK_GAP) return;
  lastKnock = at;
  try {
    const soften = ctx.createBiquadFilter();
    soften.type = "lowpass";
    soften.frequency.value = 520;
    soften.connect(master);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(155, at);
    osc.frequency.exponentialRampToValueAtTime(88, at + 0.09);
    osc.connect(gain).connect(soften);
    gain.gain.setValueAtTime(0.045, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
    osc.start(at);
    osc.stop(at + 0.18);
  } catch (e) {
    sound = false;
  }
}

function thud() {
  const ctx = wake();
  if (!ctx) return;
  try {
    const at = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, at);
    osc.frequency.exponentialRampToValueAtTime(60, at + 0.25);
    osc.connect(gain).connect(master);
    gain.gain.setValueAtTime(0.18, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    osc.start(at);
    osc.stop(at + 0.35);
  } catch (e) {
    sound = false;
  }
}

// ===========================================================================
// 9. Feel
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
// 10. Drawing
// ===========================================================================

function fit() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * ratio;
  canvas.height = canvas.clientHeight * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  fitView();
}

function draw() {
  const width = PLOT.w;
  const height = PLOT.h;
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  ctx.save();
  ctx.translate(view.ox, view.oy);
  ctx.scale(view.scale, view.scale);
  if (shake > 0.2) ctx.translate(rand(-shake, shake) * 0.3, rand(-shake, shake) * 0.3);

  // the edge of the plot, so it's obvious the ground is a fixed size
  ctx.beginPath();
  ctx.roundRect(0.5, 0.5, width - 1, height - 1, 10);
  ctx.strokeStyle = "#282830";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.save();
  ctx.clip();

  for (const dot of dots) {
    const kind = KINDS[dot.kind];
    const wobble = Math.sin(now() * 2 + dot.wobble) * 1.2;
    const going = dot.wilt < 0 ? Math.max(0, 1 + dot.wilt / 0.7) : 1;
    const size = Math.max(0.5, (dot.r + wobble) * (0.35 + dot.up * 0.65) * going);
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, size, 0, Math.PI * 2);
    ctx.fillStyle = kind.colour;
    ctx.globalAlpha = (kind.dead ? 0.5 : 0.9) * (0.3 + dot.up * 0.7) * going;
    ctx.fill();
    ctx.globalAlpha = 1;

    // armour wears a ring for every knock it has left
    if (kind.tough && dot.up > 0.7) {
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
    if (kind.pod && dot.up > 0.7) {
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, size, 0, Math.PI * 2);
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

  ctx.restore();   // the plot's clip
  ctx.restore();
}

// ===========================================================================
// 11. Running
// ===========================================================================

const bar = {
  place: document.getElementById("place"),
  pollen: document.getElementById("pollen"),
  thisGo: document.getElementById("this-go"),
  chain: document.getElementById("chain"),
  ground: document.getElementById("ground"),
  target: document.getElementById("target"),
};

const show = (id) => { document.getElementById(id).hidden = false; };
const hide = (id) => { document.getElementById(id).hidden = true; };

function showBar() {
  bar.place.textContent = place().name;
  bar.pollen.textContent = commas(save.pollen);
  bar.thisGo.textContent = commas(earned);
  bar.chain.textContent = combo > 1 ? combo : bestChain;
  bar.ground.textContent = phase === "going" ? soil : soilFor();
  bar.target.textContent = `${commas(save.bestGo)} / ${commas(targetNow())}`;
  bar.target.parentElement.classList.toggle("met", save.bestGo >= targetNow());
  document.getElementById("hint").hidden = phase !== "ready";
}

// What the go was worth, said properly, before anything else happens.
function showTally(full, bonus) {
  const panel = document.getElementById("tally");
  const ready = save.bestGo >= targetNow();
  panel.innerHTML = `
    ${full ? '<p class="full-clear">not one missed!</p>' : ""}
    <p class="tally-pollen">+${commas(earned)}</p>
    <p class="tally-line">a chain of ${bestChain} &middot; ${opened} of ${offered} caught &middot; ${
      lasted.toFixed(1)}s${full ? ` &middot; +${commas(bonus)} for missing nothing` : ""}</p>
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

  // Nothing standing and nothing left in the ground pays half as much again.
  // It's a real achievement now: the chain has to outlast the regrowth.
  // The bonus is for missing nothing at all: everything that was standing and
  // everything the ground pushed up while the chain ran. Wilted is missed.
  lasted = goTime;
  offered = liveAtStart + (sownTotal - soil);
  const full = offered > 0 && opened >= offered;
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

// One tick of the world. Split out from the frame so a go can be run through
// as fast as the machine will allow, which is how the places were balanced.
function step(dt) {
  if (phase !== "done") {
    const width = PLOT.w;
    const height = PLOT.h;
    growDots(dt);
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
    sow(dt);
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
}

function frame() {
  const time = now();
  let dt = Math.min(time - last, 0.05);
  last = time;
  if (time < slowUntil) dt *= 0.35;      // everything drags out on a big chain
  step(dt);
  draw();
  requestAnimationFrame(frame);
}

canvas.addEventListener("pointerdown", (e) => {
  if (phase !== "ready") return;
  const box = canvas.getBoundingClientRect();
  const at = toPlot(e.clientX - box.left, e.clientY - box.top);
  phase = "going";
  combo = 0;
  open(at.x, at.y, "plain", 0, true);
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

const soundBtn = document.getElementById("sound-btn");

soundBtn.addEventListener("click", () => {
  sound = !sound;
  soundBtn.setAttribute("aria-pressed", sound);
  soundBtn.title = sound ? "Sound" : "Sound off";
});

// Starting over, behind a second click so it can't happen by accident.
const wipeBtn = document.getElementById("wipe-btn");
let wipeArmed = false;

// clicking away forgets that you were half way through asking
document.addEventListener("click", (e) => {
  if (wipeArmed && e.target !== wipeBtn) {
    wipeArmed = false;
    wipeBtn.classList.remove("sure");
    wipeBtn.textContent = "clear my save";
  }
});

wipeBtn.addEventListener("click", () => {
  if (!wipeArmed) {
    wipeArmed = true;
    wipeBtn.classList.add("sure");
    wipeBtn.textContent = "really? this clears everything";
    return;
  }
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    // nothing was saved anyway
  }
  Object.assign(save, {
    pollen: 0, levels: {}, area: 0, seeds: 0, goes: 0, bestChain: 0, bestGo: 0,
  });
  wipeArmed = false;
  wipeBtn.classList.remove("sure");
  wipeBtn.textContent = "cleared - back to the meadow";
  setTimeout(() => { wipeBtn.textContent = "clear my save"; }, 2500);
  newGo();
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
