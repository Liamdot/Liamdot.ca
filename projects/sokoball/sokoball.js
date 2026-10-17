// Sokoball: the rules, and nothing else. No drawing and no page in here, so the
// game, the level editor and the solver all agree on what a level is and what
// a move does.
//
//   1. Levels on paper  - the text format, and turning it into a level
//   2. Playing          - moves, undo, and knowing when it's solved
//   3. The map          - the campaign's map, its doors and its locked balls
//   4. Short codes      - squashing a level small enough to put in a link
//   5. Solving          - finding out whether a level can be done at all
//
// Levels are written in the usual Sokoban text format, the one thousands of
// existing levels are already in, so anything you find online pastes straight
// in:
//
//   #  wall          @  player          $  ball          .  goal
//   -  floor         +  player on goal  *  ball on goal   !  finish
//   ^  hole
//
// Goals and holes are both holes in the floor. A ball pushed or rolled into
// one drops in and is gone, and the hole becomes floor anyone can walk on.
// Until then a player can't step into it. Goals are the holes that have to be
// filled; plain holes (^, Sokoball's own) are only in the way. A ball or a player
// "on a goal" (* and +) means that goal starts filled - which keeps levels from
// other Sokoban programs working, since each of their boxes fills a goal.
//
// A space is floor too. The edge of the level is as solid as a wall, so a
// level doesn't need walling in - but floor right at the start or end of a
// row has to be written "-", or it would be taken for indentation or trimmed
// off as trailing space.
//
// There can be any number of players, and they all move together.
//
// A level is won by filling every goal and then getting every player onto a
// finish - one finish each, so a level needs at least as many finishes as
// players. There can be spare balls, but never more goals than balls.
// Finishes stay shut until every goal is filled. A ball can be pushed onto
// anything a player can walk on, finishes included - so a ball left on a
// finish blocks it until it's moved.

