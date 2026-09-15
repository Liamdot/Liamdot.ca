// Idle Typer
// Type the words on the screen to earn bits. Buy shop items that earn more or
// type for you, unlock one-time upgrades that make them better, and collect
// achievements along the way.
//
// This file is split into parts:
//   1. Settings    - words, shop items, upgrades, achievements. Start by changing these!
//   2. State       - the things that change while you play
//   3. Helpers     - small functions that do math, check unlocks, show sizes
//   4. Drawing     - putting everything on the page
//   5. Input       - typing, buying, opening the achievements page
//   6. Game loop   - earning bits over time, and saving
//
// Ideas for what to add are at the bottom of the file.

// ===========================================================================
// 1. Settings
// ===========================================================================

// Where progress is saved. Give every game its own name, or they'll share
// (and overwrite) each other's saves.
const SAVE_KEY = "idle-typer-save";

// The words you have to type. Add, remove or change them however you like.
// Keep them lowercase, with no spaces.
const WORDS = [
  "ssh", "sudo", "grep", "ping", "root", "hack", "proxy", "kernel",
  "server", "packet", "script", "binary", "cipher", "access", "payload",
  "exploit", "decrypt", "encrypt", "compile", "bypass", "firewall",
  "override", "terminal", "download", "password", "backdoor", "mainframe",
  "localhost",
];

// How many words to line up on the screen (the current one + the ones coming up).
const WORDS_ON_SCREEN = 10;

// ---- Shop items -----------------------------------------------------------
// Things you can buy as many times as you want.
// Everything is counted in bits (8 bits = 1 byte, 8192 bits = 1 KB).
//
//   name      - shown in the shop. Upgrades refer to items by this name.
//   perLetter - extra bits you get for each letter of a word you finish
//   perSecond - bits you get automatically every second
//   baseCost  - price of the first one, in bits (each one after costs more)
//
// The description in the shop ("+1 bit per letter") is written automatically
// from these numbers, and goes up when you buy upgrades.
const ITEMS = [
  { name: "Keycap", baseCost: 16, perLetter: 1, perSecond: 0 },
  { name: "Auto-Typer",     baseCost: 64, perLetter: 0, perSecond: 1 },
];

// Each purchase makes the next one of that item 15% more expensive.
const COST_GROWTH = 1.15;

// ---- Unlock rules ---------------------------------------------------------
// Upgrades and achievements both use these to decide when they unlock.
// Use any mix of them - all of them must be true:
//
//   own: "Faster Fingers", count: 5   own at least 5 of a shop item
//   wordsTyped: 50                    finished at least 50 words
//   totalBits: 8192                   earned at least this many bits, ever
//   upgradesBought: 3                 bought at least 3 upgrades

// ---- Upgrades -------------------------------------------------------------
// One-time purchases. Each one stays hidden until its unlock rules are met,
// then it shows up in the upgrades window.
//
//   name   - must be different for every upgrade (saves use it to remember what you bought)
//   icon   - a few characters shown on the tile
//   desc   - what it does, shown when you hover over it
//   cost   - price in bits
//   unlock - when it shows up (see "Unlock rules" above)
//
//   effect - what it does once you buy it. Use one of these:
//              item: "Auto-Typer", multiply: 2   that shop item gives 2x as much
//              typing: 2                         all bits from typing words x2
//              idle: 2                           all bits per second x2
const UPGRADES = [
  {
    name: "Home Row",
    icon: "asdf",
    desc: "You finally learned where your fingers go. Bits from typing x2.",
    cost: 64,
    unlock: { wordsTyped: 10 },
    effect: { typing: 2 },
  },
  {
    name: "Ergonomic Keyboard",
    icon: "[_]",
    desc: "Faster Fingers are twice as good.",
    cost: 160,
    unlock: { own: "Faster Fingers", count: 5 },
    effect: { item: "Faster Fingers", multiply: 2 },
  },
  {
    name: "Overclocked Auto-Typers",
    icon: "^^",
    desc: "Auto-Typers are twice as fast.",
    cost: 400,
    unlock: { own: "Auto-Typer", count: 5 },
    effect: { item: "Auto-Typer", multiply: 2 },
  },
  {
    name: "Mechanical Switches",
    icon: "<*>",
    desc: "Clicky. Bits from typing x2.",
    cost: 2000,
    unlock: { wordsTyped: 100 },
    effect: { typing: 2 },
  },
  {
    name: "Botnet",
    icon: "@@@",
    desc: "Borrow a few thousand computers. All bits per second x2.",
    cost: 8192,
    unlock: { own: "Auto-Typer", count: 10, totalBits: 8192 },
    effect: { idle: 2 },
  },
];

