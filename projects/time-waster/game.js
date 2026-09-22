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
// Time counts for as long as the page is open, whether you're looking at it
// or not. Browsers slow this script right down in a background tab, so the
// count comes from the clock rather than from how often we get called.

const SAVE_KEY = "time-waster";
const TICK_MS = 100;
const SEND_EVERY = 20;   // seconds between leaderboard updates
const BIGGEST_GAP = 600; // seconds: longer than this and the computer was asleep

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

function tick() {
  const now = Date.now();
  // A hidden tab only gets called about once a minute, so measure the real
  // gap rather than counting ticks. An enormous gap means the computer was
  // asleep, which nobody can claim credit for.
  const gap = Math.min((now - last) / 1000, BIGGEST_GAP);
  last = now;

  session += gap;
  save.total += gap;
  sinceSend += gap;
  if (sinceSend >= SEND_EVERY) {
    sinceSend = 0;
    sendScore();
  }
  draw();
}

// Coming back to the tab, catch up straight away instead of waiting for the
// next slow tick.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") tick();
});
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

// The page starts out helpful, gets concerned, begs you to leave, and
// eventually gives up and starts cheering you on. Whichever line you've most
// recently passed is the one showing.
const INSTEAD = [
  [0, "Time starts now."],
  [10, "This is the whole game, by the way. There isn't any more."],
  [30, "You could have stood up by now."],
  [60, "A whole minute. Gone."],
  [120, "Two minutes. That's a kettle."],
  [240, "Still here? All right."],
  [300, "Five minutes. That's a short walk you didn't take."],
  [480, "You can leave whenever you like. Nothing is keeping you."],
  [600, "Ten minutes. That's a bus you could have caught."],
  [900, "Fifteen minutes. People have run three kilometres in this."],
  [1200, "Genuinely, is everything all right?"],
  [1800, "Half an hour. That's a sitcom, minus the adverts."],
  [2400, "There is no ending. I want to be clear about that."],
  [2700, "Forty-five minutes. That's a lecture you're not at."],
  [3600, "An hour. A whole hour, on this."],
  [4500, "Please go outside. I'm asking nicely."],
  [5400, "An hour and a half. That's a film."],
  [6600, "I could close, but you'd only open me again."],
  [7200, "Two hours. That's a film and the arguing about it afterwards."],
  [9000, "Fine. You win. I've stopped worrying about you."],
  [10800, "Three hours. That's a flight to somewhere nicer than this."],
  [14400, "Four hours. You could have learned the basics of an instrument."],
  [18000, "Honestly, at this point, I'm impressed."],
  [21600, "Six hours. That's a working day, more or less."],
  [28800, "Eight hours. That's a full night's sleep you're awake for."],
  [36000, "Ten hours. Nobody can take this away from you."],
  [43200, "Twelve hours. This is a hobby now."],
  [64800, "Eighteen hours. You're the best at this. That's not nothing."],
  [86400, "A full day. Genuinely, well done. Sort of."],
  [172800, "Two days. I've run out of things to say. Carry on."],
];

const commentary = (seconds) => {
  let line = INSTEAD[0][1];
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
  // ...and it follows you into the tab bar, where you'll find it later.
  document.title = session >= 1 ? `${spell(session)} wasted` : "Time Waster - Liamdot";
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
const hereEl = document.getElementById("here");

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
    // Everyone who checked in within the last minute and a half still has it
    // open. You're one of them, once you've joined.
    const here = data.here || 0;
    const others = save.id ? Math.max(0, here - 1) : here;
    hereEl.textContent = others
      ? `${others} other ${others === 1 ? "person is" : "people are"} wasting time right now.`
      : "";
    noteEl.textContent = data.people
      ? `${data.people} ${data.people === 1 ? "person has" : "people have"} wasted ${spell(data.seconds)} between them.`
      : "";
    drawBoard();
    drawMine();
  } catch (e) {
    noteEl.textContent = "Can't reach the leaderboard right now.";
    hereEl.textContent = "";
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
setInterval(loadBoard, 30000);   // often enough for "right now" to mean it
