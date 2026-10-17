# Soko — how to work on it

Soko is a box-pushing puzzle in the Sokoban mould: push every box onto a goal,
never pull, one box at a time. A level can have any number of players, and
every press moves all of them the same way at once. The edge of a level is as
solid as a wall.

It ships with eight levels, a level editor that can tell you whether a level
is solvable, and share links that carry a whole level in the URL.

This file is the plan for taking it from here: where things live, how to put
your own art in, how to make levels, how sharing works, and what's worth
building next.

---

## 1. Where everything is

```
projects/soko/
  index.html     the page: bar, board, editor panel, info panel
  style.css      how it looks
  soko.js        THE RULES - levels, moves, undo, share codes, the solver
  solver.js      runs the solver in the background so the page doesn't freeze
  assets.js      which picture is drawn for what   <- edit this for your art
  levels.js      the built-in levels, in order     <- edit this for levels
  app.js         everything on screen: drawing, input, editor, sharing
  assets/
    dev/         the developer art - plain on purpose, always kept
    mine/        your art goes here
  README.md      this
```

The split that matters: **`soko.js` knows nothing about the screen**, and
`app.js` knows nothing about the rules beyond calling `soko.js`. If you change
how the game *plays*, it's `soko.js`. If you change how it *looks or behaves
on screen*, it's `app.js` and `style.css`.

## 2. Running it on your own computer

From the root of the site:

```bash
python3 serve.py
```

then open <http://localhost:8123/projects/soko/>.

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
| `goal` | where a box should end up | **drawn on top of the floor, so leave its background transparent** |
| `box` | a box | |
| `boxOnGoal` | a box sitting on a goal | should look finished — it's how you know you're done |
| `player` | the player | every player uses it |
| `playerUp` `playerDown` `playerLeft` `playerRight` | optional | if present, the players turn to face the way they moved |

Square pictures, any size; **64 × 64 is plenty**. PNG, SVG, JPG and WebP all
work. They're drawn as square tiles that fill the grid, so whatever is in the
picture is what you see — no padding is added.

### Step by step

1. Draw your picture and save it into `assets/mine/` — say
   `assets/mine/box.png`.
2. In `assets.js`, under `mine`, uncomment the matching line so it points at
   your file:
   ```js
   mine: {
     box: "assets/mine/box.png",
   },
   ```
3. At the top of `assets.js`, set `use` to `"mine"`:
   ```js
   use: "mine",
   ```
4. Reload. Your box is in; everything else is still the developer art.
5. Repeat for the rest, in any order.

If a picture doesn't appear, open the browser console: Soko says which file
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

Press **make**. You get a grid and five tools:

- **wall**, **floor**, **goal**, **box**, **player** — click to paint, drag
  to paint a run. Players go down one click at a time, as many as you like.
  Right-click paints floor, which is how you rub things out.
- Keys **1–5** pick the tools.
- **wide** and **tall** resize the grid (3 to 30 each way). What's there
  stays put; new squares are floor.
- **The edge is solid.** There's no need to build a wall round the outside —
  walls are only for the inside of a level.

Under the tools, Soko tells you what's wrong with the level as you go — no
player, boxes and goals that don't match, boxes or goals no player can reach.

When it's playable:

- **check** tries every way of playing it and tells you whether it can be
  solved at all, and how long the shortest solution is. Press it every time.
  A box against a wall can only ever slide along that wall, and a box in a
  corner never moves again — it's very easy to build a level that looks fine
  and can't be done. Of the harder levels I sketched by hand while building
  this, four in seven couldn't be solved.

  It runs in the background, so a big level can take a few seconds without
  the page freezing. On a really big or open level it may give up and say
  it's too big to try everything — that doesn't mean it's broken, just that
  you'll have to test it yourself.
- **test** plays it. **back to editor** comes back.
- **keep** saves it to *your levels* (under **levels** in play mode). Editing
  a kept level and pressing keep again updates it rather than making a copy.

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

### The text format

