// Time Waster
// It counts. That's it. That's the game.
//
//   1. Counting     - the clock, and what counts as wasted
//   2. Saying it    - turning seconds into words, and the running commentary
//   3. The board    - everyone else's wasted time

// ===========================================================================
// 1. Counting
// ===========================================================================
//
// Only time with this page in front of you counts. Leaving it open in a
// background tab would win by doing nothing, which isn't in the spirit.

const SAVE_KEY = "time-waster";
const TICK_MS = 100;
const SEND_EVERY = 20;   // seconds between leaderboard updates

const save = (() => {
  let data = { total: 0, id: "", key: "", name: "" };
  try {
    Object.assign(data, JSON.parse(localStorage.getItem(SAVE_KEY)) || {});
  } catch (e) {
    // no saved time - starting from nothing
  }
  return data;
})();

const store = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (e) {
    // private browsing - this visit still counts, it just won't be remembered
  }
};

let session = 0;        // seconds wasted since the page opened
let last = Date.now();
let sinceSend = 0;

const watching = () => document.visibilityState === "visible" && document.hasFocus();

function tick() {
  const now = Date.now();
  const gap = (now - last) / 1000;
  last = now;

  // A big gap means the browser stopped calling us (asleep, other tab), so
  // it isn't time spent here.
  if (watching() && gap < 2) {
    session += gap;
    save.total += gap;
    sinceSend += gap;
    if (sinceSend >= SEND_EVERY) {
      sinceSend = 0;
      sendScore();
    }
  }
  draw();
}

document.addEventListener("visibilitychange", () => { last = Date.now(); });
window.addEventListener("blur", () => { last = Date.now(); });
window.addEventListener("focus", () => { last = Date.now(); });
window.addEventListener("pagehide", () => { store(); sendScore(); });
setInterval(store, 5000);
setInterval(tick, TICK_MS);

// ===========================================================================
// 2. Saying it
// ===========================================================================

