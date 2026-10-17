// Soko: everything you can see and press. The rules themselves are in soko.js,
// the art in assets.js and the built-in levels in levels.js.
//
//   1. Saved        - progress, your levels, and the level you're making
//   2. Art          - loading the pictures, falling back to the developer art
//   3. The board    - fitting a level to the screen and drawing it
//   4. Playing      - moves, undo, and finishing a level
//   5. Making       - the editor
//   6. Sharing      - levels in links, and copying text about
//   7. Panels       - the level list, the solved card, the share card
//   8. Input        - keys, swipes and the buttons
//   9. Start

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

// ===========================================================================
// 1. Saved
// ===========================================================================

const SAVE_KEY = "soko";

const save = {
  solved: {},   // level key -> { moves, pushes }: your best on each
  at: 0,        // the built-in level you were last on
  mine: [],     // levels you've kept: { id, name, map }
  draft: null,  // what's in the editor: { id, name, map }
};

function store() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (e) {
    // private browsing - it all still works, it just won't be remembered
  }
}

function load() {
  try {
    Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)) || {});
  } catch (e) {
    // nothing saved yet
  }
  save.solved = save.solved || {};
  save.mine = Array.isArray(save.mine) ? save.mine : [];
}

// A level is remembered by what it looks like rather than where it sits in a
// list, so reordering levels.js doesn't move anyone's records about, and
// changing a level starts its record afresh.
function keyOf(map) {
  const text = SOKO.rowsOf(map).join("\n");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

// ===========================================================================
// 2. Art
// ===========================================================================
//
// Each picture comes from the set named in ART.use, and anything that set
// doesn't have - or that fails to load - comes from the developer set instead.
// That's what lets you replace the art one picture at a time.

const PICTURES = ["floor", "wall", "goal", "box", "boxOnGoal", "player",
  "playerUp", "playerDown", "playerLeft", "playerRight"];

// what to draw until a picture has loaded, or if there's no picture at all
const STAND_INS = {
  floor: "#e9e2d3", wall: "#5b5049", goal: "#c8553d",
  box: "#c98a43", boxOnGoal: "#79b36f", player: "#2f6f9f",
};

const art = {};

function loadArt() {
  const chosen = ART.sets[ART.use] || {};
  const dev = ART.sets.dev;
  // a version on the end of the address makes browsers fetch a replaced
  // picture afresh - except a picture written straight into the address
  // (data: or blob:), where it would end up inside the picture and spoil it
  const bust = (src) => (/^(data|blob):/.test(src) ? src : `${src}${src.includes("?") ? "&" : "?"}v=${ART.version}`);

  for (const name of PICTURES) {
    const own = chosen[name];
    const fallback = dev[name];
    const src = own || fallback;
    if (!src) continue;                     // the facing pictures are optional

    const img = new Image();
    img.onload = () => draw();
    img.onerror = () => {
      if (own && fallback && img.dataset.tried !== "dev") {
        console.warn(`Soko: couldn't load ${own} for "${name}" - using the developer art instead.`);
        img.dataset.tried = "dev";
        img.src = bust(fallback);
      }
    };
    img.src = bust(src);
    art[name] = img;
  }
}

const ready = (img) => img && img.complete && img.naturalWidth > 0;

// The player can face the way it last moved, if there's a picture for it.
function playerPicture(facing) {
  const name = `player${facing[0].toUpperCase()}${facing.slice(1)}`;
  return ready(art[name]) ? art[name] : art.player;
}

// ===========================================================================
// 3. The board
// ===========================================================================

const canvas = $("board");
const ctx = canvas.getContext("2d");

let mode = "play";       // "play" or "make"
let current = null;      // the level being played: { kind, name, map, ... }
let game = null;         // its state, from SOKO.start
let anim = null;         // the move being drawn: { from, to, boxFrom, boxTo, t0 }
let hover = -1;          // the square under the pointer, in the editor

const ANIM_MS = 110;

function resize() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = Math.round(canvas.clientHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

// The biggest square tile that fits the whole level on screen, and where the
// top-left corner of it goes.
function layout(width, height) {
  const pad = 14;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const tile = Math.max(8, Math.min(72, Math.floor(Math.min((w - pad * 2) / width, (h - pad * 2) / height))));
  return { tile, ox: Math.round((w - tile * width) / 2), oy: Math.round((h - tile * height) / 2) };
}

function picture(name, x, y, size, img = art[name]) {
  if (ready(img)) {
    ctx.drawImage(img, x, y, size, size);
    return;
  }
  ctx.fillStyle = STAND_INS[name] || "#999";
  if (name === "goal") {
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
  } else if (name === "player") {
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.34, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(x + (name === "box" || name === "boxOnGoal" ? size * 0.1 : 0),
      y + (name === "box" || name === "boxOnGoal" ? size * 0.1 : 0),
      size * (name === "box" || name === "boxOnGoal" ? 0.8 : 1),
      size * (name === "box" || name === "boxOnGoal" ? 0.8 : 1));
  }
}

function draw() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = !ART.pixelated;
  if (mode === "make") drawDraft();
  else if (game) drawGame();
}

function drawGame() {
  const { level, boxAt } = game;
  const { tile, ox, oy } = layout(level.width, level.height);
  const at = (i) => [ox + (i % level.width) * tile, oy + Math.floor(i / level.width) * tile];

  // how far through the current move we are, eased so it settles
  let t = 1;
  if (anim) {
    t = Math.min(1, (performance.now() - anim.t0) / ANIM_MS);
    t = 1 - (1 - t) * (1 - t);
  }
  const between = (from, to) => {
    const [ax, ay] = at(from);
    const [bx, by] = at(to);
    return [ax + (bx - ax) * t, ay + (by - ay) * t];
  };

  for (let i = 0; i < boxAt.length; i++) {
    const [x, y] = at(i);
    if (level.wall[i]) picture("wall", x, y, tile);
    else if (level.inside[i]) {
      picture("floor", x, y, tile);
      if (level.goal[i]) picture("goal", x, y, tile);
    }
  }

  for (let i = 0; i < boxAt.length; i++) {
    if (!boxAt[i]) continue;
    const moving = anim && anim.boxTo === i && t < 1;
    const [x, y] = moving ? between(anim.boxFrom, anim.boxTo) : at(i);
    // a box only counts as home once it has finished arriving
    picture(level.goal[i] && !moving ? "boxOnGoal" : "box", x, y, tile);
  }

  const [px, py] = anim && t < 1 ? between(anim.from, anim.to) : at(game.player);
  picture("player", px, py, tile, playerPicture(game.facing));
}

function drawDraft() {
  const { width, height, cells } = draft;
  const { tile, ox, oy } = layout(width, height);

  for (let i = 0; i < cells.length; i++) {
    const ch = cells[i];
    const x = ox + (i % width) * tile;
    const y = oy + Math.floor(i / width) * tile;
    if (ch === SOKO.WALL) {
      picture("wall", x, y, tile);
      continue;
    }
    picture("floor", x, y, tile);
    if (ch === SOKO.GOAL || ch === SOKO.BOX_ON_GOAL || ch === SOKO.PLAYER_ON_GOAL) picture("goal", x, y, tile);
    if (ch === SOKO.BOX) picture("box", x, y, tile);
    if (ch === SOKO.BOX_ON_GOAL) picture("boxOnGoal", x, y, tile);
    if (ch === SOKO.PLAYER || ch === SOKO.PLAYER_ON_GOAL) picture("player", x, y, tile);
  }

  // a faint grid, so you can see where one square stops
  ctx.strokeStyle = "rgba(22, 22, 26, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= width; x++) {
    ctx.moveTo(ox + x * tile + 0.5, oy);
    ctx.lineTo(ox + x * tile + 0.5, oy + height * tile);
  }
  for (let y = 0; y <= height; y++) {
    ctx.moveTo(ox, oy + y * tile + 0.5);
    ctx.lineTo(ox + width * tile, oy + y * tile + 0.5);
  }
  ctx.stroke();

  if (hover >= 0) {
    ctx.strokeStyle = "#c8553d";
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + (hover % width) * tile + 1, oy + Math.floor(hover / width) * tile + 1, tile - 2, tile - 2);
  }
}

