// Breadboard Baker
// Lay out a circuit on a real breadboard, and have it tell you what a
// drawing can't: what's actually connected, what lights up, and what would
// let the smoke out.
//
//   1. The board    - where every hole sits
//   2. Drawing      - board, parts, the lot
//   3. The chip     - pinouts, and what each pin is doing right now
//   4. Doing things - placing, picking up, pressing
//   5. Keeping it   - saving, and a picture for your lab report

const { COLS, ROWS, clipOf, chipHoles } = Circuit;

// ===========================================================================
// 1. The board
// ===========================================================================

const PITCH = 20;              // holes are a tenth of an inch apart, really
const LEFT = 34;               // room for the row letters
const CHANNEL = 34;            // the gap down the middle
const RAIL_GAP = 26;

const Y = (() => {
  let y = 20;
  const railPlusTop = y; y += PITCH;
  const railMinusTop = y; y += PITCH + RAIL_GAP;
  const top = ROWS.map((_, i) => y + i * PITCH); y += ROWS.length * PITCH + CHANNEL;
  const bottom = ROWS.map((_, i) => y + i * PITCH); y += ROWS.length * PITCH + RAIL_GAP;
  const railMinusBottom = y; y += PITCH;
  const railPlusBottom = y; y += PITCH;
  return { railPlusTop, railMinusTop, top, bottom, railMinusBottom, railPlusBottom, height: y + 18 };
})();

const WIDTH = LEFT + COLS * PITCH + 24;
const holeX = (col) => LEFT + (col - 1) * PITCH;

function holeY(hole) {
  if (hole.kind === "rail") {
    return { "+top": Y.railPlusTop, "-top": Y.railMinusTop,
      "-bottom": Y.railMinusBottom, "+bottom": Y.railPlusBottom }[hole.rail];
  }
  return hole.half === "T" ? Y.top[hole.row] : Y.bottom[hole.row];
}

const point = (hole) => ({ x: holeX(hole.col), y: holeY(hole) });

// Every hole on the board, in one list, so hit-testing and drawing agree.
const HOLES = (() => {
  const all = [];
  for (let col = 1; col <= COLS; col++) {
    for (const rail of ["+top", "-top", "-bottom", "+bottom"]) all.push({ kind: "rail", rail, col });
    for (let row = 0; row < ROWS.length; row++) {
      all.push({ kind: "main", half: "T", row, col });
      all.push({ kind: "main", half: "B", row, col });
    }
  }
  return all;
})();

const holeKey = (hole) => (hole.kind === "rail" ? `${hole.rail}:${hole.col}` : `${hole.half}${hole.row}:${hole.col}`);

// ===========================================================================
// 2. State
// ===========================================================================

const SAVE_KEY = "breadboard-baker";

let parts = [];
let nextId = 1;
let tool = "wire";
let chipToPlace = "7400";
let pending = null;        // the first leg of something being placed
let selected = null;
let showChecks = false;

const WIRE_COLOURS = ["#d94f4f", "#3f7ad9", "#e0a63a", "#3fa85e", "#222", "#f1ede4"];
let wireColour = 0;

const RESISTORS = [220, 330, 1000, 4700, 10000, 100000];
const BANDS = ["#111", "#7a4a1e", "#d94f4f", "#e08a3a", "#e0d23a", "#3fa85e", "#3f7ad9", "#8a5ad9", "#888", "#fff"];

const board = document.getElementById("board");
const inspector = document.getElementById("inspector");
const checksEl = document.getElementById("checks");
const paletteEl = document.getElementById("palette");

// ===========================================================================
// 3. Drawing
// ===========================================================================

const esc = (text) => String(text).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

// 4700 -> "4.7k"
function ohms(value) {
  if (value >= 1000000) return `${value / 1000000}M`;
  if (value >= 1000) return `${value / 1000}k`;
  return `${value}`;
}

// The three colour bands a real resistor would wear.
function bandsFor(value) {
  const digits = String(value);
  const first = Number(digits[0]);
  const second = Number(digits[1] || 0);
  const zeros = digits.length - 2;
  return [BANDS[first], BANDS[second], BANDS[Math.max(0, zeros)]];
}

