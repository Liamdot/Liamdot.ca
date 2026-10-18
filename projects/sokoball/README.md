# Sokoball — how to work on it

Sokoball is a pushing puzzle in the Sokoban mould: fill every goal with a ball,
and never pull. Goals are holes in the floor. A ball pushed into one drops in
and is gone, and the filled hole is floor you can walk on. Plain holes work
the same way but don't need filling — they're only in the way. Push a ball
into another ball and it works like a Newton's cradle — the one you pushed
stays put and the far one rolls away until it hits something, which it stops
against, or drops into a hole. Filling every goal opens the finishes, and the level is
won as soon as any one player is standing on one. A player stuck in a goal
counts as filling it, for as long as they stay there — so with several
players, one can be left behind in a goal while another walks to the finish.

A level can have any number of players, and every press moves all of them the
same way at once. A player who walks into an open hole is stuck in it. Walking
into a stuck player knocks them out, and so does pushing a ball that's
touching them: they roll until they hit something or drop into another hole.
A player standing on the floor is never knocked about.

Grates can only be crossed at speed. Anything rolling — a cradle shot, or a
player knocked out of a hole — passes straight over. But a player who walks
onto one, a ball pushed onto one, or anything whose roll stops on one falls
through and is gone. If every player is stuck or gone, it's over until you
undo or restart.

There can be spare balls, but never more goals than balls. A ball can be pushed anywhere a player
can walk, finishes and doors included. The edge of a level is as solid as a
wall.

The campaign is a map you walk round. Each level is a door on it, and
solving a level frees the balls that block the way to the next door. It ships
with eight levels, a level editor that can tell you whether a level is
solvable, and share links that carry a whole level in the URL.

This file is the plan for taking it from here: where things live, how to put
your own art in, how to make levels, how sharing works, and what's worth
building next.

---

## 1. Where everything is

```
projects/sokoball/
  index.html    the page: bar, board, editor panel, info panel
  style.css     how it looks
  sokoball.js   THE RULES - levels, moves, undo, share codes, the solver
  solver.js     runs the solver in the background so the page doesn't freeze
  assets.js     which picture is drawn for what   <- edit this for your art
  levels.js     the built-in levels, and the map  <- edit this for levels
  app.js        everything on screen: drawing, input, editor, sharing
  assets/
    dev/        the developer art - plain on purpose, always kept
    mine/       your art goes here
  README.md     this
```

The split that matters: **`sokoball.js` knows nothing about the screen**, and
`app.js` knows nothing about the rules beyond calling `sokoball.js`. If you change
how the game *plays*, it's `sokoball.js`. If you change how it *looks or behaves
on screen*, it's `app.js` and `style.css`.

## 2. Running it on your own computer

From the root of the site:

```bash
python3 serve.py
```

then open <http://localhost:8123/projects/sokoball/>.

Use `serve.py` rather than `python3 -m http.server`. It tells the browser
never to cache, so a change shows up on a normal reload. Plenty of "it's
broken" moments on this site turned out to be the browser serving yesterday's
file.

## 3. Using your own art

Everything is drawn with the developer art in `assets/dev/` until you say
otherwise. You can replace it **one picture at a time** — anything you
haven't made yet keeps using the developer version, so you can see each new
picture in the game as soon as it's done.

### The pictures

| name in `assets.js` | what it is | notes |
|---|---|---|
| `floor` | open floor | drawn under everything else on the floor |
| `wall` | a wall | |
| `goal` | a hole that has to be filled | **drawn on top of the floor, so leave its corners transparent** |
| `goalFilled` | a goal a ball has dropped into | should look finished — it's how you know you're done |
| `hole` | a plain hole, only in the way | same |
| `holeFilled` | a plain hole a ball has dropped into | it's floor now, so it should look walkable |
| `grate` | a grate: roll across it, or fall through | drawn on top of the floor |
| `grateOpen` | the drop under a grate, shown while it's open | when something falls through, the grate splits down the middle and each half swings down into this on a hinge at its outer edge |
| `ball` | a ball | |
| `player` | the player | every player uses it |
| `finish` | a finish while it's shut | a goal still needs filling. **Transparent background** |
| `finishOpen` | a finish that's open | stand on it to win. **Transparent background** |
| `door` | a level's door on the map | its number is drawn on top, so keep the middle plain |
| `doorDone` | the door of a level you've solved | same |
| `ballLocked` | a ball on the map that hasn't been freed yet | should look stuck |
| `playerUp` `playerDown` `playerLeft` `playerRight` | optional | if present, the players turn to face the way they moved |

