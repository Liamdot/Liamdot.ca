// Gate Playground
// Build circuits out of logic gates, save them as chips, and use those chips
// to build bigger things - up to a tiny working computer.
//
// The parts and the simulation live in parts.js; the puzzles in levels.js.
//
// This file:
//   1. State       - the board, your chips, and what mode you're in
//   2. Helpers     - sizes, pin positions, the grid
//   3. Simulation  - running time, tick by tick
//   4. Drawing     - the board, palette, panels
//   5. Input       - dragging, wiring, switches, chips, levels
//   6. Saving

const { PARTS, BYTE, wrap, specFor, chipPins, createSim } = GateParts;
const LEVELS = GateLevels;

const GRID = 20;
const GROUPS = [["bits", "bits"], ["bytes", "bytes"], ["memory", "memory"], ["chips", "my chips"]];

// What's on the sandbox board the first time you visit.
const STARTER = {
  parts: [
    { id: 1, type: "IN", x: 100, y: 100, on: true },
    { id: 2, type: "IN", x: 100, y: 180 },
    { id: 3, type: "AND", x: 240, y: 120 },
    { id: 4, type: "OUT", x: 400, y: 140 },
  ],
  wires: [
    { id: 5, from: 1, fromPin: 0, to: 3, pin: 0 },
    { id: 6, from: 2, fromPin: 0, to: 3, pin: 1 },
    { id: 7, from: 3, fromPin: 0, to: 4, pin: 0 },
  ],
};

// ===========================================================================
// 1. State
// ===========================================================================

let parts = [];
let wires = [];
let nextId = 1;

let chips = {};             // name -> { name, board }
let mode = "sandbox";       // "sandbox", or the number of the level you're on
let editingChip = null;     // the name of the chip you're editing, if any
let selected = null;
let action = null;
let levelSelectOpen = false;
let lastTest = null;

let sim = null;
let ticks = 0;
let running = true;
let speed = 8;              // ticks per second

let progress = { sandbox: null, levels: {}, chips: {}, solved: {}, seenIntro: false };

// ===========================================================================
// 2. Helpers
// ===========================================================================

const partById = (id) => parts.find((part) => part.id === id);
const specOf = (part) => specFor(part.type, chips);
const snap = (n) => Math.round(n / GRID) * GRID;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const currentLevel = () => (mode === "sandbox" ? null : LEVELS[mode]);

function partSize(part) {
  const spec = specOf(part);
  if (!spec) return { w: 80, h: 40 };
  const rows = Math.max(spec.inputs.length, spec.outputs.length, 1);
  return { w: (spec.size && spec.size.w) || 80, h: (spec.size && spec.size.h) || (rows + 1) * GRID };
}

const pinY = (index) => GRID * (index + 1);

function pinPos(part, side, index) {
  const { w } = partSize(part);
  return { x: part.x + (side === "out" ? w : 0), y: part.y + pinY(index) };
}

// "A:byte" -> { name: "A", w: 8 }
function parsePin(text) {
  const [name, kind] = text.split(":");
  return { name, w: kind === "byte" ? BYTE : 1 };
}

// The wire plugged into an input pin, if any.
const wireInto = (partId, pin) => wires.find((wire) => wire.to === partId && wire.pin === pin);

function gateCount() {
  return parts.filter((part) => !part.locked && !["IN", "OUT", "BYTE", "SHOW"].includes(part.type)).length;
}

// ===========================================================================
// 3. Simulation
// ===========================================================================

// Rebuilds the circuit after an edit, keeping whatever the memory parts hold.
function rebuildSim() {
  sim = createSim({ parts, wires }, chips, sim ? sim.getStates() : null);
  sim.settle();
}

// For changes that don't alter the circuit itself (a flipped switch, a new
// number): no rebuild, so nothing forgets what it was holding.
function refresh() {
  if (sim) sim.settle();
  render();
  save();
}

// The value a part is showing: what it puts out, or for lamps and displays,
// what's plugged into them.
const valueOf = (part, pin = 0) => (sim ? sim.valueOf(part.id, pin) : 0);

let lastTickAt = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (!running || !sim) return;
  if (now - lastTickAt < 1000 / speed) return;
  lastTickAt = now;
  if (!sim.hasMemory) return; // nothing can change on its own
  sim.tick();
  ticks++;
  renderBoard();
  updateTimeBar();
}
requestAnimationFrame(loop);

function stepOnce() {
  if (!sim) return;
  sim.tick();
  ticks++;
  renderBoard();
  updateTimeBar();
}

function resetState() {
  if (!sim) return;
  sim.reset();
  ticks = 0;
  renderBoard();
  updateTimeBar();
}

// ---- testing a level ----

