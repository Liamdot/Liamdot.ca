// Gate Playground
// Drag logic gates onto the board, wire them together, and flip the switches
// to see what happens. Inspired by Turing Complete.
//
// There are two modes:
//   Sandbox - build anything you like with every part
//   Puzzles - levels with a goal, only certain gates allowed, and a Test
//             button that checks every combination of inputs
//
// This file is split into parts:
//   1. Settings    - the parts you can place, the sandbox starter, the levels
//   2. State       - everything on the board, and your puzzle progress
//   3. Helpers     - grid snapping, pin positions, finding things
//   4. Simulation  - working out which parts are on, and testing levels
//   5. Drawing     - turning the board into SVG, plus the puzzle panels
//   6. Input       - dragging, wiring, flipping switches, deleting, modes
//   7. Saving
//
// Ideas for what to add are at the bottom of the file.

// ===========================================================================
// 1. Settings
// ===========================================================================

// Where the board and puzzle progress are saved.
const SAVE_KEY = "gate-playground-save";

// Parts snap to a grid this many pixels apart.
const GRID = 20;

// Every kind of part you can place. Each one gets a button in the toolbar.
//
//   label  - text shown on the part and its button
//   inputs - how many input pins it has (on the left)
//   output - true if it has an output pin (on the right)
//   logic  - works out whether the output is on. "ins" is a list with one
//            true/false for each input pin, like [true, false].
//
// Want a 3-input AND? Add:
//   AND3: { label: "AND3", inputs: 3, output: true, logic: (ins) => ins[0] && ins[1] && ins[2] },
const PARTS = {
  INPUT:  { label: "IN",   inputs: 0, output: true,  logic: (ins, part) => part.on },
  OUTPUT: { label: "OUT",  inputs: 1, output: false, logic: (ins) => ins[0] },
  NOT:    { label: "NOT",  inputs: 1, output: true,  logic: (ins) => !ins[0] },
  AND:    { label: "AND",  inputs: 2, output: true,  logic: (ins) => ins[0] && ins[1] },
  OR:     { label: "OR",   inputs: 2, output: true,  logic: (ins) => ins[0] || ins[1] },
  NAND:   { label: "NAND", inputs: 2, output: true,  logic: (ins) => !(ins[0] && ins[1]) },
  NOR:    { label: "NOR",  inputs: 2, output: true,  logic: (ins) => !(ins[0] || ins[1]) },
  XOR:    { label: "XOR",  inputs: 2, output: true,  logic: (ins) => ins[0] !== ins[1] },
  XNOR:   { label: "XNOR", inputs: 2, output: true,  logic: (ins) => ins[0] === ins[1] },
};

// What's on the sandbox board the very first time you visit.
const STARTER = {
  parts: [
    { id: 1, type: "INPUT",  x: 100, y: 100, on: true },
    { id: 2, type: "INPUT",  x: 100, y: 180, on: false },
    { id: 3, type: "AND",    x: 240, y: 120 },
    { id: 4, type: "OUTPUT", x: 400, y: 140 },
  ],
  wires: [
    { from: 1, to: 3, pin: 0 },
    { from: 2, to: 3, pin: 1 },
    { from: 3, to: 4, pin: 0 },
  ],
};

