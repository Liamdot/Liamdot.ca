// Sokoball: everything you can see and press. The rules themselves are in
// sokoball.js, the art in assets.js and the built-in levels in levels.js.
//
//   1. Saved        - progress, your levels, and the level you're making
//   2. Art          - loading the pictures, falling back to the developer art
//   3. The board    - fitting a level to the screen and drawing it
//   4. Playing      - the map, moves, undo, and finishing a level
//   5. Making       - the editor
//   6. Sharing      - levels in links, and copying text about
//   7. Panels       - your levels, the solved card, the share card
//   8. Input        - keys, swipes and the buttons
//   9. Start

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

// ===========================================================================
// 1. Saved
// ===========================================================================

const SAVE_KEY = "sokoball";

const save = {
  solved: {},   // level key -> true, for every level you've solved
  world: null,  // the map as you left it: { key, player, balls, holes, freed, seen }
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
  const text = SOKOBALL.rowsOf(map).join("\n");
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

const PICTURES = ["floor", "wall", "goal", "goalFilled", "hole", "holeFilled", "grate", "grateOpen", "ball", "player", "finish", "finishOpen",
  "door", "doorDone", "ballLocked", "playerUp", "playerDown", "playerLeft", "playerRight"];

// what to draw until a picture has loaded, or if there's no picture at all
const STAND_INS = {
  floor: "#e9e2d3", wall: "#5b5049", goal: "#c8553d", goalFilled: "#79b36f",
  hole: "#3a322d", holeFilled: "#b98a5a", grate: "#6b6158", grateOpen: "#1a1613", ball: "#c98a43", player: "#2f6f9f",
  finish: "#bdb4a7", finishOpen: "#3fa85e",
  door: "#cfc5b4", doorDone: "#a9d39b", ballLocked: "#a39a8f",
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
        console.warn(`Sokoball: couldn't load ${own} for "${name}" - using the developer art instead.`);
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
let current = null;      // what's being played: { kind, name, map, ... }, kind "world" for the map
let game = null;         // its state, from SOKOBALL.start
let anim = null;         // the move being drawn: { players, balls, t0 }, each a list of [from, to]
let hover = -1;          // the square under the pointer, in the editor

const ANIM_MS = 110;     // one square
const ROLL_MS = 38;      // and this much more for each extra square a ball rolls
const DROP_MS = 200;     // a grate opening, and something dropping through it
const SHUT_MS = 200;     // the grate swinging shut again after

function resize() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = Math.round(canvas.clientHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

// On the map, the camera centres on the room you're in, and pans across to
// the next one when you step into it (PAN_MS). In a gap between rooms it stays
// on the one you came from. The zoom is the same everywhere - far enough out to
// see your room and a whole room either side of it, sized by the biggest room
// on the map - so it never lurches in and out, and the camera stops at the map's edges so there's never empty space
// past them. A map that fits on screen at that size just sits in the middle.
const PAN_MS = 420;
let mapCamera = null;            // what the camera is on: { room, from, to, t0 }, centres in squares
let panLoop = false;

// Each room's middle and size, in squares.
let roomBoxes = null;
function roomBoxesOf() {
  if (roomBoxes && roomBoxes.world === world) return roomBoxes;
  const boxes = new Map();
  for (let i = 0; i < world.rooms.length; i++) {
    const room = world.rooms[i];
    if (room < 0) continue;
    const x = i % world.width;
    const y = Math.floor(i / world.width);
    const b = boxes.get(room) || { x0: x, x1: x, y0: y, y1: y };
    b.x0 = Math.min(b.x0, x);
    b.x1 = Math.max(b.x1, x);
    b.y0 = Math.min(b.y0, y);
    b.y1 = Math.max(b.y1, y);
    boxes.set(room, b);
  }
  let across = 1;
  let down = 1;
  for (const b of boxes.values()) {
    b.middle = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
    across = Math.max(across, b.x1 - b.x0 + 1);
    down = Math.max(down, b.y1 - b.y0 + 1);
  }
  // enough for your room and a whole room on each side of it, walls included
  roomBoxes = { world, boxes, across: across * 3 + 4, down: down * 3 + 4 };
  return roomBoxes;
}

function follow(level, fit) {
  const pad = 14;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const { boxes, across, down } = roomBoxesOf();
  const tile = Math.max(fit, Math.min(72, Math.floor(Math.min((w - pad * 2) / across, (h - pad * 2) / down))));

  // which room to look at: the one the player's in, or the last one
  const now = performance.now();
  const room = game.players.length ? world.rooms[game.players[0]] : -1;
  if (room >= 0 && boxes.has(room) && (!mapCamera || mapCamera.room !== room)) {
    const to = boxes.get(room).middle;
    // the first look is straight there; after that, pan from wherever it is now
    mapCamera = mapCamera
      ? { room, from: cameraAt(now), to, t0: now }
      : { room, from: to, to, t0: now - PAN_MS };
  }
  const [cx, cy] = mapCamera ? cameraAt(now) : [level.width / 2, level.height / 2];
  if (mapCamera && now - mapCamera.t0 < PAN_MS && !panLoop) {
    panLoop = true;
    requestAnimationFrame(() => {
      panLoop = false;
      draw();
    });
  }

  // the room in the middle - unless that would leave a gap past the edge of
  // a map too big for the screen, in which case it stops at the edge
  const place = (squares, span, c) => {
    const centred = span / 2 - (c + 0.5) * tile;
    if (squares * tile <= span - pad * 2) return Math.round(centred);
    return Math.round(Math.min(pad, Math.max(span - squares * tile - pad, centred)));
  };
  return { tile, ox: place(level.width, w, cx), oy: place(level.height, h, cy) };
}

// Where the camera is right now, partway through a pan if it's panning.
function cameraAt(now) {
  const { from, to, t0 } = mapCamera;
  let t = Math.min(1, Math.max(0, (now - t0) / PAN_MS));
  t = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
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
  if (name === "finish" || name === "finishOpen") {
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
  } else if (name === "player" || name.startsWith("ball") || name.startsWith("goal") || name.startsWith("hole")) {
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.38, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const inset = name.startsWith("door") ? 0.1 : 0;
    ctx.fillRect(x + size * inset, y + size * inset, size * (1 - inset * 2), size * (1 - inset * 2));
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
  const { level, ballAt } = game;
  let { tile, ox, oy } = layout(level.width, level.height);
  const at = (i) => [ox + (i % level.width) * tile, oy + Math.floor(i / level.width) * tile];

  // How far through its own movement each piece is, eased so it settles.
  // Anything knocked rolling starts once the step that knocked it is done.
  const now = performance.now();
  const progress = (e) => {
    const t = Math.min(1, Math.max(0, (now - anim.t0 - e.start) / e.ms));
    return 1 - (1 - t) * (1 - t);
  };
  // Where a ball or player that ended up at `cell` should be drawn right now,
  // and how far into its last movement it is. A player can move twice in a
  // turn - a step, then knocked flying - so this follows it back through
  // every movement that brought it here.
  const track = (ball, cell) => {
    const path = [];
    if (anim) {
      let c = cell;
      for (let k = anim.chain.length - 1; k >= 0; k--) {
        const e = anim.chain[k];
        if (e.ball === ball && e.to === c) {
          path.unshift(e);
          c = e.from;
        }
      }
    }
    if (!path.length) return { xy: at(cell), t: 1 };
    for (const e of path) {
      const t = progress(e);
      if (t < 1) {
        const [ax, ay] = at(e.from);
        const [bx, by] = at(e.to);
        return { xy: [ax + (bx - ax) * t, ay + (by - ay) * t], t };
      }
    }
    return { xy: at(cell), t: 1 };
  };
  if (current && current.kind === "world") ({ tile, ox, oy } = follow(level, tile));
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const since = (e) => now - anim.t0 - e.start;

  // Something on its way down and out of the game: where it is and how big.
  // Into a hole, it shrinks over the end of the move that takes it there.
  // Through a grate it arrives first, at full size, then the grate opens and
  // it drops - DROP_MS more - and the grate swings shut behind it (SHUT_MS).
  const going = (e) => {
    const t = progress(e);
    const [ax, ay] = at(e.from);
    const [bx, by] = at(e.to);
    const sink = e.through
      ? 0.75 * clamp((since(e) - e.ms - DROP_MS * 0.25) / (DROP_MS * 0.75))
      : 0.45 * clamp((t - 0.55) / 0.45);
    const size = tile * (1 - sink);
    return [ax + (bx - ax) * t + (tile - size) / 2, ay + (by - ay) * t + (tile - size) / 2, size];
  };
  const stillGoing = (e) => since(e) < e.ms + (e.through ? DROP_MS : 0);

  // balls on their way into a hole or through a grate - a hole stays open
  // until they get there - and players on their way through a grate, who
  // aren't in the game any more
  const falling = anim ? anim.chain.filter((e) => e.ball && e.fell && stillGoing(e)) : [];
  const dying = anim ? anim.chain.filter((e) => e.died && stillGoing(e)) : [];
  // How open each grate is, 0 to 1, by square: starting to open as something
  // arrives, wide open as it drops, then shutting.
  const trapdoors = new Map();
  if (anim) {
    for (const e of anim.chain) {
      if (!e.through) continue;
      const opening = clamp((since(e) - e.ms * 0.6) / (e.ms * 0.4 + DROP_MS * 0.4));
      const shutting = clamp((since(e) - e.ms - DROP_MS) / SHUT_MS);
      trapdoors.set(e.to, Math.max(trapdoors.get(e.to) || 0, opening * (1 - shutting)));
    }
  }
  const landing = new Set(falling.filter((e) => !e.through).map((e) => e.to));

  // the finishes stay shut until every goal is filled
  const open = SOKOBALL.finishOpen(game);
  // on the map, locked balls stand in for walls, and doors for finishes
  const locked = (i) => level.locked && level.locked[i];
  for (let i = 0; i < ballAt.length; i++) {
    const [x, y] = at(i);
    if (level.wall[i] && !locked(i)) picture("wall", x, y, tile);
    else if (level.inside[i]) {
      picture("floor", x, y, tile);
      // a goal or hole: open, or filled in with a ball
      if (level.goal[i] || level.hole[i]) {
        const gaping = game.holes[i] || landing.has(i);
        picture(level.goal[i] ? (gaping ? "goal" : "goalFilled") : (gaping ? "hole" : "holeFilled"), x, y, tile);
      }
      if (level.grate[i]) {
        if (trapdoors.has(i)) drawTrapdoor(trapdoors.get(i), x, y, tile);
        else picture("grate", x, y, tile);
      }
      if (level.doors) {
        if (level.doors.has(i)) drawDoor(level.doors.get(i), x, y, tile);
      } else if (level.finish[i]) picture(open ? "finishOpen" : "finish", x, y, tile);
      if (locked(i)) picture("ballLocked", x, y, tile);
    }
  }
  drawEdge(level.width, level.height, tile, ox, oy, (i) => level.inside[i] && (!level.wall[i] || locked(i)));

  for (let i = 0; i < ballAt.length; i++) {
    if (!ballAt[i]) continue;
    const [x, y] = track(true, i).xy;
    picture("ball", x, y, tile);
  }
  for (const e of falling) picture("ball", ...going(e));

  // on the map, the rooms you haven't been to yet are hidden - under the
  // players, so they never vanish or flip over themselves
  if (current && current.kind === "world") drawFog(tile, ox, oy);

  // a player stuck in a hole sits down in it, a little smaller - shrinking
  // into it over the end of the movement that took it there
  const face = playerPicture(game.facing);
  for (const e of dying) picture("player", ...going(e), face);
  for (const p of game.players) {
    const { xy: [x, y], t } = track(false, p);
    const sunk = game.holes[p] ? 0.22 * Math.max(0, (t - 0.55) / 0.45) : 0;
    const size = tile * (1 - sunk);
    picture("player", x + (tile - size) / 2, y + (tile - size) / 2, size, face);
  }

}

// A grate opening like a pair of trapdoors: it splits down the middle and each
// half swings down into the hole on a hinge at its outer edge. Seen from above,
// a flap swinging down gets narrower - squashed towards its hinge - and darker
// as it tips away from the light, until it hangs straight down out of sight.
//
// The darkening is done on a copy of the grate picture first, so it only
// lands on the grate itself - painting it straight onto the board would shade
// the floor showing round the edges of the picture too, as a grey box.
//
// The hinges are on the grate's own left and right edges, not the square's:
// a picture usually leaves a little floor showing round the grate, and folding
// towards the square's edges would drag the grate out over that floor.
const flap = document.createElement("canvas");

// Where the grate actually is in its picture, left to right, as fractions of
// the picture's width - found from where the picture stops being see-through.
// Worked out once per picture.
let grateSides = null;
function sidesOf(img) {
  if (grateSides && grateSides.src === img.src) return grateSides;
  let left = 0;
  let right = 1;
  try {
    const n = 64;
    const probe = document.createElement("canvas");
    probe.width = n;
    probe.height = n;
    const p = probe.getContext("2d");
    p.drawImage(img, 0, 0, n, n);
    const { data } = p.getImageData(0, 0, n, n);
    const solid = (cx) => {
      for (let cy = 0; cy < n; cy++) if (data[(cy * n + cx) * 4 + 3] > 24) return true;
      return false;
    };
    let a = 0;
    while (a < n - 1 && !solid(a)) a++;
    let b = n - 1;
    while (b > a && !solid(b)) b--;
    left = a / n;
    right = (b + 1) / n;
  } catch (e) {
    // a picture the browser won't let us look inside: hinge on the square
  }
  grateSides = { src: img.src, left, right };
  return grateSides;
}

function drawTrapdoor(open, x, y, tile) {
  picture("grateOpen", x, y, tile);
  const angle = (open * Math.PI) / 2;
  const across = Math.cos(angle);              // how much of its width still shows
  if (across < 0.02) return;

  const size = Math.max(1, Math.round(tile * (window.devicePixelRatio || 1)));
  flap.width = size;
  flap.height = size;
  const f = flap.getContext("2d");
  f.imageSmoothingEnabled = !ART.pixelated;
  if (ready(art.grate)) f.drawImage(art.grate, 0, 0, size, size);
  else {
    f.fillStyle = STAND_INS.grate;
    f.fillRect(0, 0, size, size);
  }
  f.globalCompositeOperation = "source-atop";  // only where the grate is
  f.fillStyle = `rgba(0, 0, 0, ${0.65 * Math.sin(angle)})`;
  f.fillRect(0, 0, size, size);

  const sides = ready(art.grate) ? sidesOf(art.grate) : { left: 0, right: 1 };
  const half = ((sides.right - sides.left) * tile) / 2;
  for (const side of [-1, 1]) {
    ctx.save();
    // the hinge: the grate's left edge for the left half, its right edge for
    // the right one, so each squashes towards its own side
    const hinge = x + (side < 0 ? sides.left : sides.right) * tile;
    ctx.translate(hinge, y);
    ctx.scale(across, 1);
    ctx.beginPath();
    ctx.rect(side < 0 ? 0 : -half, 0, half, tile);   // this half, from its hinge
    ctx.clip();
    ctx.drawImage(flap, x - hinge, 0, tile, tile);
    ctx.restore();
  }
}

// A door on the map, with its level's number on it. Solved ones go green.
function drawDoor(n, x, y, tile) {
  const done = LEVELS[n] && save.solved[keyOf(LEVELS[n].map)];
  picture(done ? "doorDone" : "door", x, y, tile);
  ctx.fillStyle = done ? "#2d6b3c" : "#5b5049";
  ctx.font = `700 ${Math.round(tile * 0.4)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n + 1), x + tile / 2, y + tile / 2 + 1);
}

// The edge of a level is as solid as a wall, so where floor runs right up to
// it, it gets a hard edge to say so. A level with its own walls round the
// outside has no floor there, and looks exactly as it would anyway.
function drawEdge(width, height, tile, ox, oy, isFloor) {
  const e = Math.max(3, Math.round(tile * 0.12));
  ctx.fillStyle = ART.edge || STAND_INS.wall;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isFloor(y * width + x)) continue;
      const px = ox + x * tile;
      const py = oy + y * tile;
      const left = x === 0;
      const right = x === width - 1;
      const top = y === 0;
      const bottom = y === height - 1;
      if (left) ctx.fillRect(px - e, py, e, tile);
      if (right) ctx.fillRect(px + tile, py, e, tile);
      if (top) ctx.fillRect(px, py - e, tile, e);
      if (bottom) ctx.fillRect(px, py + tile, tile, e);
      if (left && top) ctx.fillRect(px - e, py - e, e, e);
      if (right && top) ctx.fillRect(px + tile, py - e, e, e);
      if (left && bottom) ctx.fillRect(px - e, py + tile, e, e);
      if (right && bottom) ctx.fillRect(px + tile, py + tile, e, e);
    }
  }
}

function drawDraft() {
  const { width, height, cells } = draft;
  const { tile, ox, oy } = layout(width, height);

  for (let i = 0; i < cells.length; i++) {
    const ch = cells[i];
    const x = ox + (i % width) * tile;
    const y = oy + Math.floor(i / width) * tile;
    if (ch === SOKOBALL.WALL) {
      picture("wall", x, y, tile);
      continue;
    }
    picture("floor", x, y, tile);
    if (ch === SOKOBALL.GOAL) picture("goal", x, y, tile);
    if (ch === SOKOBALL.HOLE) picture("hole", x, y, tile);
    if (ch === SOKOBALL.GRATE) picture("grate", x, y, tile);
    if (ch === SOKOBALL.BALL_ON_GOAL || ch === SOKOBALL.PLAYER_ON_GOAL) picture("goalFilled", x, y, tile);
    if (ch === SOKOBALL.FINISH) picture("finish", x, y, tile);
    if (ch === SOKOBALL.BALL) picture("ball", x, y, tile);
    if (ch === SOKOBALL.PLAYER || ch === SOKOBALL.PLAYER_ON_GOAL) picture("player", x, y, tile);
  }

  drawEdge(width, height, tile, ox, oy, (i) => cells[i] !== SOKOBALL.WALL);

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
  if (anim && performance.now() - anim.t0 < anim.ms) requestAnimationFrame(tick);
  else {
    anim = null;
    draw();
  }
}

// A step takes ANIM_MS. Something knocked rolling waits for the step to
// finish, then takes a little longer the further it goes, so a long roll still
// reads as a roll.
function animate(change) {
  if (!change) return;
  const w = game.level.width;
  const far = (e) => Math.abs((e.to % w) - (e.from % w)) + Math.abs(Math.floor(e.to / w) - Math.floor(e.from / w));
  const length = (e) => (e.wave ? ANIM_MS + ROLL_MS * (far(e) - 1) : ANIM_MS);
  const waves = Math.max(...change.chain.map((e) => e.wave));
  const starts = [0];
  for (let k = 0; k < waves; k++) {
    const inWave = change.chain.filter((e) => e.wave === k);
    starts.push(starts[k] + (inWave.length ? Math.max(...inWave.map(length)) : 0));
  }
  const gone = new Map(change.balls.filter((b) => b[2]).map(([from, to, how]) => [`${from}>${to}`, how]));
  const chain = change.chain.map((e) => {
    const how = e.ball ? gone.get(`${e.from}>${e.to}`) : undefined;
    // `through`: fell through a grate, which then has to shut again
    return { ...e, start: starts[e.wave], ms: length(e), fell: Boolean(how), through: how === "grate" || e.died };
  });
  const end = (e) => e.start + e.ms + (e.through ? DROP_MS + SHUT_MS : 0);
  anim = { chain, t0: performance.now(), ms: Math.max(...chain.map(end)) };
  requestAnimationFrame(tick);
}

// ===========================================================================
// 4. Playing
// ===========================================================================

// ---- the map ----
//
// The campaign is a map you walk round (WORLD, in levels.js). Each level is a
// door on it, and solving a level frees the balls that were holding the way
// on shut. Where you are and where you've pushed things is remembered, so
// coming out of a level puts you back on its door with the map as you left it.

let world = null;        // from SOKOBALL.parseWorld

function solvedLevels() {
  return new Set(LEVELS.map((lv, n) => (save.solved[keyOf(lv.map)] ? n : -1)).filter((n) => n >= 0));
}

function doorOf(n) {
  for (const [i, m] of world.doors) if (m === n) return i;
  return null;
}

// The level on the door you're standing on, if there is one.
function doorHere() {
  if (!current || current.kind !== "world") return null;
  const n = world.doors.get(game.players[0]);
  return n !== undefined && LEVELS[n] ? n : null;
}

// Back to the map, standing on square `at` if given, or wherever you were.
function goToMap(at = null) {
  const solved = solvedLevels();
  const level = SOKOBALL.worldLevel(world, solved);
  const key = keyOf(WORLD);
  if (!save.world || save.world.key !== key) {
    save.world = { key, player: world.start, balls: null, holes: null, freed: [], seen: [] };
  }
  const saved = save.world;

  clearTimeout(finishTimer);
  current = { kind: "world", name: "Map" };
  mapCamera = null;                          // arriving: no pan, straight to the room
  game = SOKOBALL.start(level);
  // the balls where you left them, if they still make sense on this map -
  // plus any freed since, which start where they were locked
  if (saved.balls && saved.balls.every((b) => level.inside[b] && !level.wall[b])) {
    game.ballAt.fill(0);
    for (const b of saved.balls) game.ballAt[b] = 1;
    for (const n of solved) {
      if (!saved.freed.includes(n)) for (const i of world.locks.get(n) || []) game.ballAt[i] = 1;
    }
  }
  // and the holes still open, if any have been filled
  if (saved.holes && saved.holes.every((h) => world.hole[h])) {
    game.holes.fill(0);
    for (const h of saved.holes) game.holes[h] = 1;
  }
  saved.freed = [...solved];
  const player = at !== null ? at : saved.player;
  const safe = (p) => level.inside[p] && !level.wall[p] && !game.ballAt[p] && !game.holes[p] && !level.grate[p];
  game.players = [safe(player) ? player : world.start];
  if (!Array.isArray(saved.seen)) saved.seen = [];
  explore(false);
  rememberMap();

  anim = null;
  hideCards();
  if (location.hash) history.replaceState(null, "", location.pathname);
  showBar();
  draw();
}

// Only ever a map you can carry on from: stuck in a hole or gone through a
// grate isn't saved, so a reload puts you back before it happened.
function rememberMap() {
  if (!current || current.kind !== "world" || SOKOBALL.stuck(game)) return;
  save.world.player = game.players[0];
  save.world.balls = [];
  save.world.holes = [];
  for (let i = 0; i < game.ballAt.length; i++) {
    if (game.ballAt[i]) save.world.balls.push(i);
    if (game.holes[i]) save.world.holes.push(i);
  }
  store();
}

// ---- the fog ----
//
// Rooms on the map you haven't walked into yet aren't there at all - just the
// background. Step into one and its squares flip over into view, rippling out
// from where you came in: each starts FLIP_STEP later for each square further
// away, and takes FLIP_MS to turn. The walls and gaps round a room come with
// it, turning with the nearest of its squares. Which rooms you've seen is
// saved with the map; they're just there when you come back.

const FLIP_MS = 260;
const FLIP_STEP = 45;
const BACKGROUND = "#2b2622";    // the stage behind the board
const turning = new Map();       // room -> { t0, from }: when and where it started to show

function explore(fade) {
  const at = game.players.length ? game.players[0] : -1;
  const room = at >= 0 ? world.rooms[at] : -1;
  if (room < 0 || save.world.seen.includes(room)) return;
  save.world.seen.push(room);
  if (fade) turning.set(room, { t0: performance.now(), from: at });
}

// When each square of the map shows: -Infinity for squares that have always
// been there, a time for ones still to turn over, Infinity for hidden ones.
function showTimes() {
  const { width, height, rooms, gaps } = world;
  const size = width * height;
  const room = new Float64Array(size).fill(Infinity);
  for (let i = 0; i < size; i++) {
    const r = rooms[i];
    if (r < 0 || !save.world.seen.includes(r)) continue;
    const t = turning.get(r);
    if (!t) room[i] = -Infinity;
    else {
      const dx = (i % width) - (t.from % width);
      const dy = Math.floor(i / width) - Math.floor(t.from / width);
      room[i] = t.t0 + Math.hypot(dx, dy) * FLIP_STEP;
    }
  }
  // a gap shows with the first room beside it; a wall with the first room or
  // gap beside it, corners included, so a room keeps its outline
  const earliest = (i, diagonals, from) => {
    const x = i % width;
    const y = (i - x) / width;
    let best = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!diagonals && dx && dy)) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        best = Math.min(best, from[ny * width + nx]);
      }
    }
    return best;
  };
  const shown = Float64Array.from(room);
  for (let i = 0; i < size; i++) if (gaps[i]) shown[i] = earliest(i, false, room);
  const open = Float64Array.from(shown);
  for (let i = 0; i < size; i++) if (rooms[i] < 0 && !gaps[i]) shown[i] = earliest(i, true, open);
  return shown;
}

// Covers whatever hasn't shown yet, and turns over whatever's showing now: the
// square is copied, blanked, and drawn back squeezed from edge-on to flat,
// darker while it's still edge-on.
const flipTile = document.createElement("canvas");
let flipLoop = false;

function drawFog(tile, ox, oy) {
  const { width } = world;
  const now = performance.now();
  const shown = showTimes();
  const ratio = window.devicePixelRatio || 1;
  let busy = false;
  for (let i = 0; i < shown.length; i++) {
    const since = now - shown[i];
    if (since >= FLIP_MS) continue;
    const x = ox + (i % width) * tile;
    const y = oy + Math.floor(i / width) * tile;
    if (since < 0) {
      // not yet: nothing there. A hair over size, so no seams show between.
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(x - 0.5, y - 0.5, tile + 1, tile + 1);
      if (shown[i] !== Infinity) busy = true;
      continue;
    }
    busy = true;
    const px = Math.max(1, Math.round(tile * ratio));
    flipTile.width = px;
    flipTile.height = px;
    flipTile.getContext("2d").drawImage(canvas, Math.round(x * ratio), Math.round(y * ratio), px, px, 0, 0, px, px);
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(x - 0.5, y - 0.5, tile + 1, tile + 1);
    const t = since / FLIP_MS;
    const across = Math.sin((t * Math.PI) / 2);   // edge-on to flat
    const w = tile * across;
    const left = x + (tile - w) / 2;
    ctx.drawImage(flipTile, left, y, w, tile);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.5 * (1 - across)})`;
    ctx.fillRect(left, y, w, tile);
  }
  // once everything's turned, forget when it did
  if (!busy) turning.clear();
  else if (!flipLoop) {
    flipLoop = true;
    requestAnimationFrame(() => {
      flipLoop = false;
      draw();
    });
  }
}

function enterDoor() {
  const n = doorHere();
  if (n === null) return;
  fade(() => play(builtIn(n)));
}

// From one screen to the next: a quick fade out, the change, and back in.
let fadeTimer = 0;
function fade(change) {
  letGoOfEverything();
  canvas.classList.add("fading");
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => {
    change();
    canvas.classList.remove("fading");
  }, 180);
}

// ---- a level ----

// Starts a level. Anything that can't be played is turned away with the
// reason, and nothing changes.
function play(entry) {
  let level;
  try {
    level = SOKOBALL.parse(entry.map);
  } catch (e) {
    flash(e.message);
    return false;
  }
  const problems = SOKOBALL.check(level);
  if (problems.length) {
    flash(problems[0]);
    return false;
  }

  clearTimeout(finishTimer);
  current = entry;
  game = SOKOBALL.start(level);
  anim = null;
  hideCards();
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

let finishTimer = 0;

function act(dir) {
  if (mode !== "play" || !game || game.done) return;
  const change = SOKOBALL.move(game, dir);
  if (!change) {
    draw();                                  // still worth showing the turn
    return;
  }
  animate(change);
  if (current.kind === "world") {
    explore(true);
    rememberMap();
    showBar();
    if (SOKOBALL.stuck(game)) {
      letGoOfEverything();
      finishTimer = setTimeout(() => { if (SOKOBALL.stuck(game)) showStuck(); }, anim.ms + 40);
    }
    return;
  }
  showBar();
  if (SOKOBALL.solved(game)) {
    // Finished the moment the last ball lands, not a beat later - a held key
    // would otherwise get one more step in between.
    game.done = true;
    letGoOfEverything();
    finishTimer = setTimeout(finished, anim.ms + 40);
  } else if (SOKOBALL.stuck(game)) {
    // nobody left to move: say so once the last one has sunk in
    letGoOfEverything();
    finishTimer = setTimeout(() => { if (SOKOBALL.stuck(game)) showStuck(); }, anim.ms + 40);
  }
}

// Going back is instant, and the board drains of colour for a moment as it
// happens - so taking a move back never looks like making one. Hold undo down
// and it stays grey until you let go.
let rewindTimer = 0;
function rewound() {
  anim = null;
  canvas.classList.add("rewound");
  clearTimeout(rewindTimer);
  rewindTimer = setTimeout(() => canvas.classList.remove("rewound"), 160);
}

function takeBack() {
  if (mode !== "play" || !game) return;
  hideCards();
  if (!SOKOBALL.undo(game)) return;
  // taking back the winning move means it isn't won any more
  clearTimeout(finishTimer);
  game.done = false;
  rewound();
  rememberMap();
  showBar();
  draw();
}

// On the map, restart puts every ball back where it started and you back at
// the beginning - the way out if a ball ends up somewhere it blocks you.
function restart() {
  if (!current || !game) return;
  if (current.kind === "world") {
    rewound();
    save.world.balls = null;
    save.world.holes = null;
    goToMap(world.start);
    return;
  }
  if (!game.history.length) return;
  rewound();
  play(current);
}

// Campaign levels and your own go straight back to the map. A shared level or
// a test from the editor gets a card instead, for what you'd do next.
function finished() {
  if (!game || !game.done) return;
  if (current.kind !== "test") {
    save.solved[keyOf(current.map)] = true;
    store();
  }
  if (current.kind === "built") fade(() => goToMap(doorOf(current.index)));
  else if (current.kind === "mine") fade(() => goToMap());
  else showSolved();
}

function leaveLevel() {
  if (current && current.kind !== "world" && current.kind !== "test") {
    fade(() => goToMap(current.kind === "built" ? doorOf(current.index) : null));
  }
}

function showBar() {
  const playing = mode === "play";
  const testing = playing && current && current.kind === "test";
  const onMap = playing && current && current.kind === "world";
  const door = doorHere();

  let label = "Level editor";
  if (playing && current) {
    if (onMap) label = door !== null ? `${door + 1}. ${LEVELS[door].name}` : "Map";
    else label = current.kind === "built" ? `${current.index + 1}. ${current.name}` : current.name;
    if (current.kind === "shared") label += " (shared)";
    if (testing) label += " (testing)";
  }
  $("level-name").textContent = label;

  // undo and restart only mean anything while playing; the way back to the
  // map is swapped for a way back to the editor while testing
  for (const el of document.querySelectorAll(".play-only")) el.hidden = !playing;
  $("enter-btn").hidden = !onMap || door === null;
  $("map-btn").hidden = !playing || onMap || testing;
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
let tool = SOKOBALL.WALL;
let painting = null;     // what's being painted while the pointer is down
let verdict = null;      // what "check" last said, until the next change

// No walls needed round the outside: the edge is solid already.
const STARTER = `
---------
---------
--@--$-.-
---------
-------!-`;

function draftFrom(map, name = "", id = null) {
  const rows = SOKOBALL.rowsOf(map);
  return { id, name, width: rows[0].length, height: rows.length, cells: rows.join("").split("") };
}

function draftText() {
  const rows = [];
  for (let y = 0; y < draft.height; y++) rows.push(draft.cells.slice(y * draft.width, (y + 1) * draft.width));
  return SOKOBALL.writeRows(rows);
}

function storeDraft() {
  save.draft = { id: draft.id, name: draft.name, map: draftText() };
  store();
}

// What painting one square with the current tool turns it into. Everything
// replaces what was there - a goal and a hole are holes, so nothing can start
// in one. Each player painted is another player.
function paint(i, with_) {
  const next = with_;
  if (next === draft.cells[i]) return false;
  draft.cells[i] = next;
  return true;
}

function edited() {
  stopChecking();
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
      cells.push(x < draft.width && y < draft.height ? draft.cells[y * draft.width + x] : SOKOBALL.FLOOR);
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
    const level = SOKOBALL.parse(draftText());
    return { level, problems: SOKOBALL.check(level) };
  } catch (e) {
    return { level: null, problems: [e.message] };
  }
}

function showProblems() {
  const { problems } = draftLevel();
  const note = $("problems");
  if (problems.length) {
    note.className = "problems bad";
    note.innerHTML = `<ul>${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
  } else if (verdict) {
    note.className = `problems ${verdict.good ? "good" : "bad"}`;
    note.textContent = verdict.text;
  } else {
    note.className = "problems";
    note.textContent = "The level is playable. Press check to see whether it can be solved.";
  }
}

// The solver runs in solver.js, off the page, so a big level can take a few
// seconds without everything locking up. It's given the same ?v= as the page's
// own scripts so it always checks against the rules the game is using.
let checker = null;
const VERSION = (document.querySelector('script[src*="sokoball.js"]').getAttribute("src").match(/\?.*$/) || [""])[0];

function stopChecking() {
  if (checker) checker.terminate();
  checker = null;
}

function checkDraft() {
  const { level, problems } = draftLevel();
  stopChecking();
  if (problems.length) {
    showProblems();
    return;
  }
  const note = $("problems");
  note.className = "problems";
  note.textContent = "Checking whether the puzzle can be solved...";

  const report = (result) => {
    stopChecking();
    verdict = {
      solved: { good: true, text: `The puzzle is solvable. The shortest solution takes ${result.moves} move${result.moves === 1 ? "" : "s"}.` },
      impossible: { good: false, text: "The puzzle is not solvable." },
      unknown: { good: true, text: "The puzzle is too large to check. Test it to make sure it can be solved." },
    }[result.result] || { good: false, text: "The puzzle could not be checked." };
    showProblems();
  };

  try {
    checker = new Worker(`solver.js${VERSION}`);
    checker.onmessage = (e) => report(e.data);
    checker.onerror = () => report(SOKOBALL.solve(level, 250000));
    checker.postMessage({ text: draftText(), budget: 2000000 });
  } catch (err) {
    // no workers here (a page opened straight from disk, say): a smaller check
    // on the page itself is better than none
    setTimeout(() => report(SOKOBALL.solve(level, 250000)), 30);
  }
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
  letGoOfEverything();
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
// goes back to the map, since the test isn't a level to stay on.
function setMode(next) {
  showMode(next);
  if (mode === "play" && current && current.kind === "test") goToMap();
}

function testDraft() {
  const { problems } = draftLevel();
  if (problems.length) {
    flash(problems[0]);
    return;
  }
  showMode("play");
  play({ kind: "test", name: draft.name || "Untitled level", map: draftText() });
}

function keepDraft() {
  const { problems } = draftLevel();
  if (problems.length) {
    flash(problems[0]);
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
  flash(existing ? `Updated "${name}" in my levels.` : `Saved "${name}" to my levels.`);
}

// ===========================================================================
// 6. Sharing
// ===========================================================================
//
// A shared level travels entirely in the link: its name, and the level itself
// squashed by SOKOBALL.encode. Nothing is sent anywhere or stored on a server, so
// there's nothing to look after and nothing anyone can fill with rubbish -
// a link is only ever seen by whoever it's given to.

function linkFor(name, map) {
  const params = new URLSearchParams();
  if (name) params.set("n", name.slice(0, 40));
  params.set("l", SOKOBALL.encode(map));
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
    name: (params.get("n") || "Untitled level").slice(0, 40),
    map: SOKOBALL.decode(code),
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
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.append(field);
    field.select();
    const done = document.execCommand("copy");
    field.remove();
    return done;
  } catch (e) {
    return false;
  }
}

function pasteLevel() {
  const field = $("paste-box");
  if (field.hidden) {
    field.hidden = false;
    field.value = "";
    field.focus();
    return;
  }
  const text = field.value.trim();
  field.hidden = true;
  if (!text) return;

  const fromLink = levelFromLink(text);
  const map = fromLink ? fromLink.map : text;
  try {
    SOKOBALL.parse(map);
  } catch (e) {
    flash(e.message);
    return;
  }
  draft = draftFrom(map, fromLink ? fromLink.name : draft.name, null);
  $("draft-name").value = draft.name;
  $("draft-w").value = draft.width;
  $("draft-h").value = draft.height;
  edited();
  flash("Level pasted into the editor.");
}

// ===========================================================================
// 7. Panels
// ===========================================================================

function hideCards() {
  for (const id of ["solved", "levels", "share", "stuck"]) $(id).hidden = true;
}

let flashTimer = 0;
function flash(text) {
  const el = $("flash");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// Only for a shared level or a test - everything else goes back to the map.
function showSolved() {
  const testing = current.kind === "test";
  const card = $("solved");
  card.innerHTML = `
    <h2>Solved</h2>
    <div class="row">
      ${testing ? `<button class="pill strong" data-go="editor">back to editor</button>` : ""}
      ${!testing ? `<button class="pill strong" data-go="keep-shared">save to my levels</button>` : ""}
      <button class="pill" data-go="again">play again</button>
      ${!testing ? `<button class="pill" data-go="map">map</button>` : ""}
    </div>`;
  card.hidden = false;
}

// Every player is stuck in a hole or gone: just the two ways out, quietly, at
// the bottom.
function showStuck() {
  $("stuck").hidden = false;
}

$("stuck").addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (!go) return;
  if (go.dataset.go === "undo") takeBack();
  else restart();
});

$("solved").addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (!go) return;
  const what = go.dataset.go;
  if (what === "again") restart();
  if (what === "editor") setMode("make");
  if (what === "map") fade(() => goToMap());
  if (what === "keep-shared") keepShared();
});

function keepShared() {
  if (!current || current.kind !== "shared") return;
  const already = save.mine.find((m) => keyOf(m.map) === keyOf(current.map));
  if (!already) {
    save.mine.push({ id: `m${Date.now().toString(36)}`, name: current.name, map: current.map });
    store();
  }
  flash(already ? "This level is already in my levels." : "Saved to my levels.");
}

function showLevels() {
  const card = $("levels");
  const record = (map) => save.solved[keyOf(map)];
  const mark = (map) => (record(map) ? `<span class="done" title="Solved">&#10003;</span>` : "");

  const mine = save.mine.length
    ? save.mine.map((m) => `
      <div class="level-row mine">
        <button class="name-btn" data-play="mine" data-id="${esc(m.id)}"><span class="name">${esc(m.name)}</span>${mark(m.map)}</button>
        <button class="tiny go" data-play="mine" data-id="${esc(m.id)}">play</button>
        <button class="tiny" data-edit="${esc(m.id)}">edit</button>
        <button class="tiny" data-share="${esc(m.id)}">share</button>
        <button class="tiny danger" data-delete="${esc(m.id)}">delete</button>
      </div>`).join("")
    : `<p class="sub">No saved levels yet. Make one with <strong>make</strong>, or open a share link.</p>`;

  card.innerHTML = `
    <div class="card-head"><h2>My levels</h2><button class="close" data-close aria-label="Close">&times;</button></div>
    <div class="level-list">${mine}</div>`;
  card.hidden = false;
}

$("levels").addEventListener("click", (e) => {
  const el = e.target.closest("button");
  if (!el) return;
  if (el.hasAttribute("data-close")) { hideCards(); return; }

  if (el.dataset.play === "mine") {
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
      el.textContent = "Are you sure?";
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
    <div class="card-head"><h2>Share "${esc(name || "Untitled level")}"</h2><button class="close" data-close aria-label="Close">&times;</button></div>
    <p class="sub">Anyone with this link can play the level and save their own copy.</p>
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
      flash("Couldn't copy to the clipboard. The link is selected, so you can copy it yourself.");
    }
  });
}

$("share").addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) hideCards();
});