// keeps drawing until the move has finished arriving
function tick() {
  draw();
  if (anim && performance.now() - anim.t0 < ANIM_MS) requestAnimationFrame(tick);
  else {
    anim = null;
    draw();
  }
}

function animate(change) {
  if (!change) return;
  anim = { ...change, t0: performance.now() };
  requestAnimationFrame(tick);
}

// ===========================================================================
// 4. Playing
// ===========================================================================

// Starts a level. Anything that can't be played is turned away with the
// reason, and nothing changes.
function play(entry) {
  let level;
  try {
    level = SOKO.parse(entry.map);
  } catch (e) {
    flash(e.message);
    return false;
  }
  const problems = SOKO.check(level);
  if (problems.length) {
    flash(problems[0]);
    return false;
  }

  current = entry;
  game = SOKO.start(level);
  anim = null;
  hideCards();
  if (entry.kind === "built") {
    save.at = entry.index;
    store();
  }
  // a shared level stays in the address bar so a reload keeps it; anything
  // else takes it out, so a reload doesn't drag you back to it
  if (entry.kind !== "shared" && location.hash) history.replaceState(null, "", location.pathname);
  showBar();
  draw();
  return true;
}

function builtIn(index) {
  const lv = LEVELS[index];
  return lv ? { kind: "built", index, name: lv.name, map: lv.map } : null;
}