// The puzzles, in order. Each one unlocks when you solve the one before it.
//
//   name    - must be different for every level (saves use it)
//   goal    - what to build
//   inputs  - labels for the switches you're given, like ["A", "B"]
//   outputs - labels for the lamps you have to light, like ["Q"]
//   parts   - which gates you're allowed to place
//   solve   - the right answer. It gets the switches, like { A: true, B: false },
//             and returns what each lamp should be, like { Q: true }.
const LEVELS = [
  {
    name: "Wire It Up",
    goal: "Drag a wire from A's pin to Q's pin, so the lamp copies the switch.",
    inputs: ["A"], outputs: ["Q"], parts: [],
    solve: ({ A }) => ({ Q: A }),
  },
  {
    name: "Opposite Day",
    goal: "Q should be on when A is off, and off when A is on.",
    inputs: ["A"], outputs: ["Q"], parts: ["NOT"],
    solve: ({ A }) => ({ Q: !A }),
  },
  {
    name: "Both At Once",
    goal: "Q turns on only when A and B are both on.",
    inputs: ["A", "B"], outputs: ["Q"], parts: ["AND"],
    solve: ({ A, B }) => ({ Q: A && B }),
  },
  {
    name: "Either Will Do",
    goal: "Q turns on when A or B (or both) are on.",
    inputs: ["A", "B"], outputs: ["Q"], parts: ["OR"],
    solve: ({ A, B }) => ({ Q: A || B }),
  },
  {
    name: "NAND Not",
    goal: "Build a NOT gate using only NAND gates.",
    inputs: ["A"], outputs: ["Q"], parts: ["NAND"],
    solve: ({ A }) => ({ Q: !A }),
  },
  {
    name: "NAND And",
    goal: "Build an AND gate using only NAND gates.",
    inputs: ["A", "B"], outputs: ["Q"], parts: ["NAND"],
    solve: ({ A, B }) => ({ Q: A && B }),
  },
  {
    name: "NAND Or",
    goal: "Build an OR gate using only NAND gates.",
    inputs: ["A", "B"], outputs: ["Q"], parts: ["NAND"],
    solve: ({ A, B }) => ({ Q: A || B }),
  },
  {
    name: "One Or The Other",
    goal: "Build XOR: Q is on when exactly one of A and B is on.",
    inputs: ["A", "B"], outputs: ["Q"], parts: ["AND", "OR", "NOT"],
    solve: ({ A, B }) => ({ Q: A !== B }),
  },
  {
    name: "XOR From NAND",
    goal: "Build XOR again, using only NAND gates. It can be done with 4.",
    inputs: ["A", "B"], outputs: ["Q"], parts: ["NAND"],
    solve: ({ A, B }) => ({ Q: A !== B }),
  },
  {
    name: "Majority Vote",
    goal: "Q is on when at least two of A, B and C are on.",
    inputs: ["A", "B", "C"], outputs: ["Q"], parts: ["AND", "OR"],
    solve: ({ A, B, C }) => ({ Q: (A && B) || (A && C) || (B && C) }),
  },
  {
    name: "Half Adder",
    goal: "Add two bits. SUM is on when exactly one is on. CARRY is on when both are.",
    inputs: ["A", "B"], outputs: ["SUM", "CARRY"], parts: ["XOR", "AND"],
    solve: ({ A, B }) => ({ SUM: A !== B, CARRY: A && B }),
  },
  {
    name: "Full Adder",
    goal: "Add three bits: A, B and a carry-in C. CARRY and SUM together make the total in binary.",
    inputs: ["A", "B", "C"], outputs: ["SUM", "CARRY"], parts: ["XOR", "AND", "OR"],
    solve: ({ A, B, C }) => {
      const total = A + B + C;
      return { SUM: total % 2 === 1, CARRY: total >= 2 };
    },
  },
  {
    name: "Multiplexer",
    goal: "Choose an input: Q copies A when S is off, and copies B when S is on.",
    inputs: ["A", "B", "S"], outputs: ["Q"], parts: ["AND", "OR", "NOT"],
    solve: ({ A, B, S }) => ({ Q: S ? B : A }),
  },
  {
    name: "Equal?",
    goal: "A1 A0 and B1 B0 are two 2-bit numbers. EQ is on when they're the same number.",
    inputs: ["A1", "A0", "B1", "B0"], outputs: ["EQ"], parts: ["XNOR", "AND"],
    solve: ({ A1, A0, B1, B0 }) => ({ EQ: A1 === B1 && A0 === B0 }),
  },
];

// ===========================================================================
// 2. State
// ===========================================================================

let parts = [];     // every part on the board: { id, type, x, y, on, value, label, locked }
let wires = [];     // every wire: { id, from: part id, to: part id, pin: which input pin }
let nextId = 1;     // the id the next new part or wire gets

let selected = null; // what's selected: { kind: "part" or "wire", id }, or null
let action = null;   // what the mouse is doing right now: dragging a part, or drawing a wire

let mode = "sandbox";       // "sandbox", or the number of the level you're on (0 = first level)
let levelSelectOpen = false; // is the list of levels showing?
let lastTest = null;        // the result of pressing Test, shown in a panel

// Everything that gets saved: the sandbox board, a board for every level
// you've started, the fewest gates you've solved each level with, and
// whether you've seen the welcome message.
let progress = { sandbox: null, levels: {}, solved: {}, seenIntro: false };