function testLevel() {
  const level = currentLevel();
  const ins = level.inputs.map(parsePin);
  const outs = level.outputs.map(parsePin);
  const partFor = (name) => parts.find((part) => part.label === name);

  const setInputs = (values) => {
    for (const pin of ins) {
      const part = partFor(pin.name);
      if (!part || values[pin.name] === undefined) continue;
      if (pin.w === 1) part.on = Boolean(values[pin.name]);
      else part.value = wrap(values[pin.name]);
    }
  };
  const readOutputs = () => Object.fromEntries(outs.map((pin) => {
    const part = partFor(pin.name);
    return [pin.name, part ? valueOf(part) : 0];
  }));
  const runTicks = (n) => { for (let i = 0; i < n; i++) sim.tick(); };

  const before = parts.filter((part) => part.locked).map((part) => ({ part, on: part.on, value: part.value }));
  rebuildSim();
  const rows = [];
  let extraNote = "";

  if (level.solve) {
    // Try every combination of the switches.
    for (let combo = 0; combo < 2 ** ins.length; combo++) {
      const set = {};
      ins.forEach((pin, i) => { set[pin.name] = (combo >> (ins.length - 1 - i)) & 1; });
      sim.reset();
      setInputs(set);
      sim.settle();
      runTicks(2);
      const want = level.solve(Object.fromEntries(ins.map((pin) => [pin.name, Boolean(set[pin.name])])));
      const got = readOutputs();
      const pass = outs.every((pin) => Number(Boolean(want[pin.name])) === Number(Boolean(got[pin.name])));
      rows.push({ set, want: Object.fromEntries(outs.map((p) => [p.name, Number(Boolean(want[p.name]))])), got, pass });
    }
  } else if (level.cases) {
    for (const item of level.cases) {
      sim.reset();
      setInputs(item.set);
      sim.settle();
      runTicks(2);
      const got = readOutputs();
      rows.push({ set: item.set, want: item.expect, got, pass: Object.keys(item.expect).every((k) => got[k] === item.expect[k]) });
    }
  } else if (level.steps) {
    sim.reset();
    for (const step of level.steps) {
      setInputs(step.set);
      runTicks(step.ticks || 1);
      const got = readOutputs();
      rows.push({ set: step.set, want: step.expect, got, note: step.note, pass: Object.keys(step.expect).every((k) => got[k] === step.expect[k]) });
    }
  } else if (level.watch) {
    // Run for a while and see which values show up, in order.
    sim.reset();
    const watched = partFor(level.watch.of);
    const seen = [];
    sim.settle();
    if (watched && valueOf(watched) !== 0) seen.push(valueOf(watched)); // what it shows before time starts
    for (let i = 0; i < level.watch.ticks; i++) {
      sim.tick();
      const value = watched ? valueOf(watched) : 0;
      if (value !== 0 && value !== seen[seen.length - 1]) seen.push(value);
    }
    // The wanted values have to appear in order (other values in between are fine).
    let at = 0;
    for (const value of seen) if (value === level.watch.expect[at]) at++;
    const pass = at === level.watch.expect.length;
    rows.push({ watch: true, want: level.watch.expect.join(", "), got: seen.slice(0, 12).join(", ") || "nothing", pass });
    extraNote = `after ${level.watch.ticks} ticks`;
  }

  for (const saved of before) {
    saved.part.on = saved.on;
    saved.part.value = saved.value;
  }
  rebuildSim();

  const solved = rows.every((row) => row.pass);
  const gates = gateCount();
  if (solved) {
    const best = progress.solved[level.name];
    progress.solved[level.name] = best === undefined ? gates : Math.min(best, gates);
  }
  lastTest = { rows, solved, gates, wrong: rows.filter((r) => !r.pass).length, ins, outs, extraNote };
  render();
  save();
}

// ===========================================================================
// 4. Drawing
// ===========================================================================

const board = document.getElementById("board");
const layer = document.getElementById("layer");
const paletteEl = document.getElementById("palette");
const propsEl = document.getElementById("props");
const levelBar = document.getElementById("level-bar");
const resultsEl = document.getElementById("results");
const levelSelectEl = document.getElementById("level-select");
const introEl = document.getElementById("intro");
const chipBar = document.getElementById("chip-bar");
const deleteBtn = document.getElementById("delete-btn");
const clearBtn = document.getElementById("clear-btn");
const saveChipBtn = document.getElementById("save-chip-btn");
const tickCountEl = document.getElementById("tick-count");
const playBtn = document.getElementById("play-btn");