// ---- Achievements ---------------------------------------------------------
// Earned automatically when their unlock rules are met. Once earned, they stay
// earned. They're listed on the achievements page (the trophy button).
//
//   name   - must be different for every achievement (saves use it)
//   desc   - how to get it
//   unlock - when you earn it (see "Unlock rules" above)
//   secret - optional. If true, it shows as "???" until you earn it.
const ACHIEVEMENTS = [
  { name: "Hello, World!",   desc: "Type your first word. We all have to start somewhere.",         unlock: { wordsTyped: 1 } },
  { name: "Tux Typist",  desc: "Type 50 words. ",                unlock: { wordsTyped: 50 } },
  { name: "Typeracer",   desc: "Type 250 words. Bet you couldn't beat me at typeracer.",               unlock: { wordsTyped: 250 } },
  { name: "Monkeytype Master",   desc: "Type 1000 words. You are now better than 1% of Monkeytype users.",               unlock: { wordsTyped: 1000 } },
  { name: "Byte Me",        desc: "Earn your first byte!",           unlock: { totalBits: 8 } },
  { name: "Kilobyte",       desc: "Earn 1 KB in total.",             unlock: { totalBits: 8192 } },
  { name: "Megabyte",       desc: "Earn 1 MB in total.",             unlock: { totalBits: 8 * 1024 ** 2 } },
  { name: "Gigabyte",       desc: "Earn 1 GB in total.",             unlock: { totalBits: 8 * 1024 ** 3 } },
  { name: "Ten Fingers",    desc: "Own 10 Faster Fingers.",          unlock: { own: "Faster Fingers", count: 10 } },
  { name: "Automation",     desc: "Buy your first Auto-Typer.",      unlock: { own: "Auto-Typer", count: 1 } },
  { name: "Shopaholic",     desc: "Buy 3 upgrades.",                 unlock: { upgradesBought: 3 } },
  { name: "Mainframe",      desc: "Finish 1,000 words.",             unlock: { wordsTyped: 1000 }, secret: true },
];

// ===========================================================================
// 2. State
// ===========================================================================

let bits = 0;                    // bits you have right now
let totalBits = 0;               // bits you've earned ever (spending doesn't lower it)
let wordsTyped = 0;              // words you've finished
let owned = ITEMS.map(() => 0);  // how many of each shop item you own, like [2, 1]
let bought = [];                 // names of upgrades you've bought
let earned = [];                 // names of achievements you've earned

let queue = [];  // the words on screen. queue[0] is the one you're typing now
let input = "";  // what you've typed so far for queue[0], mistakes included

fillQueue();

// ===========================================================================
// 3. Helpers
// ===========================================================================

// ---- Shop items ----

// Finds a shop item's position in the ITEMS list from its name (-1 if not found).
function itemIndex(name) {
  return ITEMS.findIndex((item) => item.name === name);
}

function itemCost(i) {
  return Math.ceil(ITEMS[i].baseCost * COST_GROWTH ** owned[i]);
}

// What one of this item gives you right now, with all your upgrades counted.
// Like "+2 bits per letter" or "+1.5 bytes/sec".
function itemDescription(i) {
  const item = ITEMS[i];
  const parts = [];
  if (item.perLetter > 0) {
    const amount = item.perLetter * itemMultiplier(item.name) * globalMultiplier("typing");
    parts.push(`+${formatBits(amount, "rate")} per letter`);
  }
  if (item.perSecond > 0) {
    const amount = item.perSecond * itemMultiplier(item.name) * globalMultiplier("idle");
    parts.push(`+${formatBits(amount, "rate")}/sec`);
  }
  return parts.join(", ");
}

