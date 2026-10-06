// Karnaugh maps: the layout of one, and the grouping that makes it worth
// drawing. No DOM in here - game.js does the drawing.
//
// An implicant is a bit pattern with some positions left open: bits says what
// the fixed positions are, mask says which positions those are. So for A B C D,
// { bits: 0b1000, mask: 0b1010 } means A = 1, C = 0, B and D anything - which
// is written AC'.

const KMAP_MOST = 6;          // four is a proper map; five and six are stacks of them

const GRAY = [[0], [0, 1], [0, 1, 3, 2]];

const covers = (one, m) => (m & one.mask) === one.bits;

// Quine-McCluskey, the first half: combine terms that differ in one place,
// over and over, and whatever never combines is a prime implicant - a group
// that can't be made any bigger.
function primeImplicants(minterms, vars) {
  const full = (1 << vars) - 1;
  let current = minterms.map((m) => ({ bits: m, mask: full }));
  const primes = [];

  while (current.length) {
    const used = new Array(current.length).fill(false);
    const next = new Map();

    for (let i = 0; i < current.length; i++) {
      for (let j = i + 1; j < current.length; j++) {
        const a = current[i];
        const b = current[j];
        if (a.mask !== b.mask) continue;
        const diff = (a.bits ^ b.bits) & a.mask;
        if (diff === 0 || (diff & (diff - 1)) !== 0) continue;   // one bit, no more
        used[i] = true;
        used[j] = true;
        const mask = a.mask & ~diff;
        const key = `${a.bits & mask}/${mask}`;
        if (!next.has(key)) next.set(key, { bits: a.bits & mask, mask });
      }
    }

    current.forEach((one, i) => { if (!used[i]) primes.push(one); });
    current = [...next.values()];
  }

  const seen = new Set();
  return primes.filter((one) => {
    const key = `${one.bits}/${one.mask}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ...and the second half: take the groups you can't do without, then find the
// fewest of the rest that cover what's left.
function smallestCover(minterms, primes) {
  const chosen = [];
  const left = new Set(minterms);

  for (const m of minterms) {
    const hits = primes.filter((one) => covers(one, m));
    if (hits.length === 1 && !chosen.includes(hits[0])) chosen.push(hits[0]);
  }
  for (const one of chosen) {
    for (const m of [...left]) if (covers(one, m)) left.delete(m);
  }
  if (!left.size) return chosen;

  const rest = primes.filter((one) => !chosen.includes(one));
  const need = [...left];

  // Four variables leaves few enough groups to try every combination. More than
  // that and it isn't worth the wait, so take the biggest bite each time.
  if (rest.length <= 14) {
    for (let size = 1; size <= rest.length; size++) {
      const found = chooseSome(rest, size, need);
      if (found) return [...chosen, ...found];
    }
  }

  const greedy = [];
  const todo = new Set(need);
  while (todo.size) {
    let best = null;
    let most = 0;
    for (const one of rest) {
      if (greedy.includes(one)) continue;
      const hits = [...todo].filter((m) => covers(one, m)).length;
      if (hits > most) { most = hits; best = one; }
    }
    if (!best) break;
    greedy.push(best);
    for (const m of [...todo]) if (covers(best, m)) todo.delete(m);
  }
  return [...chosen, ...greedy];
}

function chooseSome(list, size, need, from = 0, acc = []) {
  if (acc.length === size) {
    return need.every((m) => acc.some((one) => covers(one, m))) ? acc.slice() : null;
  }
  for (let i = from; i < list.length; i++) {
    acc.push(list[i]);
    const got = chooseSome(list, size, need, i + 1, acc);
    acc.pop();
    if (got) return got;
  }
  return null;
}

// AC', or 1 when nothing is fixed at all.
function implicantText(names, one) {
  const vars = names.length;
  let out = "";
  for (let i = 0; i < vars; i++) {
    const bit = 1 << (vars - 1 - i);
    if (one.mask & bit) out += names[i] + (one.bits & bit ? "" : "'");
  }
  return out || "1";
}

// Where everything sits. Up to four variables is one map; five is two maps side
// by side and six is four, each one a full map of the last four variables with
// the leading ones held still.
function kmapPlan(names) {
  const vars = names.length;
  const inner = Math.min(vars, 4);
  const extra = vars - inner;
  const rowBits = inner >= 3 ? 2 : inner - 1;
  const colBits = inner - rowBits;

  return {
    vars,
    inner,
    extra,
    rowBits,
    colBits,
    rowCodes: GRAY[rowBits],
    colCodes: GRAY[colBits],
    rowNames: names.slice(extra, extra + rowBits),
    colNames: names.slice(extra + rowBits),
    overNames: names.slice(0, extra),
    maps: 1 << extra,
  };
}

// Which square of which map a given row of the truth table lands on.
function kmapCell(plan, m) {
  const innerVal = m & ((1 << plan.inner) - 1);
  const rowCode = innerVal >> plan.colBits;
  const colCode = innerVal & ((1 << plan.colBits) - 1);
  return {
    map: m >> plan.inner,
    row: plan.rowCodes.indexOf(rowCode),
    col: plan.colCodes.indexOf(colCode),
  };
}

// A group is a rectangle on the map, but it's allowed to run off one edge and
// back in the other side - so it may need drawing as two pieces, or four.
function runsOf(indices, total) {
  if (!indices.length) return [];
  if (indices.length === total) return [[0, total - 1]];
  const has = (i) => indices.includes(i);
  const start = indices.find((i) => !has((i - 1 + total) % total));
  const walk = indices.map((_, k) => (start + k) % total);

  const pieces = [];
  let from = walk[0];
  for (let k = 1; k <= walk.length; k++) {
    if (k === walk.length || walk[k] !== walk[k - 1] + 1) {
      pieces.push([from, walk[k - 1]]);
      if (k < walk.length) from = walk[k];
    }
  }
  return pieces;
}

// Everything game.js needs to draw the thing.
function kmapFor(names, outs) {
  const vars = names.length;
  const plan = kmapPlan(names);
  const minterms = [];
  outs.forEach((on, m) => { if (on) minterms.push(m); });

  const all = 2 ** vars;
  let groups = [];
  let simplified;

  if (!minterms.length) {
    simplified = "0";
  } else if (minterms.length === all) {
    simplified = "1";
    groups = [{ bits: 0, mask: 0 }];
  } else {
    groups = smallestCover(minterms, primeImplicants(minterms, vars));
    simplified = groups.map((one) => implicantText(names, one)).join(" + ");
  }

  // the squares each group covers, split up by map and by piece
  const shapes = groups.map((one, i) => {
    const cells = [];
    for (let m = 0; m < all; m++) if (covers(one, m)) cells.push(m);
    const byMap = new Map();
    for (const m of cells) {
      const at = kmapCell(plan, m);
      if (!byMap.has(at.map)) byMap.set(at.map, { rows: new Set(), cols: new Set() });
      byMap.get(at.map).rows.add(at.row);
      byMap.get(at.map).cols.add(at.col);
    }
    const blocks = [];
    for (const [map, { rows, cols }] of byMap) {
      const rowRuns = runsOf([...rows].sort((a, b) => a - b), plan.rowCodes.length);
      const colRuns = runsOf([...cols].sort((a, b) => a - b), plan.colCodes.length);
      for (const r of rowRuns) for (const c of colRuns) blocks.push({ map, r, c });
    }
    return { index: i, text: implicantText(names, one), size: cells.length, blocks };
  });

  return { plan, minterms, groups, shapes, simplified };
}
