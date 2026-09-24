// Breadboard Baker - what's connected to what, and what the board does.
//
// A breadboard is just a lot of little metal clips. Everything here follows
// from that:
//
//   * the four long rails run the whole way across
//   * in the middle, each column of five holes is one clip - A to E is one,
//     F to J is another, and the gap down the centre keeps them apart
//
// So two legs are connected when they land in the same clip. The rest is
// working out which clips end up at 5V, which at 0V, and what the chips
// make of it.

(function (global) {
  const COLS = 30;
  const ROWS = ["A", "B", "C", "D", "E"];        // and F to J below the gap

  // ---- holes and clips ---------------------------------------------------

  // Which clip a hole belongs to. Rails are one clip each; in the middle
  // it's one clip per column per half.
  function clipOf(hole) {
    if (hole.kind === "rail") return hole.rail;
    return `${hole.half}${hole.col}`;
  }

  const sameHole = (a, b) => a && b && clipOf(a) === clipOf(b)
    && (a.kind === "rail" ? a.col === b.col : a.row === b.row);

  // Where a chip's pins land. A DIP straddles the centre gap: the low
  // numbers sit in row F below it, then the numbering comes back along row E
  // above it, right to left.
  function chipHoles(chip) {
    const spec = Chips.CHIPS[chip.name];
    const wide = spec.pins / 2;
    const holes = {};
    for (let i = 0; i < wide; i++) {
      holes[i + 1] = { kind: "main", half: "B", row: 0, col: chip.col + i };          // row F
      holes[spec.pins - i] = { kind: "main", half: "T", row: ROWS.length - 1, col: chip.col + i }; // row E
    }
    return holes;
  }

  // ---- which clips are joined together -----------------------------------

  function joiner() {
    const parent = new Map();
    const find = (x) => {
      if (!parent.has(x)) parent.set(x, x);
      while (parent.get(x) !== x) {
        parent.set(x, parent.get(parent.get(x)));
        x = parent.get(x);
      }
      return x;
    };
    const join = (a, b) => { parent.set(find(a), find(b)); };
    return { find, join };
  }

  // Everything that conducts joins its two clips. An LED only conducts one
  // way, so it isn't joined here - it's worked out afterwards.
  function connect(parts) {
    const { find, join } = joiner();
    find("+top"); find("-top"); find("+bottom"); find("-bottom");

    for (const part of parts) {
      if (part.type === "chip") continue;
      if (part.type === "led") continue;
      if (part.type === "button" && !part.pressed) continue;
      join(clipOf(part.a), clipOf(part.b));
    }
    return find;
  }

  // ---- what the board does -----------------------------------------------

  // The rails are the supply: the two marked + sit at 5V, the two marked - at
  // 0V. Chips then drive their outputs, which can feed other chips, so it
  // goes round until nothing changes.
  function simulate(parts) {
    const find = connect(parts);
    const chips = parts.filter((p) => p.type === "chip");

    const powered = new Set([find("+top"), find("+bottom")]);
    const grounded = new Set([find("-top"), find("-bottom")]);

    let driven = new Map();   // group -> 0 or 1, from chip outputs

    const levelOf = (group) => {
      if (powered.has(group) && grounded.has(group)) return "short";
      if (powered.has(group)) return 1;
      if (grounded.has(group)) return 0;
      return driven.has(group) ? driven.get(group) : undefined;
    };

    const conflicts = new Set();
    for (let pass = 0; pass < 12; pass++) {
      const next = new Map();
      const seen = new Map();

      for (const chip of chips) {
        const spec = Chips.CHIPS[chip.name];
        const holes = chipHoles(chip);
        const read = (pin) => {
          const level = levelOf(find(clipOf(holes[pin])));
          return level === "short" ? 0 : level;   // a shorted clip reads low
        };
        const out = Chips.runChip(spec, read);

        for (const pin of Object.keys(out)) {
          const group = find(clipOf(holes[pin]));
          if (seen.has(group) && seen.get(group) !== out[pin]) conflicts.add(group);
          seen.set(group, out[pin]);
          next.set(group, out[pin]);
        }
      }

      const settled = next.size === driven.size && [...next].every(([k, v]) => driven.get(k) === v);
      driven = next;
      if (settled) break;
    }

    // An LED lights when there's a way for current to get through it: its
    // anode side high, its cathode side low, and the two not the same clip.
    const lit = new Set();
    for (const part of parts) {
      if (part.type !== "led") continue;
      const a = find(clipOf(part.a));
      const b = find(clipOf(part.b));
      if (a !== b && levelOf(a) === 1 && levelOf(b) === 0) lit.add(part.id);
    }

    return { find, levelOf, lit, conflicts, powered, grounded };
  }

  // ---- looking for mistakes ----------------------------------------------
  //
  // The point of the whole thing: the board tells you what a picture can't.

  function check(parts, state) {
    const { find, levelOf, conflicts } = state;
    const notes = [];
    const say = (kind, text, partId) => notes.push({ kind, text, partId });

    if (find("+top") === find("-top") || find("+bottom") === find("-bottom")
        || find("+top") === find("-bottom") || find("+bottom") === find("-top")) {
      say("bad", "The + and - rails are joined together. That's a short across the supply.");
    }

    // Compare the clips themselves, not what they're joined to: a wire
    // always joins its own two ends, so asking afterwards would catch every
    // wire on the board.
    for (const part of parts) {
      if (part.type === "chip") continue;
      if (clipOf(part.a) === clipOf(part.b)) {
        say("warn", `Both legs of the ${part.type} are in the same clip, so it isn't doing anything.`, part.id);
      }
    }

    // LEDs: the classic one. Nothing in series to limit the current.
    for (const part of parts) {
      if (part.type !== "led") continue;
      const sides = [find(clipOf(part.a)), find(clipOf(part.b))];
      const guarded = parts.some((p) => p.type === "resistor"
        && (sides.includes(find(clipOf(p.a))) || sides.includes(find(clipOf(p.b)))));
      if (!guarded && levelOf(sides[0]) !== undefined && levelOf(sides[1]) !== undefined) {
        say("bad", "This LED has nothing to limit the current. On a real board it would be a brief, bright goodbye.", part.id);
      }
      if (levelOf(sides[0]) === 0 && levelOf(sides[1]) === 1) {
        say("warn", "This LED is in backwards - the flat side is the cathode, and it goes towards ground.", part.id);
      }
    }

    // Chips: power first, then floating inputs.
    for (const chip of parts.filter((p) => p.type === "chip")) {
      const spec = Chips.CHIPS[chip.name];
      const holes = chipHoles(chip);
      const kinds = Chips.pinKinds(spec);
      const names = Chips.pinNames(spec);

      if (levelOf(find(clipOf(holes[spec.vcc]))) !== 1) {
        say("bad", `${spec.name} has no 5V on pin ${spec.vcc}, so it won't do anything at all.`, chip.id);
      }
      if (levelOf(find(clipOf(holes[spec.gnd]))) !== 0) {
        say("bad", `${spec.name} has no ground on pin ${spec.gnd}.`, chip.id);
      }

      const used = new Set();
      for (const g of spec.gates) if (levelOf(find(clipOf(holes[g.out]))) !== undefined || true) g.ins.forEach((p) => used.add(p));
      if (spec.decoder) [...spec.decoder.select, ...spec.decoder.enableHigh, ...spec.decoder.enableLow].forEach((p) => used.add(p));

      const floating = [...used].filter((pin) => levelOf(find(clipOf(holes[pin]))) === undefined
        && kinds[pin] === "in");
      if (floating.length) {
        say("warn", `${spec.name} has nothing connected to ${floating.map((p) => `pin ${p} (${names[p]})`).join(", ")}. `
          + "A floating TTL input reads high, which looks like it works until it doesn't.", chip.id);
      }
    }

    for (const group of conflicts) {
      say("bad", "Two outputs are driving the same clip, and they disagree. One of them is going to lose.");
    }

    // An output wired straight to a rail is the other way to cook a chip.
    for (const chip of parts.filter((p) => p.type === "chip")) {
      const spec = Chips.CHIPS[chip.name];
      const holes = chipHoles(chip);
      const kinds = Chips.pinKinds(spec);
      for (let pin = 1; pin <= spec.pins; pin++) {
        if (kinds[pin] !== "out") continue;
        const group = find(clipOf(holes[pin]));
        if (state.powered.has(group) || state.grounded.has(group)) {
          say("bad", `${spec.name} pin ${pin} is an output wired straight to a rail. Outputs push back.`, chip.id);
        }
      }
    }

    return notes;
  }

  global.Circuit = { COLS, ROWS, clipOf, sameHole, chipHoles, connect, simulate, check };
})(window);