function act(dir) {
  if (mode !== "play" || !game || !$("solved").hidden) return;
  const change = SOKO.move(game, dir);
  if (!change) {
    draw();                                  // still worth showing the turn
    return;
  }
  animate(change);
  showBar();
  if (SOKO.solved(game)) setTimeout(finished, ANIM_MS + 40);
}

function takeBack() {
  if (mode !== "play" || !game) return;
  hideCards();
  animate(SOKO.undo(game));
  showBar();
}

function restart() {
  if (current) play(current);
}

function finished() {
  const record = { moves: game.moves, pushes: game.pushes };
  let best = null;
  let better = false;

  if (current.kind !== "test") {
    const key = keyOf(current.map);
    const was = save.solved[key];
    better = !was || record.moves < was.moves || record.pushes < was.pushes;
    best = was
      ? { moves: Math.min(was.moves, record.moves), pushes: Math.min(was.pushes, record.pushes) }
      : record;
    save.solved[key] = best;
    store();
  }
  showSolved(record, best, better);
}

function nextEntry() {
  if (current.kind === "built") return builtIn(current.index + 1);
  if (current.kind === "mine") {
    const at = save.mine.findIndex((m) => m.id === current.id);
    const next = save.mine[at + 1];
    return next ? { kind: "mine", ...next } : null;
  }
  return null;
}

function showBar() {
  const playing = mode === "play";
  const testing = playing && current && current.kind === "test";

  let label = "making a level";
  if (playing && current) {
    label = current.kind === "built" ? `${current.index + 1}. ${current.name}` : current.name;
    if (current.kind === "shared") label += " (shared)";
    if (testing) label += " (testing)";
  }
  $("level-name").textContent = label;
  $("moves").textContent = game ? game.moves : 0;
  $("pushes").textContent = game ? game.pushes : 0;

  // the stats, undo and restart only mean anything while playing; the level
  // list is swapped for a way back while testing something from the editor
  for (const el of document.querySelectorAll(".play-only")) el.hidden = !playing;
  $("levels-btn").hidden = !playing || testing;
  $("back-btn").hidden = !testing;
  $("undo-btn").disabled = !game || !game.history.length;

  for (const btn of document.querySelectorAll(".mode")) {
    btn.classList.toggle("on", btn.dataset.mode === (testing ? "make" : mode));
  }
}

// ===========================================================================
// 5. Making
// ===========================================================================

let draft = null;        // { id, name, width, height, cells: [one character per square] }
let tool = SOKO.WALL;
let painting = null;     // what's being painted while the pointer is down
let verdict = null;      // what "check" last said, until the next change

const STARTER = `
#########
#       #
#       #
# @  $ .#
#       #
#       #
#########`;

