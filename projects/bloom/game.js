// Bloom
// One click. Everything it touches opens, and everything that opens touches
// something else. The whole game is the moment you realise it hasn't stopped.
//
//   1. The world   - dots drifting about
//   2. Blooms      - the chain reaction itself
//   3. Sound       - a note per link, climbing
//   4. Feel        - particles, slow motion, the numbers that float up
//   5. Levels      - what gets harder, and what gets unlocked
//   6. The shop    - petals spent on permanent things
//   7. Drawing     - all of it, once a frame
//   8. Running     - the loop, the clicks, the saving

const SAVE_KEY = "bloom";

const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");

// ===========================================================================
// 1. The world
// ===========================================================================

const KINDS = {
  plain: { colour: "#7ee08a", worth: 1, size: 9, from: 1 },
  gold: { colour: "#f2c94c", worth: 5, size: 9, from: 3, chance: 0.05 },
  heavy: { colour: "#6fc3df", worth: 2, size: 13, from: 5, chance: 0.12, slow: true },
  splitter: { colour: "#d98ae0", worth: 3, size: 8, from: 8, chance: 0.1, splits: true },
};

let dots = [];
let blooms = [];
let sparks = [];
let floaters = [];

let level = 1;
let popped = 0;
let goal = 0;
let clicksLeft = 1;
let phase = "ready";       // ready, going, won, lost
let combo = 0;
let best = 0;
let petals = 0;
let slowUntil = 0;
let shake = 0;
let barDirty = false;      // the numbers along the top need writing again
let missed = false;        // the last bloom opened on empty space

const save = { level: 1, petals: 0, best: 0, upgrades: {}, seen: false };

const rand = (a, b) => a + Math.random() * (b - a);
const now = () => performance.now() / 1000;

// How many dots this level has, and how many of them have to open.
const levelSize = (n) => 18 + Math.floor(n * 3.2);
const levelGoal = (n) => Math.max(2, Math.round(levelSize(n) * Math.min(0.28 + n * 0.022, 0.72)));

function pickKind() {
  const allowed = Object.entries(KINDS).filter(([, kind]) => level >= kind.from && kind.chance);
  for (const [name, kind] of allowed) {
    const chance = name === "gold" ? kind.chance + up("golden") * 0.03 : kind.chance;
    if (Math.random() < chance) return name;
  }
  return "plain";
}

function startLevel() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  dots = [];
  blooms = [];
  sparks = [];
  floaters = [];
  popped = 0;
  combo = 0;
  missed = false;
  goal = levelGoal(level);
  clicksLeft = 1 + up("clicks");
  phase = "ready";

  for (let i = 0; i < levelSize(level); i++) {
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
  draw();
}

// ===========================================================================
// 2. Blooms
// ===========================================================================
//
// A bloom opens out, holds for a moment, then closes. While it's out, any dot
// it touches opens a bloom of its own - which is the whole game.

const GROW = 0.55;
const HOLD = 0.5;
const CLOSE = 0.75;

function open(x, y, kind = "plain", depth = 0) {
  const wide = 78 * (1 + up("wide") * 0.1) * (kind === "heavy" ? 1.45 : 1);
  blooms.push({
    x, y, kind, depth,
    r: 0,
    max: wide,
    age: 0,
    life: GROW + HOLD + up("hold") * 0.18 + CLOSE,
    grow: kind === "heavy" ? GROW * 1.6 : GROW,
  });
  if (KINDS[kind].splits) {
    for (let i = 0; i < 2; i++) {
      const angle = rand(0, Math.PI * 2);
      blooms.push({
        x: x + Math.cos(angle) * 40, y: y + Math.sin(angle) * 40,
        kind: "plain", depth, r: 0, max: wide * 0.6, age: 0,
        life: GROW + HOLD + CLOSE, grow: GROW,
      });
    }
  }
}

