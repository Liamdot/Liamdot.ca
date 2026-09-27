// Bloom
// One click. Everything it touches opens, and everything that opens touches
// something else. Clear the round, take an upgrade, go again - until a round
// beats you and the whole run goes with it.
//
//   1. The run     - rounds, quotas, and what you've picked up
//   2. The world   - dots drifting about
//   3. Blooms      - the chain reaction itself
//   4. Sound       - a note per link, climbing
//   5. Feel        - particles, slow motion, the numbers that float up
//   6. Upgrades    - the draft, three at a time
//   7. Drawing     - all of it, once a frame
//   8. Running     - the loop, the clicks, the saving

const SAVE_KEY = "bloom";

const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const now = () => performance.now() / 1000;

// ===========================================================================
// 1. The run
// ===========================================================================

let round = 1;
let opened = 0;            // this round
let total = 0;             // this run
let quota = 0;
let clicksLeft = 1;
let phase = "ready";       // ready, going, offering, over
let combo = 0;
let bestChain = 0;
let held = {};             // upgrade id -> how many of it you've taken
let offer = [];            // the three on the table

const record = { runs: 0, bestRound: 1, bestChain: 0, bestTotal: 0 };

const have = (id) => held[id] || 0;

// Rounds get bigger, and a growing share of what's out there is stone, so
// the dots that actually chain get further and further apart.
const fieldSize = () => Math.round(26 + round * 3.6 + have("seed") * 7);
// Stone climbs steeply on purpose. The field keeps growing, so without this
// the dots that can chain would get denser every round and a good run would
// never end - measured, and it didn't.
const stoneShare = () => Math.max(0, Math.min(0.05 * (round - 2) - have("chisel") * 0.08, 0.8));

// The quota only ever counts dots that can open, and it's worked out from
// how many of those the round actually laid down.
function quotaFor(live) {
  if (round === 1) return 4;        // the first two rounds are an on-ramp
  if (round === 2) return 6;
  const share = Math.min(0.2 + round * 0.008, 0.62) * (1 - have("mercy") * 0.08);
  return Math.max(2, Math.round(live * share));
}

// ===========================================================================
// 2. The world
// ===========================================================================

const KINDS = {
  plain: { colour: "#7ee08a", worth: 1, size: 9 },
  // Stones never open. They're what stops the game running away with itself:
  // a field with more dots in it chains more easily, so without something
  // thinning the ones that count, every late round would clear itself.
  stone: { colour: "#4a4a55", worth: 0, size: 10, dead: true, chance: () => stoneShare() },
  gold: { colour: "#f2c94c", worth: 5, size: 9, chance: () => 0.04 + have("gold") * 0.06 },
  heavy: { colour: "#6fc3df", worth: 2, size: 13, slow: true, chance: () => have("heavy") * 0.08 },
  splitter: { colour: "#d98ae0", worth: 3, size: 8, splits: true, chance: () => have("split") * 0.08 },
};

let dots = [];
let blooms = [];
let sparks = [];
let floaters = [];
let slowUntil = 0;
let shake = 0;
let barDirty = false;
let missed = false;

function pickKind() {
  for (const [name, kind] of Object.entries(KINDS)) {
    if (!kind.chance) continue;
    if (Math.random() < kind.chance()) return name;
  }
  return "plain";
}

function startRound() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  dots = [];
  blooms = [];
  sparks = [];
  floaters = [];
  opened = 0;
  combo = 0;
  missed = false;
  clicksLeft = 1 + have("click");
  phase = "ready";

  for (let i = 0; i < fieldSize(); i++) {
    const kind = pickKind();
    const speed = rand(24, 54) * (KINDS[kind].slow ? 0.6 : 1);
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

  quota = quotaFor(dots.filter((dot) => !KINDS[dot.kind].dead).length);
  showBar();
  draw();
}

function newRun() {
  round = 1;
  total = 0;
  bestChain = 0;
  held = {};
  phase = "ready";
  document.getElementById("offer").hidden = true;   // get the panel out of the way
  startRound();
  showHeld();
}

// ===========================================================================
// 3. Blooms
// ===========================================================================

const GROW = 0.55;
const HOLD = 0.5;
const CLOSE = 0.75;

const holdTime = () => HOLD + have("linger") * 0.2;