function draftFrom(map, name = "", id = null) {
  const rows = SOKO.rowsOf(map);
  return { id, name, width: rows[0].length, height: rows.length, cells: rows.join("").split("") };
}

function draftText() {
  const rows = [];
  for (let y = 0; y < draft.height; y++) {
    rows.push(draft.cells.slice(y * draft.width, (y + 1) * draft.width).join("").replace(/\s+$/, ""));
  }
  return rows.join("\n");
}

function storeDraft() {
  save.draft = { id: draft.id, name: draft.name, map: draftText() };
  store();
}

// What painting one square with the current tool turns it into. Goals and
// boxes stack (a box on a goal), and there's only ever one player: putting
// them somewhere takes them away from wherever they were.
function paint(i, with_) {
  const ch = draft.cells[i];
  const goalHere = ch === SOKO.GOAL || ch === SOKO.BOX_ON_GOAL || ch === SOKO.PLAYER_ON_GOAL;
  let next = ch;

  if (with_ === SOKO.WALL || with_ === SOKO.FLOOR) next = with_;
  else if (with_ === SOKO.GOAL) {
    next = ch === SOKO.BOX || ch === SOKO.BOX_ON_GOAL ? SOKO.BOX_ON_GOAL
      : ch === SOKO.PLAYER || ch === SOKO.PLAYER_ON_GOAL ? SOKO.PLAYER_ON_GOAL : SOKO.GOAL;
  } else if (with_ === SOKO.BOX) {
    next = goalHere ? SOKO.BOX_ON_GOAL : SOKO.BOX;
  } else if (with_ === SOKO.PLAYER) {
    draft.cells = draft.cells.map((c) => (c === SOKO.PLAYER ? SOKO.FLOOR : c === SOKO.PLAYER_ON_GOAL ? SOKO.GOAL : c));
    next = goalHere ? SOKO.PLAYER_ON_GOAL : SOKO.PLAYER;
  }

  if (next === draft.cells[i]) return false;
  draft.cells[i] = next;
  return true;
}

function edited() {
  verdict = null;
  storeDraft();
  showProblems();
  draw();
}

// Squares are kept where they are when the size changes; new ones are floor.
function resizeDraft(width, height) {
  width = Math.max(3, Math.min(30, Math.round(width) || draft.width));
  height = Math.max(3, Math.min(30, Math.round(height) || draft.height));
  const cells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cells.push(x < draft.width && y < draft.height ? draft.cells[y * draft.width + x] : SOKO.FLOOR);
    }
  }
  Object.assign(draft, { width, height, cells });
  $("draft-w").value = width;
  $("draft-h").value = height;
  edited();
}

// The draft as a level, and anything stopping it being played.
function draftLevel() {
  try {
    const level = SOKO.parse(draftText());
    return { level, problems: SOKO.check(level) };
  } catch (e) {
    return { level: null, problems: [e.message] };
  }
}