// ---- Unlock rules ----

// Checks every rule in an "unlock" object. All of them must be true.
function meetsRules(rules) {
  if (rules.own !== undefined) {
    const i = itemIndex(rules.own);
    if (i === -1 || owned[i] < (rules.count || 1)) return false;
  }
  if (rules.wordsTyped !== undefined && wordsTyped < rules.wordsTyped) return false;
  if (rules.totalBits !== undefined && totalBits < rules.totalBits) return false;
  if (rules.upgradesBought !== undefined && bought.length < rules.upgradesBought) return false;

  return true;
}

// ---- Upgrades ----

function hasBought(upgrade) {
  return bought.includes(upgrade.name);
}

// How much bought upgrades multiply one shop item by.
function itemMultiplier(name) {
  let multiplier = 1;
  for (const upgrade of UPGRADES) {
    if (hasBought(upgrade) && upgrade.effect.item === name) {
      multiplier *= upgrade.effect.multiply;
    }
  }
  return multiplier;
}

// How much bought upgrades multiply all typing (or all idle) bits by.
// type is "typing" or "idle".
function globalMultiplier(type) {
  let multiplier = 1;
  for (const upgrade of UPGRADES) {
    if (hasBought(upgrade) && upgrade.effect[type]) {
      multiplier *= upgrade.effect[type];
    }
  }
  return multiplier;
}

// ---- Achievements ----

function hasEarned(achievement) {
  return earned.includes(achievement.name);
}

// Gives you any achievements whose rules are now met.
// showPopups is false when loading a save, so you don't get a flood of pop-ups.
function checkAchievements(showPopups) {
  for (const achievement of ACHIEVEMENTS) {
    if (!hasEarned(achievement) && meetsRules(achievement.unlock)) {
      earned.push(achievement.name);
      if (showPopups) showAchievementPopup(achievement);
    }
  }
}

// ---- Earning ----

function bitsPerLetter() {
  let total = 1;
  for (let i = 0; i < ITEMS.length; i++) {
    total += ITEMS[i].perLetter * owned[i] * itemMultiplier(ITEMS[i].name);
  }
  return total * globalMultiplier("typing");
}

function bitsPerSecond() {
  let total = 0;
  for (let i = 0; i < ITEMS.length; i++) {
    total += ITEMS[i].perSecond * owned[i] * itemMultiplier(ITEMS[i].name);
  }
  return total * globalMultiplier("idle");
}

function earn(amount) {
  bits += amount;
  totalBits += amount;
}

// ---- Words ----

// Picks a random word that isn't the same as the one before it.
function pickWord(previous) {
  if (WORDS.length < 2) return WORDS[0];
  let next = previous;
  while (next === previous) {
    next = WORDS[Math.floor(Math.random() * WORDS.length)];
  }
  return next;
}

// Adds random words to the end of the queue until the screen is full.
function fillQueue() {
  while (queue.length < WORDS_ON_SCREEN) {
    queue.push(pickWord(queue[queue.length - 1]));
  }
}

// ---- Showing sizes ----

// Turns a number of bits into something readable:
//   5 -> "5 bits", 20 -> "2.5 bytes", 16000 -> "1.9 KB", 9000000 -> "1 MB"
//
// 8 bits = 1 byte, and each unit after that is 1024 of the one before.
//
// mode changes how it rounds:
//   "down" - round down, so you never see more than you have (the default)
//   "up"   - round up, for prices, so you never think you can afford something you can't
//   "rate" - like "down", but allows things like "0.5 bits" (for per-second rates)
const BIG_UNITS = ["KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

function formatBits(n, mode = "down") {
  if (n < 8) {
    const amount = mode === "rate" ? round(n, "down") : mode === "up" ? Math.ceil(n) : Math.floor(n);
    return `${amount} ${amount === 1 ? "bit" : "bits"}`;
  }

  let value = n / 8; // bits -> bytes
  if (value < 1024) {
    const amount = round(value, mode);
    return `${amount} ${amount === 1 ? "byte" : "bytes"}`;
  }

  let unit = -1;
  while (value >= 1024 && unit < BIG_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${round(value, mode)} ${BIG_UNITS[unit]}`;
}

// Rounds to 1 decimal place for small numbers (2.57 -> 2.5 or 2.6), and to a
// whole number once it's 100 or more.
function round(value, mode) {
  const roundFn = mode === "up" ? Math.ceil : Math.floor;
  if (value >= 100) return roundFn(value);
  return roundFn(value * 10) / 10;
}

// Warns in the console (Cmd+Option+J) if an upgrade or achievement mentions a
// shop item that doesn't exist - usually a typo in the name.
for (const thing of [...UPGRADES, ...ACHIEVEMENTS]) {
  for (const name of [thing.unlock.own, thing.effect && thing.effect.item]) {
    if (name !== undefined && itemIndex(name) === -1) {
      console.warn(`"${thing.name}" mentions a shop item called "${name}", but there isn't one.`);
    }
  }
}