function boardSVG(state) {
  let svg = `<rect class="body" x="0" y="${Y.railPlusTop - 14}" width="${WIDTH}" height="${Y.height - Y.railPlusTop + 8}" rx="6"/>`;

  // the channel down the middle, and the rail stripes
  const channelY = Y.top[ROWS.length - 1] + PITCH - 6;
  svg += `<rect class="channel" x="8" y="${channelY}" width="${WIDTH - 16}" height="${CHANNEL - 8}" rx="3"/>`;
  for (const [y, cls, label] of [
    [Y.railPlusTop, "plus", "+"], [Y.railMinusTop, "minus", "−"],
    [Y.railMinusBottom, "minus", "−"], [Y.railPlusBottom, "plus", "+"],
  ]) {
    svg += `<line class="rail-line ${cls}" x1="18" y1="${y}" x2="${WIDTH - 12}" y2="${y}"/>`
      + `<text class="rail-label ${cls}" x="14" y="${y}">${label}</text>`;
  }

  // row letters and column numbers
  ROWS.forEach((row, i) => {
    svg += `<text class="mark" x="${LEFT - 16}" y="${Y.top[i]}">${row}</text>`;
    svg += `<text class="mark" x="${LEFT - 16}" y="${Y.bottom[i]}">${String.fromCharCode(70 + i)}</text>`;
  });
  for (let col = 1; col <= COLS; col += 5) {
    svg += `<text class="mark col" x="${holeX(col)}" y="${Y.top[0] - 14}">${col}</text>`;
    svg += `<text class="mark col" x="${holeX(col)}" y="${Y.bottom[ROWS.length - 1] + 16}">${col}</text>`;
  }

  // the holes themselves
  for (const hole of HOLES) {
    const { x, y } = point(hole);
    const group = state ? state.find(clipOf(hole)) : null;
    let live = "";
    if (state) {
      const level = state.levelOf(group);
      if (level === 1) live = " high";
      else if (level === 0) live = " low";
      else if (level === "short") live = " short";
    }
    const highlight = pending && state && state.find(clipOf(pending)) === group ? " same" : "";
    svg += `<rect class="hole${live}${highlight}" data-hole="${holeKey(hole)}" x="${x - 4}" y="${y - 4}" width="8" height="8" rx="1.5"/>`;
  }

  return svg;
}