function showProblems() {
  const { problems } = draftLevel();
  const box = $("problems");
  if (problems.length) {
    box.className = "problems bad";
    box.innerHTML = `<ul>${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
  } else if (verdict) {
    box.className = `problems ${verdict.good ? "good" : "bad"}`;
    box.textContent = verdict.text;
  } else {
    box.className = "problems";
    box.textContent = "Playable. Press check to find out whether it can actually be solved.";
  }
}

function checkDraft() {
  const { level, problems } = draftLevel();
  if (problems.length) {
    showProblems();
    return;
  }
  const box = $("problems");
  box.className = "problems";
  box.textContent = "Checking...";
  // let the page say so before the search starts
  setTimeout(() => {
    const result = SOKO.solve(level, 250000);
    verdict = {
      solved: { good: true, text: `Can be solved, in ${result.pushes} push${result.pushes === 1 ? "" : "es"} at the fewest.` },
      impossible: { good: false, text: "Can't be solved - whatever you do, a box ends up stuck." },
      unknown: { good: true, text: "Too big to check every possibility. It might well be fine - test it yourself." },
    }[result.result] || { good: false, text: "Something's wrong with it." };
    showProblems();
  }, 30);
}

function startMaking(entry = null) {
  if (entry) {
    draft = draftFrom(entry.map, entry.name, entry.kind === "mine" ? entry.id : null);
    verdict = null;
    storeDraft();
  }
  setMode("make");
}

// Just the page: which controls show and what the board is for. Choosing what
// to play is someone else's job - see setMode, just below.
function showMode(next) {
  mode = next;
  hideCards();
  $("editor").hidden = mode !== "make";
  $("dpad").hidden = mode !== "play";
  canvas.classList.toggle("painting", mode === "make");
  if (mode === "make") {
    $("draft-name").value = draft.name;
    $("draft-w").value = draft.width;
    $("draft-h").value = draft.height;
    showProblems();
  }
  showBar();
  // the board has changed size with the editor opening or closing
  requestAnimationFrame(resize);
}

// Switching modes from the buttons. Leaving the editor after testing something
// goes back to the level you were on, since the test isn't a level to stay on.
function setMode(next) {
  showMode(next);
  if (mode === "play" && current && current.kind === "test") play(builtIn(save.at) || builtIn(0));
}

function testDraft() {
  const { problems } = draftLevel();
  if (problems.length) {
    flash(problems[0]);
    return;
  }
  showMode("play");
  play({ kind: "test", name: draft.name || "your level", map: draftText() });
}

function keepDraft() {
  const { problems } = draftLevel();
  if (problems.length) {
    flash(`Not yet: ${problems[0]}`);
    return;
  }
  const name = draft.name.trim() || `Level ${save.mine.length + 1}`;
  const map = draftText();
  const existing = save.mine.find((m) => m.id === draft.id);
  if (existing) Object.assign(existing, { name, map });
  else {
    draft.id = `m${Date.now().toString(36)}`;
    save.mine.push({ id: draft.id, name, map });
  }
  draft.name = name;
  $("draft-name").value = name;
  storeDraft();
  flash(existing ? `Updated "${name}".` : `Kept "${name}" - it's under levels now.`);
}

// ===========================================================================
// 6. Sharing
// ===========================================================================
//
// A shared level travels entirely in the link: its name, and the level itself
// squashed by SOKO.encode. Nothing is sent anywhere or stored on a server, so
// there's nothing to look after and nothing anyone can fill with rubbish -
// a link is only ever seen by whoever it's given to.

function linkFor(name, map) {
  const params = new URLSearchParams();
  if (name) params.set("n", name.slice(0, 40));
  params.set("l", SOKO.encode(map));
  return `${location.origin}${location.pathname}#${params}`;
}

// A level from the address bar, or from a link pasted into the editor.
function levelFromLink(link) {
  const hash = String(link).includes("#") ? String(link).split("#").slice(1).join("#") : String(link);
  const params = new URLSearchParams(hash);
  const code = params.get("l");
  if (!code) return null;
  return {
    kind: "shared",
    name: (params.get("n") || "a shared level").slice(0, 40),
    map: SOKO.decode(code),
  };
}

// The modern clipboard call is refused in plenty of places, so the old
// selection trick is kept as a second go.
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    // refused - try the old way
  }
  try {
    const box = document.createElement("textarea");
    box.value = text;
    box.setAttribute("readonly", "");
    box.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.append(box);
    box.select();
    const done = document.execCommand("copy");
    box.remove();
    return done;
  } catch (e) {
    return false;
  }
}

function pasteLevel() {
  const box = $("paste-box");
  if (box.hidden) {
    box.hidden = false;
    box.value = "";
    box.focus();
    return;
  }
  const text = box.value.trim();
  box.hidden = true;
  if (!text) return;

  const fromLink = levelFromLink(text);
  const map = fromLink ? fromLink.map : text;
  try {
    SOKO.parse(map);
  } catch (e) {
    flash(`That isn't a level: ${e.message}`);
    return;
  }
  draft = draftFrom(map, fromLink ? fromLink.name : draft.name, null);
  $("draft-name").value = draft.name;
  $("draft-w").value = draft.width;
  $("draft-h").value = draft.height;
  edited();
  flash("Pasted in. It's yours to change.");
}

// ===========================================================================
// 7. Panels
// ===========================================================================

