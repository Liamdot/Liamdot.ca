// Nine
// Nine squares. Pick one and it opens into nine more, four times over.
// At the bottom of every path is a spot for one short message.
//
//   1. State     - which squares you've picked so far
//   2. Building  - making a grid, or the message at the end of a path
//   3. Fetching  - asking the store for what this level needs
//   4. Zooming   - the seamless move between one level and the next
//   5. Moving    - the trail, the address bar, the keyboard

// ===========================================================================
// 1. State
// ===========================================================================

let path = [];      // the squares picked so far, like [4, 7]
let busy = false;   // true while a zoom is playing
let travelling = false; // true while a run of zooms plays, one after another

const scene = document.getElementById("scene");
const trail = document.getElementById("trail");
const counter = document.getElementById("counter");

const GAP = 10;                  // the gap between squares, matching style.css
const ZOOM_MS = 520;             // how long a zoom takes

const pathText = (list = path) => list.join(".");

// ===========================================================================
// 2. Building a level
// ===========================================================================

// One grid of nine squares, for the path given.
function buildGrid(forPath) {
  const layer = document.createElement("div");
  layer.className = "layer grid-layer";

  const spot = pathText(forPath);
  const waiting = !Store.known(spot);                  // nothing fetched yet
  const counts = Store.counts(spot);
  const deepest = forPath.length === Store.LEVELS - 1; // the next pick lands on a message
  const most = Math.max(...counts, 1);

  layer.replaceChildren(...counts.map((count, i) => {
    const square = i + 1;
    const cell = document.createElement("button");
    cell.className = "cell";
    cell.dataset.square = square;

    // Brighter the more messages are hidden under it.
    cell.style.setProperty("--fill", count ? 0.25 + 0.75 * (count / most) : 0);
    cell.classList.toggle("cell-written", !waiting && deepest && count > 0);
    cell.classList.toggle("cell-empty", !waiting && deepest && count === 0);

    let hint;
    if (waiting) hint = "&middot;&middot;&middot;";
    else if (deepest) hint = count ? "a message" : "empty";
    else hint = count ? `${count} message${count === 1 ? "" : "s"}` : "nothing yet";

    cell.innerHTML = `<span class="num">${square}</span><span class="hint">${hint}</span>`;
    cell.setAttribute("aria-label", `Square ${square}, ${count} message${count === 1 ? "" : "s"}`);
    return cell;
  }));

  return layer;
}

// The message at the end of a path: someone else's to read, a space to write
// in, or a moment's wait while it's fetched.
function buildNote(forPath) {
  const spot = pathText(forPath);
  const message = Store.get(spot);       // undefined until it's been fetched
  const mine = Store.isMine(spot);
  const waiting = message === undefined;
  const reading = message && !mine;
  const shut = Store.writingOff && !message;

  const layer = document.createElement("div");
  layer.className = "layer note-layer";

  const stuck = waiting && Store.trouble;

  let body;
  if (stuck) {
    body = `<p class="note-intro">${Store.trouble}</p>`;
  } else if (waiting) {
    body = `<p class="note-intro looking">looking&hellip;</p>`;
  } else if (reading) {
    body = `<p class="note-text"></p><p class="note-by"></p>`;
  } else if (shut) {
    body = `<p class="note-intro">Writing is switched off for now. Have a read of the rest.</p>`;
  } else {
    body = `<p class="note-intro">${message ? "Your message:" : "Nobody has written here yet. Go on."}</p>
       <textarea id="text" maxlength="${Store.LIMIT}" rows="6" placeholder="Say something to whoever finds this…"></textarea>
       <div class="note-row">
         <input id="name" maxlength="20" placeholder="your name (optional)">
         <span class="left" id="left"></span>
       </div>
       <p class="why" id="why" hidden></p>`;
  }

  const back = `<button class="pill" data-act="back">&larr; back</button>`;
  let buttons;
  if (stuck) {
    buttons = `<button class="pill" data-act="retry">try again</button>${back}`;
  } else if (waiting || shut) {
    buttons = back;
  } else if (reading) {
    buttons = `${back}<button class="pill quiet" data-act="report">report</button>`;
  } else {
    buttons = `<button class="pill strong" data-act="save">${message ? "save changes" : "leave it here"}</button>
       ${message ? `<button class="pill quiet" data-act="delete">delete</button>` : ""}
       ${back}`;
  }

  layer.innerHTML = `
    <div class="note">
      <p class="note-path">${forPath.join(" · ")}</p>
      <div class="note-body">${body}</div>
      <div class="note-buttons">${buttons}</div>
    </div>`;

  if (reading) {
    const text = layer.querySelector(".note-text");
    text.textContent = message.text;
    text.classList.toggle("long", message.text.length > 180); // smaller type, so it still fits
    const when = message.at ? `, ${new Date(message.at).toLocaleDateString()}` : "";
    layer.querySelector(".note-by").textContent = `${message.name ? `— ${message.name}` : "— anonymous"}${when}`;
  } else if (message) {
    layer.querySelector("#text").value = message.text;
    layer.querySelector("#name").value = message.name || "";
  }

  return layer;
}