function partSVG(part, state) {
  const chosen = selected === part.id ? " chosen" : "";

  if (part.type === "chip") {
    const spec = Chips.CHIPS[part.name];
    const wide = spec.pins / 2;
    const x = holeX(part.col) - 9;
    const y = Y.top[ROWS.length - 1] - 4;
    const w = (wide - 1) * PITCH + 18;
    const h = Y.bottom[0] - Y.top[ROWS.length - 1] + 8;
    let legs = "";
    const holes = chipHoles(part);
    for (const pin of Object.keys(holes)) {
      const p = point(holes[pin]);
      legs += `<rect class="leg" x="${p.x - 3}" y="${p.y - 5}" width="6" height="10" rx="1"/>`;
    }
    return `<g class="part chip${chosen}" data-part="${part.id}">${legs}
      <rect class="dip" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>
      <path class="notch" d="M${x} ${y + h / 2 - 7} a7 7 0 0 0 0 14"/>
      <text class="chip-name" x="${x + w / 2}" y="${y + h / 2}">${esc(spec.name)}</text></g>`;
  }

  const a = point(part.a);
  const b = point(part.b);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;

  if (part.type === "wire") {
    // a real jumper sags a little; a straight line looks like a schematic
    const sag = Math.min(24, Math.hypot(b.x - a.x, b.y - a.y) / 5);
    const colour = part.colour || WIRE_COLOURS[0];
    return `<g class="part wire${chosen}" data-part="${part.id}">
      <path class="jumper" d="M${a.x} ${a.y} Q ${mid.x} ${mid.y + sag} ${b.x} ${b.y}" stroke="${colour}"/>
      <circle class="end" cx="${a.x}" cy="${a.y}" r="3.5" fill="${colour}"/>
      <circle class="end" cx="${b.x}" cy="${b.y}" r="3.5" fill="${colour}"/></g>`;
  }

  if (part.type === "resistor") {
    const [b1, b2, b3] = bandsFor(part.value);
    return `<g class="part resistor${chosen}" data-part="${part.id}" transform="translate(${mid.x} ${mid.y}) rotate(${angle})">
      <line class="lead" x1="${-Math.hypot(b.x - a.x, b.y - a.y) / 2}" y1="0" x2="${Math.hypot(b.x - a.x, b.y - a.y) / 2}" y2="0"/>
      <rect class="package" x="-13" y="-6" width="26" height="12" rx="4"/>
      <rect x="-7" y="-6" width="3" height="12" fill="${b1}"/>
      <rect x="-2" y="-6" width="3" height="12" fill="${b2}"/>
      <rect x="3" y="-6" width="3" height="12" fill="${b3}"/>
      <text class="value" x="0" y="-11" transform="rotate(${-angle})">${ohms(part.value)}&#8486;</text></g>`;
  }

  if (part.type === "led") {
    const lit = state && state.lit.has(part.id) ? " lit" : "";
    const half = Math.hypot(b.x - a.x, b.y - a.y) / 2;
    const colour = part.colour || "#d94f4f";
    // Round, with one side flattened - and the flat side is the cathode, the
    // leg that goes towards ground, which is the b end here.
    return `<g class="part led${lit}${chosen}" data-part="${part.id}" transform="translate(${mid.x} ${mid.y}) rotate(${angle})">
      <line class="lead" x1="${-half}" y1="0" x2="${half}" y2="0"/>
      <circle class="halo" cx="0" cy="0" r="15" fill="${colour}"/>
      <path class="bulb" d="M6 -9 A9 9 0 1 0 6 9 Z" fill="${colour}"/></g>`;
  }

  if (part.type === "button") {
    return `<g class="part button${part.pressed ? " pressed" : ""}${chosen}" data-part="${part.id}">
      <line class="lead" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>
      <rect class="cap" x="${mid.x - 11}" y="${mid.y - 11}" width="22" height="22" rx="4"/>
      <circle class="top" cx="${mid.x}" cy="${mid.y}" r="6"/></g>`;
  }

  return "";
}

function render() {
  const state = Circuit.simulate(parts);
  board.setAttribute("viewBox", `0 0 ${WIDTH} ${Y.height}`);
  board.innerHTML = boardSVG(state)
    + parts.map((part) => partSVG(part, state)).join("")
    + (pending ? `<circle class="pending" cx="${point(pending).x}" cy="${point(pending).y}" r="7"/>` : "");

  renderInspector(state);
  renderChecks(state);
  renderPalette();
  save();
}

// ===========================================================================
// 4. The chip panel
// ===========================================================================

