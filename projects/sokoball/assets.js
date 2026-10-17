// Sokoball's art: which picture is drawn for each thing on the board.
//
// Everything starts on the developer art in assets/dev/. To use your own,
// put your pictures in assets/mine/, list them under `mine` below, and change
// `use` to "mine". You don't have to do it all at once: anything you leave
// out of `mine` is drawn with the developer version instead, so you can swap
// one picture at a time and see each one in the game as you go.
//
// The full walk-through is in README.md, under "Using your own art".

const ART = {
  // which set to draw with
  use: "dev",

  // true for pixel art: scaled up with hard edges instead of being smoothed
  pixelated: false,

  // The colour of the solid edge round a level, where floor runs right up to
  // it. Match it to your wall when you draw one.
  edge: "#5b5049",

  // Bump this whenever you replace a picture but keep its file name. Browsers
  // hang on to images for a few hours, so without it you'd see the old one.
  version: 4,

  sets: {
    // The developer art. Plain on purpose, and always there to fall back on.
    dev: {
      floor: "assets/dev/floor.svg",
      wall: "assets/dev/wall.svg",
      goal: "assets/dev/goal.svg",
      goalFilled: "assets/dev/goal-filled.svg",
      hole: "assets/dev/hole.svg",
      holeFilled: "assets/dev/hole-filled.svg",
      grate: "assets/dev/grate.svg",
      ball: "assets/dev/ball.svg",
      player: "assets/dev/player.svg",
      finish: "assets/dev/finish.svg",
      finishOpen: "assets/dev/finish-open.svg",
      door: "assets/dev/door.svg",
      doorDone: "assets/dev/door-done.svg",
      ballLocked: "assets/dev/ball-locked.svg",
    },

    // Yours. Uncomment a line once the file exists. PNG, SVG, JPG or WebP all
    // work; square pictures look best, and 64 x 64 is plenty.
    mine: {
      // floor: "assets/mine/floor.png",
      // wall: "assets/mine/wall.png",
      // goal: "assets/mine/goal.png",                (a hole that has to be filled)
      // goalFilled: "assets/mine/goal-filled.png",   (one a ball has dropped into)
      // hole: "assets/mine/hole.png",                (a plain hole, only in the way)
      // holeFilled: "assets/mine/hole-filled.png",   (one a ball has dropped into)
      // grate: "assets/mine/grate.png",              (roll across it or fall through)
      // ball: "assets/mine/ball.png",
      // player: "assets/mine/player.png",
      // finish: "assets/mine/finish.png",            (shut: a goal still needs a ball)
      // finishOpen: "assets/mine/finish-open.png",   (open: stand on it to win)
      // door: "assets/mine/door.png",                (a level on the map; its number is drawn on top)
      // doorDone: "assets/mine/door-done.png",       (a level you've solved)
      // ballLocked: "assets/mine/ball-locked.png",   (a ball on the map that's still locked)

      // Optional. If any of these exist the player turns to face the way it
      // last moved; any that don't fall back to `player`.
      // playerUp: "assets/mine/player-up.png",
      // playerDown: "assets/mine/player-down.png",
      // playerLeft: "assets/mine/player-left.png",
      // playerRight: "assets/mine/player-right.png",
    },
  },
};