const curve = (a, b) => {
  const bend = Math.max(35, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + bend} ${a.y}, ${b.x - bend} ${b.y}, ${b.x} ${b.y}`;
};

const escapeText = (text) => String(text).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

function partSVG(part) {
  const spec = specOf(part);
  if (!spec) return "";
  const { w, h } = partSize(part);
  const isSelected = selected && selected.kind === "part" && selected.id === part.id;
  const value = spec.outputs.length ? valueOf(part) : valueOf(part);

  let classes = `part ${part.type.startsWith("chip:") ? "CHIP" : part.type}`;
  if (spec.isChip) classes += " CHIP";
  if (value) classes += " on";
  if (isSelected) classes += " selected";

  let shape = "";
  if (spec.isSwitch) {
    shape = `<rect class="body" width="${w}" height="${h}" rx="8"/>
      <circle class="light" cx="${w / 2}" cy="${h / 2}" r="12"/>
      <text x="${w / 2}" y="${h / 2}">${part.on ? 1 : 0}</text>`;
  } else if (spec.isLamp) {
    shape = `<circle class="body" cx="${w / 2}" cy="${h / 2}" r="${w / 2 - 1}"/>
      <text x="${w / 2}" y="${h / 2}">${value ? 1 : 0}</text>`;
  } else if (spec.isByteSwitch) {
    // eight little cells you can click, plus the number
    let cells = "";
    for (let i = 0; i < 8; i++) {
      const on = ((part.value || 0) >> (7 - i)) & 1;
      cells += `<rect class="cell${on ? " on" : ""}" data-part="${part.id}" data-bit="${7 - i}" x="${6 + i * 8}" y="${h - 15}" width="7" height="9" rx="1.5"/>`;
    }
    shape = `<rect class="body" width="${w}" height="${h}" rx="6"/>
      <text class="value" x="${w / 2}" y="13">${part.value || 0}</text>${cells}`;
  } else if (spec.isDisplay) {
    shape = `<rect class="body" width="${w}" height="${h}" rx="6"/>
      <text class="value" x="${w / 2}" y="${h / 2}">${value}</text>`;
  } else {
    shape = `<rect class="body" width="${w}" height="${h}" rx="6"/>
      <text x="${w / 2}" y="${spec.hasProgram || spec.label === "RAM" ? 15 : h / 2}">${escapeText(spec.label)}</text>`;
    if (spec.hasProgram) shape += `<text class="sub" x="${w / 2}" y="${h - 12}">${(part.program || []).length} bytes</text>`;
    if (spec.label === "RAM") shape += `<text class="sub" x="${w / 2}" y="${h - 12}">256 bytes</text>`;
  }

  if (part.label) {
    shape += spec.inputs.length === 0
      ? `<text class="part-label left" x="-10" y="${h / 2}">${escapeText(part.label)}</text>`
      : `<text class="part-label right" x="${w + 10}" y="${h / 2}">${escapeText(part.label)}</text>`;
  }

  let pins = "";
  const pinMarkup = (pin, i, side) => {
    const x = side === "out" ? w : 0;
    const shapeSVG = pin.w === BYTE
      ? `<rect class="pin byte" data-part="${part.id}" data-pin="${side}" data-index="${i}" x="${x - 4}" y="${pinY(i) - 4}" width="8" height="8" rx="1.5"/>`
      : `<circle class="pin" data-part="${part.id}" data-pin="${side}" data-index="${i}" cx="${x}" cy="${pinY(i)}" r="5"/>`;
    const label = spec.inputs.length + spec.outputs.length > 2 && pin.name && !spec.isChip
      ? `<text class="pin-name ${side}" x="${side === "out" ? w - 8 : 8}" y="${pinY(i)}">${escapeText(pin.name)}</text>` : "";
    const chipLabel = spec.isChip
      ? `<text class="pin-name ${side}" x="${side === "out" ? w - 7 : 7}" y="${pinY(i)}">${escapeText(pin.name)}</text>` : "";
    return shapeSVG + label + chipLabel;
  };
  spec.inputs.forEach((pin, i) => { pins += pinMarkup(pin, i, "in"); });
  spec.outputs.forEach((pin, i) => { pins += pinMarkup(pin, i, "out"); });

  return `<g class="${classes}" data-part="${part.id}" transform="translate(${part.x} ${part.y})">${shape}${pins}</g>`;
}

function renderBoard() {
  let svg = "";

  for (const wire of wires) {
    const from = partById(wire.from);
    const to = partById(wire.to);
    if (!from || !to) continue;
    const fromSpec = specOf(from);
    const toSpec = specOf(to);
    if (!fromSpec || !toSpec || !fromSpec.outputs[wire.fromPin || 0] || !toSpec.inputs[wire.pin]) continue;

    const a = pinPos(from, "out", wire.fromPin || 0);
    const b = pinPos(to, "in", wire.pin);
    const path = curve(a, b);
    const width = fromSpec.outputs[wire.fromPin || 0].w;
    const value = valueOf(from, wire.fromPin || 0);
    const isSelected = selected && selected.kind === "wire" && selected.id === wire.id;

    let classes = `wire${width === BYTE ? " byte" : ""}`;
    if (value) classes += " on";
    if (isSelected) classes += " selected";
    svg += `<path class="${classes}" d="${path}"/>`;
    svg += `<path class="wire-hit" data-wire="${wire.id}" d="${path}"/>`;
    if (width === BYTE && value) {
      svg += `<text class="wire-value" x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 6}">${value}</text>`;
    }
  }

  for (const part of parts) svg += partSVG(part);

  if (action && action.kind === "wire") {
    const part = partById(action.part);
    if (part) {
      const from = pinPos(part, action.pin, action.index);
      const path = action.pin === "out" ? curve(from, action.pointer) : curve(action.pointer, from);
      svg += `<path class="wire preview" d="${path}"/>`;
    }
  }

  layer.innerHTML = svg;
  const selectedPart = selected && selected.kind === "part" && partById(selected.id);
  deleteBtn.disabled = !selected || Boolean(selectedPart && selectedPart.locked);
}