function hideCards() {
  for (const id of ["solved", "levels", "share"]) $(id).hidden = true;
}

let flashTimer = 0;
function flash(text) {
  const el = $("flash");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function showSolved(record, best, better) {
  const next = nextEntry();
  const testing = current.kind === "test";
  const card = $("solved");
  card.innerHTML = `
    <h2>Solved</h2>
    <p class="big">${record.moves} move${record.moves === 1 ? "" : "s"}, ${record.pushes} push${record.pushes === 1 ? "" : "es"}</p>
    ${best ? `<p class="sub">${better ? "Your best yet." : `Your best: ${best.moves} moves, ${best.pushes} pushes.`}</p>` : ""}
    ${testing ? `<p class="sub">It works.</p>` : ""}
    <div class="row">
      ${testing ? `<button class="pill strong" data-go="editor">back to editor</button>` : ""}
      ${next ? `<button class="pill strong" data-go="next">next level</button>` : ""}
      <button class="pill" data-go="again">again</button>
      ${current.kind === "shared" ? `<button class="pill" data-go="keep-shared">keep it</button>` : ""}
      ${!testing && !next ? `<button class="pill" data-go="levels">levels</button>` : ""}
    </div>`;
  card.hidden = false;
}

$("solved").addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (!go) return;
  const what = go.dataset.go;
  if (what === "next") play(nextEntry());
  if (what === "again") restart();
  if (what === "editor") setMode("make");
  if (what === "levels") showLevels();
  if (what === "keep-shared") keepShared();
});

function keepShared() {
  if (!current || current.kind !== "shared") return;
  const already = save.mine.find((m) => keyOf(m.map) === keyOf(current.map));
  if (!already) {
    save.mine.push({ id: `m${Date.now().toString(36)}`, name: current.name, map: current.map });
    store();
  }
  flash(already ? "You've already got that one." : "Kept - it's under levels now.");
}

function showLevels() {
  const card = $("levels");
  const record = (map) => save.solved[keyOf(map)];
  const mark = (map) => {
    const r = record(map);
    return r ? `<span class="done" title="Solved">&#10003; ${r.moves}</span>` : "";
  };

  const built = LEVELS.map((lv, i) => `
    <button class="level-row${current && current.kind === "built" && current.index === i ? " here" : ""}" data-play="built" data-i="${i}">
      <span class="num">${i + 1}</span><span class="name">${esc(lv.name)}</span>${mark(lv.map)}
    </button>`).join("");

  const mine = save.mine.length
    ? save.mine.map((m) => `
      <div class="level-row mine">
        <button class="name-btn" data-play="mine" data-id="${esc(m.id)}"><span class="name">${esc(m.name)}</span>${mark(m.map)}</button>
        <button class="tiny" data-edit="${esc(m.id)}">edit</button>
        <button class="tiny" data-share="${esc(m.id)}">share</button>
        <button class="tiny danger" data-delete="${esc(m.id)}">delete</button>
      </div>`).join("")
    : `<p class="sub">Nothing yet. Press <strong>make</strong> to build one.</p>`;

  card.innerHTML = `
    <div class="card-head"><h2>Levels</h2><button class="close" data-close aria-label="Close">&times;</button></div>
    <h3>Built in</h3>
    <div class="level-list">${built}</div>
    <h3>Yours</h3>
    <div class="level-list">${mine}</div>`;
  card.hidden = false;
}

$("levels").addEventListener("click", (e) => {
  const el = e.target.closest("button");
  if (!el) return;
  if (el.hasAttribute("data-close")) { hideCards(); return; }

  if (el.dataset.play === "built") play(builtIn(Number(el.dataset.i)));
  else if (el.dataset.play === "mine") {
    const m = save.mine.find((x) => x.id === el.dataset.id);
    if (m) play({ kind: "mine", ...m });
  } else if (el.dataset.edit) {
    const m = save.mine.find((x) => x.id === el.dataset.edit);
    if (m) startMaking({ kind: "mine", ...m });
  } else if (el.dataset.share) {
    const m = save.mine.find((x) => x.id === el.dataset.share);
    if (m) showShare(m.name, m.map);
  } else if (el.dataset.delete) {
    // asks twice, on the button itself
    if (el.dataset.sure !== "yes") {
      el.dataset.sure = "yes";
      el.textContent = "sure?";
      return;
    }
    save.mine = save.mine.filter((x) => x.id !== el.dataset.delete);
    store();
    showLevels();
  }
});

