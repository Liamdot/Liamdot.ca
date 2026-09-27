// Bloom
// One click. Everything it touches opens, and everything that opens touches
// something else. It starts pitiful - a dozen dots, a bloom the size of a
// coin - and ends with half the field going up at once.
//
// Each go pays pollen. Pollen buys upgrades. The upgrades are the game.
//
//   1. What's saved  - pollen, upgrades, records
//   2. The shop      - everything you can buy, and what it does
//   3. The field     - dots, and which of them are worth anything
//   4. Blooms        - the chain reaction itself
//   5. Scoring       - the multiplier that runs away with itself
//   6. Sound         - a note per link, climbing
//   7. Feel          - particles, slow motion, floating numbers
//   8. Drawing       - all of it, once a frame
//   9. Running       - the go, the shop, what there is to chase

const SAVE_KEY = "bloom";

const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const now = () => performance.now() / 1000;
const commas = (n) => Math.round(n).toLocaleString();

// ===========================================================================
// 1. What's saved
// ===========================================================================

const save = {
  pollen: 0,          // what there is to spend
  levels: {},         // upgrade id -> how many bought
  goes: 0,
  bestChain: 0,
  bestGo: 0,
};

const lvl = (id) => save.levels[id] || 0;

// ===========================================================================
// 2. The shop
// ===========================================================================
//
// Costs climb steeply, so each one is a decision - and every upgrade shows
// the number it moves, so you can see what you're buying.

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
      { id: "splitter", name: "Splitters", note: "throw off two more blooms each", cost: 400, growth: 1.65, most: 14,
        shows: () => `${Math.round(chanceOf("splitter") * 100)}% splitter` },
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
      { id: "click", name: "Another click", note: "a second go at the same field", cost: 900, growth: 3.4, most: 5,
        shows: () => `${1 + lvl("click")} clicks` },
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
      { id: "spark", name: "Spark", note: "every seventh link opens somewhere else entirely", cost: 800, growth: 2, most: 5,
        shows: () => (lvl("spark") ? `${lvl("spark")} at a time` : "off") },
      { id: "pollen", name: "Fertiliser", note: "everything pays more pollen", cost: 200, growth: 1.62, most: 40,
        shows: () => `+${lvl("pollen") * 10}% pollen` },
    ],
  },
];

const ALL = SHOP.flatMap((group) => group.items);
const itemOf = (id) => ALL.find((one) => one.id === id);
const costOf = (item) => Math.round(item.cost * item.growth ** lvl(item.id));

function buy(id) {
  const item = itemOf(id);
  if (!item || lvl(id) >= item.most) return;
  const cost = costOf(item);
  if (save.pollen < cost) return;
  save.pollen -= cost;
  save.levels[id] = lvl(id) + 1;
  store();
  showShop();
}

// ===========================================================================
// 3. The field
// ===========================================================================

const KINDS = {
  plain: { colour: "#7ee08a", worth: 10, size: 9 },
  // Stones never open. You start with a field half full of them and buy them
  // away, which is the first thing that makes the chains take off.
  stone: { colour: "#4a4a55", worth: 0, size: 10, dead: true },
  gold: { colour: "#f2c94c", worth: 50, size: 9 },
  heavy: { colour: "#6fc3df", worth: 20, size: 13, slow: true },
  splitter: { colour: "#d98ae0", worth: 30, size: 8, splits: true },
};

const fieldSize = () => 16 + lvl("seed") * 4;
const stoneShare = () => Math.max(0, 0.35 - lvl("chisel") * 0.035);

const chanceOf = (kind) => ({
  gold: lvl("gold") * 0.02,
  heavy: lvl("heavy") * 0.022,
  splitter: lvl("splitter") * 0.02,
}[kind] || 0);

let dots = [];
let blooms = [];
let sparks = [];
let floaters = [];
let slowUntil = 0;
let shake = 0;
let barDirty = false;

