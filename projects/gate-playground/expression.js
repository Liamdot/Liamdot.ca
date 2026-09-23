// Gate Playground - turning something like (A'B + C) into a circuit.
//
// Two halves:
//   1. Reading   - the text becomes a little tree
//   2. Building  - the tree becomes parts and wires, laid out left to right
//
// What it understands:
//   A B C ...      a letter is an input (A1, B2 work too)
//   A'  !A  ~A     not
//   AB  A*B  A&B   and (writing them side by side is enough)
//   A+B  A|B       or
//   A^B            exclusive or
//   NOT AND OR XOR NAND NOR XNOR      spelled out, if you prefer
//   ( )            brackets
//
// Tightest first: not, then and, then xor, then or - so A'B + C means
// ((not A) and B) or C.

(function (global) {
  const WORDS = ["NOT", "AND", "OR", "XOR", "NAND", "NOR", "XNOR"];

  // ---- 1. Reading -------------------------------------------------------

  function tokenize(text) {
    const tokens = [];
    let i = 0;
    const input = String(text).replace(/[‘’´`]/g, "'").replace(/[·•×]/g, "*");

    while (i < input.length) {
      const c = input[i];

      if (/\s/.test(c)) { i++; continue; }

      if (/[a-z]/i.test(c)) {
        const run = input.slice(i).match(/^[a-z]+/i)[0];
        const word = run.toUpperCase();
        if (WORDS.includes(word)) {            // spelled-out operator
          tokens.push({ kind: word });
          i += run.length;
          continue;
        }
        // otherwise every letter is its own input, with any digits after it
        const name = input.slice(i).match(/^[a-z][0-9]*/i)[0];
        tokens.push({ kind: "var", name: name[0].toUpperCase() + name.slice(1) });
        i += name.length;
        continue;
      }

      if (c === "'") { tokens.push({ kind: "NOT-AFTER" }); i++; continue; }
      if (c === "!" || c === "~") { tokens.push({ kind: "NOT" }); i++; continue; }
      if (c === "+" || c === "|") { tokens.push({ kind: "OR" }); i++; continue; }
      if (c === "^") { tokens.push({ kind: "XOR" }); i++; continue; }
      if (c === "*" || c === "&" || c === ".") { tokens.push({ kind: "AND" }); i++; continue; }
      if (c === "(" || c === ")") { tokens.push({ kind: c }); i++; continue; }

      throw new Error(`I don't know what to do with "${c}".`);
    }
    return tokens;
  }

  function parse(text) {
    const tokens = tokenize(text);
    let at = 0;
    const peek = () => tokens[at];
    const take = (kind) => (peek() && peek().kind === kind ? tokens[at++] : null);

    // or - the loosest, so it's read last
    function orExpr() {
      let left = xorExpr();
      while (peek() && (peek().kind === "OR" || peek().kind === "NOR")) {
        const word = tokens[at++].kind;
        const right = xorExpr();
        left = word === "NOR" ? { kind: "not", of: { kind: "or", a: left, b: right } } : { kind: "or", a: left, b: right };
      }
      return left;
    }

    function xorExpr() {
      let left = andExpr();
      while (peek() && (peek().kind === "XOR" || peek().kind === "XNOR")) {
        const word = tokens[at++].kind;
        const right = andExpr();
        left = word === "XNOR" ? { kind: "not", of: { kind: "xor", a: left, b: right } } : { kind: "xor", a: left, b: right };
      }
      return left;
    }

    // and - either spelled out, or just by writing things next to each other
    function andExpr() {
      let left = notExpr();
      for (;;) {
        if (take("AND")) { left = { kind: "and", a: left, b: notExpr() }; continue; }
        if (take("NAND")) { left = { kind: "not", of: { kind: "and", a: left, b: notExpr() } }; continue; }
        const next = peek();
        if (next && (next.kind === "var" || next.kind === "(" || next.kind === "NOT")) {
          left = { kind: "and", a: left, b: notExpr() };
          continue;
        }
        return left;
      }
    }

    function notExpr() {
      if (take("NOT")) return { kind: "not", of: notExpr() };
      return afterExpr();
    }

    // A' - the little mark goes after what it undoes
    function afterExpr() {
      let node = atom();
      while (take("NOT-AFTER")) node = { kind: "not", of: node };
      return node;
    }

    function atom() {
      const token = peek();
      if (!token) throw new Error("It stops early - something's missing off the end.");
      if (token.kind === "var") { at++; return { kind: "var", name: token.name }; }
      if (token.kind === "(") {
        at++;
        const inside = orExpr();
        if (!take(")")) throw new Error("There's a ( without a ).");
        return inside;
      }
      if (token.kind === ")") throw new Error("There's a ) without a (.");
      throw new Error(`"${token.kind.toLowerCase()}" turns up where an input should be.`);
    }

    if (!tokens.length) throw new Error("Write something like (A'B + C) first.");
    const tree = orExpr();
    if (at < tokens.length) throw new Error("There's something left over at the end.");
    return tree;
  }

  // ---- 2. Building ------------------------------------------------------

  const GATE = { or: "OR", and: "AND", xor: "XOR", not: "NOT" };

  // Every input used, in the order they first appear.
  function variablesIn(node, found = []) {
    if (node.kind === "var") {
      if (!found.includes(node.name)) found.push(node.name);
    } else if (node.kind === "not") {
      variablesIn(node.of, found);
    } else {
      variablesIn(node.a, found);
      variablesIn(node.b, found);
    }
    return found;
  }

  // How far from the inputs a gate sits - which is the column it goes in.
  const depthOf = (node) => (
    node.kind === "var" ? 0
      : node.kind === "not" ? depthOf(node.of) + 1
        : Math.max(depthOf(node.a), depthOf(node.b)) + 1
  );

  // Turns the tree into parts and wires. `existing` maps an input name to a
  // part that's already on the board, and `outPart` is a lamp already there -
  // both let a circuit be built straight onto a puzzle.
  function build(tree, options = {}) {
    const {
      nextId = 1, existing = {}, left = 40, top = 60,
      column = 120, row = 60, grid = 20,
    } = options;

    const snap = (n) => Math.round(n / grid) * grid;
    let id = nextId;
    const parts = [];
    const wires = [];

    // the inputs, one under the other
    const inputs = {};
    let inputY = top;
    for (const name of variablesIn(tree)) {
      if (existing[name]) {
        inputs[name] = existing[name];
        continue;
      }
      const part = { id: id++, type: "IN", x: snap(left), y: snap(inputY), on: false, value: 0, label: name };
      parts.push(part);
      inputs[name] = part;
      inputY += 80;
    }

    const deepest = depthOf(tree);
    const startX = Math.max(...Object.values(inputs).map((p) => p.x + 80), left + 120);

    // Each gate is placed in the column its depth says, level with the
    // middle of whatever feeds it. Collisions are sorted out afterwards.
    const placed = [];   // one list per column

    function make(node) {
      if (node.kind === "var") {
        const part = inputs[node.name];
        return { id: part.id, pin: 0, y: part.y + 20 };
      }

      const feeds = node.kind === "not" ? [make(node.of)] : [make(node.a), make(node.b)];
      const depth = depthOf(node);
      const x = snap(startX + (depth - 1) * column);
      const y = snap(feeds.reduce((sum, f) => sum + f.y, 0) / feeds.length - 20);

      const part = { id: id++, type: GATE[node.kind], x, y, on: false, value: 0 };
      parts.push(part);
      (placed[depth] = placed[depth] || []).push(part);
      feeds.forEach((feed, i) => {
        wires.push({ id: id++, from: feed.id, fromPin: feed.pin, to: part.id, pin: i });
      });
      return { id: part.id, pin: 0, y: part.y + 20 };
    }

    const result = make(tree);

    // Nothing may sit on top of anything else: within a column, spread them
    // out in the order they ended up.
    for (const stack of placed) {
      if (!stack) continue;
      stack.sort((a, b) => a.y - b.y);
      let lowest = -Infinity;
      for (const part of stack) {
        part.y = snap(Math.max(part.y, lowest));
        lowest = part.y + row;
      }
    }

    // and the lamp on the end - or a lamp the board already has, in a puzzle
    if (options.outPart) {
      wires.push({ id: id++, from: result.id, fromPin: result.pin, to: options.outPart.id, pin: 0 });
    } else {
      const lamp = {
        id: id++, type: "OUT", x: snap(startX + deepest * column), y: snap(result.y - 20),
        on: false, value: 0, label: options.name || "",
      };
      parts.push(lamp);
      wires.push({ id: id++, from: result.id, fromPin: result.pin, to: lamp.id, pin: 0 });
    }

    return { parts, wires, nextId: id, inputs: Object.keys(inputs) };
  }

  // Works out the answer for one set of inputs, for checking against the
  // circuit that gets built.
  function evaluate(node, values) {
    switch (node.kind) {
      case "var": return values[node.name] ? 1 : 0;
      case "not": return evaluate(node.of, values) ? 0 : 1;
      case "and": return evaluate(node.a, values) && evaluate(node.b, values) ? 1 : 0;
      case "or": return evaluate(node.a, values) || evaluate(node.b, values) ? 1 : 0;
      case "xor": return evaluate(node.a, values) !== evaluate(node.b, values) ? 1 : 0;
      default: return 0;
    }
  }

  global.Expression = { parse, build, variablesIn, evaluate };
})(window);