// ---- palette ----

function renderPalette() {
  const level = currentLevel();
  const allowed = level ? level.parts : null;
  paletteEl.replaceChildren();

  for (const [group, groupLabel] of GROUPS) {
    let types = group === "chips"
      ? Object.keys(chips).map((name) => `chip:${name}`)
      : Object.keys(PARTS).filter((type) => PARTS[type].group === group);

    if (allowed) {
      types = types.filter((type) => allowed.includes(type) || (group === "chips" && !editingChip));
      if (group === "bits") types = ["IN", "OUT", ...types.filter((t) => !["IN", "OUT"].includes(t))].filter((t) => allowed.includes(t));
    }
    if (editingChip) types = types.filter((type) => type !== `chip:${editingChip}`); // a chip can't contain itself
    if (types.length === 0) continue;

    const wrapper = document.createElement("div");
    wrapper.className = "group";
    wrapper.innerHTML = `<span class="group-name">${groupLabel}</span>`;
    for (const type of types) {
      const spec = specFor(type, chips);
      if (!spec) continue;
      const button = document.createElement("button");
      button.className = `part-btn${group === "chips" ? " chip-btn" : ""}`;
      button.textContent = spec.label;
      button.dataset.type = type;
      button.title = group === "chips" ? `${spec.label} — double-click to edit, right-click to delete` : spec.label;
      wrapper.append(button);
    }
    paletteEl.append(wrapper);
  }

  if (level && !paletteEl.children.length) {
    paletteEl.innerHTML = `<span class="no-parts">no parts needed for this one</span>`;
  }

  clearBtn.textContent = level ? "reset" : "clear";
  // You can save a chip from a puzzle too - that's how you reuse your
  // Full Adder in the byte levels.
  saveChipBtn.textContent = editingChip ? "save chip" : "save as chip";
  for (const button of document.querySelectorAll(".mode-btn")) {
    button.classList.toggle("active", (button.dataset.mode === "sandbox") === (mode === "sandbox" && !levelSelectOpen));
  }
}

// ---- properties of the selected part ----

function renderProps() {
  const part = selected && selected.kind === "part" ? partById(selected.id) : null;
  const spec = part && specOf(part);
  propsEl.replaceChildren();
  propsEl.hidden = !part || !spec;
  if (!part || !spec) return;

  const add = (label, input) => {
    const wrapper = document.createElement("label");
    wrapper.className = "prop";
    wrapper.append(label, input);
    propsEl.append(wrapper);
  };

  const name = document.createElement("strong");
  name.textContent = spec.label;
  propsEl.append(name);

  if (spec.isSwitch || spec.isLamp || spec.isByteSwitch || spec.isDisplay) {
    const input = document.createElement("input");
    input.value = part.label || "";
    input.placeholder = "name";
    input.size = 8;
    input.disabled = Boolean(part.locked);
    input.addEventListener("input", () => { part.label = input.value; renderBoard(); save(); });
    add("name", input);
  }
  if (spec.isByteSwitch) {
    const input = document.createElement("input");
    input.type = "number";
    input.min = 0;
    input.max = 255;
    input.value = part.value || 0;
    input.addEventListener("input", () => { part.value = wrap(parseInt(input.value, 10) || 0); refresh(); });
    add("value", input);
  }
  if (spec.hasProgram) {
    const input = document.createElement("input");
    input.className = "program";
    input.value = (part.program || []).join(", ");
    input.placeholder = "1, 2, 3";
    input.addEventListener("input", () => {
      part.program = input.value.split(/[ ,]+/).filter(Boolean).map((n) => wrap(parseInt(n, 10) || 0));
      refresh();
    });
    add("bytes", input);
  }
}