let phase = "ready";       // ready, going, done
let clicksLeft = 1;
let combo = 0;
let bestChain = 0;
let opened = 0;
let earned = 0;            // pollen this go

function pickKind() {
  if (Math.random() < stoneShare()) return "stone";
  for (const kind of ["gold", "heavy", "splitter"]) {
    if (Math.random() < chanceOf(kind)) return kind;
  }
  return "plain";
}

function newGo() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  dots = [];
  blooms = [];
  sparks = [];
  floaters = [];
  opened = 0;
  earned = 0;
  combo = 0;
  bestChain = 0;
  clicksLeft = 1 + lvl("click");
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
      wobble: rand(0, Math.PI * 2),
    });
  }
  hideShop();
  showBar();
  draw();
}

// ===========================================================================
// 4. Blooms
// ===========================================================================

const GROW = 0.5;
const CLOSE = 0.7;

const holdTime = () => 0.35 + lvl("hold") * 0.08;

// Everything that makes a bloom bigger lands here.
function reach(kind, depth, first) {
  let wide = 52 + lvl("wide") * 5;
  if (kind === "heavy") wide *= 1.45;
  if (first) wide *= 1 + lvl("lucky") * 0.15;
  if (lvl("momentum")) wide *= 1 + Math.min(depth * 0.02 * lvl("momentum"), 1.5);
  return wide;
}