Square pictures, any size; **64 × 64 is plenty**. PNG, SVG, JPG and WebP all
work. They're drawn as square tiles that fill the grid, so whatever is in the
picture is what you see — no padding is added.

### Step by step

1. Draw your picture and save it into `assets/mine/` — say
   `assets/mine/ball.png`.
2. In `assets.js`, under `mine`, uncomment the matching line so it points at
   your file:
   ```js
   mine: {
     ball: "assets/mine/ball.png",
   },
   ```
3. At the top of `assets.js`, set `use` to `"mine"`:
   ```js
   use: "mine",
   ```
4. Reload. Your ball is in; everything else is still the developer art.
5. Repeat for the rest, in any order.

If a picture doesn't appear, open the browser console: Sokoball says which file
it couldn't load and that it fell back to the developer art.

### Three settings worth knowing

- **`pixelated: true`** — set this if your art is pixel art. It's scaled up
  with hard edges instead of being blurred.
- **`edge`** — the colour of the solid border drawn where floor runs right up
  to the edge of a level. It's a colour, not a picture: match it to your wall.
- **`version`** — bump it (1 → 2) whenever you *replace* a picture but keep
  its file name. Browsers keep images for a few hours, so without it people
  would go on seeing the old one. New file names don't need it.

The developer art is never deleted. If you ever want it back, set `use` back
to `"dev"`.

## 4. Making levels

### In the game

Press **make**. You get a grid and eight tools:

- **wall**, **floor**, **goal**, **hole**, **grate**, **ball**, **player**,
  **finish** — click to paint, drag to paint a run. Players go down one click
  at a time, as many as you like. Right-click paints floor, which is how you
  rub things out.
- Keys **1–8** pick the tools.
- A level needs at least one finish a player can reach, and enough balls and
  players to fill every goal with one player left over to reach the finish. Spare balls are fine — they make a good red
  herring. Balls and goals are optional: with no goals, the finishes are open
  from the start and the level is just about getting there.
- **wide** and **tall** resize the grid (3 to 30 each way). What's there
  stays put; new squares are floor.
- **The edge is solid.** There's no need to build a wall round the outside —
  walls are only for the inside of a level.

Under the tools, Sokoball tells you what's wrong with the level as you go — no
player, more goals than balls, too few finishes, or balls, goals or finishes no
player can reach.

When it's playable:

- **check** tries every way of playing it and tells you whether it can be
  solved at all, and how long the shortest solution is. Press it every time.
  A ball against a wall can only ever slide along that wall, and a ball in a
  corner never moves again — it's very easy to build a level that looks fine
  and can't be done. Of the harder levels I sketched by hand while building
  this, four in seven couldn't be solved.

  It runs in the background, so a big level can take a few seconds without
  the page freezing. On a really big or open level it may give up and say the
  puzzle is too large to check — that doesn't mean it's broken, just that
  you'll have to test it yourself.
- **test** plays it. **back to editor** comes back.
- **save to my levels** saves it to *My levels* (under **my levels** in
  play mode), in this browser. Editing a saved level and saving again updates it
  rather than making a copy.

What's in the editor is saved as you go, so closing the tab loses nothing.

### Making one a built-in level

1. In the editor, press **copy as text**.
2. Open `levels.js` and add a new entry where you want it in the order:
   ```js
   {
     name: "Your level",
     map: `
       -------
       -@-$-.-
       -------
     `,
   },
   ```
3. Paste the text between the backticks. Indentation doesn't matter.
4. Give it a door on the map (next section). Its letter is its place in the
   list: the first level is `A`, the ninth is `I`.

### The map

The map is `WORLD`, at the bottom of `levels.js`. It's drawn in the same text
as a level, with two extra kinds of character:

| character | means |
|---|---|
| `A` to `Z` | the door to a level — `A` is the first in `LEVELS`, `B` the second |
| `a` to `z` | a ball locked in place until the level with the same letter is solved |
| `#` `@` `$` | wall, where you start, and a ball that's free from the start |

The idea is that each level's balls sit in the gaps between rooms, so the way
to the next door stays shut until you've solved the level before it. Once a
ball is free you push it out of the way. **restart** on the map puts every ball
back where it started, in case one gets pushed somewhere it blocks you.

Two traps when you redraw it, both of which I walked into making this one:

