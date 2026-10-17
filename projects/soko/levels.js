// Soko's campaign: the map you walk round, and the levels behind its doors.
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

// The map. Walk onto a door and press Enter to play its level. Doors are
// capital letters - A is the first level above, B the second - and each
// lowercase letter is a ball held in place until the level with that letter is
// solved. Put a level's balls where they block the way to the next door, and
// solving it lets you push them aside. The rest is the usual: # wall, space or
// - floor, @ where you start, $ a ball that's free from the start.
//
// Two things to watch when you redraw it. Balls can be pushed onto doors, so a
// door straight in line with a gap is easy to bury: put doors off to one side.
// And make sure every gap in a wall has its ball: an open gap is a way round.
//
// The map is remembered by what it looks like, like the levels are: change it
// and everyone's balls go back to where they started (their solved levels
// stay solved).

const WORLD = `
  #######################
  #     #    #     #    #
  #  @  a  B #   C c    #
  #  A  #    b     #  D #
  #     #    #     #    #
  ###################d###
  # H  #     #     #    #
  #    g  G  f  F  e    #
  #    #     #     #  E #
  #######################
`;