const UNITS = [
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

// 3725 -> "1 hour, 2 minutes". Two parts is plenty.
function spell(seconds, parts = 2) {
  let left = Math.floor(seconds);
  const said = [];
  for (const [name, size] of UNITS) {
    const n = Math.floor(left / size);
    if (n > 0 || (said.length === 0 && size === 1)) {
      said.push(`${n} ${name}${n === 1 ? "" : "s"}`);
      left -= n * size;
    }
    if (said.length === parts) break;
  }
  return said.join(", ");
}

// Spelled out in full: "2 days, 4 hours, 1 minute and 9 seconds". Once the
// biggest unit has turned up, every smaller one is named even at zero -
// otherwise an exact hour reads "1 hour and 0 seconds", and units would pop
// in and out of the sentence as the numbers roll over.
function sentence(seconds) {
  let left = Math.floor(seconds);
  const said = [];
  for (const [name, size] of UNITS) {
    const n = Math.floor(left / size);
    left -= n * size;
    if (said.length || n > 0 || size === 1) said.push(`${n} ${name}${n === 1 ? "" : "s"}`);
  }
  const last = said.pop();
  return said.length ? `${said.join(", ")} and ${last}` : last;
}

// What you could have been doing instead. Whichever is the last one you've
// passed is the one you get told about.
const INSTEAD = [
  [10, "You could have stood up."],
  [30, "That's a decent stretch."],
  [60, "A whole minute. Gone."],
  [120, "Two minutes. That's a kettle."],
  [300, "Five minutes. That's a short walk you didn't take."],
  [600, "Ten minutes. That's a bus you could have caught."],
  [900, "Fifteen minutes. People have run three kilometres in this."],
  [1800, "Half an hour. That's a sitcom, minus the adverts."],
  [2700, "Forty-five minutes. That's a lecture."],
  [3600, "An hour. A whole hour, on this."],
  [5400, "An hour and a half. That's a film."],
  [7200, "Two hours. That's a film and the arguing about it afterwards."],
  [10800, "Three hours. That's a flight to somewhere nicer than this."],
  [14400, "Four hours. You could have learned the basics of an instrument."],
  [21600, "Six hours. That's a working day, more or less."],
  [28800, "Eight hours. That's a full night's sleep you're awake for."],
  [43200, "Twelve hours. This is a hobby now."],
  [86400, "A full day. Genuinely, well done. Sort of."],
];

const commentary = (seconds) => {
  let line = "Time starts now.";
  for (const [mark, words] of INSTEAD) {
    if (seconds >= mark) line = words;
  }
  return line;
};

const bigEl = document.getElementById("big");
const insteadEl = document.getElementById("instead");

function draw() {
  bigEl.textContent = `You've wasted ${sentence(session)}`;
  insteadEl.textContent = commentary(session);
  drawMine();
}

// ===========================================================================
// 3. The board
// ===========================================================================
//
// The server only ever believes a total that could have happened - whatever
// it had before, plus the time that has really passed since - so nobody can
// simply claim a thousand hours.

const API = String(window.WASTE_API || "").replace(/\/+$/, "");
const boardEl = document.getElementById("board");
const nameEl = document.getElementById("name");
const joinEl = document.getElementById("join");
const noteEl = document.getElementById("board-note");
const mineEl = document.getElementById("mine");

let leaders = [];   // not "top": the browser already has a window.top
let sending = false;

nameEl.value = save.name;
joinEl.textContent = save.id ? "update my time" : "put me on the board";

async function ask(route, body) {
  const response = await fetch(API + route, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "no answer");
  return data;
}

function drawBoard() {
  boardEl.replaceChildren(...leaders.map((row, i) => {
    const line = document.createElement("li");
    line.className = row.name === save.name && save.id ? "row you" : "row";
    const place = document.createElement("span");
    place.className = "place";
    place.textContent = `${i + 1}`;
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = row.name;
    const much = document.createElement("span");
    much.className = "much";
    much.textContent = spell(row.seconds);
    line.append(place, who, much);
    return line;
  }));
  if (!leaders.length) boardEl.replaceChildren(Object.assign(document.createElement("li"), {
    className: "row empty-row",
    textContent: "Nobody has wasted any time yet.",
  }));
}

function drawMine() {
  const all = `All time: <b>${spell(save.total)}</b>.`;
  if (!save.id) {
    mineEl.innerHTML = all;
    return;
  }
  const place = leaders.findIndex((row) => row.name === save.name);
  mineEl.innerHTML = place >= 0 ? `${all} You're number ${place + 1}.` : `${all} Not on the board yet.`;
}

async function loadBoard() {
  if (!API) {
    noteEl.textContent = "The leaderboard isn't switched on here.";
    return;
  }
  try {
    const data = await ask("/waste/top");
    leaders = data.top || [];
    noteEl.textContent = data.people
      ? `${data.people} ${data.people === 1 ? "person has" : "people have"} wasted ${spell(data.seconds)} between them.`
      : "";
    drawBoard();
    drawMine();
  } catch (e) {
    noteEl.textContent = "Can't reach the leaderboard right now.";
  }
}

// Sends the total, quietly. Only does anything once you've joined.
async function sendScore() {
  if (!API || !save.id || sending) return;
  sending = true;
  try {
    const data = await ask("/waste", {
      id: save.id, key: save.key, name: save.name, seconds: Math.floor(save.total),
    });
    // The server may hand back an entry this browser didn't know it had - the
    // same name from the same person at a different address - so take it on.
    Object.assign(save, { id: data.id, key: data.key });
    save.total = Math.max(save.total, data.seconds);
    store();
    await loadBoard();
  } catch (e) {
    // it'll try again in twenty seconds
  } finally {
    sending = false;
  }
}

joinEl.addEventListener("click", async () => {
  const name = nameEl.value.trim();
  if (!name) {
    noteEl.textContent = "Put a name in first.";
    nameEl.focus();
    return;
  }
  joinEl.disabled = true;
  try {
    const data = await ask("/waste", {
      id: save.id, key: save.key, name, seconds: Math.floor(save.total),
    });
    Object.assign(save, { id: data.id, key: data.key, name });
    save.total = Math.max(save.total, data.seconds);
    store();
    joinEl.textContent = "update my time";
    noteEl.textContent = "";
    await loadBoard();
  } catch (e) {
    noteEl.textContent = e.message;
  } finally {
    joinEl.disabled = false;
  }
});

nameEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinEl.click();
});

// The drawer slides up out of the bottom edge.
const drawer = document.getElementById("drawer");
const handle = document.getElementById("handle");

handle.addEventListener("click", () => {
  const open = drawer.classList.toggle("open");
  handle.setAttribute("aria-expanded", String(open));
});

draw();
loadBoard();
setInterval(loadBoard, 60000);