// ---- the level bar, results and level list ----

function renderLevelBar() {
  const level = currentLevel();
  levelBar.hidden = !level || levelSelectOpen || Boolean(editingChip);
  chipBar.hidden = !editingChip;
  if (editingChip) document.getElementById("chip-name").textContent = editingChip;
  if (!level) return;

  const best = progress.solved[level.name];
  document.getElementById("level-name").textContent = `${mode + 1}. ${level.name}`;
  document.getElementById("level-goal").textContent = level.goal;
  document.getElementById("level-best").textContent = best === undefined ? "" : `✓ solved · best: ${best} ${best === 1 ? "part" : "parts"}`;
}

function renderResults() {
  const level = currentLevel();
  resultsEl.hidden = !level || !lastTest || levelSelectOpen;
  if (resultsEl.hidden) return;

  const { rows, solved, gates, wrong, ins, outs, extraNote } = lastTest;
  const heading = solved
    ? `<span class="solved-msg">✓ Solved with ${gates} ${gates === 1 ? "part" : "parts"}!</span>`
    : `<span class="wrong-msg">✗ ${wrong} of ${rows.length} ${rows.length === 1 ? "check" : "checks"} failed</span>`;

  let table;
  if (rows[0] && rows[0].watch) {
    table = `<table><tr><th>wanted</th><td>${rows[0].want}</td></tr><tr><th>your circuit showed</th><td class="${rows[0].pass ? "" : "got-wrong"}">${rows[0].got}</td></tr></table>`;
  } else {
    const head = `<tr>${ins.map((p) => `<th>${p.name}</th>`).join("")}${outs.map((p, i) => `<th class="${i === 0 ? "sep" : ""}">want ${p.name}</th>`).join("")}${outs.map((p, i) => `<th class="${i === 0 ? "sep" : ""}">got ${p.name}</th>`).join("")}${rows.some((r) => r.note) ? "<th class='sep note'></th>" : ""}</tr>`;
    const body = rows.map((row) => `<tr class="${row.pass ? "" : "bad"}">
      ${ins.map((p) => `<td>${row.set[p.name] === undefined ? "–" : row.set[p.name]}</td>`).join("")}
      ${outs.map((p, i) => `<td class="${i === 0 ? "sep" : ""}">${row.want[p.name]}</td>`).join("")}
      ${outs.map((p, i) => `<td class="${i === 0 ? "sep" : ""} ${row.want[p.name] !== row.got[p.name] ? "got-wrong" : ""}">${row.got[p.name]}</td>`).join("")}
      ${rows.some((r) => r.note) ? `<td class="sep note">${escapeText(row.note || "")}</td>` : ""}
    </tr>`).join("");
    table = `<table>${head}${body}</table>`;
  }

  const nextExists = mode + 1 < LEVELS.length;
  resultsEl.innerHTML = `
    <div class="results-head">${heading}<button class="close-btn" id="results-close" aria-label="Close">×</button></div>
    ${extraNote ? `<p class="results-note">${extraNote}</p>` : ""}
    ${table}
    ${solved && nextExists ? `<button class="test-btn next-btn" id="next-level">next level &rarr;</button>` : ""}
    ${solved && !nextExists ? `<p class="all-done">That's the last level. You built a computer!</p>` : ""}`;
}

function renderLevelSelect() {
  levelSelectEl.hidden = !levelSelectOpen;
  if (!levelSelectOpen) return;

  const solvedCount = LEVELS.filter((level) => progress.solved[level.name] !== undefined).length;
  const cards = LEVELS.map((level, i) => {
    const best = progress.solved[level.name];
    const status = best !== undefined ? `✓ best: ${best} ${best === 1 ? "part" : "parts"}` : "not solved yet";
    return `<button class="level-card ${best !== undefined ? "solved" : ""} ${i === mode ? "current" : ""}" data-level="${i}">
      <span class="lc-num">Level ${i + 1}</span>
      <span class="lc-name">${escapeText(level.name)}</span>
      <span class="lc-status">${status}</span>
    </button>`;
  }).join("");

  levelSelectEl.innerHTML = `<div class="ls-inner">
    <div class="ls-head"><h2>Puzzles</h2><span class="ls-count">${solvedCount} / ${LEVELS.length} solved</span></div>
    <p class="ls-intro">Play them in any order. Build each circuit, then press <strong>test</strong>. Save anything useful as a chip - later levels expect it.</p>
    <div class="level-grid">${cards}</div>
  </div>`;
}