// ===========================================================================
// 4. Drawing
// ===========================================================================

// Grab the elements from index.html that we'll be changing.
const bitsEl = document.getElementById("bits");
const perSecondEl = document.getElementById("per-second");
const perLetterEl = document.getElementById("per-letter");
const typedEl = document.getElementById("typed");
const todoEl = document.getElementById("todo");
const upcomingEl = document.getElementById("upcoming");
const hintEl = document.getElementById("hint");
const upgradeTilesEl = document.getElementById("upgrade-tiles");
const upgradeInfoEl = document.getElementById("upgrade-info");
const shopEl = document.getElementById("shop");
const achievementsBtn = document.getElementById("achievements-btn");
const achievementsPage = document.getElementById("achievements");
const achievementListEl = document.getElementById("achievement-list");
const achievementCountEl = document.getElementById("achievement-count");
const popupsEl = document.getElementById("popups");

// Make the shop buttons, upgrade tiles and achievement cards. We only create
// these once, then render() just updates them. (Rebuilding buttons many times
// a second would break clicking on them.)
const shopButtons = ITEMS.map((item, i) => {
  const button = document.createElement("button");
  button.className = "item";
  button.innerHTML = `
    <span class="name">${item.name}</span>
    <span class="owned"></span>
    <span class="desc"></span>
    <span class="cost"></span>`;
  button.addEventListener("click", () => buyItem(i));
  shopEl.appendChild(button);
  return button;
});

let hoveredUpgrade = -1; // which upgrade tile the mouse is over (-1 means none)

const upgradeTiles = UPGRADES.map((upgrade, i) => {
  const tile = document.createElement("button");
  tile.className = "upgrade-tile";
  tile.textContent = upgrade.icon;
  tile.setAttribute("aria-label", upgrade.name);
  tile.hidden = true;

  tile.addEventListener("click", () => buyUpgrade(i));

  // Show its details while hovered (or selected with the Tab key).
  const showInfo = () => { hoveredUpgrade = i; render(); };
  const hideInfo = () => { hoveredUpgrade = -1; render(); };
  tile.addEventListener("mouseenter", showInfo);
  tile.addEventListener("focus", showInfo);
  tile.addEventListener("mouseleave", hideInfo);
  tile.addEventListener("blur", hideInfo);

  upgradeTilesEl.appendChild(tile);
  return tile;
});

const achievementCards = ACHIEVEMENTS.map(() => {
  const card = document.createElement("div");
  card.className = "achievement";
  card.innerHTML = `
    <span class="a-name"></span>
    <span class="a-desc"></span>`;
  achievementListEl.appendChild(card);
  return card;
});