const SOKOBALL = (() => {
  // =========================================================================
  // 1. Levels on paper
  // =========================================================================

  const WALL = "#";
  const FLOOR = " ";
  const GOAL = ".";
  const BALL = "$";
  const BALL_ON_GOAL = "*";
  const PLAYER = "@";
  const PLAYER_ON_GOAL = "+";
  const FINISH = "!";
  const HOLE = "^";

  const KNOWN = new Set([WALL, FLOOR, GOAL, BALL, BALL_ON_GOAL, PLAYER, PLAYER_ON_GOAL, FINISH, HOLE]);

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
  //   wall[i], goal[i],
  //   finish[i]         - the fixed parts of the map. goal[i] marks a goal
  //                       whether it starts open or filled
  //   hole[i]           - the holes open at the start, goals and plain holes
  //                       alike. Which are still open is part of the game,
  //                       not the level: see start()
  //   inside[i]         - floor some player can reach; anything else is the
  //                       dark outside, and isn't drawn as floor
  //   balls, players    - where each starts
  //
  // Throws with a plain explanation if the text isn't a level at all. Whether
  // it's a fair one is check()'s business, further down.
  function parse(text) {
    const rows = rowsOf(text);
    if (!rows.length) throw new Error("The level is empty.");

    const height = rows.length;
    const width = rows[0].length;
    const size = width * height;
    const wall = new Uint8Array(size);
    const goal = new Uint8Array(size);
    const hole = new Uint8Array(size);
    const finish = new Uint8Array(size);
    const balls = [];
    const players = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const ch = rows[y][x];
        const i = y * width + x;
        if (!KNOWN.has(ch)) throw new Error(`Unknown character "${ch}" on row ${y + 1}.`);
        if (ch === WALL) wall[i] = 1;
        if (ch === FINISH) finish[i] = 1;
        if (ch === GOAL || ch === BALL_ON_GOAL || ch === PLAYER_ON_GOAL) goal[i] = 1;
        if (ch === GOAL || ch === HOLE) hole[i] = 1;
        if (ch === BALL) balls.push(i);
        if (ch === PLAYER || ch === PLAYER_ON_GOAL) players.push(i);
      }
    }

    const level = { width, height, wall, goal, hole, finish, balls, players };
    level.inside = reach(level, players);
    return level;
  }

  function toText(level, balls = level.balls, players = level.players, holes = level.hole) {
    const onBall = new Uint8Array(level.width * level.height);
    const onPlayer = new Uint8Array(level.width * level.height);
    for (const b of balls) onBall[b] = 1;
    for (const p of players) onPlayer[p] = 1;
    const rows = [];
    for (let y = 0; y < level.height; y++) {
      let row = "";
      for (let x = 0; x < level.width; x++) {
        const i = y * level.width + x;
        if (level.wall[i]) row += WALL;
        else if (onPlayer[i]) row += level.goal[i] ? PLAYER_ON_GOAL : PLAYER;
        else if (holes[i]) row += level.goal[i] ? GOAL : HOLE;
        else if (onBall[i]) row += BALL;
        else if (level.finish[i]) row += FINISH;
        else row += level.goal[i] ? BALL_ON_GOAL : FLOOR;
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

  // Everywhere the players can walk to, ignoring balls.
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

  // Is this level fit to play? A list of problems, each a plain sentence to
  // show under the editor. Empty means it's fine.
  function check(level) {
    const problems = [];
    // only the goals still to fill - one that starts filled needs nothing
    let goals = 0;
    for (let i = 0; i < level.goal.length; i++) if (level.goal[i] && level.hole[i]) goals++;
    const balls = level.balls.length;

    if (!level.players.length) problems.push("The level needs at least one player.");
    if (!level.finish.some((f) => f)) problems.push("The level needs a finish.");
    // Balls and goals are optional - with no goals the finish is open from the
    // start - but every goal there is needs a ball to fill it.
    if (goals > balls) {
      const have = balls === 0 ? "no balls" : balls === 1 ? "only 1 ball" : `only ${balls} balls`;
      problems.push(`The level has ${goals} goal${goals === 1 ? "" : "s"} but ${have}. Every goal needs a ball.`);
    }
    if (level.players.length) {
      const stray = level.balls.filter((b) => !level.inside[b]).length;
      if (stray) problems.push(`${stray} ball${stray === 1 ? " can't" : "s can't"} be reached by any player.`);
      let lost = 0;
      for (let i = 0; i < level.goal.length; i++) if (level.goal[i] && level.hole[i] && !level.inside[i]) lost++;
      if (lost) problems.push(`${lost} goal${lost === 1 ? " can't" : "s can't"} be reached by any player.`);
      const finishes = level.finish.reduce((n, f) => n + f, 0);
      const players = level.players.length;
      let reachable = 0;
      for (let i = 0; i < level.finish.length; i++) if (level.finish[i] && level.inside[i]) reachable++;
      if (finishes && finishes < players) {
        problems.push(`The level has ${players} players but ${finishes} finish${
          finishes === 1 ? "" : "es"}. Every player needs one to stand on.`);
      } else if (finishes && reachable < players) {
        problems.push(players === 1
          ? "The finish can't be reached by the player."
          : `Only ${reachable} finish${reachable === 1 ? "" : "es"} can be reached by the players, and every player needs one.`);
      }
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
  // player in front who didn't move - stays put, and the rest carry on without
  // them. Anywhere a player can walk, a ball can be pushed: finishes, and doors
  // on the map, are floor as far as moving goes.
  //
  // Walking into a ball with room behind it pushes it one square. Walking into
  // a ball with something behind it - another ball, a player - strikes it
  // instead, like a Newton's cradle: you and the ball stay put, and whatever's
  // at the far end of the row goes rolling (see strike). So does walking into
  // a player stuck in a hole.
  //
  // Holes: a ball that goes into an open hole drops in and fills it (see
  // fall). A player that goes into one is stuck there - it doesn't fill it, and
  // it stays put while the others move, until something knocks it out. A
  // player is stuck exactly when it's standing on an open hole, so there's
  // nothing extra to keep track of.
  //
  // Changes `players`, `ballAt` and `holes` in place and says what moved, or
  // returns null if nothing did:
  //   players  [from, to] for each player that moved
  //   balls    [from, to] for each ball, with a third `true` if it fell into
  //            the hole at `to`
  //   chain    every movement in the order it happened, for drawing: each is
  //            { ball, from, to, wave }, where wave 0 is the step everyone
  //            takes and wave 1, 2, ... are the knocks of a chain reaction
  // Both the game and the solver go through this, so they can never disagree
  // about what a move does.
  function moveAll(level, players, ballAt, holes, dir) {
    const [dx, dy] = DIRS[dir];
    const along = (i) => (i % level.width) * dx + Math.floor(i / level.width) * dy;
    const order = players.map((_, n) => n).sort((a, b) => along(players[b]) - along(players[a]));
    const playerAt = new Map(players.map((p, n) => [p, n]));
    const knocked = new Set();               // players already sent flying this turn
    const moved = [];
    const pushed = [];
    const chain = [];

    const solid = (i) => i < 0 || level.wall[i];
    const thing = (i) => i >= 0 && (ballAt[i] || playerAt.has(i));

    // moves whatever is at `from` - a ball drops into an open hole at `to`;
    // a player in one is stuck there
    const shift = (from, to, wave) => {
      if (ballAt[from]) {
        const ball = fall(ballAt, holes, from, to);
        pushed.push(ball);
        chain.push({ ball: true, from, to, wave });
      } else {
        const n = playerAt.get(from);
        playerAt.delete(from);
        playerAt.set(to, n);
        players[n] = to;
        if (wave) knocked.add(n);
        moved.push([from, to]);
        chain.push({ ball: false, from, to, wave });
      }
    };

    // The thing at `first` is struck from behind. The knock passes along any
    // row of things touching it to the last one, which rolls on until the
    // next square is a wall or the edge, or until it drops into an empty hole.
    // If what stops it is another ball or player, that one is struck in turn,
    // and so on down the line.
    const strike = (first) => {
      let at = first;
      for (let wave = 1; ; wave++) {
        let last = at;
        while (thing(step(level, last, dir))) last = step(level, last, dir);
        let to = step(level, last, dir);
        if (solid(to)) return;               // the row is up against a wall
        while (!holes[to]) {
          const next = step(level, to, dir);
          if (solid(next) || thing(next)) break;
          to = next;
        }
        const dropped = holes[to];
        shift(last, to, wave);
        const next = step(level, to, dir);
        if (dropped || !thing(next)) return;
        at = next;                           // it hit something: that rolls next
      }
    };

    for (const n of order) {
      if (knocked.has(n)) continue;
      const from = players[n];
      if (holes[from]) continue;               // stuck in a hole
      const to = step(level, from, dir);
      if (solid(to)) continue;
      if (playerAt.has(to)) {
        // a stuck player gets knocked out; one standing on floor just blocks
        if (holes[to]) strike(to);
        continue;
      }
      if (ballAt[to]) {
        const beyond = step(level, to, dir);
        if (solid(beyond)) continue;
        if (thing(beyond)) {
          strike(to);                          // the cradle: you stay put
          continue;
        }
        shift(to, beyond, 0);                  // an ordinary push: one square
      }
      playerAt.delete(from);
      playerAt.set(to, n);
      players[n] = to;
      moved.push([from, to]);
      chain.push({ ball: false, from, to, wave: 0 });
    }
    return chain.length ? { players: moved, balls: pushed, chain } : null;
  }

  // Moves a ball. If it lands on an open hole it drops in: the ball is gone
  // and the hole is filled, floor from now on.
  function fall(ballAt, holes, from, to) {
    ballAt[from] = 0;
    if (holes[to]) {
      holes[to] = 0;
      return [from, to, true];
    }
    ballAt[to] = 1;
    return [from, to];
  }

  function start(level) {
    const ballAt = new Uint8Array(level.width * level.height);
    for (const b of level.balls) ballAt[b] = 1;
    return {
      level, ballAt, holes: level.hole.slice(), players: level.players.slice(), facing: "down", history: [],
    };
  }

  // Tries a move: what moved, or null if nobody could. Either way everyone turns
  // to face the way that was pressed.
  function move(game, dirName) {
    game.facing = dirName;
    const before = game.players.slice();
    const change = moveAll(game.level, game.players, game.ballAt, game.holes, DIR[dirName]);
    if (change) game.history.push({ players: before, balls: change.balls, facing: dirName });
    return change;
  }

  // Puts the last move back - a ball that fell in climbs back out, and its
  // hole opens again.
  function undo(game) {
    const last = game.history.pop();
    if (!last) return false;
    for (const [from, to, fell] of last.balls.slice().reverse()) {
      if (fell) game.holes[to] = 1;
      else game.ballAt[to] = 0;
      game.ballAt[from] = 1;
    }
    game.players = last.players;
    const before = game.history[game.history.length - 1];
    game.facing = before ? before.facing : "down";
    return true;
  }

  // Every goal is filled, which is what opens the finish. `holes` is a list of
  // the holes still open; plain holes left open don't matter.
  function goalsFilled(level, holes) {
    return holes.every((h) => !level.goal[h]);
  }

  // The level is won once the finishes are open and every player is standing
  // on one. The game and the solver both ask this, so they agree on what
  // winning is.
  function won(level, players, holes) {
    return goalsFilled(level, holes) && players.every((p) => level.finish[p]);
  }

  const openHoles = (game) => {
    const list = [];
    for (let i = 0; i < game.holes.length; i++) if (game.holes[i]) list.push(i);
    return list;
  };

  function finishOpen(game) {
    return goalsFilled(game.level, openHoles(game));
  }

  function solved(game) {
    return won(game.level, game.players, openHoles(game));
  }

  // Every player is stuck in a hole, so nobody can move again. Only undo or
  // restart can help.
  function stuck(game) {
    return game.players.every((p) => game.holes[p]);
  }

  // =========================================================================
  // 3. The map
  // =========================================================================
  //
  // The campaign is played from a map you walk round. It's the same kind of
  // text as a level, with two more kinds of character:
  //
  //   A to Z   the door to a level: A is the first in levels.js, B the second...
  //   a to z   a ball that's locked in place until the level with the same
  //            letter is solved - "b" comes free when level B is done
  //
  // plus #, floor, @ for where you start, and $ for a ball that's free from the
  // start. Locked balls are what keep the next door shut: solving a level frees
  // its balls, and you push them out of the way to get on. A ball can be pushed
  // onto a door like anywhere else, and then has to be moved off it again
  // before the door can be used.

  function parseWorld(text) {
    const rows = rowsOf(text);
    if (!rows.length) throw new Error("The map is empty.");
    const height = rows.length;
    const width = rows[0].length;
    const size = width * height;
    const wall = new Uint8Array(size);
    const doors = new Map();        // square -> level number, counting from 0
    const locks = new Map();        // level number -> the squares of its locked balls
    const balls = [];
    let start = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const ch = rows[y][x];
        const i = y * width + x;
        if (ch === WALL) wall[i] = 1;
        else if (ch === PLAYER) start = i;
        else if (ch === BALL) balls.push(i);
        else if (ch >= "A" && ch <= "Z") doors.set(i, ch.charCodeAt(0) - 65);
        else if (ch >= "a" && ch <= "z") {
          const n = ch.charCodeAt(0) - 97;
          if (!locks.has(n)) locks.set(n, []);
          locks.get(n).push(i);
        } else if (ch !== FLOOR) throw new Error(`Unknown character "${ch}" on row ${y + 1} of the map.`);
      }
    }
    if (start < 0) throw new Error("The map needs a @ to start from.");

    // everything walkable, as if every ball were free, so the whole map is drawn
    // from the start rather than only the part you can get to yet
    const inside = reach({ width, height, wall }, [start]);
    return { width, height, wall, doors, locks, balls, start, inside };
  }

  // The map as a level to walk round, with the balls of every level in
  // `solved` (a Set of level numbers) let loose. Locked balls stand as walls.
  // Doors go in `finish` too, though nothing about moving treats them differently.
  function worldLevel(world, solved) {
    const size = world.width * world.height;
    const wall = world.wall.slice();
    const locked = new Uint8Array(size);
    const finish = new Uint8Array(size);
    const balls = world.balls.slice();
    for (const [n, squares] of world.locks) {
      for (const i of squares) {
        if (solved.has(n)) balls.push(i);
        else {
          wall[i] = 1;
          locked[i] = 1;
        }
      }
    }
    for (const i of world.doors.keys()) finish[i] = 1;
    return {
      width: world.width, height: world.height, wall, locked, finish, balls,
      goal: new Uint8Array(size), hole: new Uint8Array(size), players: [world.start],
      inside: world.inside, doors: world.doors,
    };
  }

  // =========================================================================
  // 4. Short codes
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
  // 5. Solving
  // =========================================================================
  //
  // Tries every sequence of moves, shortest first, until the level is won -
  // so if it finds a way, it's the shortest way.
  //
  // It knows nothing about the rules. It just calls moveAll, the same as the
  // game does, and remembers which arrangements of players and balls it has
  // already seen. So a new mechanic - ice, things that pull, anything -
  // is checked correctly the moment moveAll does it, with nothing changed
  // here. The price is that it can't take shortcuts a rules-aware solver
  // could, so it gives up sooner on big levels. When it runs out of `budget`
  // it says it doesn't know, rather than freezing the page.

  function solve(level, budget = 250000) {
    if (check(level).length) return { result: "broken" };

    const size = level.width * level.height;
    const ballAt = new Uint8Array(size);              // reused for every try
    const holeAt = new Uint8Array(size);              // and this
    const sorted = (list) => list.slice().sort((a, b) => a - b);
    // which holes are still open is part of where you are: the same balls in
    // the same places with a different hole filled is a different position
    const keyOf = (players, balls, holes) => `${sorted(players).join(",")}|${balls.join(",")}|${holes.join(",")}`;
    const startHoles = [];
    for (let i = 0; i < size; i++) if (level.hole[i]) startHoles.push(i);
    const first = { players: level.players.slice(), balls: sorted(level.balls), holes: startHoles };
    if (won(level, first.players, first.holes)) return { result: "solved", moves: 0, searched: 0 };

    const seen = new Set([keyOf(first.players, first.balls, first.holes)]);
    let frontier = [first];
    let moves = 0;
    let searched = 0;

    while (frontier.length) {
      moves++;
      const next = [];
      for (const state of frontier) {
        for (let d = 0; d < 4; d++) {
          for (const b of state.balls) ballAt[b] = 1;
          for (const h of state.holes) holeAt[h] = 1;
          const players = state.players.slice();
          const change = moveAll(level, players, ballAt, holeAt, d);
          for (const b of state.balls) ballAt[b] = 0;
          for (const h of state.holes) holeAt[h] = 0;
          if (change) for (const [, to] of change.balls) ballAt[to] = 0;
          if (!change) continue;

          let balls = state.balls;
          let holes = state.holes;
          if (change.balls.length) {
            balls = state.balls.slice();
            for (const [from, to, fell] of change.balls) {
              const at = balls.indexOf(from);
              if (fell) {
                balls.splice(at, 1);
                holes = holes.filter((h) => h !== to);
              } else balls[at] = to;
            }
            balls.sort((a, b) => a - b);
          }
          const key = keyOf(players, balls, holes);
          if (seen.has(key)) continue;
          seen.add(key);

          if (won(level, players, holes)) return { result: "solved", moves, searched };
          if (++searched >= budget) return { result: "unknown", searched };
          next.push({ players, balls, holes });
        }
      }
      frontier = next;
    }
    return { result: "impossible", searched };
  }

  return {
    WALL, FLOOR, GOAL, BALL, BALL_ON_GOAL, PLAYER, PLAYER_ON_GOAL, FINISH, HOLE,
    rowsOf, writeRows, parse, toText, check, start, move, undo, solved, stuck, finishOpen, encode, decode, solve,
    parseWorld, worldLevel,
  };
})();