// How wide a bloom opens. Every width upgrade lands here, including the ones
// that only apply deep into a chain.
function reach(kind, depth, first) {
  let wide = 105 * (1 + have("wide") * 0.12);
  if (kind === "heavy") wide *= 1.45;
  if (first) wide *= 1 + have("lucky") * 0.3;
  if (have("momentum")) wide *= 1 + Math.min(depth * 0.03 * have("momentum"), 0.6);
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

function catchDot(bloom, index) {
  const dot = dots[index];
  dots.splice(index, 1);
  opened++;
  total++;
  combo++;
  bestChain = Math.max(bestChain, combo);

  open(dot.x, dot.y, dot.kind, bloom.depth + 1);
  if (have("echo") && Math.random() < 0.25 * have("echo")) {
    open(dot.x, dot.y, "plain", bloom.depth + 1);    // it opens twice
  }
  if (have("spark") && combo % 7 === 0 && dots.length) {
    const far = pick(dots);
    open(far.x, far.y, "plain", bloom.depth + 1);    // and somewhere else entirely
  }

  burst(dot.x, dot.y, KINDS[dot.kind].colour, dot.kind === "gold" ? 26 : 14);
  float(dot.x, dot.y, `+${KINDS[dot.kind].worth}`, KINDS[dot.kind].colour);
  note(combo);
  barDirty = true;
  shake = Math.min(shake + (dot.kind === "gold" ? 5 : 2.2), 14);

  const from = 6 - have("fuse");
  if (combo >= from) slowUntil = now() + 0.55 + have("fuse") * 0.3;
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
      if (KINDS[dot.kind].dead) continue;           // a stone just sits there
      if (Math.hypot(dot.x - bloom.x, dot.y - bloom.y) <= bloom.r + dot.r) catchDot(bloom, i);
    }
  }
}

// Dots lean towards whatever is open, if you've taken the upgrade for it.
function pullDots(dt) {
  if (!have("magnet") || !blooms.length) return;
  for (const dot of dots) {
    let closest = null;
    let near = Infinity;
    for (const bloom of blooms) {
      const gap = Math.hypot(dot.x - bloom.x, dot.y - bloom.y);
      if (gap < near) { near = gap; closest = bloom; }
    }
    if (!closest || near > 260) continue;
    const pull = 40 * have("magnet") * dt;
    dot.vx += ((closest.x - dot.x) / near) * pull;
    dot.vy += ((closest.y - dot.y) / near) * pull;
  }
}

// ===========================================================================
// 4. Sound
// ===========================================================================
//
// One note per link, climbing a pentatonic scale, so a long chain plays a
// little tune that goes up and up. This is most of the satisfaction.

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
// 5. Feel
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
  [3, "nice"], [5, "lovely"], [8, "chain!"], [12, "unstoppable"],
  [16, "absurd"], [22, "ludicrous"], [30, "stop it"], [40, "you monster"],
];

const wordFor = (n) => {
  let word = "";
  for (const [mark, text] of WORDS) if (n >= mark) word = text;
  return word;
};

// ===========================================================================
// 6. Upgrades
// ===========================================================================
//
// Taken three at a time between rounds, kept for the run, gone when it ends.

const UPGRADES = [
  { id: "wide", name: "Wider bloom", note: "every bloom opens 12% further", most: 6 },
  { id: "linger", name: "Slow to close", note: "blooms stay open a fifth of a second longer", most: 5 },
  { id: "seed", name: "Seeded field", note: "seven more dots every round", most: 5 },
  { id: "click", name: "Another click", note: "one more go at starting a chain", most: 2 },
  { id: "gold", name: "Golden touch", note: "far more gold dots, worth five each", most: 4 },
  { id: "split", name: "Split happens", note: "more purple dots, which throw off two blooms", most: 4 },
  { id: "heavy", name: "Heavy weather", note: "more blue dots: slow to open, but huge", most: 4 },
  { id: "echo", name: "Echo", note: "a quarter of dots bloom twice over", most: 3 },
  { id: "magnet", name: "Magnetism", note: "dots drift towards anything open", most: 3 },
  { id: "momentum", name: "Momentum", note: "every link makes the next bloom wider", most: 3 },
  { id: "spark", name: "Spark", note: "every seventh link opens somewhere else entirely", most: 2 },
  { id: "fuse", name: "Long fuse", note: "slow motion starts sooner and lasts longer", most: 3 },
  { id: "lucky", name: "Lucky start", note: "the bloom you click is 30% wider", most: 3 },
  { id: "mercy", name: "Kind quota", note: "every round asks for 8% fewer", most: 3 },
  { id: "chisel", name: "Chisel", note: "fewer grey stones, which never open", most: 4 },
];

function offerUpgrades() {
  const room = UPGRADES.filter((one) => have(one.id) < one.most);
  offer = [];
  while (offer.length < 3 && offer.length < room.length) {
    const one = pick(room);
    if (!offer.includes(one)) offer.push(one);
  }
  phase = "offering";
  showOffer();
}

function take(id) {
  if (phase !== "offering") return;
  held[id] = have(id) + 1;
  round++;
  offer = [];
  document.getElementById("offer").hidden = true;
  showHeld();
  startRound();
}