function render() {
  bitsEl.textContent = formatBits(bits);
  perSecondEl.textContent = formatBits(bitsPerSecond(), "rate");
  perLetterEl.textContent = formatBits(bitsPerLetter(), "rate");

  // The screen, left to right:
  //   what you've typed (green if right, red if wrong), the cursor,
  //   the rest of the word (white), then the words coming up (grey)
  const word = queue[0];

  typedEl.textContent = ""; // clear it, then add one <span> per typed letter
  for (let i = 0; i < input.length; i++) {
    const letter = document.createElement("span");
    letter.textContent = input[i];
    letter.className = input[i].toLowerCase() === word[i] ? "ok" : "bad";
    typedEl.appendChild(letter);
  }

  todoEl.textContent = word.slice(input.length);
  upcomingEl.textContent = " " + queue.slice(1).join(" ");

  // Upgrades window: show tiles for upgrades that are unlocked but not bought.
  let anyShowing = false;
  for (let i = 0; i < UPGRADES.length; i++) {
    const upgrade = UPGRADES[i];
    const tile = upgradeTiles[i];
    tile.hidden = hasBought(upgrade) || !meetsRules(upgrade.unlock);
    tile.classList.toggle("cant-afford", bits < upgrade.cost);
    if (!tile.hidden) anyShowing = true;
  }

  if (hoveredUpgrade !== -1 && !upgradeTiles[hoveredUpgrade].hidden) {
    const upgrade = UPGRADES[hoveredUpgrade];
    upgradeInfoEl.innerHTML = `
      <span class="up-name">${upgrade.name}</span>
      <span class="up-cost">${formatBits(upgrade.cost, "up")}</span><br>
      ${upgrade.desc}`;
  } else if (anyShowing) {
    upgradeInfoEl.textContent = "hover an upgrade to see what it does";
  } else {
    upgradeInfoEl.textContent = "nothing yet - keep typing";
  }

  // Shop
  for (let i = 0; i < ITEMS.length; i++) {
    const button = shopButtons[i];
    button.querySelector(".owned").textContent = owned[i];
    button.querySelector(".desc").textContent = itemDescription(i);
    button.querySelector(".cost").textContent = formatBits(itemCost(i), "up");
    button.disabled = bits < itemCost(i);
  }

  // Achievements page
  const percent = Math.floor((earned.length / ACHIEVEMENTS.length) * 100); // round down, so 100% means all of them
  achievementCountEl.textContent = `${earned.length} / ${ACHIEVEMENTS.length} (${percent}%)`;
  for (let i = 0; i < ACHIEVEMENTS.length; i++) {
    const achievement = ACHIEVEMENTS[i];
    const card = achievementCards[i];
    const got = hasEarned(achievement);
    const hideIt = achievement.secret && !got;

    card.classList.toggle("earned", got);
    card.querySelector(".a-name").textContent = hideIt ? "???" : achievement.name;
    card.querySelector(".a-desc").textContent = hideIt ? "A secret." : achievement.desc;
  }
}

// Shows the reward text under the screen, which then fades away (see .fade in style.css).
function showReward(text) {
  hintEl.textContent = text;
  hintEl.classList.remove("fade");
  void hintEl.offsetWidth; // forces the fade to start over if you finish another word quickly
  hintEl.classList.add("fade");
}

// Shows an "Achievement unlocked" pop-up in the corner, which removes itself
// when its animation finishes (see .popup in style.css).
function showAchievementPopup(achievement) {
  const popup = document.createElement("div");
  popup.className = "popup";
  popup.innerHTML = `<span class="popup-label">achievement unlocked</span>`;
  const name = document.createElement("span");
  name.className = "popup-name";
  name.textContent = achievement.name;
  popup.appendChild(name);

  popup.addEventListener("animationend", () => popup.remove());
  popupsEl.appendChild(popup);
}

// ===========================================================================
// 5. Input
// ===========================================================================

// Called for every letter you type.
function typeLetter(letter) {
  const word = queue[0];

  // You can't type past the end of the word. If you're at the end and some
  // letters are wrong, you have to backspace and fix them.
  if (input.length >= word.length) return;

  input += letter;
  render();
}

// Called when you press Space. If the word is typed correctly, you get paid
// and move on to the next one. Otherwise nothing happens - finish or fix it first.
function submitWord() {
  const word = queue[0];
  if (input.toLowerCase() !== word) return;

  const reward = word.length * bitsPerLetter();
  earn(reward);
  wordsTyped++;
  showReward(`+${formatBits(reward)}`);

  queue.shift(); // remove the finished word from the front
  fillQueue();   // add a new one to the end
  input = "";

  render();
}

// Backspace removes the last letter you typed.
function backspace() {
  input = input.slice(0, -1);
  render();
}