const buildLayer = (forPath) => (forPath.length === Store.LEVELS ? buildNote(forPath) : buildGrid(forPath));

// Counts up the characters left as you type.
function wireUpForm(layer) {
  const text = layer.querySelector("#text");
  if (!text) return;
  const left = layer.querySelector("#left");
  const countLeft = () => { left.textContent = `${Store.LIMIT - text.value.length} left`; };
  text.addEventListener("input", countLeft);
  countLeft();
}

function drawTrail() {
  trail.replaceChildren(...path.map((square, depth) => {
    const step = document.createElement("button");
    step.className = "crumb";
    step.dataset.depth = depth + 1;
    step.textContent = square;
    return step;
  }));
  counter.textContent = Store.trouble
    ? Store.trouble
    : `${Store.total().toLocaleString()} of ${Store.TOTAL.toLocaleString()} written`;
}

// Puts a level on screen with no animation.
function show(forPath, { focus } = {}) {
  const layer = buildLayer(forPath);
  scene.replaceChildren(layer);
  wireUpForm(layer);
  if (focus) {
    const text = layer.querySelector("#text");
    if (text) text.focus();
  }
  drawTrail();
  fetchFor(forPath);
  return layer;
}

// ===========================================================================
// 3. Fetching
// ===========================================================================
//
// Every level is drawn from whatever's already been fetched, so it appears at
// once. Then the store is asked about this spot, and if anything turns out to
// be different the level is drawn again - carefully, so a half-typed message
// isn't thrown away.

// A short description of what's on screen, to tell "nothing changed" from
// "this needs drawing again".
function signature(forPath) {
  const spot = pathText(forPath);
  if (!Store.known(spot)) return "waiting";
  if (forPath.length === Store.LEVELS) {
    const message = Store.get(spot);
    return message ? `written:${message.text}|${message.name || ""}` : "empty";
  }
  return Store.counts(spot).join(",");
}

function fetchFor(forPath) {
  const spot = pathText(forPath);
  const before = signature(forPath);

  Store.fetchFor(spot).then(() => {
    if (busy || pathText() !== spot) return;   // they've moved on
    drawTrail();
    if (signature(path) === before) return;

    // Don't pull the page out from under someone mid-sentence.
    const text = document.getElementById("text");
    if (text && text.value.trim()) return;
    const hadFocus = text && document.activeElement === text;

    const layer = show(path);
    if (hadFocus) {
      const fresh = layer.querySelector("#text");
      if (fresh) fresh.focus();
    }
  });
}

// ===========================================================================
// 4. Zooming
// ===========================================================================
//
// The trick: the next level is drawn full size but shrunk down into the exact
// square you picked, and then everything - the level you're leaving included -
// is scaled up around that square. The old level flies off past the edges of
// the screen while the new one grows to fill it, so the move never cuts.

// Where a square sits inside the scene, and how much everything has to grow
// for that square to fill the whole scene.
function squareBox(square) {
  const size = scene.clientWidth;
  const cell = (size - GAP * 2) / 3;
  const col = (square - 1) % 3;
  const row = Math.floor((square - 1) / 3);
  const left = col * (cell + GAP);
  const top = row * (cell + GAP);
  return { size, cell, left, top, centerX: left + cell / 2, centerY: top + cell / 2, grow: size / cell };
}