function radiusOf(bloom) {
  const hold = HOLD + up("hold") * 0.18;
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

  // anything a bloom reaches opens too
  for (const bloom of blooms) {
    if (bloom.age > bloom.life - CLOSE * 0.5) continue;   // closing blooms don't catch
    for (let i = dots.length - 1; i >= 0; i--) {
      const dot = dots[i];
      const gap = Math.hypot(dot.x - bloom.x, dot.y - bloom.y);
      if (gap > bloom.r + dot.r) continue;

      dots.splice(i, 1);
      popped++;
      combo++;
      const worth = KINDS[dot.kind].worth + up("petal");
      petals += worth;
      best = Math.max(best, combo);

      open(dot.x, dot.y, dot.kind, bloom.depth + 1);
      burst(dot.x, dot.y, KINDS[dot.kind].colour, dot.kind === "gold" ? 26 : 14);
      float(dot.x, dot.y, `+${worth}`, KINDS[dot.kind].colour);
      note(combo);
      barDirty = true;      // watching the count climb is half the fun
      shake = Math.min(shake + (dot.kind === "gold" ? 5 : 2.2), 14);
      if (combo >= 6) slowUntil = now() + 0.55 + up("slow") * 0.35;
    }
  }
}

// ===========================================================================
// 3. Sound
// ===========================================================================
//
// One note per link, climbing a pentatonic scale, so a long chain plays a
// little tune that goes up and up. This is most of the satisfaction.

let audio = null;
let sound = true;

const STEPS = [0, 2, 4, 7, 9];   // pentatonic: no wrong notes, however long the chain

function note(n) {
  if (!sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();

    const step = STEPS[(n - 1) % STEPS.length] + 12 * Math.floor((n - 1) / STEPS.length);
    const freq = 261.6 * 2 ** (Math.min(step, 38) / 12);

    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, audio.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.5);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.55);
  } catch (e) {
    sound = false;   // no audio here; the game is fine without it
  }
}

function thud() {
  if (!sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, audio.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, audio.currentTime + 0.25);
    gain.gain.setValueAtTime(0.2, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.3);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.32);
  } catch (e) {
    sound = false;
  }
}

// ===========================================================================
// 4. Feel
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

// ===========================================================================
// 5. Levels
// ===========================================================================

const WORDS = [
  [3, "nice"], [5, "lovely"], [8, "chain!"], [12, "unstoppable"],
  [16, "absurd"], [22, "ludicrous"], [30, "stop it"], [40, "you monster"],
];

const wordFor = (n) => {
  let word = "";
  for (const [mark, text] of WORDS) if (n >= mark) word = text;
  return word;
};

function finish() {
  phase = popped >= goal ? "won" : "lost";
  if (phase === "won") {
    save.level = Math.max(save.level, level + 1);
    float(canvas.clientWidth / 2, canvas.clientHeight / 2 - 40, "level clear", "#7ee08a");
  }
  save.petals = petals;
  save.best = best;
  store();
  showBar();
}

// ===========================================================================
// 6. The shop
// ===========================================================================

const SHOP = [
  { id: "wide", name: "Wider bloom", note: "every bloom opens 10% further", cost: 40, step: 1.9, most: 6 },
  { id: "hold", name: "Slower to close", note: "blooms stay open longer", cost: 60, step: 2.1, most: 5 },
  { id: "clicks", name: "Another click", note: "start a second chain if the first fizzles", cost: 300, step: 4, most: 2 },
  { id: "golden", name: "Golden touch", note: "more gold dots, worth five each", cost: 90, step: 2, most: 5 },
  { id: "slow", name: "Longer slow motion", note: "time drags out further on a big chain", cost: 120, step: 2, most: 4 },
  { id: "petal", name: "Richer petals", note: "every dot pays one more", cost: 150, step: 2.4, most: 5 },
];

const up = (id) => save.upgrades[id] || 0;
const costOf = (item) => Math.round(item.cost * item.step ** up(item.id));