// ===========================================================================
// 7. Drawing
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
    ctx.globalAlpha = 0.9;
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
    ctx.fillStyle = "#f1ede4";
    ctx.globalAlpha = 0.9;
    ctx.font = `800 ${Math.min(34 + combo * 2.5, 92)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(combo, width / 2, height / 2);
    const word = wordFor(combo);
    if (word) {
      ctx.font = "600 17px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = "#7ee08a";
      ctx.fillText(word, width / 2, height / 2 + 30);
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ===========================================================================
// 8. Running
// ===========================================================================

const bar = {
  round: document.getElementById("round"),
  quota: document.getElementById("quota"),
  chain: document.getElementById("chain"),
  record: document.getElementById("record"),
};

function showBar() {
  bar.round.textContent = round;
  bar.quota.textContent = `${opened} / ${quota}`;
  bar.quota.parentElement.classList.toggle("met", opened >= quota);
  bar.chain.textContent = bestChain;
  bar.record.textContent = `round ${record.bestRound}`;

  const hint = document.getElementById("hint");
  hint.hidden = phase !== "ready";
  hint.textContent = missed
    ? "nothing there - have another go"
    : clicksLeft > 1 ? `click anywhere (${clicksLeft} clicks)` : "click anywhere";
}

function showHeld() {
  const list = document.getElementById("held");
  const mine = UPGRADES.filter((one) => have(one.id));
  list.replaceChildren(...mine.map((one) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.title = one.note;
    tag.textContent = have(one.id) > 1 ? `${one.name} ×${have(one.id)}` : one.name;
    return tag;
  }));
  list.hidden = !mine.length;
}

function showOffer() {
  const panel = document.getElementById("offer");
  panel.hidden = false;
  panel.innerHTML = `<h2>Round ${round} cleared</h2>
    <p class="sub">${opened} opened. Take one.</p>
    <div class="cards">${offer.map((one) => `
      <button class="card" data-id="${one.id}">
        <span class="card-name">${one.name}</span>
        <span class="card-note">${one.note}</span>
        <span class="card-have">${have(one.id) ? `you have ${have(one.id)}` : ""}</span>
      </button>`).join("")}</div>`;
}

// A run is counted when it ends, not when it starts, so the one you're in
// the middle of isn't in the tally yet.
function finishRun() {
  phase = "over";
  record.runs++;
  record.bestChain = Math.max(record.bestChain, bestChain);
  record.bestTotal = Math.max(record.bestTotal, total);
  store();
  showOver();
}

function showOver() {
  const panel = document.getElementById("offer");
  panel.hidden = false;
  const far = round > record.bestRound;
  panel.innerHTML = `<h2>${far ? "Best run yet" : "Run over"}</h2>
    <p class="sub">Run ${record.runs}. Round ${round}, ${total} dots opened, longest chain ${bestChain}.</p>
    <div class="cards"><button class="card wide-card" id="new-run">
      <span class="card-name">Go again</span>
      <span class="card-note">new run, no upgrades, same nerve</span>
    </button></div>`;
  document.getElementById("new-run").addEventListener("click", newRun);
}

function endRound() {
  if (opened >= quota) {
    record.bestRound = Math.max(record.bestRound, round + 1);
    record.bestChain = Math.max(record.bestChain, bestChain);
    record.bestTotal = Math.max(record.bestTotal, total);
    store();
    offerUpgrades();
  } else {
    finishRun();
  }
  showBar();
}

let last = now();

function frame() {
  const time = now();
  let dt = Math.min(time - last, 0.05);
  last = time;
  if (time < slowUntil) dt *= 0.35;      // everything drags out on a big chain

  if (phase === "going" || phase === "ready") {
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
      // A bloom that caught nothing doesn't count - it just didn't happen.
      // Ending a run on one bad click, with nothing to watch, is the least
      // satisfying thing a game like this could do.
      if (opened === 0) {
        clicksLeft = Math.max(clicksLeft, 1);
        phase = "ready";
        missed = true;
      } else if (clicksLeft > 0 && opened < quota) {
        phase = "ready";
      } else {
        endRound();
      }
      combo = 0;
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
  missed = false;
  open(e.clientX - box.left, e.clientY - box.top, "plain", 0, true);
  thud();
  shake = 4;
  showBar();
});

document.getElementById("offer").addEventListener("click", (e) => {
  const card = e.target.closest("[data-id]");
  if (card) take(card.dataset.id);
});

document.getElementById("sound-btn").addEventListener("click", (e) => {
  sound = !sound;
  e.currentTarget.textContent = sound ? "sound on" : "sound off";
});

document.getElementById("give-up").addEventListener("click", () => {
  if (phase === "offering" || phase === "over") return;
  if (confirm("Give up this run?")) finishRun();
});

function store() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(record));
  } catch (e) {
    // private browsing - the game still plays, it just won't be remembered
  }
}

function load() {
  try {
    Object.assign(record, JSON.parse(localStorage.getItem(SAVE_KEY)) || {});
  } catch (e) {
    // nothing saved yet
  }
}

window.addEventListener("resize", () => { fit(); draw(); });

load();
fit();
startRound();
showHeld();
showBar();
requestAnimationFrame(frame);