// Shrinks a full-size layer into one square, ready to be grown.
function tuckInto(layer, box) {
  layer.style.width = `${box.size}px`;
  layer.style.height = `${box.size}px`;
  layer.style.left = `${box.left}px`;
  layer.style.top = `${box.top}px`;
  layer.style.transform = `scale(${1 / box.grow})`;
  layer.style.transformOrigin = "top left";
}

// The transform that makes the picked square fill the screen.
const growTransform = (box) =>
  `translate(${box.size / 2 - box.centerX}px, ${box.size / 2 - box.centerY}px) scale(${box.grow})`;

function runZoom(zoomer, ms, after) {
  busy = true;
  let done = false;

  return new Promise((resolve) => {
    const finish = () => {
      if (done) return;
      done = true;
      zoomer.removeEventListener("transitionend", onEnd);
      busy = false;
      after();
      resolve();
    };

    // Only the zoom itself counts as finished. Without this check, a hover
    // fading out on one of the squares bubbles up and ends the zoom early.
    const onEnd = (e) => {
      if (e.target === zoomer && e.propertyName === "transform") finish();
    };

    zoomer.addEventListener("transitionend", onEnd);
    setTimeout(finish, ms + 150); // in case the transition never runs at all
  });
}

// Going in: the level you're on grows around the square you picked.
function zoomIn(square) {
  if (busy) return;
  const current = scene.firstElementChild;
  if (!current) return;

  const box = squareBox(square);
  const nextPath = [...path, square];
  const next = buildLayer(nextPath);
  tuckInto(next, box);

  // The level arriving fades up, and the big number on the square you picked
  // fades away, so the two don't sit on top of each other.
  next.classList.add("fade-in");
  current.classList.add("fade-out-late"); // stays for most of the zoom, then goes before the swap
  const opening = current.querySelector(`[data-square="${square}"]`);
  if (opening) opening.classList.add("opening");

  const zoomer = document.createElement("div");
  zoomer.className = "zoomer";
  zoomer.style.transformOrigin = `${box.centerX}px ${box.centerY}px`;
  zoomer.append(current, next);
  scene.replaceChildren(zoomer);

  void zoomer.offsetWidth; // makes the browser take in the starting position first
  zoomer.classList.add("moving");
  zoomer.style.transform = growTransform(box);

  // Ask for what's down there while the zoom plays, so it's usually waiting
  // by the time the zoom lands.
  Store.fetchFor(pathText(nextPath));

  return runZoom(zoomer, ZOOM_MS, () => {
    path = nextPath;
    updateAddressBar();
    show(path, { focus: true });
  });
}

// Going back out: the level you're on shrinks back into its square, while the
// level above it comes into view around it.
function zoomOut({ ms = ZOOM_MS, quiet = false } = {}) {
  if (busy || path.length === 0) return Promise.resolve();
  const current = scene.firstElementChild;
  const square = path[path.length - 1];
  const parentPath = path.slice(0, -1);
  const box = squareBox(square);

  const parent = buildLayer(parentPath);

  // Going the other way: the level you're leaving fades out as it shrinks,
  // and the number on the square it shrinks into fades back in.
  current.classList.add("fade-out");
  const closing = parent.querySelector(`[data-square="${square}"]`);
  if (closing) closing.classList.add("closing");

  const zoomer = document.createElement("div");
  zoomer.className = "zoomer";
  zoomer.style.setProperty("--zoom-ms", `${ms}ms`);
  zoomer.style.transformOrigin = `${box.centerX}px ${box.centerY}px`;
  zoomer.style.transform = growTransform(box); // start zoomed in...
  tuckInto(current, box);
  zoomer.append(parent, current);
  scene.replaceChildren(zoomer);

  void zoomer.offsetWidth; // makes the browser take in the starting position first
  zoomer.classList.add("moving");
  zoomer.style.transform = "none"; // ...and settle back out

  return runZoom(zoomer, ms, () => {
    path = parentPath;
    // On a run of zooms only the last one is worth a history entry, so the
    // back button returns to where the run started rather than stepping
    // through every level again.
    if (!quiet) updateAddressBar();
    show(path);
  });
}