// ===========================================================================
// 8. Input
// ===========================================================================

// By where the key is rather than what it types, so holding Shift halfway
// through doesn't turn "d" into "D" and leave it held for ever - and WASD
// stays in the same place on keyboards that put other letters there.
const KEYS = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right",
};

// ---- holding a direction ----
//
// One step the moment it's pressed, a short pause so a tap is only ever one
// step, then steadily for as long as it's held. The browser's own key repeat
// is ignored: its speed is whatever the computer happens to be set to, and
// this way it matches the moves on screen. With two directions held, the
// newest one wins, and letting it go carries on with the other.
const HOLD_PAUSE = 220;    // ms before it starts repeating
const HOLD_EVERY = 135;    // ms between steps after that - just behind each move finishing

const held = [];           // whatever's holding a direction down, newest last
let holdTimer = 0;

function heldDir() {
  const what = held[held.length - 1];
  return what ? what.split(":")[1] : null;
}

function press(what) {
  const at = held.indexOf(what);
  if (at >= 0) held.splice(at, 1);
  held.push(what);
  act(heldDir());
  clearTimeout(holdTimer);
  holdTimer = setTimeout(keepGoing, HOLD_PAUSE);
}

function keepGoing() {
  const dir = heldDir();
  if (!dir) return;
  act(dir);
  holdTimer = setTimeout(keepGoing, HOLD_EVERY);
}