- **Balls can be pushed onto doors.** A door straight in line with a gap is
  easy to bury under the ball that came through it. Put doors off to one side
  of any gap.
- **Every gap needs its ball.** An open gap, even one square, is a way round.

The letters cap the campaign at 26 levels. If it ever needs more, that's a
change to `parseWorld` in `sokoball.js`.

Rooms you haven't walked into yet aren't shown at all — just the background.
Step into one and its squares flip over into view, rippling out from where
you came in, with its walls and gaps turning alongside. Nothing in the map marks the rooms: they're the open areas between
gaps, and a gap is a single open square in a wall with wall at least two deep
on either side of it. So a gap through an ordinary wall splits two rooms, but
a corridor between two short bits of wall inside a room — like the grate row
in room 3 — doesn't. If the fog ever splits a room you meant as one, that's
the rule to look at (`roomsOf` in `sokoball.js`). The flipping is `drawFog`
in `app.js`: `FLIP_MS` is how long one square takes to turn, and `FLIP_STEP`
how much later each square further out starts.

The same rooms steer the camera: on the map it centres on the room you're in
and pans to the next one as you step into it, stopping at the map's edges.
The zoom is set once for the whole map, far enough out to see your room and a
whole room either side of it. That's
`follow` in `app.js`, and `PAN_MS` is how long a pan takes.

Where you are on the map, where you've pushed things and which rooms you've
seen are saved. Change the map and everyone's balls go back to where they
started and the fog comes back (solved levels stay solved).

### The text format

Levels are plain text, in the format other Sokoban programs use — so you can
also paste in levels you find elsewhere, with **paste a level**.

