// Soko's built-in levels, in the order they're played.
//
// Each one is the usual Sokoban text, plus "!" for a finish, written between
// backticks - see the top of soko.js for what each character means. Indent it however you like; the
// shared indentation is ignored. The quickest way to make one is the editor in
// the game itself: build it there, press "copy as text", and paste the result
// in here as a new entry.
//
// A level is remembered by what it looks like, so changing one starts its
// record afresh - which is right, since it's a different puzzle now.

const LEVELS = [
  {
    name: "First push",
    map: `
      ########
      #!@ $ .#
      ########
    `,
  },
  {
    name: "Round the back",
    map: `
      ######
      #!   #
      # #$ #
      # @ .#
      ######
    `,
  },
  {
    name: "Corner shop",
    map: `
      #######
      #.  $ #
      #  # !#
      #@ $ .#
      #######
    `,
  },
  {
    name: "Two of them",
    map: `
      #######
      #    !#
      # $ $ #
      #@ ## #
      #  .. #
      #######
    `,
  },
  {
    name: "Store room",
    map: `
        ######
      ###   !#
      #. $## #
      # $  . #
      #.$ #  #
      ##  @ ##
       ######
    `,
  },
  {
    name: "Hallway",
    map: `
        #######
        #     #
      ###$##$ #
      #!  ..  #
      #  #$## #
      ## @.   #
       ########
    `,
  },
  {
    name: "Zigzag",
    map: `
       ########
       #! #   #
       #  $ $ #
      ### ##@ #
      #  . #$ #
      # .  .  #
      #   #####
      #####
    `,
  },
  {
    name: "Courtyard",
    map: `
      #########
      #   #  !#
      #  $@$  #
      # $#.#  #
      ## ...  #
      # $# #  #
      #       #
      #########
    `,
  },
];