function letGo(what) {
  const at = held.indexOf(what);
  if (at >= 0) held.splice(at, 1);
  if (!held.length) clearTimeout(holdTimer);
}

function letGoOfEverything() {
  held.length = 0;
  clearTimeout(holdTimer);
}

// a key let go of while the window wasn't looking would otherwise never come up
window.addEventListener("blur", letGoOfEverything);
document.addEventListener("visibilitychange", () => { if (document.hidden) letGoOfEverything(); });

window.addEventListener("keyup", (e) => {
  if (KEYS[e.code]) letGo(`key-${e.code}:${KEYS[e.code]}`);
});

window.addEventListener("keydown", (e) => {
  const focused = document.activeElement;
  if (focused && focused.closest && focused.closest("input, textarea, select")) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.key === "Escape") {
    // closes whatever card is open, or failing that leaves the level for the map
    const open = ["solved", "levels", "share"].some((id) => !$(id).hidden);
    hideCards();
    if (!open && mode === "play") leaveLevel();
    return;
  }

  if (mode === "play") {
    if (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space" || e.code === "KeyE") {
      if (doorHere() !== null) {
        e.preventDefault();
        if (!e.repeat) enterDoor();
      }
    } else if (KEYS[e.code]) {
      e.preventDefault();
      if (!e.repeat) press(`key-${e.code}:${KEYS[e.code]}`);
    } else if (e.key === "z" || e.key === "u" || e.key === "Backspace") {
      e.preventDefault();
      takeBack();
    } else if (e.key === "r") {
      restart();
    }
  } else {
    const tools = [SOKOBALL.WALL, SOKOBALL.FLOOR, SOKOBALL.GOAL, SOKOBALL.HOLE, SOKOBALL.GRATE, SOKOBALL.BALL, SOKOBALL.PLAYER, SOKOBALL.FINISH];
    const n = Number(e.key);
    if (n >= 1 && n <= tools.length) chooseTool(tools[n - 1]);
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
    painting = e.button === 2 || e.button === 5 ? SOKOBALL.FLOOR : tool;
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
  // players are placed one click at a time - dragging would lay a whole crowd
  if (painting && i >= 0 && painting !== SOKOBALL.PLAYER && paint(i, painting)) edited();
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

// The d-pad holds the same way the keys do: press for one step, keep a finger
// on it to keep going.
$("dpad").addEventListener("pointerdown", (e) => {
  const btn = e.target.closest("[data-dir]");
  if (!btn) return;
  e.preventDefault();
  try {
    btn.setPointerCapture(e.pointerId);    // keeps it held if the finger slides off
  } catch (err) {
    // fine without it
  }
  press(`pad-${e.pointerId}:${btn.dataset.dir}`);
});

for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  $("dpad").addEventListener(type, (e) => {
    for (const what of held.filter((h) => h.startsWith(`pad-${e.pointerId}:`))) letGo(what);
  });
}

// a long press would otherwise bring up the phone's own menu
$("dpad").addEventListener("contextmenu", (e) => e.preventDefault());

// Pressing a d-pad button from the keyboard (Tab to it, then Enter) still works.
$("dpad").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-dir]");
  if (btn && e.detail === 0) act(btn.dataset.dir);
});