| character | means |
|---|---|
| `#` | wall |
| `-` or space | floor (`_` works too) |
| `.` | goal — a hole that has to be filled |
| `^` | a plain hole (Sokoball's own) |
| `=` | a grate (Sokoball's own too) |
| `$` | ball |
| `*` | a goal that starts filled (a "box on a goal" anywhere else) |
| `@` | a player — as many as you like |
| `+` | a player standing on a goal that starts filled |
| `!` | a finish (Sokoball's own too; other programs won't know it) |

Levels from other Sokoban programs still work: each of their boxes fills a
goal, so the counts come out the same. What changes is that a box can no
longer be pushed *across* a goal on its way somewhere else — it drops into the
first one it reaches — and nobody can walk over an empty goal. Some of them
won't be solvable any more; **check** will say.

One thing to watch: **floor at the very start or end of a row must be `-`,
not a space.** Spaces there get trimmed — they look like indentation, or like
trailing space — and the level would shrink. **copy as text** always writes
them as `-` for you, so this only matters if you're typing a level by hand.

### A tip for hard levels

Design **backwards**: start from the finished level, with every goal filled,
and imagine lifting a ball out of the last goal and pulling it back the way it
came. Anywhere you can pull a ball to, it can be pushed back from. Holes make
this harder to do in your head than it was with boxes — a lifted ball reopens
its hole, and the open hole blocks the way you just walked — so lean on
**check** and test as you go.

Holes are where the interesting levels are. Each plain hole costs a ball to
cross, so the question becomes which balls to spend and where. The cradle sends
a ball into the first hole in its path, which means a row of holes has to be
filled nearest-first, and it lets you fill a hole you can't get next to.

## 5. Sharing levels

**share** (in the editor, or next to any of your levels) gives you a link
like:

```
https://liamdot.ca/projects/sokoball/#n=Wall+flower&l=9%23%7C%237-%23%7C...
```

The whole level is in that link — its name, and the level squashed down with
run-length encoding (`#####` becomes `5#`). Opening it plays the level
straight away, and the person can **save to my levels** to keep a copy. Pasting a
share link into **paste a level** opens it in the editor instead.

Nothing goes to a server. That's deliberate: there's no database to look
after, no cost, and nothing anyone can fill with rubbish under your name —
a link is only ever seen by whoever it's given to. A typical level makes a
link of 100–300 characters, and even a full 30 × 30 grid stays far inside
what browsers accept.

What it doesn't do is give you a public list of everyone's levels. That's the
biggest thing on the roadmap.

## 6. Changing how it plays

Everything about movement is in **one function in `sokoball.js`: `moveAll`**. It
takes every player and one direction, and decides who moves, who gets stuck
and which balls get pushed. Want ice that keeps you sliding, balls that can be
pulled, players that only move on alternate turns? It's there.

The Newton's cradle is `strike`, inside `moveAll`: what gets knocked and how
far it rolls. Anything rolling stops against a wall, the edge, a ball or a
player, or drops into the first open hole. I tried letting whatever it hits
roll on in turn (chain reactions) and took it out again: rolls that only stop
at walls leave far fewer places to park a ball, and parking balls as
backstops is where the puzzles are. What happens when a ball reaches a hole is
`fall`, just under it. How long a roll takes on screen is `ROLL_MS` in
`app.js`; how long a grate takes to open and drop something through is
`DROP_MS`, and to swing shut again `SHUT_MS`.

How fast holding a direction walks is set near the top of section 8 of
`app.js`: `HOLD_PAUSE` is how long a press waits before it starts repeating
(so a tap is only ever one step), and `HOLD_EVERY` is the time between steps
after that. Keep `HOLD_EVERY` a little longer than `ANIM_MS`, so each step
finishes sliding before the next begins.

Around it:

- **`won`** — what counts as finished: every goal filled (`goalsFilled`),
  then any one player on a finish. The game and the solver both ask it.
- **`stuck`** — every player in a hole, which brings up undo and restart at the bottom of the board.
- **`check`** — what makes a level unplayable in the editor.
- **`undo`** — puts the last move back.

**The solver doesn't need changing when the rules do.** It has no rules of its
own: it tries every sequence of moves by calling `moveAll`, exactly as the
game does, and remembers which arrangements it has already seen. So whatever
`moveAll` does, **check** checks — correctly, the moment you change it. The
cost is speed: it can't take the shortcuts a solver built around one set of
rules could, so it gives up sooner on big levels. If it ever gets in the way,
it's the one function `solve` to delete.

If you add a new kind of square, it needs a character (in `sokoball.js`), a
picture name (in `assets.js` and `PICTURES` in `app.js`), a developer
picture (in `assets/dev/`) and a tool button (in `index.html`).

## 7. Putting a change live

1. If you changed any `.js` or `.css` file, run this from the site root:
   ```bash
   python3 bump.py
   ```
   It changes the `?v=` on every page so browsers fetch the new files.
   Cloudflare caches scripts for four hours otherwise, and a page with new
   HTML but an old script is how buttons end up doing nothing. The background
   solver picks up the same version from the page, so it never checks against
   old rules.
2. If you replaced a picture but kept its name, bump `version` in
   `assets.js`.
3. Add a line to the **Updates** list in the info panel (`index.html`) —
   newest first, saying what changed for the player.
4. Commit and push. Cloudflare Pages has it live in about a minute.

## 8. Roadmap

A suggested order. Each step is useful on its own.

**Now — your art.** Work through section 3. Start with `ball` and `player`;
they're what people look at.

**Next — more levels, and a bigger map.** Eight is a taster, and none of them use more than one
player yet. Twenty to thirty with a steady climb is a game — and the
several-players-at-once rule is the most interesting thing Sokoball has that plain
Sokoban doesn't. Levels that are *about* it — lining players up against walls
so only some of them move — are where it'll stand out.

**Then — feel.**
- Sound, in the style of Bloom: a soft roll for a push, a clack for the cradle, a plunk for a ball
  dropping into a hole, something bigger for finishing.
- A small celebration on finishing a level.

**Then — editor power.**
- **"Make it hard"** — a button that keeps your walls, goals and holes and
  searches for the ball positions that need the longest solution.
- **Hints** — the solver already finds the shortest solution; teaching it to
  remember the path would let it show the next move.
- Undo in the editor.

**Later — a public gallery.** A page of everyone's levels, ranked by plays.
The site already has a Cloudflare Worker and database (they run Nine and the
Time Waster leaderboard), so the plumbing exists. The real work is keeping it
clean: level names are text from strangers, so they'd need the same filter,
reporting and admin page Nine has. Worth doing once there are people asking
to share.

## 9. Decisions for you

I made a call on each of these so the game works now. Any of them is easy to
change — say which.

1. **How hard should the map be?** Right now each gate is one ball in a gap,
   pushed straight through. There's room for small puzzles of their own
   between levels — a ball that has to go round a corner, or two balls in one
   gap — but they make it easier to get stuck.
2. **Pixel art or smooth?** It only changes `pixelated` in `assets.js`, but
   it's worth deciding before you draw everything.
3. **Sharing: links only, or a gallery?** Links are live now. A gallery is a
   bigger job (section 8) — only worth it if people want to browse.