function updateTimeBar() {
  tickCountEl.textContent = `tick ${ticks}`;
  playBtn.textContent = running ? "pause" : "play";
  playBtn.title = running ? "Pause time" : "Start time";
}

function render() {
  renderBoard();
  renderPalette();
  renderProps();
  renderLevelBar();
  renderResults();
  renderLevelSelect();
  updateTimeBar();
  introEl.hidden = Boolean(progress.seenIntro);
}

// Rebuild the circuit, redraw, save. Call after anything changes.
function changed() {
  rebuildSim();
  render();
  save();
}

// ===========================================================================
// 5. Input
// ===========================================================================

const boardPoint = (e) => {
  const rect = board.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
};
const isOverBoard = (e) => {
  const rect = board.getBoundingClientRect();
  return e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
};

board.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const point = boardPoint(e);
  const target = e.target;

  // a bit cell on a BYTE switch
  if (target.dataset.bit !== undefined) {
    const part = partById(Number(target.dataset.part));
    part.value = (part.value || 0) ^ (1 << Number(target.dataset.bit));
    selected = { kind: "part", id: part.id };
    refresh();
    return;
  }

  // a pin: start a wire
  if (target.dataset.pin) {
    const partId = Number(target.dataset.part);
    const index = Number(target.dataset.index || 0);
    const existing = target.dataset.pin === "in" && wireInto(partId, index);
    if (existing) {
      wires = wires.filter((wire) => wire !== existing);
      action = { kind: "wire", part: existing.from, pin: "out", index: existing.fromPin || 0, pointer: point };
      rebuildSim();
    } else {
      action = { kind: "wire", part: partId, pin: target.dataset.pin, index, pointer: point };
    }
    board.classList.add("wiring");
    renderBoard();
    return;
  }

  // a part: select and drag
  const partEl = target.closest("[data-part]");
  if (partEl) {
    const part = partById(Number(partEl.dataset.part));
    selected = { kind: "part", id: part.id };
    action = { kind: "drag", id: part.id, offsetX: point.x - part.x, offsetY: point.y - part.y, startX: e.clientX, startY: e.clientY, moved: false };
    renderBoard();
    renderProps();
    return;
  }

  if (target.dataset.wire) {
    selected = { kind: "wire", id: Number(target.dataset.wire) };
    renderBoard();
    renderProps();
    return;
  }

  selected = null;
  renderBoard();
  renderProps();
});

paletteEl.addEventListener("pointerdown", (e) => {
  const button = e.target.closest("[data-type]");
  if (!button || e.button !== 0) return;
  e.preventDefault();

  const part = { id: nextId++, type: button.dataset.type, x: 0, y: 0, on: false, value: 0 };
  if (specFor(part.type, chips).hasProgram) part.program = [];
  parts.push(part);
  selected = { kind: "part", id: part.id };

  const { w, h } = partSize(part);
  action = { kind: "drag", id: part.id, offsetX: w / 2, offsetY: h / 2, moved: true, fromToolbar: true, reachedBoard: false };
  moveDraggedPart(e);
  changed();
});

function moveDraggedPart(e) {
  const part = partById(action.id);
  const { w, h } = partSize(part);
  const point = boardPoint(e);
  const rect = board.getBoundingClientRect();
  part.x = clamp(snap(point.x - action.offsetX), 0, Math.floor((rect.width - w) / GRID) * GRID);
  part.y = clamp(snap(point.y - action.offsetY), 0, Math.floor((rect.height - h) / GRID) * GRID);
  if (isOverBoard(e)) action.reachedBoard = true;
}

window.addEventListener("pointermove", (e) => {
  if (!action) return;
  if (action.kind === "drag") {
    if (!action.moved && Math.hypot(e.clientX - action.startX, e.clientY - action.startY) > 4) action.moved = true;
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

  let onlyFlipped = false;
  if (action.kind === "drag") {
    const part = partById(action.id);
    if (!action.moved && specOf(part).isSwitch) {
      part.on = !part.on;
      onlyFlipped = !action.fromToolbar; // nothing about the circuit changed, so memory is kept
    }
    if (action.fromToolbar && !isOverBoard(e)) {
      if (action.reachedBoard) deletePart(part.id);
      else {
        const rect = board.getBoundingClientRect();
        const { w, h } = partSize(part);
        part.x = snap(rect.width / 2 - w / 2);
        part.y = snap(rect.height / 2 - h / 2);
      }
    }
  }

  if (action.kind === "wire") {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target && target.dataset && target.dataset.pin) {
      connect(action, { part: Number(target.dataset.part), pin: target.dataset.pin, index: Number(target.dataset.index || 0) });
    }
    board.classList.remove("wiring");
  }

  action = null;
  if (onlyFlipped) refresh();
  else changed();
});