// A drawing of the chip on its own, with what each pin is called - and, once
// it's on the board, what each pin is actually doing.
function pinoutSVG(name, state, part) {
  const spec = Chips.CHIPS[name];
  const names = Chips.pinNames(spec);
  const kinds = Chips.pinKinds(spec);
  const wide = spec.pins / 2;
  const step = 30;
  const w = wide * step + 20;

  // Room for, top to bottom: pin name, pin number, the chip, then the same
  // again underneath.
  const topY = 42;
  const botY = 96;
  const h = 138;
  const holes = part ? chipHoles(part) : null;

  let svg = `<svg class="pinout" viewBox="0 0 ${w} ${h}">
    <rect class="dip" x="10" y="${topY}" width="${w - 20}" height="${botY - topY}" rx="4"/>
    <path class="notch" d="M10 ${(topY + botY) / 2 - 8} a8 8 0 0 0 0 16"/>
    <text class="chip-name" x="${w / 2}" y="${(topY + botY) / 2}">${esc(spec.name)}</text>`;

  for (let pin = 1; pin <= spec.pins; pin++) {
    const lower = pin <= wide;                 // pins count along the bottom first
    const i = lower ? pin - 1 : spec.pins - pin;
    const x = 25 + i * step;
    const edge = lower ? botY : topY;
    let live = "";
    if (state && holes) {
      const level = state.levelOf(state.find(clipOf(holes[pin])));
      live = level === 1 ? " high" : level === 0 ? " low" : level === "short" ? " short" : " floating";
    }
    svg += `<rect class="pin ${kinds[pin]}${live}" x="${x - 5}" y="${edge - 6}" width="10" height="12" rx="1.5"/>
      <text class="pin-num" x="${x}" y="${lower ? edge + 18 : edge - 18}">${pin}</text>
      <text class="pin-name ${kinds[pin]}" x="${x}" y="${lower ? edge + 32 : edge - 32}">${esc(names[pin])}</text>`;
  }
  return `${svg}</svg>`;
}

function renderInspector(state) {
  const part = parts.find((p) => p.id === selected);
  const name = part && part.type === "chip" ? part.name : (tool === "chip" ? chipToPlace : null);

  if (!name) {
    inspector.innerHTML = `<p class="hint">Pick a chip to see its pinout, or drop one on the board to watch its pins.</p>`;
    return;
  }

  const spec = Chips.CHIPS[name];
  inspector.innerHTML = `
    <h2>${esc(spec.name)} <span class="sub">${esc(spec.title)}</span></h2>
    ${pinoutSVG(name, state, part && part.type === "chip" ? part : null)}
    <p class="note">${esc(spec.note)}</p>
    <p class="legend"><span class="key out"></span> output <span class="key in"></span> input
      <span class="key power"></span> power</p>`;
}

function renderChecks(state) {
  const notes = Circuit.check(parts, state);
  const bad = notes.filter((n) => n.kind === "bad").length;
  const button = document.getElementById("check-btn");
  button.textContent = notes.length ? `${notes.length} thing${notes.length === 1 ? "" : "s"} to look at` : "wiring looks fine";
  button.classList.toggle("has-bad", bad > 0);
  button.classList.toggle("all-good", notes.length === 0);

  checksEl.hidden = !showChecks;
  if (!showChecks) return;
  checksEl.innerHTML = notes.length
    ? `<div class="checks-head"><strong>Checking your wiring</strong>
         <button class="close-btn" id="checks-close" aria-label="Close">&times;</button></div>`
      + notes.map((n) => `<p class="note ${n.kind}">${esc(n.text)}</p>`).join("")
    : `<div class="checks-head"><strong>Nothing to report</strong>
         <button class="close-btn" id="checks-close" aria-label="Close">&times;</button></div>
       <p class="note good">Every chip has power, every LED has a resistor, and nothing is fighting anything else.</p>`;
  document.getElementById("checks-close").addEventListener("click", () => { showChecks = false; render(); });
}

function renderPalette() {
  paletteEl.querySelectorAll("[data-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool
      && (button.dataset.chip ? button.dataset.chip === chipToPlace : true));
  });
  document.getElementById("wire-colour").style.background = WIRE_COLOURS[wireColour];
}

// ===========================================================================
// 5. Doing things
// ===========================================================================

const holeFromKey = (key) => HOLES.find((hole) => holeKey(hole) === key);

function placeChip(col) {
  const spec = Chips.CHIPS[chipToPlace];
  const wide = spec.pins / 2;
  const at = Math.max(1, Math.min(col, COLS - wide + 1));
  parts.push({ id: nextId++, type: "chip", name: chipToPlace, col: at });
  selected = nextId - 1;
}

function placeTwoLegged(hole) {
  if (!pending) { pending = hole; return; }
  if (clipOf(pending) === clipOf(hole) && pending.row === hole.row && pending.col === hole.col) { pending = null; return; }

  const part = { id: nextId++, type: tool, a: pending, b: hole };
  if (tool === "wire") part.colour = WIRE_COLOURS[wireColour];
  if (tool === "resistor") part.value = RESISTORS[1];
  if (tool === "led") part.colour = "#d94f4f";
  if (tool === "button") part.pressed = false;
  parts.push(part);
  pending = null;
  selected = part.id;
}

