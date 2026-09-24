// Breadboard Baker - the chips you can drop on the board.
//
// These are the real 74-series parts you get handed in a lab, with the real
// pin numbers. On a DIP package the notch goes to the left, pin 1 is the
// bottom left, the numbers run along the bottom to the right, then back
// along the top to the left:
//
//        14 13 12 11 10  9  8
//       +---------------------+
//    notch                    |
//       +---------------------+
//         1  2  3  4  5  6  7
//
// Each gate says which pins feed it and which pin it drives.

(function (global) {
  const gate = (op, out, ins) => ({ op, out, ins });

  // Four two-input gates in one package, all wired the same way - only the
  // logic differs. 7408, 7432 and 7486 share this exact pinout.
  const quad = (op) => [
    gate(op, 3, [1, 2]),
    gate(op, 6, [4, 5]),
    gate(op, 8, [9, 10]),
    gate(op, 11, [12, 13]),
  ];

  const CHIPS = {
    "7400": {
      name: "7400", pins: 14, vcc: 14, gnd: 7,
      title: "quad 2-input NAND",
      note: "The one people build everything else out of.",
      gates: quad("nand"),
    },
    "7402": {
      name: "7402", pins: 14, vcc: 14, gnd: 7,
      title: "quad 2-input NOR",
      note: "Careful: the outputs are on pins 1, 4, 10 and 13 - the opposite way round to the 7400.",
      gates: [
        gate("nor", 1, [2, 3]),
        gate("nor", 4, [5, 6]),
        gate("nor", 10, [8, 9]),
        gate("nor", 13, [11, 12]),
      ],
    },
    "7404": {
      name: "7404", pins: 14, vcc: 14, gnd: 7,
      title: "hex inverter",
      note: "Six NOTs. Input on the odd pin, output on the one beside it.",
      gates: [
        gate("not", 2, [1]),
        gate("not", 4, [3]),
        gate("not", 6, [5]),
        gate("not", 8, [9]),
        gate("not", 10, [11]),
        gate("not", 12, [13]),
      ],
    },
    "7408": {
      name: "7408", pins: 14, vcc: 14, gnd: 7,
      title: "quad 2-input AND",
      note: "Same pinout as the 7432 and 7486 - check the number printed on the chip.",
      gates: quad("and"),
    },
    "7432": {
      name: "7432", pins: 14, vcc: 14, gnd: 7,
      title: "quad 2-input OR",
      note: "Same pinout as the 7408 and 7486.",
      gates: quad("or"),
    },
    "7486": {
      name: "7486", pins: 14, vcc: 14, gnd: 7,
      title: "quad 2-input XOR",
      note: "Two of these and a couple of ANDs make a full adder.",
      gates: quad("xor"),
    },
    "74138": {
      name: "74138", pins: 16, vcc: 16, gnd: 8,
      title: "3-to-8 decoder",
      note: "Outputs are active LOW: the chosen one goes low, the rest stay high. Enable with G1 high, G2A and G2B low.",
      decoder: {
        select: [1, 2, 3],          // A, B, C - pin 1 is the least significant
        enableHigh: [6],            // G1
        enableLow: [4, 5],          // G2A, G2B
        outputs: [15, 14, 13, 12, 11, 10, 9, 7],   // Y0 to Y7
      },
      gates: [],
    },
  };

  // What each pin is called, worked out from the gates - so the labels can
  // never disagree with the logic.
  function pinNames(chip) {
    const names = {};
    names[chip.vcc] = "VCC";
    names[chip.gnd] = "GND";

    chip.gates.forEach((g, i) => {
      const n = i + 1;
      names[g.out] = chip.gates.length === 6 ? `${n}Y` : `${n}Y`;
      g.ins.forEach((pin, j) => { names[pin] = `${n}${"AB"[j] || j + 1}`; });
    });

    if (chip.decoder) {
      const { select, enableHigh, enableLow, outputs } = chip.decoder;
      select.forEach((pin, i) => { names[pin] = "ABC"[i]; });
      enableHigh.forEach((pin) => { names[pin] = "G1"; });
      enableLow.forEach((pin, i) => { names[pin] = `G2${"AB"[i]}`; });
      outputs.forEach((pin, i) => { names[pin] = `Y${i}`; });
    }

    for (let pin = 1; pin <= chip.pins; pin++) if (!names[pin]) names[pin] = `${pin}`;
    return names;
  }

  // Which pins this chip drives, and which it only listens to.
  function pinKinds(chip) {
    const kinds = {};
    for (let pin = 1; pin <= chip.pins; pin++) kinds[pin] = "in";
    kinds[chip.vcc] = "power";
    kinds[chip.gnd] = "power";
    for (const g of chip.gates) kinds[g.out] = "out";
    if (chip.decoder) for (const pin of chip.decoder.outputs) kinds[pin] = "out";
    return kinds;
  }

  const LOGIC = {
    and: (v) => (v.every((x) => x === 1) ? 1 : 0),
    or: (v) => (v.some((x) => x === 1) ? 1 : 0),
    nand: (v) => (v.every((x) => x === 1) ? 0 : 1),
    nor: (v) => (v.some((x) => x === 1) ? 0 : 1),
    xor: (v) => (v.filter((x) => x === 1).length % 2 ? 1 : 0),
    not: (v) => (v[0] === 1 ? 0 : 1),
  };

  // Works out what a chip drives, given what's on its input pins. A pin
  // that's floating counts as high, the way a real TTL input does - which is
  // exactly the trap that catches people out, so the checker warns about it
  // separately rather than pretending it isn't happening.
  function runChip(chip, read) {
    const driven = {};
    const level = (pin) => (read(pin) === 0 ? 0 : 1);

    for (const g of chip.gates) driven[g.out] = LOGIC[g.op](g.ins.map(level));

    if (chip.decoder) {
      const { select, enableHigh, enableLow, outputs } = chip.decoder;
      const on = enableHigh.every((pin) => level(pin) === 1) && enableLow.every((pin) => level(pin) === 0);
      const which = select.reduce((sum, pin, i) => sum + (level(pin) << i), 0);
      outputs.forEach((pin, i) => { driven[pin] = on && i === which ? 0 : 1; });
    }

    return driven;
  }

  global.Chips = { CHIPS, pinNames, pinKinds, runChip };
})(window);