// Back up several levels at once: every level in between goes past, a little
// quicker than a single step so it doesn't turn into a journey.
async function zoomOutTo(depth) {
  if (busy || travelling || depth >= path.length) return;
  const steps = path.length - depth;
  const ms = steps > 1 ? Math.round(ZOOM_MS * 0.6) : ZOOM_MS;

  travelling = true;
  for (let step = 0; step < steps; step++) {
    await zoomOut({ ms, quiet: step < steps - 1 });
  }
  travelling = false;
}

// ===========================================================================
// 5. Moving around
// ===========================================================================

function updateAddressBar({ replace = false } = {}) {
  const hash = path.length ? `#${pathText()}` : " ";
  if (replace) history.replaceState(null, "", hash);
  else history.pushState(null, "", hash);
}

// Jumps straight to a spot, no animation (used by links, the trail and the
// random button).
function goTo(next, { replace } = {}) {
  path = next.slice(0, Store.LEVELS);
  updateAddressBar({ replace });
  show(path);
}

function pathFromHash() {
  return location.hash.slice(1).split(".")
    .map((n) => parseInt(n, 10))
    .filter((n) => n >= 1 && n <= 9)
    .slice(0, Store.LEVELS);
}

function complain(why) {
  const box = document.getElementById("why");
  if (!box) return;
  box.textContent = why;
  box.hidden = false;
}

scene.addEventListener("click", async (e) => {
  if (busy || travelling) return;

  const cell = e.target.closest(".cell");
  if (cell) {
    zoomIn(Number(cell.dataset.square));
    return;
  }

  const button = e.target.closest("[data-act]");
  if (!button || button.disabled) return;
  const spot = pathText();
  const act = button.dataset.act;

  if (act === "back") zoomOut();

  if (act === "retry") show(path);

  if (act === "save") {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "saving…";
    const result = await Store.put(spot, document.getElementById("text").value, document.getElementById("name").value);
    if (!result.ok) {
      button.disabled = false;
      button.textContent = label;
      complain(result.why);
      return;
    }
    if (pathText() === spot) show(path);
  }

  if (act === "delete") {
    if (!confirm("Delete your message?")) return;
    button.disabled = true;
    const result = await Store.remove(spot);
    button.disabled = false;
    if (!result.ok) {
      complain(result.why);
      return;
    }
    if (pathText() === spot) show(path, { focus: true });
  }

  if (act === "report") {
    button.disabled = true;
    button.textContent = "reporting…";
    const result = await Store.report(spot);
    button.textContent = result.ok ? "reported — thanks" : "couldn't report";
  }
});

// The "Nine · 4 · 7" trail at the top.
document.querySelector(".path-bar").addEventListener("click", (e) => {
  const crumb = e.target.closest(".crumb");
  if (!crumb || busy || travelling) return;
  zoomOutTo(Number(crumb.dataset.depth));
});

document.getElementById("random-btn").addEventListener("click", async (e) => {
  const button = e.currentTarget;
  button.disabled = true;
  const spot = await Store.randomPath();
  button.disabled = false;
  if (spot && !busy && !travelling) goTo(spot.split(".").map(Number));
});

// Keys: 1-9 pick a square, Escape or Backspace goes back up.
window.addEventListener("keydown", (e) => {
  const focused = document.activeElement;
  if (busy || travelling || (focused && focused.closest("input, textarea"))) return;
  if (e.key >= "1" && e.key <= "9" && path.length < Store.LEVELS) zoomIn(Number(e.key));
  if ((e.key === "Escape" || e.key === "Backspace") && path.length) {
    e.preventDefault();
    zoomOut();
  }
});

window.addEventListener("popstate", () => {
  path = pathFromHash();
  show(path);
});

// If the window changes size mid-zoom the maths would be off, so just redraw.
window.addEventListener("resize", () => {
  if (!busy && !travelling) return;
  busy = false;
  travelling = false;
  show(path);
});

document.getElementById("storage-note").textContent = Store.isLocalOnly
  ? "Right now messages are only saved in your own browser — everyone else sees empty squares."
  : "Messages are saved for everyone. Anything rude is turned away, and anything reported enough times disappears.";

path = pathFromHash();
updateAddressBar({ replace: true });
show(path);