$("undo-btn").addEventListener("click", takeBack);
$("restart-btn").addEventListener("click", restart);
$("levels-btn").addEventListener("click", () => ($("levels").hidden ? showLevels() : hideCards()));
$("enter-btn").addEventListener("click", enterDoor);
$("map-btn").addEventListener("click", leaveLevel);
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
    flash(problems[0]);
    return;
  }
  showShare(draft.name, draftText());
});
$("copy-text-btn").addEventListener("click", async () => {
  flash(await copyText(draftText()) ? "Level copied as text." : "Couldn't copy to the clipboard.");
});
$("paste-btn").addEventListener("click", pasteLevel);

let fresh = false;
$("new-btn").addEventListener("click", (e) => {
  // asks twice, so a slip doesn't lose a level
  if (!fresh) {
    fresh = true;
    e.target.textContent = "Are you sure?";
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
    resetBtn.textContent = "Are you sure?";
    return;
  }
  resetArmed = false;
  resetBtn.classList.remove("sure");
  save.solved = {};
  save.world = null;
  store();
  resetBtn.textContent = "Save cleared";
  setTimeout(() => { if (!resetArmed) resetBtn.textContent = "clear my save"; }, 2500);
  if (mode === "play") goToMap();
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
world = SOKOBALL.parseWorld(WORLD);
draft = save.draft ? draftFrom(save.draft.map, save.draft.name, save.draft.id) : draftFrom(STARTER);

const shared = levelFromLink(location.hash);
showMode("play");
if (!(shared && play(shared))) goToMap();
new ResizeObserver(resize).observe(canvas);