// ===========================================================================
// 3. Helpers
// ===========================================================================

function partById(id) {
  return parts.find((part) => part.id === id);
}

// The wire plugged into a part's input pin, if there is one.
function wireInto(partId, pin) {
  return wires.find((wire) => wire.to === partId && wire.pin === pin);
}

// Rounds a position to the nearest grid line.
function snap(n) {
  return Math.round(n / GRID) * GRID;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// How big a part is. Switches and lamps are small squares; gates get taller
// the more inputs they have.
function partSize(type) {
  if (type === "INPUT" || type === "OUTPUT") return { w: 40, h: 40 };
  return { w: 80, h: Math.max(2, PARTS[type].inputs + 1) * GRID };
}

// Where a part's pins are on the board.
function inputPinPos(part, pin) {
  return { x: part.x, y: part.y + GRID * (pin + 1) };
}

function outputPinPos(part) {
  const size = partSize(part.type);
  return { x: part.x + size.w, y: part.y + size.h / 2 };
}

// Mouse position in board coordinates (0,0 is the top left of the board).
function boardPoint(e) {
  const rect = board.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function isOverBoard(e) {
  const rect = board.getBoundingClientRect();
  return e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
}

// ---- Puzzles ----

function currentLevel() {
  return mode === "sandbox" ? null : LEVELS[mode];
}

// How many gates are on the board (switches and lamps don't count).
function gateCount() {
  return parts.filter((part) => part.type !== "INPUT" && part.type !== "OUTPUT").length;
}

// You can play a level once you've solved the one before it.
function isUnlocked(index) {
  return index === 0 || progress.solved[LEVELS[index - 1].name] !== undefined;
}

// The board a level starts with: its switches down the left, its lamps on the right.
function levelStartBoard(level) {
  const width = board.getBoundingClientRect().width || 700;
  const lampX = Math.max(360, Math.floor((width - 140) / GRID) * GRID);
  let id = 1;
  return {
    parts: [
      ...level.inputs.map((label, i) => ({ id: id++, type: "INPUT", x: 60, y: 60 + i * 80, label, locked: true })),
      ...level.outputs.map((label, i) => ({ id: id++, type: "OUTPUT", x: lampX, y: 60 + i * 80, label, locked: true })),
    ],
    wires: [],
  };
}

// ===========================================================================
// 4. Simulation
// ===========================================================================

// Works out every part's output. Parts are updated one at a time, over and
// over, until nothing changes. That way signals travel through long chains of
// gates, and loops (like a NOR latch that remembers a bit) settle down.
// If a circuit never settles (like a NOT wired into itself), it gives up
// after 50 rounds.
function simulate() {
  for (let round = 0; round < 50; round++) {
    let changed = false;

    for (const part of parts) {
      const type = PARTS[part.type];

      // Read each input pin: on if its wire comes from a part that's on.
      const ins = [];
      for (let pin = 0; pin < type.inputs; pin++) {
        const wire = wireInto(part.id, pin);
        const source = wire && partById(wire.from);
        ins.push(source ? source.value : false);
      }

      const value = Boolean(type.logic(ins, part));
      if (value !== part.value) {
        part.value = value;
        changed = true;
      }
    }

    if (!changed) break;
  }
}

// Tries every combination of the level's switches and compares the lamps to
// the right answer. With 2 switches that's 4 rows: 00, 01, 10, 11.
function testLevel() {
  const level = currentLevel();
  const switches = level.inputs.map((label) => parts.find((part) => part.type === "INPUT" && part.label === label));
  const lamps = level.outputs.map((label) => parts.find((part) => part.type === "OUTPUT" && part.label === label));
  const before = switches.map((part) => part.on);

  const rows = [];
  const combinations = 2 ** switches.length;
  for (let combo = 0; combo < combinations; combo++) {
    // Set each switch from the bits of the combination number.
    const ins = {};
    switches.forEach((part, i) => {
      part.on = Boolean((combo >> (switches.length - 1 - i)) & 1);
      ins[level.inputs[i]] = part.on;
    });

    // Start every part from "off", so leftover values can't help.
    for (const part of parts) part.value = false;
    simulate();

    const want = level.solve(ins);
    const got = {};
    level.outputs.forEach((label, i) => { got[label] = lamps[i].value; });
    const pass = level.outputs.every((label) => Boolean(want[label]) === got[label]);
    rows.push({ ins, want, got, pass });
  }

  // Put the switches back how you had them.
  switches.forEach((part, i) => { part.on = before[i]; });
  for (const part of parts) part.value = false;
  simulate();

  const solved = rows.every((row) => row.pass);
  const gates = gateCount();
  if (solved) {
    const best = progress.solved[level.name];
    progress.solved[level.name] = best === undefined ? gates : Math.min(best, gates);
  }

  lastTest = { rows, solved, gates, wrong: rows.filter((row) => !row.pass).length };
  render();
  save();
}

// ===========================================================================
// 5. Drawing
// ===========================================================================

const board = document.getElementById("board");
const layer = document.getElementById("layer");
const paletteEl = document.getElementById("palette");
const hintEl = document.getElementById("hint");
const deleteBtn = document.getElementById("delete-btn");
const clearBtn = document.getElementById("clear-btn");
const levelBar = document.getElementById("level-bar");
const resultsEl = document.getElementById("results");
const levelSelectEl = document.getElementById("level-select");
const introEl = document.getElementById("intro");

// A smooth S-shaped wire from point a (an output) to point b (an input).
function curve(a, b) {
  const bend = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + bend} ${a.y}, ${b.x - bend} ${b.y}, ${b.x} ${b.y}`;
}

// The SVG for one part. The data-* attributes are how the mouse code knows
// what you clicked on.
function partSVG(part) {
  const type = PARTS[part.type];
  const { w, h } = partSize(part.type);
  const isSelected = selected && selected.kind === "part" && selected.id === part.id;

  let classes = `part ${part.type}`;
  if (part.value) classes += " on";
  if (isSelected) classes += " selected";

  let shape;
  if (part.type === "INPUT") {
    shape = `
      <rect class="body" width="${w}" height="${h}" rx="8"/>
      <circle class="light" cx="${w / 2}" cy="${h / 2}" r="12"/>
      <text x="${w / 2}" y="${h / 2}">${part.on ? 1 : 0}</text>`;
  } else if (part.type === "OUTPUT") {
    shape = `
      <circle class="body" cx="${w / 2}" cy="${h / 2}" r="${w / 2 - 1}"/>
      <text x="${w / 2}" y="${h / 2}">${part.value ? 1 : 0}</text>`;
  } else {
    shape = `
      <rect class="body" width="${w}" height="${h}" rx="6"/>
      <text x="${w / 2}" y="${h / 2}">${type.label}</text>`;
  }

  // Puzzle switches and lamps have a name beside them.
  if (part.label) {
    shape += part.type === "INPUT"
      ? `<text class="part-label left" x="-10" y="${h / 2}">${part.label}</text>`
      : `<text class="part-label right" x="${w + 10}" y="${h / 2}">${part.label}</text>`;
  }

  let pins = "";
  for (let pin = 0; pin < type.inputs; pin++) {
    pins += `<circle class="pin" data-part="${part.id}" data-pin="in" data-index="${pin}" cx="0" cy="${GRID * (pin + 1)}" r="5"/>`;
  }
  if (type.output) {
    pins += `<circle class="pin" data-part="${part.id}" data-pin="out" cx="${w}" cy="${h / 2}" r="5"/>`;
  }

  return `<g class="${classes}" data-part="${part.id}" transform="translate(${part.x} ${part.y})">${shape}${pins}</g>`;
}

function renderBoard() {
  let svg = "";

  // Wires first, so parts are drawn on top of them.
  for (const wire of wires) {
    const from = partById(wire.from);
    const to = partById(wire.to);
    const path = curve(outputPinPos(from), inputPinPos(to, wire.pin));
    const isSelected = selected && selected.kind === "wire" && selected.id === wire.id;

    let classes = "wire";
    if (from.value) classes += " on";
    if (isSelected) classes += " selected";

    svg += `<path class="${classes}" d="${path}"/>`;
    svg += `<path class="wire-hit" data-wire="${wire.id}" d="${path}"/>`;
  }

  for (const part of parts) {
    svg += partSVG(part);
  }

  // The dashed wire you're currently dragging out of a pin.
  if (action && action.kind === "wire") {
    const part = partById(action.part);
    const path = action.pin === "out"
      ? curve(outputPinPos(part), action.pointer)
      : curve(action.pointer, inputPinPos(part, action.index));
    svg += `<path class="wire preview" d="${path}"/>`;
  }

  layer.innerHTML = svg;

  // You can't delete a puzzle's switches and lamps.
  const selectedPart = selected && selected.kind === "part" && partById(selected.id);
  deleteBtn.disabled = selected === null || Boolean(selectedPart && selectedPart.locked);
}

// The toolbar buttons: every part in the sandbox, only the allowed gates in a level.
function renderPalette() {
  const level = currentLevel();
  const types = level ? level.parts : Object.keys(PARTS);

  paletteEl.replaceChildren(...types.map((type) => {
    const button = document.createElement("button");
    button.className = "part-btn";
    button.textContent = PARTS[type].label;
    button.dataset.type = type;
    return button;
  }));

  if (level && types.length === 0) {
    paletteEl.innerHTML = `<span class="no-parts">no gates needed for this one</span>`;
  }

  hintEl.textContent = level ? "only these gates are allowed" : "drag parts onto the board";
  clearBtn.textContent = level ? "reset" : "clear";

  for (const button of document.querySelectorAll(".mode-btn")) {
    button.classList.toggle("active", (button.dataset.mode === "sandbox") === (mode === "sandbox" && !levelSelectOpen));
  }
}

// The strip under the toolbar with the level's name, goal and Test button.
function renderLevelBar() {
  const level = currentLevel();
  levelBar.hidden = !level || levelSelectOpen;
  if (!level) return;

  const best = progress.solved[level.name];
  document.getElementById("level-name").textContent = `${mode + 1}. ${level.name}`;
  document.getElementById("level-goal").textContent = level.goal;
  document.getElementById("level-best").textContent = best === undefined ? "" : `✓ solved · best: ${best} ${best === 1 ? "gate" : "gates"}`;
}

// The truth table from the last Test.
function renderResults() {
  const level = currentLevel();
  resultsEl.hidden = !level || !lastTest || levelSelectOpen;
  if (resultsEl.hidden) return;

  const { rows, solved, gates, wrong } = lastTest;
  const bit = (value) => (value ? 1 : 0);
  const nextExists = mode + 1 < LEVELS.length;

  const heading = solved
    ? `<span class="solved-msg">✓ Solved with ${gates} ${gates === 1 ? "gate" : "gates"}!</span>`
    : `<span class="wrong-msg">✗ ${wrong} of ${rows.length} rows are wrong</span>`;

  const header1 = `<tr>
    <th colspan="${level.inputs.length}">switches</th>
    <th class="sep" colspan="${level.outputs.length}">should be</th>
    <th class="sep" colspan="${level.outputs.length}">you got</th>
  </tr>`;
  const labels = (list, first) => list.map((label, i) => `<th class="${i === 0 && first ? "sep" : ""}">${label}</th>`).join("");
  const header2 = `<tr>${labels(level.inputs, false)}${labels(level.outputs, true)}${labels(level.outputs, true)}</tr>`;

  const body = rows.map((row) => {
    const cells = (values, extra) => level.outputs.map((label, i) =>
      `<td class="${i === 0 ? "sep" : ""} ${extra && Boolean(row.want[label]) !== row.got[label] ? "got-wrong" : ""}">${bit(values[label])}</td>`).join("");
    return `<tr class="${row.pass ? "" : "bad"}">
      ${level.inputs.map((label) => `<td>${bit(row.ins[label])}</td>`).join("")}
      ${cells(row.want, false)}
      ${cells(row.got, true)}
    </tr>`;
  }).join("");

  resultsEl.innerHTML = `
    <div class="results-head">
      ${heading}
      <button class="close-btn" id="results-close" aria-label="Close">×</button>
    </div>
    <table><thead>${header1}${header2}</thead><tbody>${body}</tbody></table>
    ${solved && nextExists ? `<button class="test-btn next-btn" id="next-level">next level &rarr;</button>` : ""}
    ${solved && !nextExists ? `<p class="all-done">That was the last level. Nice work!</p>` : ""}`;
}

// The list of levels.
function renderLevelSelect() {
  levelSelectEl.hidden = !levelSelectOpen;
  if (!levelSelectOpen) return;

  const solvedCount = LEVELS.filter((level) => progress.solved[level.name] !== undefined).length;
  const cards = LEVELS.map((level, i) => {
    const best = progress.solved[level.name];
    const unlocked = isUnlocked(i);
    const status = best !== undefined ? `✓ best: ${best} ${best === 1 ? "gate" : "gates"}` : unlocked ? "not solved yet" : "locked";
    const classes = ["level-card", best !== undefined ? "solved" : "", i === mode ? "current" : ""].join(" ");
    return `<button class="${classes}" data-level="${i}" ${unlocked ? "" : "disabled"}>
      <span class="lc-num">Level ${i + 1}</span>
      <span class="lc-name">${level.name}</span>
      <span class="lc-status">${status}</span>
    </button>`;
  }).join("");

  levelSelectEl.innerHTML = `
    <div class="ls-inner">
      <div class="ls-head">
        <h2>Puzzles</h2>
        <span class="ls-count">${solvedCount} / ${LEVELS.length} solved</span>
      </div>
      <p class="ls-intro">Build each circuit, then press <strong>test</strong> to check it against every combination of switches.</p>
      <div class="level-grid">${cards}</div>
    </div>`;
}

function render() {
  renderBoard();
  renderPalette();
  renderLevelBar();
  renderResults();
  renderLevelSelect();
  introEl.hidden = Boolean(progress.seenIntro);
}

// Simulate, redraw and save. Call this after anything changes the circuit.
function changed() {
  simulate();
  render();
  save();
}

// ===========================================================================
// 6. Input
// ===========================================================================

// Pressing on the board: a pin starts a wire, a part starts dragging,
// a wire gets selected, and empty space clears the selection.
board.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return; // right-click is handled below
  const point = boardPoint(e);
  const target = e.target;

  // A pin: start drawing a wire.
  if (target.dataset.pin) {
    const partId = Number(target.dataset.part);
    const index = Number(target.dataset.index || 0);

    // Grabbing an input pin that already has a wire picks that wire up,
    // so you can move it somewhere else or drop it to disconnect it.
    const existing = target.dataset.pin === "in" && wireInto(partId, index);
    if (existing) {
      wires = wires.filter((wire) => wire !== existing);
      action = { kind: "wire", part: existing.from, pin: "out", index: 0, pointer: point };
      simulate();
    } else {
      action = { kind: "wire", part: partId, pin: target.dataset.pin, index, pointer: point };
    }

    board.classList.add("wiring");
    renderBoard();
    return;
  }

  // A part: select it and start dragging.
  const partEl = target.closest("[data-part]");
  if (partEl) {
    const part = partById(Number(partEl.dataset.part));
    selected = { kind: "part", id: part.id };
    action = {
      kind: "drag",
      id: part.id,
      offsetX: point.x - part.x,
      offsetY: point.y - part.y,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    renderBoard();
    return;
  }

  // A wire: select it.
  if (target.dataset.wire) {
    selected = { kind: "wire", id: Number(target.dataset.wire) };
    renderBoard();
    return;
  }

  // Empty space.
  selected = null;
  renderBoard();
});

// Pressing a toolbar button makes a new part and starts dragging it.
paletteEl.addEventListener("pointerdown", (e) => {
  const button = e.target.closest("[data-type]");
  if (!button || e.button !== 0) return;
  e.preventDefault();

  const type = button.dataset.type;
  const { w, h } = partSize(type);
  const point = boardPoint(e);
  const part = { id: nextId++, type, x: snap(point.x - w / 2), y: snap(point.y - h / 2), on: false, value: false };
  parts.push(part);
  selected = { kind: "part", id: part.id };

  action = {
    kind: "drag",
    id: part.id,
    offsetX: w / 2,
    offsetY: h / 2,
    moved: true,
    fromToolbar: true,
    reachedBoard: false,
  };
  moveDraggedPart(e);
  changed();
});

function moveDraggedPart(e) {
  const part = partById(action.id);
  const { w, h } = partSize(part.type);
  const point = boardPoint(e);
  const rect = board.getBoundingClientRect();

  // Snap to the grid, and keep the part inside the board.
  part.x = clamp(snap(point.x - action.offsetX), 0, Math.floor((rect.width - w) / GRID) * GRID);
  part.y = clamp(snap(point.y - action.offsetY), 0, Math.floor((rect.height - h) / GRID) * GRID);

  if (isOverBoard(e)) action.reachedBoard = true;
}

window.addEventListener("pointermove", (e) => {
  if (!action) return;

  if (action.kind === "drag") {
    // Only count it as a drag once the mouse has moved a few pixels, so a
    // simple click on a switch flips it instead of nudging it.
    if (!action.moved && Math.hypot(e.clientX - action.startX, e.clientY - action.startY) > 4) {
      action.moved = true;
    }
    if (action.moved) moveDraggedPart(e);
    renderBoard();
  }

  if (action.kind === "wire") {
    action.pointer = boardPoint(e);
    renderBoard();
  }
});

window.addEventListener("pointerup", (e) => {
  if (!action) return;

  if (action.kind === "drag") {
    const part = partById(action.id);

    // Clicked a switch without dragging it: flip it.
    if (!action.moved && part.type === "INPUT") {
      part.on = !part.on;
    }

    // Dropped a new part back on the toolbar.
    if (action.fromToolbar && !isOverBoard(e)) {
      if (action.reachedBoard) {
        // dragged onto the board and back off again: cancel it
        deletePart(part.id);
      } else {
        // just clicked the button: put it in the middle of the board
        const rect = board.getBoundingClientRect();
        const { w, h } = partSize(part.type);
        part.x = snap(rect.width / 2 - w / 2);
        part.y = snap(rect.height / 2 - h / 2);
      }
    }
  }

  if (action.kind === "wire") {
    // Did you let go on a pin? Then connect the two pins.
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target && target.dataset && target.dataset.pin) {
      connect(action, {
        part: Number(target.dataset.part),
        pin: target.dataset.pin,
        index: Number(target.dataset.index || 0),
      });
    }
    board.classList.remove("wiring");
  }

  action = null;
  changed();
});

// Connects two pins with a wire. One has to be an output and the other an
// input - it doesn't matter which one you started dragging from.
function connect(a, b) {
  let output;
  let input;
  if (a.pin === "out" && b.pin === "in") {
    output = a;
    input = b;
  } else if (a.pin === "in" && b.pin === "out") {
    output = b;
    input = a;
  } else {
    return; // two inputs or two outputs can't be connected
  }

  // An input pin can only have one wire, so replace any wire already there.
  wires = wires.filter((wire) => !(wire.to === input.part && wire.pin === input.index));
  wires.push({ id: nextId++, from: output.part, to: input.part, pin: input.index });
}

function deletePart(id) {
  const part = partById(id);
  if (!part || part.locked) return; // puzzle switches and lamps stay put
  parts = parts.filter((p) => p.id !== id);
  wires = wires.filter((wire) => wire.from !== id && wire.to !== id);
  if (selected && selected.kind === "part" && selected.id === id) selected = null;
}

function deleteSelected() {
  if (!selected) return;
  if (selected.kind === "part") {
    deletePart(selected.id);
  } else {
    wires = wires.filter((wire) => wire.id !== selected.id);
    selected = null;
  }
  changed();
}

// Right-click deletes whatever's under the mouse.
board.addEventListener("contextmenu", (e) => {
  const partEl = e.target.closest("[data-part]");
  if (partEl) {
    e.preventDefault();
    deletePart(Number(partEl.dataset.part));
    changed();
  } else if (e.target.dataset.wire) {
    e.preventDefault();
    wires = wires.filter((wire) => wire.id !== Number(e.target.dataset.wire));
    changed();
  }
});

window.addEventListener("keydown", (e) => {
  if (levelSelectOpen || !progress.seenIntro) return;
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault(); // some browsers go "back" a page on Backspace
    deleteSelected();
  }
  if (e.key === "Escape") {
    selected = null;
    renderBoard();
  }
});

deleteBtn.addEventListener("click", deleteSelected);

// "clear" in the sandbox, "reset" in a level.
clearBtn.addEventListener("click", () => {
  const level = currentLevel();
  if (!confirm(level ? "Start this level over?" : "Remove everything from the board?")) return;
  loadBoard(level ? levelStartBoard(level) : { parts: [], wires: [] });
  selected = null;
  lastTest = null;
  changed();
});

// ---- Modes and levels ----

// Switches to the sandbox or a level, keeping each one's board separate.
function switchMode(newMode) {
  storeBoard();
  mode = newMode;
  selected = null;
  action = null;
  lastTest = null;
  levelSelectOpen = false;
  openBoard();
  changed();
}

for (const button of document.querySelectorAll(".mode-btn")) {
  button.addEventListener("click", () => {
    if (button.dataset.mode === "sandbox") {
      levelSelectOpen = false;
      if (mode !== "sandbox") switchMode("sandbox");
      else render();
    } else {
      levelSelectOpen = true;
      render();
    }
  });
}

document.getElementById("levels-btn").addEventListener("click", () => {
  levelSelectOpen = true;
  render();
});

document.getElementById("test-btn").addEventListener("click", testLevel);

levelSelectEl.addEventListener("click", (e) => {
  const card = e.target.closest("[data-level]");
  if (card && !card.disabled) switchMode(Number(card.dataset.level));
});

// The welcome message: pick Sandbox or Puzzles.
introEl.addEventListener("click", (e) => {
  const choice = e.target.closest("[data-start]");
  if (!choice) return;
  progress.seenIntro = true;
  if (choice.dataset.start === "puzzles") levelSelectOpen = true;
  render();
  save();
});

resultsEl.addEventListener("click", (e) => {
  if (e.target.id === "results-close") {
    lastTest = null;
    render();
  }
  if (e.target.id === "next-level") {
    switchMode(mode + 1);
  }
});

// ===========================================================================
// 7. Saving
// ===========================================================================

// Copies the board into progress, under the sandbox or the current level.
function storeBoard() {
  const data = {
    parts: parts.map(({ id, type, x, y, on, label, locked }) => ({ id, type, x, y, on, label, locked })),
    wires,
  };
  if (mode === "sandbox") progress.sandbox = data;
  else progress.levels[LEVELS[mode].name] = data;
}

// Loads the board for the current mode (or a fresh one if there isn't one).
function openBoard() {
  const level = currentLevel();
  if (!level) {
    loadBoard(progress.sandbox || STARTER);
    return;
  }

  const saved = progress.levels[level.name];
  loadBoard(saved || levelStartBoard(level));

  // If the level's switches or lamps have changed since it was saved, start it fresh.
  const hasAll = [...level.inputs.map((label) => ["INPUT", label]), ...level.outputs.map((label) => ["OUTPUT", label])]
    .every(([type, label]) => parts.some((part) => part.type === type && part.label === label));
  if (!hasAll) loadBoard(levelStartBoard(level));
}

function save() {
  storeBoard();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ mode, ...progress }));
  } catch (e) {
    // saving can fail (e.g. private browsing) - the playground still works
  }
}

// Loads a board, skipping anything that doesn't make sense any more (like a
// part type you've removed from PARTS, or a wire to a part that's gone).
function loadBoard(data) {
  parts = (data.parts || [])
    .filter((part) => PARTS[part.type])
    .map((part) => ({
      id: part.id, type: part.type, x: part.x, y: part.y, on: Boolean(part.on), value: false,
      label: part.label, locked: Boolean(part.locked),
    }));

  let highestId = Math.max(0, ...parts.map((part) => part.id), ...(data.wires || []).map((wire) => wire.id || 0));

  wires = (data.wires || [])
    .filter((wire) => {
      const from = partById(wire.from);
      const to = partById(wire.to);
      return from && to && PARTS[from.type].output && wire.pin < PARTS[to.type].inputs;
    })
    .map((wire) => ({ id: wire.id || ++highestId, from: wire.from, to: wire.to, pin: wire.pin }));

  nextId = highestId + 1;
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (data && data.parts) {
      // saves from before puzzles existed were just the sandbox board
      progress.sandbox = data;
    } else if (data) {
      progress = {
        sandbox: data.sandbox || null,
        levels: data.levels || {},
        solved: data.solved || {},
        seenIntro: Boolean(data.seenIntro),
      };
      const level = Number.isInteger(data.mode) && LEVELS[data.mode] && isUnlocked(data.mode);
      mode = level ? data.mode : "sandbox";
    }
  } catch (e) {
    // broken save - start fresh
  }
  openBoard();
}

load();
simulate();
render();

// ===========================================================================
// Ideas to try
// ===========================================================================
//
// - More levels: a 2-bit adder, a decoder, "only NOR gates"
// - A CLOCK part, and levels that need memory (a latch, a counter)
// - Labels you can type on sandbox switches and lamps
// - A star rating for solving a level in the fewest possible gates
// - Zooming and scrolling around a bigger board