function showShare(name, map) {
  const link = linkFor(name, map);
  const card = $("share");
  card.innerHTML = `
    <div class="card-head"><h2>Share "${esc(name || "your level")}"</h2><button class="close" data-close aria-label="Close">&times;</button></div>
    <p class="sub">The whole level is in this link. Anyone who opens it plays it, and can keep a copy.</p>
    <input class="link" id="share-link" readonly value="${esc(link)}">
    <div class="row"><button class="pill strong" id="share-copy">copy link</button></div>`;
  card.hidden = false;
  const input = $("share-link");
  input.addEventListener("focus", () => input.select());
  $("share-copy").addEventListener("click", async () => {
    if (await copyText(link)) {
      $("share-copy").textContent = "copied";
      setTimeout(() => { if ($("share-copy")) $("share-copy").textContent = "copy link"; }, 1400);
    } else {
      input.focus();
      flash("Couldn't copy - it's selected, so copy it yourself.");
    }
  });
}

$("share").addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) hideCards();
});

// ===========================================================================
// 8. Input
// ===========================================================================

const KEYS = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
  W: "up", S: "down", A: "left", D: "right",
};

window.addEventListener("keydown", (e) => {
  const focused = document.activeElement;
  if (focused && focused.closest && focused.closest("input, textarea, select")) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.key === "Escape") {
    hideCards();
    return;
  }

  if (mode === "play") {
    if (KEYS[e.key]) {
      e.preventDefault();
      act(KEYS[e.key]);
    } else if (e.key === "z" || e.key === "u" || e.key === "Backspace") {
      e.preventDefault();
      takeBack();
    } else if (e.key === "r") {
      restart();
    }
  } else {
    const tools = [SOKO.WALL, SOKO.FLOOR, SOKO.GOAL, SOKO.BOX, SOKO.PLAYER];
    const n = Number(e.key);
    if (n >= 1 && n <= 5) chooseTool(tools[n - 1]);
  }
});

// which square of the draft is under the pointer
function squareAt(e) {
  const rect = canvas.getBoundingClientRect();
  const { tile, ox, oy } = layout(draft.width, draft.height);
  const x = Math.floor((e.clientX - rect.left - ox) / tile);
  const y = Math.floor((e.clientY - rect.top - oy) / tile);
  if (x < 0 || y < 0 || x >= draft.width || y >= draft.height) return -1;
  return y * draft.width + x;
}

let swipe = null;

canvas.addEventListener("pointerdown", (e) => {
  if (mode === "make") {
    const i = squareAt(e);
    if (i < 0) return;
    // right-click, or a pen's eraser end, paints floor
    painting = e.button === 2 || e.button === 5 ? SOKO.FLOOR : tool;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      // fine without it
    }
    if (paint(i, painting)) edited();
    e.preventDefault();
    return;
  }
  swipe = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener("pointermove", (e) => {
  if (mode !== "make") return;
  const i = squareAt(e);
  if (i !== hover) {
    hover = i;
    if (!painting) draw();
  }
  // the player is only ever in one place, so dragging it doesn't paint a trail
  if (painting && i >= 0 && painting !== SOKO.PLAYER && paint(i, painting)) edited();
});

canvas.addEventListener("pointerup", (e) => {
  if (mode === "make") {
    painting = null;
    return;
  }
  if (!swipe) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  swipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) act(dx > 0 ? "right" : "left");
  else act(dy > 0 ? "down" : "up");
});

canvas.addEventListener("pointerleave", () => {
  hover = -1;
  if (mode === "make") draw();
});

canvas.addEventListener("pointercancel", () => {
  painting = null;
  swipe = null;
});

canvas.addEventListener("contextmenu", (e) => {
  if (mode === "make") e.preventDefault();
});

function chooseTool(next) {
  tool = next;
  for (const btn of document.querySelectorAll(".tool")) btn.classList.toggle("on", btn.dataset.tool === tool);
}

