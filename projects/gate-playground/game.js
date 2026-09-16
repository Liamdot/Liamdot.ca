// Gate Playground
// Drag logic gates onto the board, wire them together, and flip the switches
// to see what happens. Inspired by Turing Complete.
//
// This file is split into parts:
//   1. Settings    - the parts you can place, and how each one works
//   2. State       - everything on the board
//   3. Helpers     - grid snapping, pin positions, finding things
//   4. Simulation  - working out which parts are on
//   5. Drawing     - turning the board into SVG
//   6. Input       - dragging, wiring, flipping switches, deleting
//   7. Saving
//
// Ideas for what to add are at the bottom of the file.

// ===========================================================================
// 1. Settings
// ===========================================================================

// Where the board is saved.
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

// What's on the board the very first time you visit: two switches, an AND
// gate and a lamp. (The "clear" button empties it.)
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

// ===========================================================================
// 2. State
// ===========================================================================

let parts = [];     // every part on the board: { id, type, x, y, on, value }
let wires = [];     // every wire: { id, from: part id, to: part id, pin: which input pin }
let nextId = 1;     // the id the next new part or wire gets

let selected = null; // what's selected: { kind: "part" or "wire", id }, or null
let action = null;   // what the mouse is doing right now: dragging a part, or drawing a wire

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

// ===========================================================================
// 5. Drawing
// ===========================================================================

const board = document.getElementById("board");
const layer = document.getElementById("layer");
const paletteEl = document.getElementById("palette");
const deleteBtn = document.getElementById("delete-btn");

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

  let pins = "";
  for (let pin = 0; pin < type.inputs; pin++) {
    pins += `<circle class="pin" data-part="${part.id}" data-pin="in" data-index="${pin}" cx="0" cy="${GRID * (pin + 1)}" r="5"/>`;
  }
  if (type.output) {
    pins += `<circle class="pin" data-part="${part.id}" data-pin="out" cx="${w}" cy="${h / 2}" r="5"/>`;
  }

  return `<g class="${classes}" data-part="${part.id}" transform="translate(${part.x} ${part.y})">${shape}${pins}</g>`;
}

function render() {
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
  deleteBtn.disabled = selected === null;
}

// Simulate, redraw and save. Call this after anything changes the circuit.
function changed() {
  simulate();
  render();
  save();
}

// One toolbar button per part type.
for (const type in PARTS) {
  const button = document.createElement("button");
  button.className = "part-btn";
  button.textContent = PARTS[type].label;
  button.dataset.type = type;
  paletteEl.appendChild(button);
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
    render();
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
    render();
    return;
  }

  // A wire: select it.
  if (target.dataset.wire) {
    selected = { kind: "wire", id: Number(target.dataset.wire) };
    render();
    return;
  }

  // Empty space.
  selected = null;
  render();
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
    render();
  }

  if (action.kind === "wire") {
    action.pointer = boardPoint(e);
    render();
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
  parts = parts.filter((part) => part.id !== id);
  wires = wires.filter((wire) => wire.from !== id && wire.to !== id);
  if (selected && selected.kind === "part" && selected.id === id) selected = null;
}

function deleteSelected() {
  if (!selected) return;
  if (selected.kind === "part") {
    deletePart(selected.id);
  } else {
    wires = wires.filter((wire) => wire.id !== selected.id);
  }
  selected = null;
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
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault(); // some browsers go "back" a page on Backspace
    deleteSelected();
  }
  if (e.key === "Escape") {
    selected = null;
    render();
  }
});

deleteBtn.addEventListener("click", deleteSelected);

document.getElementById("clear-btn").addEventListener("click", () => {
  if (!confirm("Remove everything from the board?")) return;
  parts = [];
  wires = [];
  selected = null;
  changed();
});

// ===========================================================================
// 7. Saving
// ===========================================================================

function save() {
  try {
    const data = {
      parts: parts.map(({ id, type, x, y, on }) => ({ id, type, x, y, on })),
      wires,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    // saving can fail (e.g. private browsing) - the playground still works
  }
}

// Loads a board, skipping anything that doesn't make sense any more (like a
// part type you've removed from PARTS, or a wire to a part that's gone).
function loadBoard(data) {
  parts = (data.parts || [])
    .filter((part) => PARTS[part.type])
    .map((part) => ({ id: part.id, type: part.type, x: part.x, y: part.y, on: Boolean(part.on), value: false }));

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
    loadBoard(data || STARTER);
  } catch (e) {
    loadBoard(STARTER);
  }
}

load();
simulate();
render();

// ===========================================================================
// Ideas to try
// ===========================================================================
//
// - A CLOCK part that turns itself on and off every second
// - Labels you can type on switches and lamps (A, B, SUM, CARRY...)
// - Parts with more than one output, like a half adder
// - Levels: "build XOR using only NAND gates", checked with a truth table
// - Zooming and scrolling around a bigger board