// Connects an output pin to an input pin. Bits only plug into bits, bytes
// into bytes.
function connect(a, b) {
  let output;
  let input;
  if (a.pin === "out" && b.pin === "in") { output = a; input = b; }
  else if (a.pin === "in" && b.pin === "out") { output = b; input = a; }
  else return;

  const fromPart = partById(output.part);
  const toPart = partById(input.part);
  if (!fromPart || !toPart) return;
  const fromPin = specOf(fromPart).outputs[output.index];
  const toPin = specOf(toPart).inputs[input.index];
  if (!fromPin || !toPin || fromPin.w !== toPin.w) {
    flashMessage(fromPin && toPin ? "A bit wire can't plug into a byte pin." : "");
    return;
  }

  wires = wires.filter((wire) => !(wire.to === input.part && wire.pin === input.index));
  wires.push({ id: nextId++, from: output.part, fromPin: output.index, to: input.part, pin: input.index });
}

let messageTimer = 0;
function flashMessage(text) {
  if (!text) return;
  const el = document.getElementById("flash");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

function deletePart(id) {
  const part = partById(id);
  if (!part || part.locked) return;
  parts = parts.filter((p) => p.id !== id);
  wires = wires.filter((wire) => wire.from !== id && wire.to !== id);
  if (selected && selected.kind === "part" && selected.id === id) selected = null;
}

function deleteSelected() {
  if (!selected) return;
  if (selected.kind === "part") deletePart(selected.id);
  else {
    wires = wires.filter((wire) => wire.id !== selected.id);
    selected = null;
  }
  changed();
}

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
  const focused = document.activeElement;
  if (focused && focused.closest("input, select, textarea")) return;

  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelected(); }
  if (e.key === "Escape") { selected = null; renderBoard(); renderProps(); }
  if (e.key === " ") { e.preventDefault(); running = !running; updateTimeBar(); }
  if (e.key === ".") { running = false; stepOnce(); }
});

deleteBtn.addEventListener("click", deleteSelected);

clearBtn.addEventListener("click", () => {
  const level = currentLevel();
  if (!confirm(level ? "Start this level over?" : "Remove everything from the board?")) return;
  loadBoard(level ? levelStartBoard(level) : { parts: [], wires: [] });
  selected = null;
  lastTest = null;
  changed();
});

// ---- time controls ----

playBtn.addEventListener("click", () => { running = !running; updateTimeBar(); });
document.getElementById("step-btn").addEventListener("click", () => { running = false; stepOnce(); });
document.getElementById("reset-state-btn").addEventListener("click", resetState);
document.getElementById("speed").addEventListener("input", (e) => { speed = Number(e.target.value); });

// ---- chips ----

function boardCopy() {
  return { parts: parts.map((part) => ({ ...part })), wires: wires.map((wire) => ({ ...wire })) };
}

saveChipBtn.addEventListener("click", () => {
  if (editingChip) { // saving changes to a chip you were editing
    chips[editingChip].board = boardCopy();
    const name = editingChip;
    editingChip = null;
    loadBoard(progress.sandbox || STARTER);
    flashMessage(`Saved changes to ${name}.`);
    changed();
    return;
  }

  const pins = chipPins({ parts, wires });
  if (pins.inputs.length === 0 || pins.outputs.length === 0) {
    flashMessage("A chip needs at least one IN and one OUT part inside it.");
    return;
  }
  const name = (prompt("Name this chip:", "") || "").trim();
  if (!name) return;
  if (chips[name]) { flashMessage(`There's already a chip called ${name}.`); return; }

  chips[name] = { name, board: boardCopy() };
  flashMessage(`Saved ${name} — find it under "my chips".`);
  changed();
});

document.getElementById("chip-cancel").addEventListener("click", () => {
  editingChip = null;
  loadBoard(progress.sandbox || STARTER);
  changed();
});

paletteEl.addEventListener("contextmenu", (e) => {
  const button = e.target.closest(".chip-btn");
  if (!button) return;
  e.preventDefault();
  const name = button.dataset.type.slice(5);
  if (!confirm(`Delete the chip "${name}"? Circuits using it will lose it.`)) return;
  delete chips[name];
  changed();
});

paletteEl.addEventListener("dblclick", (e) => {
  const button = e.target.closest(".chip-btn");
  if (!button) return;
  const name = button.dataset.type.slice(5);
  if (mode !== "sandbox") { flashMessage("You can only edit chips in the sandbox."); return; }
  storeBoard();
  editingChip = name;
  loadBoard(chips[name].board);
  selected = null;
  changed();
});

// ---- modes and levels ----

