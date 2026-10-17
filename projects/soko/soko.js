// Soko: the rules, and nothing else. No drawing and no page in here, so the
// game, the level editor and the solver all agree on what a level is and what
// a move does.
//
//   1. Levels on paper  - the text format, and turning it into a level
//   2. Playing          - moves, pushes, undo, and knowing when it's solved
//   3. Short codes      - squashing a level small enough to put in a link
//   4. Solving          - proving a level can be done, for the editor
//
// Levels are written in the usual Sokoban text format, the one thousands of
// existing levels are already in, so anything you find online pastes straight
// in:
//
//   #  wall          @  player          $  box          .  goal
//      floor         +  player on goal  *  box on goal
//
// "-" and "_" also mean floor, for places that can't hold a space.

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
  // length. Blank lines either side go, and so does indentation that every row
  // shares - that way a level can sit indented inside levels.js and still mean
  // the same thing.
  function rowsOf(text) {
    let rows = String(text).replace(/\r/g, "").replace(/\t/g, "    ").split("\n");
    while (rows.length && !rows[0].trim()) rows.shift();
    while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
    if (!rows.length) return [];

    const indent = Math.min(...rows.filter((r) => r.trim()).map((r) => r.match(/^ */)[0].length));
    rows = rows.map((r) => r.slice(indent).replace(/[-_]/g, FLOOR).replace(/\s+$/, ""));
    const width = Math.max(...rows.map((r) => r.length));
    return rows.map((r) => r.padEnd(width, FLOOR));
  }

  // A level, ready to play. Everything is a flat array indexed y * width + x.
  //
  //   wall[i], goal[i]  - the fixed parts of the map
  //   inside[i]         - floor the player can actually reach; everything else
  //                       is the dark outside, and isn't drawn as floor
  //   boxes             - where each box starts
  //   player            - where the player starts
  //
  // Throws with a plain explanation if the text isn't a level at all. Whether
  // it's a good or a fair level is check()'s business, further down.
  function parse(text) {
    const rows = rowsOf(text);
    if (!rows.length) throw new Error("There's nothing there.");

    const height = rows.length;
    const width = rows[0].length;
    const size = width * height;
    const wall = new Uint8Array(size);
    const goal = new Uint8Array(size);
    const boxes = [];
    let player = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const ch = rows[y][x];
        const i = y * width + x;
        if (!KNOWN.has(ch)) {
          throw new Error(`"${ch}" on row ${y + 1} isn't a level character.`);
        }
        if (ch === WALL) wall[i] = 1;
        if (ch === GOAL || ch === BOX_ON_GOAL || ch === PLAYER_ON_GOAL) goal[i] = 1;
        if (ch === BOX || ch === BOX_ON_GOAL) boxes.push(i);
        if (ch === PLAYER || ch === PLAYER_ON_GOAL) {
          if (player !== -1) throw new Error("There's more than one player.");
          player = i;
        }
      }
    }
    if (player === -1) throw new Error("There's no player (@) in it.");

    const level = { width, height, wall, goal, boxes, player };
    level.inside = reach(level, player, null).seen;
    return level;
  }

  // Back to text - what the editor exports and what a link carries.
  function toText(level, boxes = level.boxes, player = level.player) {
    const onBox = new Uint8Array(level.width * level.height);
    for (const b of boxes) onBox[b] = 1;
    const rows = [];
    for (let y = 0; y < level.height; y++) {
      let row = "";
      for (let x = 0; x < level.width; x++) {
        const i = y * level.width + x;
        if (level.wall[i]) row += WALL;
        else if (i === player) row += level.goal[i] ? PLAYER_ON_GOAL : PLAYER;
        else if (onBox[i]) row += level.goal[i] ? BOX_ON_GOAL : BOX;
        else row += level.goal[i] ? GOAL : FLOOR;
      }
      rows.push(row.replace(/\s+$/, ""));
    }
    return rows.join("\n");
  }

  // Everywhere the player can walk from `from` without moving a box. Walls and
  // boxes block; the edge of the map doesn't, but walking off it is reported,
  // because a level the player can wander out of has a hole in its walls.
  function reach(level, from, boxAt) {
    const { width, height, wall } = level;
    const seen = new Uint8Array(width * height);
    const queue = [from];
    seen[from] = 1;
    let leaks = false;
    while (queue.length) {
      const i = queue.pop();
      const x = i % width;
      const y = (i - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) leaks = true;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (seen[n] || wall[n] || (boxAt && boxAt[n])) continue;
        seen[n] = 1;
        queue.push(n);
      }
    }
    return { seen, leaks };
  }

  // Is this level fit to play? Returns a list of problems, each one a sentence
  // a person can act on. An empty list means it's fine.
  function check(level) {
    const problems = [];
    const goals = level.goal.reduce((n, g) => n + g, 0);
    const boxes = level.boxes.length;

    if (!boxes) problems.push("It needs at least one box ($).");
    if (!goals) problems.push("It needs at least one goal (.).");
    if (boxes && goals && boxes !== goals) {
      problems.push(`It has ${boxes} box${boxes === 1 ? "" : "es"} and ${goals} goal${
        goals === 1 ? "" : "s"} - they have to match.`);
    }
    if (reach(level, level.player, null).leaks) {
      problems.push("The player can walk off the edge - close the walls round them.");
    }
    const stray = level.boxes.filter((b) => !level.inside[b]).length;
    if (stray) problems.push(`${stray} box${stray === 1 ? " is" : "es are"} somewhere the player can't get to.`);
    let lost = 0;
    for (let i = 0; i < level.goal.length; i++) if (level.goal[i] && !level.inside[i]) lost++;
    if (lost) problems.push(`${lost} goal${lost === 1 ? " is" : "s are"} somewhere the player can't get to.`);
    return problems;
  }

  // =========================================================================
  // 2. Playing
  // =========================================================================

  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const DIR = { up: 0, right: 1, down: 2, left: 3 };
  const DIR_NAMES = ["up", "right", "down", "left"];

  function start(level) {
    const boxAt = new Uint8Array(level.width * level.height);
    for (const b of level.boxes) boxAt[b] = 1;
    return {
      level,
      boxAt,
      player: level.player,
      facing: "down",
      moves: 0,
      pushes: 0,
      history: [],
    };
  }

  function step(level, i, dir) {
    const x = i % level.width;
    const y = (i - x) / level.width;
    const [dx, dy] = DIRS[dir];
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= level.width || ny >= level.height) return -1;
    return ny * level.width + nx;
  }

  // Tries a move. Returns what happened - or null if it was walked into a wall,
  // or into a box that had nowhere to go - so the caller can animate it.
  function move(game, dirName) {
    const dir = DIR[dirName];
    const { level, boxAt } = game;
    game.facing = dirName;

    const to = step(level, game.player, dir);
    if (to < 0 || level.wall[to]) return null;

    let boxFrom = -1;
    let boxTo = -1;
    if (boxAt[to]) {
      const beyond = step(level, to, dir);
      if (beyond < 0 || level.wall[beyond] || boxAt[beyond]) return null;
      boxFrom = to;
      boxTo = beyond;
      boxAt[boxFrom] = 0;
      boxAt[boxTo] = 1;
      game.pushes++;
    }

    const from = game.player;
    game.player = to;
    game.moves++;
    game.history.push({ from, to, boxFrom, boxTo, facing: dirName });
    return { from, to, boxFrom, boxTo };
  }

  function undo(game) {
    const last = game.history.pop();
    if (!last) return null;
    if (last.boxFrom !== -1) {
      game.boxAt[last.boxTo] = 0;
      game.boxAt[last.boxFrom] = 1;
      game.pushes--;
    }
    game.player = last.from;
    game.moves--;
    const before = game.history[game.history.length - 1];
    game.facing = before ? before.facing : "down";
    // reported backwards, so it can be animated the same way as a move
    return { from: last.to, to: last.from, boxFrom: last.boxTo, boxTo: last.boxFrom };
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
  // character written as a count and the character, and floor written "-" so
  // nothing gets lost to spaces. "#####|#@$.#|#####" becomes "5#|#@$.#|5#".
  // This is the run-length format other Sokoban programs use too.

  function encode(text) {
    return rowsOf(text).map((row) => row.replace(/\s+$/, "").replace(/ /g, "-")
      .replace(/(.)\1+/g, (run, ch) => `${run.length}${ch}`)).join("|");
  }

  function decode(code) {
    const rows = [""];
    let count = "";
    for (const ch of String(code)) {
      if (ch >= "0" && ch <= "9") { count += ch; continue; }
      if (ch === "|") { rows.push(""); count = ""; continue; }
      const n = count ? Math.min(Number(count), 200) : 1;
      rows[rows.length - 1] += (ch === "-" || ch === "_" ? FLOOR : ch).repeat(n);
      count = "";
    }
    return rows.join("\n");
  }

  // =========================================================================
  // 4. Solving
  // =========================================================================
  //
  // A breadth-first search over pushes, so the first solution it finds uses as
  // few pushes as possible. A state is where the boxes are plus which patch of
  // floor the player is standing in - the exact square doesn't matter, only
  // which boxes they can get behind.
  //
  // Two things keep it quick enough to run in the editor. Squares a box could
  // never be pushed from onto any goal - most corners, most of the floor along
  // a wall - are worked out first and never pushed onto. And it gives up after
  // `budget` states and says it doesn't know, rather than freezing the page on
  // a level too big to search.

  function deadSquares(level) {
    const { width, height, wall, goal } = level;
    const live = new Uint8Array(width * height);
    // pull every goal backwards: anywhere a box can be pulled to is somewhere
    // it could have been pushed from
    const queue = [];
    for (let i = 0; i < goal.length; i++) if (goal[i]) { live[i] = 1; queue.push(i); }
    while (queue.length) {
      const i = queue.pop();
      for (let d = 0; d < 4; d++) {
        const to = step(level, i, d);           // where the box is pulled to
        if (to < 0 || wall[to] || live[to]) continue;
        const stand = step(level, to, d);       // where the puller stands
        if (stand < 0 || wall[stand]) continue;
        live[to] = 1;
        queue.push(to);
      }
    }
    const dead = new Uint8Array(width * height);
    for (let i = 0; i < dead.length; i++) dead[i] = wall[i] || !live[i] ? 1 : 0;
    return dead;
  }

  function solve(level, budget = 200000) {
    if (check(level).length) return { result: "broken" };
    const dead = deadSquares(level);
    if (level.boxes.some((b) => dead[b] && !level.goal[b])) return { result: "impossible", searched: 0 };

    const size = level.width * level.height;
    const keyOf = (boxes, zone) => `${zone}:${boxes.join(",")}`;

    // the lowest-numbered square the player can reach stands for the whole patch
    function zoneOf(player, boxAt) {
      const { seen } = reach(level, player, boxAt);
      for (let i = 0; i < size; i++) if (seen[i]) return { zone: i, seen };
      return { zone: player, seen };
    }

    const startBoxes = level.boxes.slice().sort((a, b) => a - b);
    const startAt = new Uint8Array(size);
    for (const b of startBoxes) startAt[b] = 1;
    const first = zoneOf(level.player, startAt);

    const seenStates = new Set([keyOf(startBoxes, first.zone)]);
    let frontier = [{ boxes: startBoxes, player: level.player }];
    let searched = 0;
    let pushes = 0;

    const isSolved = (boxes) => boxes.every((b) => level.goal[b]);
    if (isSolved(startBoxes)) return { result: "solved", pushes: 0, searched: 1 };

    while (frontier.length) {
      pushes++;
      const next = [];
      for (const state of frontier) {
        const boxAt = new Uint8Array(size);
        for (const b of state.boxes) boxAt[b] = 1;
        const { seen } = reach(level, state.player, boxAt);

        for (let n = 0; n < state.boxes.length; n++) {
          const box = state.boxes[n];
          for (let d = 0; d < 4; d++) {
            const behind = step(level, box, (d + 2) % 4);
            const ahead = step(level, box, d);
            if (behind < 0 || ahead < 0 || !seen[behind]) continue;
            if (level.wall[ahead] || boxAt[ahead] || dead[ahead]) continue;

            const boxes = state.boxes.slice();
            boxes[n] = ahead;
            boxes.sort((a, b) => a - b);
            const after = new Uint8Array(size);
            for (const b of boxes) after[b] = 1;
            const { zone } = zoneOf(box, after);
            const key = keyOf(boxes, zone);
            if (seenStates.has(key)) continue;
            seenStates.add(key);

            if (isSolved(boxes)) return { result: "solved", pushes, searched };
            if (++searched >= budget) return { result: "unknown", searched };
            next.push({ boxes, player: box });
          }
        }
      }
      frontier = next;
    }
    return { result: "impossible", searched };
  }

  return {
    WALL, FLOOR, GOAL, BOX, BOX_ON_GOAL, PLAYER, PLAYER_ON_GOAL, DIR_NAMES,
    rowsOf, parse, toText, check, start, move, undo, solved, encode, decode, solve,
  };
})();
