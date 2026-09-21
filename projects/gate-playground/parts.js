// Gate Playground - the parts you can place, and how a circuit is worked out.
// The board, drawing and mouse handling live in game.js.
//
// Two kinds of wire:
//   a bit  (width 1) carries 0 or 1
//   a byte (width 8) carries a whole number from 0 to 255
//
// Two kinds of part:
//   instant parts have `logic`, which turns their inputs into their outputs
//   remembering parts have `read` (what they show now, based on what they
//   remember) and `tick` (what they'll remember next). Time moves in "ticks",
//   which is what makes memory, clocks and counters possible.

(function (global) {
  const BYTE = 8;
  const bit = (name) => ({ name, w: 1 });
  const byte = (name) => ({ name, w: BYTE });
  const wrap = (n) => ((Math.round(n) % 256) + 256) % 256;

  function gate(label, group, inputs, outputs, logic, extra = {}) {
    return { label, group, inputs, outputs, logic, ...extra };
  }

  const PARTS = {
    // ---- bits ----
    IN: {
      label: "IN", group: "bits", inputs: [], outputs: [bit("out")],
      isSwitch: true, size: { w: 40, h: 40 },
    },
    OUT: {
      label: "OUT", group: "bits", inputs: [bit("in")], outputs: [],
      isLamp: true, size: { w: 40, h: 40 },
    },
    NOT:  gate("NOT",  "bits", [bit("in")], [bit("out")], (i) => [i[0] ? 0 : 1]),
    AND:  gate("AND",  "bits", [bit("a"), bit("b")], [bit("out")], (i) => [i[0] && i[1] ? 1 : 0]),
    OR:   gate("OR",   "bits", [bit("a"), bit("b")], [bit("out")], (i) => [i[0] || i[1] ? 1 : 0]),
    NAND: gate("NAND", "bits", [bit("a"), bit("b")], [bit("out")], (i) => [i[0] && i[1] ? 0 : 1]),
    NOR:  gate("NOR",  "bits", [bit("a"), bit("b")], [bit("out")], (i) => [i[0] || i[1] ? 0 : 1]),
    XOR:  gate("XOR",  "bits", [bit("a"), bit("b")], [bit("out")], (i) => [i[0] !== i[1] ? 1 : 0]),
    XNOR: gate("XNOR", "bits", [bit("a"), bit("b")], [bit("out")], (i) => [i[0] === i[1] ? 1 : 0]),

    // ---- time and memory ----
    // Passes on whatever it was given, one tick later. This is what lets a
    // signal loop back on itself without going haywire.
    DELAY: {
      label: "DELAY", group: "memory", inputs: [bit("in")], outputs: [bit("out")],
      read: (state) => [state.q || 0],
      tick: (ins, state) => ({ q: ins[0] ? 1 : 0 }),
    },
    // Flips between 0 and 1 by itself, every tick.
    CLOCK: {
      label: "CLOCK", group: "memory", inputs: [], outputs: [bit("out")],
      size: { w: 62, h: 40 },
      read: (state) => [state.q || 0],
      tick: (ins, state) => ({ q: state.q ? 0 : 1 }),
    },
    // Remembers one bit. It only changes when "save" is on.
    BIT: {
      label: "BIT", group: "memory", inputs: [bit("in"), bit("save")], outputs: [bit("out")],
      read: (state) => [state.q || 0],
      tick: (ins, state) => ({ q: ins[1] ? (ins[0] ? 1 : 0) : state.q || 0 }),
    },
    // Remembers one byte.
    REG: {
      label: "REG", group: "memory", inputs: [byte("in"), bit("save")], outputs: [byte("out")],
      read: (state) => [state.q || 0],
      tick: (ins, state) => ({ q: ins[1] ? wrap(ins[0]) : state.q || 0 }),
    },
    // 256 bytes of memory: shows what's at "addr", saves when "write" is on.
    RAM: {
      label: "RAM", group: "memory", inputs: [byte("addr"), byte("in"), bit("write")], outputs: [byte("out")],
      size: { w: 90 },
      read: (state, ins) => {
        if (!state.cells) state.cells = new Uint8Array(256);
        return [state.cells[wrap(ins[0])]];
      },
      tick: (ins, state) => {
        if (!state.cells) state.cells = new Uint8Array(256);
        if (ins[2]) state.cells[wrap(ins[0])] = wrap(ins[1]);
        return {};
      },
    },
    // A list of bytes you type in yourself: a program, or a lookup table.
    ROM: {
      label: "ROM", group: "memory", inputs: [byte("addr")], outputs: [byte("out")],
      size: { w: 90 }, hasProgram: true,
      logic: (ins, part) => [wrap((part && part.program && part.program[wrap(ins[0])]) || 0)],
    },

    // ---- bytes ----
    BYTE: {
      label: "BYTE", group: "bytes", inputs: [], outputs: [byte("out")],
      isByteSwitch: true, size: { w: 92, h: 40 },
    },
    SHOW: {
      label: "SHOW", group: "bytes", inputs: [byte("in")], outputs: [],
      isDisplay: true, size: { w: 66, h: 40 },
    },
    // A byte is 8 bits: this pulls them apart (bit 1 is the smallest).
    SPLIT: {
      label: "SPLIT", group: "bytes", inputs: [byte("in")],
      outputs: Array.from({ length: 8 }, (_, i) => bit(String(i + 1))),
      logic: (ins) => Array.from({ length: 8 }, (_, i) => (wrap(ins[0]) >> i) & 1),
    },
    // ...and this puts them back together.
    MERGE: {
      label: "MERGE", group: "bytes",
      inputs: Array.from({ length: 8 }, (_, i) => bit(String(i + 1))),
      outputs: [byte("out")],
      logic: (ins) => [ins.reduce((total, b, i) => total + (b ? 1 << i : 0), 0)],
    },
    ADD: gate("ADD", "bytes", [byte("a"), byte("b"), bit("carry")], [byte("sum"), bit("carry")],
      (i) => { const total = wrap(i[0]) + wrap(i[1]) + (i[2] ? 1 : 0); return [wrap(total), total > 255 ? 1 : 0]; },
      { size: { w: 90 } }),
    MUX: gate("MUX", "bytes", [byte("a"), byte("b"), bit("pick")], [byte("out")],
      (i) => [wrap(i[2] ? i[1] : i[0])], { size: { w: 90 } }),
    EQUAL: gate("EQUAL", "bytes", [byte("a"), byte("b")], [bit("same")],
      (i) => [wrap(i[0]) === wrap(i[1]) ? 1 : 0], { size: { w: 90 } }),
    // Maths on two bytes. op1 and op2 pick which: 00 add, 01 subtract,
    // 10 and, 11 or. "zero" lights up when the answer is 0.
    ALU: gate("ALU", "bytes", [byte("a"), byte("b"), bit("op1"), bit("op2")], [byte("out"), bit("zero")],
      (i) => {
        const a = wrap(i[0]);
        const b = wrap(i[1]);
        const op = (i[2] ? 2 : 0) + (i[3] ? 1 : 0);
        const out = wrap([a + b, a - b, a & b, a | b][op]);
        return [out, out === 0 ? 1 : 0];
      }, { size: { w: 90 } }),
  };

  // Parts used only inside the simulation, never placed on a board.
  const SWITCH = (w) => ({ inputs: [], outputs: [{ name: "out", w }], read: (state, ins, part) => [w === 1 ? (part.on ? 1 : 0) : wrap(part.value || 0)] });
  const PASS = (w) => ({ inputs: [{ name: "in", w }], outputs: [{ name: "out", w }], logic: (i) => [i[0] || 0] });

  // ---- custom chips ------------------------------------------------------

  // A chip is a saved circuit used as a single part. Its pins come from the
  // IN and BYTE parts (inputs) and OUT and SHOW parts (outputs) inside it,
  // ordered down the board.
  function chipPins(board) {
    const sorted = (types) => board.parts
      .filter((part) => types.includes(part.type))
      .sort((a, b) => a.y - b.y || a.x - b.x);

    return {
      inputs: sorted(["IN", "BYTE"]).map((part, i) => ({ id: part.id, name: part.label || `in${i + 1}`, w: part.type === "BYTE" ? BYTE : 1 })),
      outputs: sorted(["OUT", "SHOW"]).map((part, i) => ({ id: part.id, name: part.label || `out${i + 1}`, w: part.type === "SHOW" ? BYTE : 1 })),
    };
  }

  // The part description for a chip, so it can be drawn and placed like any other.
  function chipSpec(chip) {
    const pins = chipPins(chip.board);
    const rows = Math.max(pins.inputs.length, pins.outputs.length, 1);
    return {
      label: chip.name,
      group: "chips",
      isChip: true,
      inputs: pins.inputs.map((p) => ({ name: p.name, w: p.w })),
      outputs: pins.outputs.map((p) => ({ name: p.name, w: p.w })),
      size: { w: Math.max(84, chip.name.length * 8 + 30), h: (rows + 1) * 20 },
    };
  }

  // Looks up any part type, including chips ("chip:Half Adder").
  function specFor(type, chips) {
    if (PARTS[type]) return PARTS[type];
    if (type && type.startsWith("chip:") && chips) {
      const chip = chips[type.slice(5)];
      if (chip) return chipSpec(chip);
    }
    return null;
  }

  // ---- working the circuit out -------------------------------------------

  // Chips (and chips inside chips) are spread out into one flat list of plain
  // parts. Every entry is a node:
  //   { spec, part, sources, values, state }
  // sources[i] says where input i comes from: { node, pin }, or null.
  // `oldStates` (from a previous sim's getStates) lets memory parts keep what
  // they remembered when you edit the circuit around them.
  function createSim(board, chips, oldStates) {
    const nodes = [];

    function makeNode(spec, part, key) {
      const node = { spec, part, key, sources: spec.inputs.map(() => null), values: spec.outputs.map(() => 0), state: {} };
      if (oldStates && oldStates.has(key)) node.state = oldStates.get(key);
      nodes.push(node);
      return node;
    }

    // Adds one board to the list. Inside a chip (depth > 0) the IN and OUT
    // parts become simple pass-throughs, which is how the chip's pins connect
    // to the circuit around it.
    function addBoard(currentBoard, depth, prefix = "") {
      const nodeOf = new Map();  // part id -> node, or { chip } for a chip instance
      if (depth > 6) return { nodeOf, inputNodes: [], outputSources: [] }; // chips nested too deep

      for (const part of currentBoard.parts) {
        const spec = specFor(part.type, chips);
        if (!spec) continue;
        const key = `${prefix}${part.id}`;

        if (spec.isChip) {
          const chip = chips[part.type.slice(5)];
          nodeOf.set(part.id, { chip: addBoard(chip.board, depth + 1, `${key}/`) });
        } else if (spec.isSwitch || spec.isByteSwitch) {
          const w = spec.isByteSwitch ? BYTE : 1;
          nodeOf.set(part.id, makeNode(depth === 0 ? SWITCH(w) : PASS(w), part, key));
        } else if (spec.isLamp || spec.isDisplay) {
          nodeOf.set(part.id, makeNode(PASS(spec.isDisplay ? BYTE : 1), part, key));
        } else {
          nodeOf.set(part.id, makeNode(spec, part, key));
        }
      }

      // Where a wire's starting pin gets its value from.
      const sourceOf = (entry, pin) => (entry.chip ? entry.chip.outputSources[pin] : { node: entry, pin });

      for (const wire of currentBoard.wires) {
        const from = nodeOf.get(wire.from);
        const to = nodeOf.get(wire.to);
        if (!from || !to) continue;
        const source = sourceOf(from, wire.fromPin || 0);
        if (!source) continue;
        if (to.chip) {
          const target = to.chip.inputNodes[wire.pin];
          if (target) target.sources[0] = source;
        } else {
          to.sources[wire.pin] = source;
        }
      }

      const pins = chipPins(currentBoard);
      return {
        nodeOf,
        inputNodes: pins.inputs.map((pin) => nodeOf.get(pin.id)).map((n) => (n && !n.chip ? n : null)),
        outputSources: pins.outputs.map((pin) => {
          const node = nodeOf.get(pin.id);
          return node && !node.chip ? { node, pin: 0 } : null;
        }),
      };
    }

    const top = addBoard(board, 0);

    const inputsOf = (node) => node.sources.map((source) => (source ? source.node.values[source.pin] : 0));

    // Works everything out until nothing changes any more. Circuits that
    // never settle (like a NOT wired to itself) give up after 60 rounds -
    // that's what DELAY parts are for.
    function settle() {
      for (let round = 0; round < 60; round++) {
        let changed = false;
        for (const node of nodes) {
          const ins = inputsOf(node);
          const outs = node.spec.logic ? node.spec.logic(ins, node.part) : node.spec.read(node.state, ins, node.part);
          for (let i = 0; i < node.values.length; i++) {
            const value = outs[i] || 0;
            if (value !== node.values[i]) {
              node.values[i] = value;
              changed = true;
            }
          }
        }
        if (!changed) break;
      }
    }

    // One tick of time: everything settles, then the remembering parts take
    // in what they saw, then everything settles again with the new values.
    function tick() {
      settle();
      const updates = [];
      for (const node of nodes) {
        if (node.spec.tick) updates.push([node, node.spec.tick(inputsOf(node), node.state, node.part)]);
      }
      for (const [node, state] of updates) Object.assign(node.state, state);
      settle();
    }

    // What a part on the top-level board is showing right now.
    function valueOf(partId, pin = 0) {
      const entry = top.nodeOf.get(partId);
      if (!entry) return 0;
      if (entry.chip) {
        const source = entry.chip.outputSources[pin];
        return source ? source.node.values[source.pin] : 0;
      }
      return entry.values[pin] || 0;
    }

    function reset() {
      for (const node of nodes) {
        node.state = {};
        node.values = node.values.map(() => 0);
      }
      settle();
    }

    // What every memory part is holding, so an edit doesn't wipe the circuit's memory.
    function getStates() {
      const states = new Map();
      for (const node of nodes) if (node.spec.tick) states.set(node.key, node.state);
      return states;
    }

    return { nodes, settle, tick, reset, valueOf, getStates, hasMemory: nodes.some((node) => node.spec.tick) };
  }

  global.GateParts = { PARTS, BYTE, wrap, specFor, chipSpec, chipPins, createSim };
})(self);