window.addEventListener("keydown", (e) => {
  // Escape closes the achievements page.
  if (e.key === "Escape") {
    setAchievementsOpen(false);
    return;
  }

  // No typing while the achievements page is open.
  if (!achievementsPage.hidden) return;

  // Ignore shortcuts like Cmd+R.
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.key === "Backspace") {
    e.preventDefault(); // some browsers go "back" a page on Backspace
    backspace();
    return;
  }

  // Ignore keys like Shift or the Arrow keys, and keys being held down.
  if (e.key.length !== 1) return;
  if (e.repeat) return;

  // Stop Space from scrolling the page or pressing a focused button.
  e.preventDefault();

  // Space finishes the word.
  if (e.key === " ") {
    submitWord();
    return;
  }

  typeLetter(e.key);
});

function buyItem(i) {
  const cost = itemCost(i);
  if (bits < cost) return; // can't afford it
  bits -= cost;
  owned[i]++;
  render();
}

function buyUpgrade(i) {
  const upgrade = UPGRADES[i];
  if (hasBought(upgrade) || !meetsRules(upgrade.unlock)) return;
  if (bits < upgrade.cost) return; // can't afford it
  bits -= upgrade.cost;
  bought.push(upgrade.name);
  hoveredUpgrade = -1; // its tile disappears, so stop showing its details
  render();
}

// Opening and closing the achievements page.
function setAchievementsOpen(open) {
  achievementsPage.hidden = !open;
  achievementsBtn.setAttribute("aria-expanded", open);
  render();
}

achievementsBtn.addEventListener("click", () => setAchievementsOpen(achievementsPage.hidden));
document.getElementById("achievements-close").addEventListener("click", () => setAchievementsOpen(false));

// Clicking the empty space around the list closes it too.
achievementsPage.addEventListener("click", (e) => {
  if (e.target === achievementsPage) setAchievementsOpen(false);
});

// ===========================================================================
// 6. Game loop + saving
// ===========================================================================

// Every 100ms, add however many bits were earned since last time, and check
// for new achievements. Using the real time passed keeps things fair if the
// browser slows the timer down (like when the tab is hidden).
let lastTick = Date.now();

setInterval(() => {
  const now = Date.now();
  const seconds = (now - lastTick) / 1000;
  lastTick = now;
  earn(bitsPerSecond() * seconds);
  checkAchievements(true);
  render();
}, 100);

// Saving uses localStorage, which keeps small bits of data in this browser.
function save() {
  try {
    const data = { bits, totalBits, wordsTyped, owned, bought, earned };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    // saving can fail (e.g. private browsing) - the game still works
  }
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!data) return;
    bits = data.bits || data.chars || 0; // older saves called it "chars"
    totalBits = data.totalBits || bits;
    wordsTyped = data.wordsTyped || 0;
    owned = ITEMS.map((_, i) => (data.owned && data.owned[i]) || 0);
    // only keep upgrades and achievements that still exist (in case you renamed or removed one)
    bought = (data.bought || []).filter((name) => UPGRADES.some((u) => u.name === name));
    earned = (data.earned || []).filter((name) => ACHIEVEMENTS.some((a) => a.name === name));
  } catch (e) {
    // broken or missing save - just start fresh
  }
}

document.getElementById("reset-btn").addEventListener("click", () => {
  if (!confirm("Erase all your progress?")) return;
  bits = 0;
  totalBits = 0;
  wordsTyped = 0;
  owned = ITEMS.map(() => 0);
  bought = [];
  earned = [];
  queue = [];
  fillQueue();
  input = "";
  hintEl.textContent = "";
  save();
  render();
});

setInterval(save, 5000);                   // save every 5 seconds
window.addEventListener("pagehide", save); // and when leaving the page

load();
checkAchievements(false); // quietly catch up on anything already earned
render();

// ===========================================================================
// Ideas to try
// ===========================================================================
//
// - More shop items (a Script Kiddie? a Server Farm?) and upgrades for them
// - A new unlock rule, like "type 20 words without a mistake"
// - Achievements that give a small bonus, like +1% bits per achievement
// - Longer, harder words that unlock once you've earned enough
// - Show how fast you're typing (words per minute)
