// Soko: the rules, and nothing else. No drawing and no page in here, so the
// game, the level editor and the solver all agree on what a level is and what
// a move does.
//
//   1. Levels on paper  - the text format, and turning it into a level
//   2. Playing          - moves, undo, and knowing when it's solved
//   3. Short codes      - squashing a level small enough to put in a link
//   4. Solving          - finding out whether a level can be done at all
//
// Levels are written in the usual Sokoban text format, the one thousands of
// existing levels are already in, so anything you find online pastes straight
// in:
//
//   #  wall          @  player          $  box          .  goal
//   -  floor         +  player on goal  *  box on goal
//
// A space is floor too. The edge of the level is as solid as a wall, so a
// level doesn't need walling in - but floor right at the start or end of a
// row has to be written "-", or it would be taken for indentation or trimmed
// off as trailing space.
//
// There can be any number of players, and they all move together.

const SOKO = (() => {
  // =========================================================================
  // 1. Levels on paper
  // =========================================================================

  const WALL = "#";
  const FLOOR = " ";
  const GOAL = ".";
  const BOX = "$";
  const BOX_ON_GOAL = "*";
  const PLAYER = "@";
  const PLAYER_ON_GOAL = "+";

  const KNOWN = new Set([WALL, FLOOR, GOAL, BOX, BOX_ON_GOAL, PLAYER, PLAYER_ON_GOAL]);

  // Turns the text of a level into rows of single characters, all the same
  // length, with floor as a space. Blank lines either side go, and so does
  // indentation every row shares - so a level can sit indented inside
  // levels.js. Only spaces are ever trimmed: "-" is floor that's staying put.
  function rowsOf(text) {
    let rows = String(text).replace(/\r/g, "").replace(/\t/g, "    ").split("\n");
    while (rows.length && !rows[0].trim()) rows.shift();
    while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
    if (!rows.length) return [];

    const indent = Math.min(...rows.filter((r) => r.trim()).map((r) => r.match(/^ */)[0].length));
    rows = rows.map((r) => r.slice(indent).replace(/ +$/, ""));
    const width = Math.max(...rows.map((r) => r.length));
    return rows.map((r) => r.padEnd(width, FLOOR).replace(/[-_]/g, FLOOR));
  }

  // Rows back to text. Floor at either end of a row is written "-" so it
  // survives being read back in; floor in the middle stays a space, which is
  // easier on the eye.
  function writeRows(rows) {
    return rows.map((row) => {
      const s = Array.isArray(row) ? row.join("") : row;
      const lead = s.match(/^ */)[0].length;
      if (lead === s.length) return "-".repeat(s.length);
      const trail = s.match(/ *$/)[0].length;
      return "-".repeat(lead) + s.slice(lead, s.length - trail) + "-".repeat(trail);
    }).join("\n");
  }

  // A level, ready to play. Everything is a flat array indexed y * width + x.
  //
  //   wall[i], goal[i]  - the fixed parts of the map
  //   inside[i]         - floor some player can reach; anything else is the
  //                       dark outside, and isn't drawn as floor
  //   boxes, players    - where each starts
  //
  // Throws with a plain explanation if the text isn't a level at all. Whether
  // it's a fair one is check()'s business, further down.
  function parse(text) {
    const rows = rowsOf(text);
    if (!rows.length) throw new Error("There's nothing there.");

    const height = rows.length;
    const width = rows[0].length;
    const size = width * height;
    const wall = new Uint8Array(size);
    const goal = new Uint8Array(size);
    const boxes = [];
    const players = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const ch = rows[y][x];
        const i = y * width + x;
        if (!KNOWN.has(ch)) throw new Error(`"${ch}" on row ${y + 1} isn't a level character.`);
        if (ch === WALL) wall[i] = 1;
        if (ch === GOAL || ch === BOX_ON_GOAL || ch === PLAYER_ON_GOAL) goal[i] = 1;
        if (ch === BOX || ch === BOX_ON_GOAL) boxes.push(i);
        if (ch === PLAYER || ch === PLAYER_ON_GOAL) players.push(i);
      }
    }

    const level = { width, height, wall, goal, boxes, players };
    level.inside = reach(level, players);
    return level;
  }

  function toText(level, boxes = level.boxes, players = level.players) {
    const onBox = new Uint8Array(level.width * level.height);
    const onPlayer = new Uint8Array(level.width * level.height);
    for (const b of boxes) onBox[b] = 1;
    for (const p of players) onPlayer[p] = 1;
    const rows = [];
    for (let y = 0; y < level.height; y++) {
      let row = "";
      for (let x = 0; x < level.width; x++) {
        const i = y * level.width + x;
        if (level.wall[i]) row += WALL;
        else if (onPlayer[i]) row += level.goal[i] ? PLAYER_ON_GOAL : PLAYER;
        else if (onBox[i]) row += level.goal[i] ? BOX_ON_GOAL : BOX;
        else row += level.goal[i] ? GOAL : FLOOR;
      }
      rows.push(row);
    }
    return writeRows(rows);
  }

  // One square on in a direction, or -1 off the edge - which is why the edge
  // behaves as a wall without anyone having to build one.
  function step(level, i, dir) {
    const x = i % level.width;
    const y = (i - x) / level.width;
    const [dx, dy] = DIRS[dir];
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= level.width || ny >= level.height) return -1;
    return ny * level.width + nx;
  }

  // Everywhere the players can walk to, ignoring boxes.
  function reach(level, from) {
    const seen = new Uint8Array(level.width * level.height);
    const queue = [];
    for (const p of from) {
      if (!seen[p]) {
        seen[p] = 1;
        queue.push(p);
      }
    }
    while (queue.length) {
      const i = queue.pop();
      for (let d = 0; d < 4; d++) {
        const n = step(level, i, d);
        if (n < 0 || seen[n] || level.wall[n]) continue;
        seen[n] = 1;
        queue.push(n);
      }
    }
    return seen;
  }

  // Is this level fit to play? A list of problems, each a sentence a person
  // can act on. Empty means it's fine.
  function check(level) {
    const problems = [];
    const goals = level.goal.reduce((n, g) => n + g, 0);
    const boxes = level.boxes.length;

    if (!level.players.length) problems.push("It needs a player (@) - as many as you like.");
    if (!boxes) problems.push("It needs at least one box ($).");
    if (!goals) problems.push("It needs at least one goal (.).");
    if (boxes && goals && boxes !== goals) {
      problems.push(`It has ${boxes} box${boxes === 1 ? "" : "es"} and ${goals} goal${
        goals === 1 ? "" : "s"} - they have to match.`);
    }
    if (level.players.length) {
      const stray = level.boxes.filter((b) => !level.inside[b]).length;
      if (stray) problems.push(`${stray} box${stray === 1 ? " is" : "es are"} where no player can get to.`);
      let lost = 0;
      for (let i = 0; i < level.goal.length; i++) if (level.goal[i] && !level.inside[i]) lost++;
      if (lost) problems.push(`${lost} goal${lost === 1 ? " is" : "s are"} where no player can get to.`);
    }
    return problems;
  }

  // =========================================================================
  // 2. Playing
  // =========================================================================

  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const DIR = { up: 0, right: 1, down: 2, left: 3 };

  // Every player tries to step the same way at once. They go furthest-along
  // first, so a line of them moves like a train: each one steps into the space
  // the one ahead has just left. Anyone who can't move - a wall, the edge, a
  // box with nowhere to go, a stuck player in front - stays put, and the rest
  // carry on without them.
  //
  // Changes `players` and `boxAt` in place and says what moved, or returns null
  // if nothing did. Both the game and the solver go through this, so they can
  // never disagree about what a move does.
  function moveAll(level, players, boxAt, dir) {
    const [dx, dy] = DIRS[dir];
    const along = (i) => (i % level.width) * dx + Math.floor(i / level.width) * dy;
    const order = players.map((_, n) => n).sort((a, b) => along(players[b]) - along(players[a]));
    const occupied = new Set(players);
    const moved = [];
    const pushed = [];

    for (const n of order) {
      const from = players[n];
      const to = step(level, from, dir);
      if (to < 0 || level.wall[to] || occupied.has(to)) continue;
      if (boxAt[to]) {
        const beyond = step(level, to, dir);
        if (beyond < 0 || level.wall[beyond] || boxAt[beyond] || occupied.has(beyond)) continue;
        boxAt[to] = 0;
        boxAt[beyond] = 1;
        pushed.push([to, beyond]);
      }
      occupied.delete(from);
      occupied.add(to);
      players[n] = to;
      moved.push([from, to]);
    }
    return moved.length ? { players: moved, boxes: pushed } : null;
  }

  function start(level) {
    const boxAt = new Uint8Array(level.width * level.height);
    for (const b of level.boxes) boxAt[b] = 1;
    return { level, boxAt, players: level.players.slice(), facing: "down", history: [] };
  }

  // Tries a move: what moved, or null if nobody could. Either way everyone turns
  // to face the way that was pressed.
  function move(game, dirName) {
    game.facing = dirName;
    const before = game.players.slice();
    const change = moveAll(game.level, game.players, game.boxAt, DIR[dirName]);
    if (change) game.history.push({ players: before, boxes: change.boxes, facing: dirName });
    return change;
  }

  function undo(game) {
    const last = game.history.pop();
    if (!last) return false;
    for (const [from, to] of last.boxes.slice().reverse()) {
      game.boxAt[to] = 0;
      game.boxAt[from] = 1;
    }
    game.players = last.players;
    const before = game.history[game.history.length - 1];
    game.facing = before ? before.facing : "down";
    return true;
  }

  function solved(game) {
    const { level, boxAt } = game;
    for (let i = 0; i < boxAt.length; i++) if (boxAt[i] && !level.goal[i]) return false;
    return true;
  }

  // =========================================================================
  // 3. Short codes
  // =========================================================================
  //
  // A level squashed for a link: rows joined with "|", runs of the same
  // character written as a count and the character, floor written "-". So
  // "#####|#@$.#|#####" becomes "5#|#@$.#|5#". It's the run-length format other
  // Sokoban programs use too.

  function encode(text) {
    return rowsOf(text).map((row) => row.replace(/ /g, "-")
      .replace(/(.)\1+/g, (run, ch) => `${run.length}${ch}`)).join("|");
  }

  // Floor comes back as "-", not a space, so rowsOf keeps any that sits at
  // the edge of a row.
  function decode(code) {
    const rows = [""];
    let count = "";
    for (const ch of String(code)) {
      if (ch >= "0" && ch <= "9") { count += ch; continue; }
      if (ch === "|") { rows.push(""); count = ""; continue; }
      const n = count ? Math.min(Number(count), 200) : 1;
      rows[rows.length - 1] += (ch === " " || ch === "_" ? "-" : ch).repeat(n);
      count = "";
    }
    return rows.join("\n");
  }

  // =========================================================================
  // 4. Solving
  // =========================================================================
  //
  // Tries every sequence of moves, shortest first, until the boxes are all
  // home - so if it finds a way, it's the shortest way.
  //
  // It knows nothing about the rules. It just calls moveAll, the same as the
  // game does, and remembers which arrangements of players and boxes it has
  // already seen. So a new mechanic - ice, things that pull, anything -
  // is checked correctly the moment moveAll does it, with nothing changed
  // here. The price is that it can't take shortcuts a rules-aware solver
  // could, so it gives up sooner on big levels. When it runs out of `budget`
  // it says it doesn't know, rather than freezing the page.

  function solve(level, budget = 250000) {
    if (check(level).length) return { result: "broken" };

    const size = level.width * level.height;
    const boxAt = new Uint8Array(size);              // reused for every try
    const sorted = (list) => list.slice().sort((a, b) => a - b);
    const keyOf = (players, boxes) => `${sorted(players).join(",")}|${boxes.join(",")}`;
    const home = (boxes) => boxes.every((b) => level.goal[b]);

    const first = { players: level.players.slice(), boxes: sorted(level.boxes) };
    if (home(first.boxes)) return { result: "solved", moves: 0, searched: 0 };

    const seen = new Set([keyOf(first.players, first.boxes)]);
    let frontier = [first];
    let moves = 0;
    let searched = 0;

    while (frontier.length) {
      moves++;
      const next = [];
      for (const state of frontier) {
        for (let d = 0; d < 4; d++) {
          for (const b of state.boxes) boxAt[b] = 1;
          const players = state.players.slice();
          const change = moveAll(level, players, boxAt, d);
          for (const b of state.boxes) boxAt[b] = 0;
          if (change) for (const [, to] of change.boxes) boxAt[to] = 0;
          if (!change) continue;

          let boxes = state.boxes;
          if (change.boxes.length) {
            boxes = state.boxes.slice();
            for (const [from, to] of change.boxes) boxes[boxes.indexOf(from)] = to;
            boxes.sort((a, b) => a - b);
          }
          const key = keyOf(players, boxes);
          if (seen.has(key)) continue;
          seen.add(key);

          if (change.boxes.length && home(boxes)) return { result: "solved", moves, searched };
          if (++searched >= budget) return { result: "unknown", searched };
          next.push({ players, boxes });
        }
      }
      frontier = next;
    }
    return { result: "impossible", searched };
  }

  return {
    WALL, FLOOR, GOAL, BOX, BOX_ON_GOAL, PLAYER, PLAYER_ON_GOAL,
    rowsOf, writeRows, parse, toText, check, start, move, undo, solved, encode, decode, solve,
  };
})();