$("tools").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tool]");
  if (btn) chooseTool(btn.dataset.tool);
});

for (const btn of document.querySelectorAll(".mode")) {
  btn.addEventListener("click", () => {
    if (btn.dataset.mode === mode && !(current && current.kind === "test")) return;
    if (btn.dataset.mode === "make") startMaking();
    else setMode("play");
  });
}

$("dpad").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-dir]");
  if (btn) act(btn.dataset.dir);
});

$("undo-btn").addEventListener("click", takeBack);
$("restart-btn").addEventListener("click", restart);
$("levels-btn").addEventListener("click", () => ($("levels").hidden ? showLevels() : hideCards()));
$("back-btn").addEventListener("click", () => setMode("make"));

$("draft-name").addEventListener("input", (e) => {
  draft.name = e.target.value;
  storeDraft();
});
$("draft-w").addEventListener("change", (e) => resizeDraft(Number(e.target.value), draft.height));
$("draft-h").addEventListener("change", (e) => resizeDraft(draft.width, Number(e.target.value)));

$("test-btn").addEventListener("click", testDraft);
$("check-btn").addEventListener("click", checkDraft);
$("keep-btn").addEventListener("click", keepDraft);
$("share-btn").addEventListener("click", () => {
  const { problems } = draftLevel();
  if (problems.length) {
    flash(`Not yet: ${problems[0]}`);
    return;
  }
  showShare(draft.name, draftText());
});
$("copy-text-btn").addEventListener("click", async () => {
  flash(await copyText(draftText()) ? "Copied as text - paste it into levels.js to make it a built-in level." : "Couldn't copy.");
});
$("paste-btn").addEventListener("click", pasteLevel);

let fresh = false;
$("new-btn").addEventListener("click", (e) => {
  // asks twice, so a slip doesn't lose a level
  if (!fresh) {
    fresh = true;
    e.target.textContent = "sure? this clears it";
    setTimeout(() => { fresh = false; e.target.textContent = "start again"; }, 2500);
    return;
  }
  fresh = false;
  e.target.textContent = "start again";
  draft = draftFrom(STARTER);
  $("draft-name").value = "";
  $("draft-w").value = draft.width;
  $("draft-h").value = draft.height;
  edited();
});

// Clearing the save asks twice on the button, the same as every game here. It
// forgets progress, not the levels you made.
const resetBtn = $("reset-btn");
let resetArmed = false;

document.addEventListener("click", (e) => {
  if (resetArmed && e.target !== resetBtn) {
    resetArmed = false;
    resetBtn.classList.remove("sure");
    resetBtn.textContent = "clear my save";
  }
});

resetBtn.addEventListener("click", () => {
  if (!resetArmed) {
    resetArmed = true;
    resetBtn.classList.add("sure");
    resetBtn.textContent = "really? your levels are kept";
    return;
  }
  resetArmed = false;
  resetBtn.classList.remove("sure");
  save.solved = {};
  save.at = 0;
  store();
  resetBtn.textContent = "cleared - back to level 1";
  setTimeout(() => { if (!resetArmed) resetBtn.textContent = "clear my save"; }, 2500);
  if (mode === "play") play(builtIn(0));
});

// A share link pasted into the address bar of an open page. Straight to it:
// going through setMode could resume some other level first, and playing that
// would wipe this link out of the address bar before it was ever used.
window.addEventListener("hashchange", () => {
  const shared = levelFromLink(location.hash);
  if (!shared) return;
  showMode("play");
  play(shared);
});

// ===========================================================================
// 9. Start
// ===========================================================================

load();
loadArt();
draft = save.draft ? draftFrom(save.draft.map, save.draft.name, save.draft.id) : draftFrom(STARTER);

// show the d-pad only where there are fingers
document.body.classList.toggle("touch", window.matchMedia("(pointer: coarse)").matches);

const shared = levelFromLink(location.hash);
showMode("play");
if (!(shared && play(shared))) play(builtIn(Math.min(save.at || 0, LEVELS.length - 1)));
new ResizeObserver(resize).observe(canvas);