board.addEventListener("click", (e) => {
  const partEl = e.target.closest("[data-part]");
  const holeEl = e.target.closest("[data-hole]");

  // clicking a button presses it, wherever you are
  if (partEl) {
    const part = parts.find((p) => p.id === Number(partEl.dataset.part));
    if (part && part.type === "button") {
      part.pressed = !part.pressed;
      render();
      return;
    }
    if (tool === "pick") {
      selected = part ? part.id : null;
      render();
      return;
    }
  }

  if (!holeEl) return;
  const hole = holeFromKey(holeEl.dataset.hole);
  if (!hole) return;

  if (tool === "chip") {
    if (hole.kind === "rail") return;
    placeChip(hole.col);
  } else if (tool !== "pick") {
    placeTwoLegged(hole);
  }
  render();
});

board.addEventListener("contextmenu", (e) => {
  const partEl = e.target.closest("[data-part]");
  if (!partEl) return;
  e.preventDefault();
  parts = parts.filter((p) => p.id !== Number(partEl.dataset.part));
  selected = null;
  render();
});

paletteEl.addEventListener("click", (e) => {
  const button = e.target.closest("[data-tool]");
  if (!button) return;
  tool = button.dataset.tool;
  if (button.dataset.chip) chipToPlace = button.dataset.chip;
  pending = null;
  render();
});

document.getElementById("wire-colour").addEventListener("click", (e) => {
  e.stopPropagation();
  wireColour = (wireColour + 1) % WIRE_COLOURS.length;
  render();
});

document.getElementById("check-btn").addEventListener("click", () => { showChecks = !showChecks; render(); });

document.getElementById("clear-btn").addEventListener("click", () => {
  if (!parts.length || !confirm("Take everything off the board?")) return;
  parts = [];
  selected = null;
  pending = null;
  render();
});

window.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea")) return;
  if (e.key === "Escape") { pending = null; selected = null; render(); }
  if ((e.key === "Delete" || e.key === "Backspace") && selected) {
    e.preventDefault();
    parts = parts.filter((p) => p.id !== selected);
    selected = null;
    render();
  }
  // a selected resistor cycles through the usual values
  if (e.key === "r" && selected) {
    const part = parts.find((p) => p.id === selected);
    if (part && part.type === "resistor") {
      part.value = RESISTORS[(RESISTORS.indexOf(part.value) + 1) % RESISTORS.length];
      render();
    }
  }
});

// ===========================================================================
// 6. Keeping it
// ===========================================================================

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ parts, nextId }));
  } catch (e) {
    // saving can fail in private browsing - the board still works
  }
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (data && Array.isArray(data.parts)) {
      parts = data.parts;
      nextId = data.nextId || parts.length + 1;
    }
  } catch (e) {
    parts = [];
  }
}

// A picture of the board, for sticking in a lab report.
document.getElementById("image-btn").addEventListener("click", () => {
  const styles = [...document.styleSheets]
    .flatMap((sheet) => { try { return [...sheet.cssRules]; } catch (e) { return []; } })
    .map((rule) => rule.cssText).join("\n");
  const copy = board.cloneNode(true);
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", WIDTH * 2);
  copy.setAttribute("height", Y.height * 2);
  copy.insertAdjacentHTML("afterbegin", `<style>${styles}</style><rect width="100%" height="100%" fill="#16161a"/>`);

  const svg = new Blob([copy.outerHTML], { type: "image/svg+xml" });
  const url = URL.createObjectURL(svg);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH * 2;
    canvas.height = Y.height * 2;
    canvas.getContext("2d").drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    const link = document.createElement("a");
    link.download = "breadboard.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  image.onerror = () => URL.revokeObjectURL(url);
  image.src = url;
});

load();
render();
