// Soko's art: which picture is drawn for each thing on the board.
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
  version: 2,

  sets: {
    // The developer art. Plain on purpose, and always there to fall back on.
    dev: {
      floor: "assets/dev/floor.svg",
      wall: "assets/dev/wall.svg",
      goal: "assets/dev/goal.svg",
      box: "assets/dev/box.svg",
      boxOnGoal: "assets/dev/box-on-goal.svg",
      player: "assets/dev/player.svg",
    },

    // Yours. Uncomment a line once the file exists. PNG, SVG, JPG or WebP all
    // work; square pictures look best, and 64 x 64 is plenty.
    mine: {
      // floor: "assets/mine/floor.png",
      // wall: "assets/mine/wall.png",
      // goal: "assets/mine/goal.png",
      // box: "assets/mine/box.png",
      // boxOnGoal: "assets/mine/box-on-goal.png",
      // player: "assets/mine/player.png",

      // Optional. If any of these exist the player turns to face the way it
      // last moved; any that don't fall back to `player`.
      // playerUp: "assets/mine/player-up.png",
      // playerDown: "assets/mine/player-down.png",
      // playerLeft: "assets/mine/player-left.png",
      // playerRight: "assets/mine/player-right.png",
    },
  },
};