function open(x, y, kind = "plain", depth = 0, first = false) {
  const max = reach(kind, depth, first);
  blooms.push({
    x, y, kind, depth, max,
    r: 0,
    age: 0,
    life: GROW + holdTime() + CLOSE,
    grow: kind === "heavy" ? GROW * 1.6 : GROW,
  });

  if (KINDS[kind].splits) {
    for (let i = 0; i < 2; i++) {
      const angle = rand(0, Math.PI * 2);
      blooms.push({
        x: x + Math.cos(angle) * 40, y: y + Math.sin(angle) * 40,
        kind: "plain", depth, max: max * 0.6, r: 0, age: 0,
        life: GROW + holdTime() + CLOSE, grow: GROW,
      });
    }
  }
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
      if (Math.hypot(dot.x - bloom.x, dot.y - bloom.y) <= bloom.r + dot.r) catchDot(bloom, i);
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
// 5. Scoring
// ===========================================================================
//
// The chain pays flat until it gets going, then every further link is worth
// more than the last - and the climb itself steepens, so the end of a long
// chain is where the pollen is.

const multFrom = () => Math.max(2, 6 - lvl("early"));
const multStep = () => 0.12 + lvl("step") * 0.06;
const multCurve = () => lvl("curve") * 0.004;

function multiplier(links) {
  const over = Math.max(0, links - multFrom());
  return 1 + over * multStep() + over * over * multCurve();
}

function catchDot(bloom, index) {
  const dot = dots[index];
  dots.splice(index, 1);
  opened++;
  combo++;
  bestChain = Math.max(bestChain, combo);

  const mult = multiplier(combo);
  const paid = Math.max(1, Math.round(KINDS[dot.kind].worth * mult * (1 + lvl("pollen") * 0.1)));
  earned += paid;

  open(dot.x, dot.y, dot.kind, bloom.depth + 1);
  if (lvl("echo") && Math.random() < Math.min(lvl("echo") * 0.12, 0.8)) {
    open(dot.x, dot.y, "plain", bloom.depth + 1);
  }
  if (lvl("spark") && combo % 7 === 0) {
    for (let i = 0; i < lvl("spark") && dots.length; i++) {
      const far = pick(dots);
      if (!KINDS[far.kind].dead) open(far.x, far.y, "plain", bloom.depth + 1);
    }
  }

  burst(dot.x, dot.y, KINDS[dot.kind].colour, dot.kind === "gold" ? 26 : 14);
  float(dot.x, dot.y, `+${commas(paid)}`, mult > 1.05 ? "#f2c94c" : KINDS[dot.kind].colour);
  note(combo);
  barDirty = true;
  shake = Math.min(shake + (dot.kind === "gold" ? 5 : 2.2), 14);
  if (combo >= multFrom() + 2) slowUntil = now() + 0.55 + lvl("slow") * 0.3;
}

// ===========================================================================
// 6. Sound
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
// 7. Feel
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
// 8. Drawing
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
    const wobble = Math.sin(now() * 2 + dot.wobble) * 1.2;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r + wobble, 0, Math.PI * 2);
    ctx.fillStyle = KINDS[dot.kind].colour;
    ctx.globalAlpha = KINDS[dot.kind].dead ? 0.5 : 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (dot.kind === "splitter") {
      ctx.strokeStyle = "#16161a";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
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
      ctx.fillText(`×${shown}`, width / 2, height / 2 + size * 0.62);
    }

    const word = wordFor(combo);
    if (word) {
      ctx.font = "600 17px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = "#7ee08a";
      ctx.fillText(word, width / 2, height / 2 - size * 0.62);
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ===========================================================================
// 9. Running
// ===========================================================================

const bar = {
  pollen: document.getElementById("pollen"),
  thisGo: document.getElementById("this-go"),
  chain: document.getElementById("chain"),
  best: document.getElementById("best"),
};

function showBar() {
  bar.pollen.textContent = commas(save.pollen);
  bar.thisGo.textContent = commas(earned);
  bar.chain.textContent = combo > 1 ? combo : bestChain;
  bar.best.textContent = `${commas(save.bestGo)} · chain ${save.bestChain}`;

  const hint = document.getElementById("hint");
  hint.hidden = phase !== "ready";
  hint.textContent = clicksLeft > 1 ? `click anywhere (${clicksLeft} clicks left)` : "click anywhere";
}

// Something to chase, so the numbers mean something. The next one along is
// always in view.
const MILESTONES = [
  [5, "a chain of five"],
  [12, "a chain of twelve"],
  [25, "a chain of twenty-five"],
  [50, "half a hundred"],
  [100, "a chain of a hundred"],
  [200, "a chain of two hundred"],
  [350, "a chain of three hundred and fifty"],
  [500, "a chain of five hundred"],
];

const nextMilestone = () => MILESTONES.find(([n]) => save.bestChain < n);

function showShop() {
  const panel = document.getElementById("shop");
  const next = nextMilestone();
  const bestNow = earned > 0 && earned >= save.bestGo;

  panel.innerHTML = `
    <div class="shop-head">
      <div>
        <h2>${commas(save.pollen)} pollen</h2>
        <p class="sub">${earned > 0
          ? `that go paid ${commas(earned)}${bestNow ? " - your best yet" : ""}`
          : "spend it on something"}</p>
      </div>
      <button class="pill strong" id="go-again">go again</button>
    </div>
    <p class="chase">${next
      ? `next up: ${next[1]} <span class="chase-now">(best so far ${save.bestChain})</span>`
      : `every chain there is, chained. Best ${save.bestChain}.`}</p>
    ${SHOP.map((group) => `
      <section class="group">
        <h3>${group.group}</h3>
        <div class="items">${group.items.map((item) => {
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
      </section>`).join("")}`;

  panel.hidden = false;
  document.getElementById("go-again").addEventListener("click", newGo);
  showBar();
}

const hideShop = () => { document.getElementById("shop").hidden = true; };

function endGo() {
  phase = "done";
  save.goes++;
  save.pollen += earned;
  save.bestGo = Math.max(save.bestGo, earned);
  save.bestChain = Math.max(save.bestChain, bestChain);
  store();
  showShop();
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
    stepBlooms(dt);
    if (!blooms.length) {
      combo = 0;
      if (clicksLeft > 0) phase = "ready";
      else endGo();
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
  if (phase !== "ready" || clicksLeft <= 0) return;
  const box = canvas.getBoundingClientRect();
  clicksLeft--;
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
  else hideShop();
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