function levelStartBoard(level) {
  const width = board.getBoundingClientRect().width || 700;
  const outX = Math.max(380, Math.floor((width - 150) / GRID) * GRID);
  let id = 1;
  const made = [];

  level.inputs.map(parsePin).forEach((pin, i) => {
    made.push({ id: id++, type: pin.w === BYTE ? "BYTE" : "IN", x: 40, y: 60 + i * 80, label: pin.name, locked: true, value: 0 });
  });
  level.outputs.map(parsePin).forEach((pin, i) => {
    made.push({ id: id++, type: pin.w === BYTE ? "SHOW" : "OUT", x: outX, y: 60 + i * 80, label: pin.name, locked: true });
  });
  for (const extra of level.extra || []) {
    made.push({ id: id++, locked: true, ...extra });
  }
  return { parts: made, wires: [] };
}

function switchMode(newMode) {
  storeBoard();
  mode = newMode;
  editingChip = null;
  selected = null;
  action = null;
  lastTest = null;
  levelSelectOpen = false;
  openBoard();
  sim = null; // a different circuit: start its memory fresh
  ticks = 0;
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

document.getElementById("levels-btn").addEventListener("click", () => { levelSelectOpen = true; render(); });
document.getElementById("test-btn").addEventListener("click", testLevel);

levelSelectEl.addEventListener("click", (e) => {
  const card = e.target.closest("[data-level]");
  if (card) switchMode(Number(card.dataset.level));
});

resultsEl.addEventListener("click", (e) => {
  if (e.target.id === "results-close") { lastTest = null; render(); }
  if (e.target.id === "next-level") switchMode(mode + 1);
});

introEl.addEventListener("click", (e) => {
  const choice = e.target.closest("[data-start]");
  if (!choice) return;
  progress.seenIntro = true;
  if (choice.dataset.start === "puzzles") levelSelectOpen = true;
  render();
  save();
});

// ===========================================================================
// 6. Saving
// ===========================================================================

function storeBoard() {
  if (editingChip) return; // chip edits are saved with the "save chip" button
  const data = boardCopy();
  if (mode === "sandbox") progress.sandbox = data;
  else progress.levels[LEVELS[mode].name] = data;
}

function openBoard() {
  const level = currentLevel();
  if (!level) {
    loadBoard(progress.sandbox || STARTER);
    return;
  }
  const saved = progress.levels[level.name];
  loadBoard(saved || levelStartBoard(level));

  // If the level's switches or lamps have changed since it was saved, start fresh.
  const wanted = [...level.inputs, ...level.outputs].map(parsePin);
  const hasAll = wanted.every((pin) => parts.some((part) => part.label === pin.name));
  if (!hasAll) loadBoard(levelStartBoard(level));
}

function save() {
  storeBoard();
  try {
    localStorage.setItem("gate-playground-save", JSON.stringify({ version: 3, mode, ...progress, chips }));
  } catch (e) {
    // saving can fail (e.g. private browsing) - the playground still works
  }
}

function loadBoard(data) {
  const oldNames = { INPUT: "IN", OUTPUT: "OUT" }; // saves from before bytes existed
  parts = (data.parts || [])
    .map((part) => ({ ...part, type: oldNames[part.type] || part.type }))
    .filter((part) => specFor(part.type, chips))
    .map((part) => ({
      id: part.id, type: part.type, x: part.x, y: part.y,
      on: Boolean(part.on), value: part.value || 0, label: part.label,
      locked: Boolean(part.locked), program: part.program,
    }));

  let highestId = Math.max(0, ...parts.map((p) => p.id), ...(data.wires || []).map((w) => w.id || 0));
  wires = (data.wires || [])
    .filter((wire) => {
      const from = parts.find((p) => p.id === wire.from);
      const to = parts.find((p) => p.id === wire.to);
      if (!from || !to) return false;
      const fromSpec = specFor(from.type, chips);
      const toSpec = specFor(to.type, chips);
      return fromSpec.outputs[wire.fromPin || 0] && toSpec.inputs[wire.pin];
    })
    .map((wire) => ({ id: wire.id || ++highestId, from: wire.from, fromPin: wire.fromPin || 0, to: wire.to, pin: wire.pin }));

  nextId = highestId + 1;
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem("gate-playground-save"));
    if (data && data.parts) {
      progress.sandbox = data; // the very first save format was just a board
    } else if (data) {
      progress = {
        sandbox: data.sandbox || null,
        levels: data.levels || {},
        solved: data.solved || {},
        seenIntro: Boolean(data.seenIntro),
      };
      chips = data.chips || {};
      if (Number.isInteger(data.mode) && LEVELS[data.mode]) mode = data.mode;
    }
  } catch (e) {
    // broken save - start fresh
  }
  openBoard();
}

load();
rebuildSim();
render();