Levels are plain text, in the format other Sokoban programs use — so you can
also paste in levels you find elsewhere, with **paste a level**.

| character | means |
|---|---|
| `#` | wall |
| `-` or space | floor (`_` works too) |
| `.` | goal |
| `$` | box |
| `*` | box already on a goal |
| `@` | a player — as many as you like |
| `+` | a player standing on a goal |

One thing to watch: **floor at the very start or end of a row must be `-`,
not a space.** Spaces there get trimmed — they look like indentation, or like
trailing space — and the level would shrink. **copy as text** always writes
them as `-` for you, so this only matters if you're typing a level by hand.

### A tip for hard levels

The best way I found to make a level hard is to design it **backwards**:
draw the walls and goals, put the boxes *on* the goals, then imagine pulling
them off one at a time. Anywhere you can pull a box to, it can be pushed
back from — so the result is solvable by construction. That's how Zigzag and
Courtyard were made. It works cleanly for one player; with several moving
together, pulling one back drags the others too, which is harder to reason
about.

## 5. Sharing levels

**share** (in the editor, or next to any of your levels) gives you a link
like:

```
https://liamdot.ca/projects/soko/#n=Wall+flower&l=9%23%7C%237-%23%7C...
```

The whole level is in that link — its name, and the level squashed down with
run-length encoding (`#####` becomes `5#`). Opening it plays the level
straight away, and the person can **keep it** to their own levels. Pasting a
share link into **paste a level** opens it in the editor instead.

Nothing goes to a server. That's deliberate: there's no database to look
after, no cost, and nothing anyone can fill with rubbish under your name —
a link is only ever seen by whoever it's given to. A typical level makes a
link of 100–300 characters, and even a full 30 × 30 grid stays far inside
what browsers accept.

What it doesn't do is give you a public list of everyone's levels. That's the
biggest thing on the roadmap.

## 6. Changing how it plays

Everything about movement is in **one function in `soko.js`: `moveAll`**. It
takes every player and one direction, and decides who moves, who gets stuck
and which boxes get pushed. Want ice that keeps you sliding, boxes that can be
pulled, players that only move on alternate turns? It's there.

Around it:

- **`solved`** — what counts as finished.
- **`check`** — what makes a level unplayable in the editor.
- **`undo`** — puts the last move back.

**The solver doesn't need changing when the rules do.** It has no rules of its
own: it tries every sequence of moves by calling `moveAll`, exactly as the
game does, and remembers which arrangements it has already seen. So whatever
`moveAll` does, **check** checks — correctly, the moment you change it. The
cost is speed: it can't take the shortcuts a solver built around one set of
rules could, so it gives up sooner on big levels. If it ever gets in the way,
it's the one function `solve` to delete.

If you add a new kind of square, it needs a character (in `soko.js`), a
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

**Now — your art.** Work through section 3. Start with `box` and `player`;
they're what people look at.

**Next — more levels.** Eight is a taster, and none of them use more than one
player yet. Twenty to thirty with a steady climb is a game — and the
several-players-at-once rule is the most interesting thing Soko has that plain
Sokoban doesn't. Levels that are *about* it — lining players up against walls
so only some of them move — are where it'll stand out.

**Then — feel.**
- Sound, in the style of Bloom: a soft scrape for a push, a knock for a box
  landing on a goal, something bigger for finishing.
- A small celebration on finishing a level.

**Then — editor power.**
- **"Make it hard"** — a button that keeps your walls and goals and finds the
  box positions that need the longest solution, using the backwards method in
  section 4. I proved this works for one player while building the built-in
  levels.
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

1. **Should levels unlock in order?** Right now every level is open from the
   start. Locking them makes the climb matter more; leaving them open is
   friendlier.
2. **Pixel art or smooth?** It only changes `pixelated` in `assets.js`, but
   it's worth deciding before you draw everything.
3. **Sharing: links only, or a gallery?** Links are live now. A gallery is a
   bigger job (section 8) — only worth it if people want to browse.