function buy(id) {
  const item = SHOP.find((one) => one.id === id);
  if (!item || up(id) >= item.most) return;
  const cost = costOf(item);
  if (petals < cost) return;
  petals -= cost;
  save.upgrades[id] = up(id) + 1;
  save.petals = petals;
  store();
  showShop();
  showBar();
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
    const kind = KINDS[dot.kind];
    const wobble = Math.sin(now() * 2 + dot.wobble) * 1.2;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r + wobble, 0, Math.PI * 2);
    ctx.fillStyle = kind.colour;
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

  // the chain, counted out in the middle of the screen
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
  level: document.getElementById("level"),
  goal: document.getElementById("goal"),
  petals: document.getElementById("petals"),
  best: document.getElementById("best"),
  message: document.getElementById("message"),
  again: document.getElementById("again"),
};

function showBar() {
  bar.level.textContent = level;
  bar.goal.textContent = `${popped} / ${goal}`;
  bar.petals.textContent = petals.toLocaleString();
  bar.best.textContent = best;

  const clear = phase === "won";
  bar.message.hidden = phase === "ready" || phase === "going";
  if (!bar.message.hidden) {
    bar.message.className = `message ${clear ? "good" : "bad"}`;
    bar.message.textContent = clear
      ? `${popped} of ${goal}. Through to level ${level + 1}.`
      : `${popped} of ${goal}. Not quite.`;
    bar.again.textContent = clear ? "next level" : "again";
  }
  bar.again.hidden = !(phase === "won" || phase === "lost");
  const hint = document.getElementById("hint");
  hint.hidden = phase !== "ready";
  hint.textContent = missed ? "nothing there - have another go" : "click anywhere";
}

function showShop() {
  const list = document.getElementById("shop-list");
  list.replaceChildren(...SHOP.map((item) => {
    const owned = up(item.id);
    const maxed = owned >= item.most;
    const cost = costOf(item);
    const row = document.createElement("button");
    row.className = `buy${maxed ? " maxed" : ""}${!maxed && petals >= cost ? " afford" : ""}`;
    row.disabled = maxed || petals < cost;
    row.dataset.id = item.id;
    row.innerHTML = `<span class="buy-name">${item.name}</span>
      <span class="buy-note">${item.note}</span>
      <span class="buy-cost">${maxed ? "done" : `${cost} petals`}</span>
      <span class="pips">${"●".repeat(owned)}${"○".repeat(item.most - owned)}</span>`;
    return row;
  }));
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
      // A bloom that caught nothing at all doesn't count - it just didn't
      // happen. Losing a level to one bad click, with nothing to watch,
      // is the least satisfying thing a game like this can do.
      if (popped === 0) {
        clicksLeft = Math.max(clicksLeft, 1);
        phase = "ready";
        missed = true;
      } else if (clicksLeft > 0 && popped < goal) {
        phase = "ready";
      } else {
        finish();
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
  if (phase === "won" || phase === "lost" || clicksLeft <= 0) return;
  const box = canvas.getBoundingClientRect();
  clicksLeft--;
  phase = "going";
  combo = 0;
  missed = false;
  open(e.clientX - box.left, e.clientY - box.top);
  thud();
  shake = 4;
  showBar();
});

bar.again.addEventListener("click", () => {
  if (phase === "won") level += 1;
  startLevel();
  showBar();
});

document.getElementById("shop-btn").addEventListener("click", () => {
  const shop = document.getElementById("shop");
  shop.classList.toggle("open");
  document.getElementById("shop-btn").setAttribute("aria-expanded", String(shop.classList.contains("open")));
  showShop();
});

document.getElementById("shop-list").addEventListener("click", (e) => {
  const row = e.target.closest("[data-id]");
  if (row) buy(row.dataset.id);
});

document.getElementById("sound-btn").addEventListener("click", (e) => {
  sound = !sound;
  e.currentTarget.textContent = sound ? "sound on" : "sound off";
});

function store() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (e) {
    // private browsing - the game still plays, it just won't be remembered
  }
}

function load() {
  try {
    Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)) || {});
  } catch (e) {
    // nothing saved yet
  }
  level = save.level || 1;
  petals = save.petals || 0;
  best = save.best || 0;
  save.upgrades = save.upgrades || {};
}

window.addEventListener("resize", () => { fit(); draw(); });

load();
fit();
startLevel();
showBar();
showShop();
requestAnimationFrame(frame);
