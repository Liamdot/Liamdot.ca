// The puzzles. Every level is unlocked from the start - play them in any order.
//
//   name    - must be different for every level (saves use it)
//   goal    - what to build
//   inputs  - the switches you're given: "A" is a bit, "A:byte" is a byte
//   outputs - the lamps you have to light, same naming
//   parts   - which parts you're allowed to place
//   extra   - optional parts placed for you, like a ROM with a program in it
//
// How a level is checked, one of:
//   solve(ins)        every combination of the bit switches is tried
//   cases             a list of { set, expect } checked one at a time
//   steps             a list of { set, ticks, expect } run in order, for
//                     circuits that remember things
//   watch             run for a while and check which values appear, in order

(function (global) {
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
      goal: "Add three bits: A, B and a carry-in C. CARRY and SUM together make the total in binary. Tip: save this as a chip - you'll want it later!",
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

    // ---- memory: circuits that remember ----
    {
      name: "Remember A Bit",
      goal: "A memory cell. Turning SET on makes Q stay on, even after SET goes off again. RESET turns it back off. Two NOR gates feeding each other will do it - use DELAY parts so the loop has time to settle.",
      inputs: ["SET", "RESET"], outputs: ["Q"], parts: ["NOR", "NOT", "AND", "OR", "DELAY"],
      steps: [
        { set: { SET: 1, RESET: 0 }, ticks: 3, expect: { Q: 1 }, note: "SET turns it on" },
        { set: { SET: 0, RESET: 0 }, ticks: 3, expect: { Q: 1 }, note: "and it stays on" },
        { set: { SET: 0, RESET: 1 }, ticks: 3, expect: { Q: 0 }, note: "RESET turns it off" },
        { set: { SET: 0, RESET: 0 }, ticks: 3, expect: { Q: 0 }, note: "and it stays off" },
        { set: { SET: 1, RESET: 0 }, ticks: 3, expect: { Q: 1 }, note: "on again" },
      ],
    },
    {
      name: "Save On Command",
      goal: "Q copies DATA, but only while SAVE is on. When SAVE is off, Q keeps whatever it had.",
      inputs: ["DATA", "SAVE"], outputs: ["Q"], parts: ["AND", "OR", "NOT", "NAND", "NOR", "DELAY"],
      steps: [
        { set: { DATA: 1, SAVE: 1 }, ticks: 3, expect: { Q: 1 }, note: "save a 1" },
        { set: { DATA: 0, SAVE: 0 }, ticks: 3, expect: { Q: 1 }, note: "DATA changes, but it's not saved" },
        { set: { DATA: 0, SAVE: 1 }, ticks: 3, expect: { Q: 0 }, note: "save a 0" },
        { set: { DATA: 1, SAVE: 0 }, ticks: 3, expect: { Q: 0 }, note: "still 0" },
        { set: { DATA: 1, SAVE: 1 }, ticks: 3, expect: { Q: 1 }, note: "save a 1 again" },
      ],
    },
    {
      name: "Counter",
      goal: "COUNT goes up by one every tick that GO is on, and back to 0 when RESET is on. A REG remembers the number, and ADD adds one to it.",
      inputs: ["GO", "RESET"], outputs: ["COUNT:byte"], parts: ["REG", "ADD", "BYTE", "MUX", "AND", "OR", "NOT"],
      steps: [
        { set: { GO: 1, RESET: 0 }, ticks: 1, expect: { COUNT: 1 } },
        { set: { GO: 1, RESET: 0 }, ticks: 1, expect: { COUNT: 2 } },
        { set: { GO: 1, RESET: 0 }, ticks: 3, expect: { COUNT: 5 } },
        { set: { GO: 0, RESET: 0 }, ticks: 3, expect: { COUNT: 5 }, note: "stops when GO is off" },
        { set: { GO: 0, RESET: 1 }, ticks: 1, expect: { COUNT: 0 }, note: "back to zero" },
        { set: { GO: 1, RESET: 0 }, ticks: 2, expect: { COUNT: 2 }, note: "counting again" },
      ],
    },

    // ---- bytes ----
    {
      name: "Odd Or Even",
      goal: "ODD lights up when the number A is odd. (A byte is 8 bits - SPLIT gives you them separately, smallest first.)",
      inputs: ["A:byte"], outputs: ["ODD"], parts: ["SPLIT", "AND", "OR", "NOT"],
      cases: [0, 1, 2, 7, 10, 15, 128, 255].map((a) => ({ set: { A: a }, expect: { ODD: a % 2 } })),
    },
    {
      name: "Byte Adder",
      goal: "Add two whole bytes without using an ADD part: split them into bits, add them one bit at a time carrying as you go, and merge the answer. Your Full Adder chip makes this much easier.",
      inputs: ["A:byte", "B:byte"], outputs: ["SUM:byte"], parts: ["SPLIT", "MERGE", "XOR", "AND", "OR", "NOT"],
      cases: [[0, 0], [1, 1], [5, 3], [12, 200], [99, 100], [255, 1], [200, 100], [170, 85]]
        .map(([a, b]) => ({ set: { A: a, B: b }, expect: { SUM: (a + b) % 256 } })),
    },
    {
      name: "Byte Picker",
      goal: "OUT copies A when PICK is off, and B when PICK is on - a whole byte at a time, without using a MUX part.",
      inputs: ["A:byte", "B:byte", "PICK"], outputs: ["OUT:byte"], parts: ["SPLIT", "MERGE", "AND", "OR", "NOT"],
      cases: [[7, 200, 0], [7, 200, 1], [255, 0, 0], [255, 0, 1], [36, 91, 1]]
        .map(([a, b, pick]) => ({ set: { A: a, B: b, PICK: pick }, expect: { OUT: pick ? b : a } })),
    },
    {
      name: "Byte Memory",
      goal: "Build a register: OUT remembers a whole byte, and only changes when SAVE is on. Use eight BIT memories (SPLIT and MERGE will help).",
      inputs: ["IN:byte", "SAVE"], outputs: ["OUT:byte"], parts: ["SPLIT", "MERGE", "BIT", "AND", "OR", "NOT"],
      steps: [
        { set: { IN: 42, SAVE: 1 }, ticks: 2, expect: { OUT: 42 } },
        { set: { IN: 7, SAVE: 0 }, ticks: 2, expect: { OUT: 42 }, note: "not saved" },
        { set: { IN: 7, SAVE: 1 }, ticks: 2, expect: { OUT: 7 } },
        { set: { IN: 200, SAVE: 0 }, ticks: 3, expect: { OUT: 7 } },
        { set: { IN: 200, SAVE: 1 }, ticks: 2, expect: { OUT: 200 } },
      ],
    },

    // ---- building a computer ----
    {
      name: "Program Counter",
      goal: "A computer works through its program one step at a time. PC starts at 0 and goes up by one every tick, unless RESET is on, which sends it back to 0.",
      inputs: ["RESET"], outputs: ["PC:byte"], parts: ["REG", "ADD", "BYTE", "MUX", "NOT", "AND", "OR"],
      steps: [
        { set: { RESET: 0 }, ticks: 1, expect: { PC: 1 } },
        { set: { RESET: 0 }, ticks: 1, expect: { PC: 2 } },
        { set: { RESET: 0 }, ticks: 5, expect: { PC: 7 } },
        { set: { RESET: 1 }, ticks: 1, expect: { PC: 0 } },
        { set: { RESET: 0 }, ticks: 3, expect: { PC: 3 } },
      ],
    },
    {
      name: "Fetch The Program",
      goal: "The ROM holds a program. Feed it addresses 0, 1, 2… one per tick, and show each byte it gives back. (The ROM is already filled in - double-click it to peek.)",
      inputs: [], outputs: ["OUT:byte"], parts: ["REG", "ADD", "BYTE", "MUX", "NOT", "AND", "OR"],
      extra: [{ type: "ROM", program: [11, 22, 33, 44, 55], x: 260, y: 60 }],
      watch: { of: "OUT", ticks: 60, expect: [11, 22, 33, 44, 55] },
    },
    {
      name: "Tiny CPU",
      goal:
        "Build a computer. Each byte in the ROM is one instruction: the top half says what to do (1 = load this number, 2 = add this number, 3 = show the answer), the bottom half is the number. " +
        "Run through the program and SHOW must display 8, then 10. (Try: PC → ROM → SPLIT the instruction → ALU and a REG for the answer.)",
      inputs: [], outputs: ["OUT:byte"],
      parts: ["REG", "ADD", "ALU", "BYTE", "MUX", "SPLIT", "MERGE", "EQUAL", "RAM", "NOT", "AND", "OR", "XOR", "BIT", "DELAY"],
      extra: [{ type: "ROM", program: [0x15, 0x23, 0x30, 0x22, 0x30, 0x00], x: 260, y: 60 }],
      watch: { of: "OUT", ticks: 400, expect: [8, 10] },
    },
  ];

  global.GateLevels = LEVELS;
})(self);
