// Sokoball's campaign: the map you walk round, and the levels behind its doors.
//
// Each one is the usual Sokoban text, plus "!" for a finish and "^" for a
// plain hole, written between backticks - see the top of sokoball.js for what each
// character means. Indent it however you like; the shared indentation is
// ignored. The quickest way to make one is the editor in
// the game itself: build it there, press "copy as text", and paste the result
// in here as a new entry.
//
// A level is remembered by what it looks like, so changing one starts its
// record afresh - which is right, since it's a different puzzle now.

/*
GATE INTRO:

#############
#.  = $ =  .#
#####@$ #####
----# $  !#--
----##  ###--
-----####----




*/

const LEVELS = [
  // The start room: the basics.
  {
    name: "First push",
    map: `
      ########
      #!@ $ .#
      ########
    `,
  },
  {
    name: "Long Way Around",
    map: `
      ######
      #!   #
      # #$ #
      # @ .#
      ######
    `,
  },
  {
    name: "Stepping stone",
    map: `
      ##########
      #    ^  .#
      #@$$$^ ! #
      #    ^  .#
      ##########
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
    name: "BOGO",
    map: `
      #######
      #    !#
      # $ $ #
      #@ ## #
      #  .. #
      #######
    `,
  },
  // The second room: harder.
  {
    name: "Island",
    map: `
      #########
      #  ^^^  #
      # ^^.^^ #
      #  ^^^  #
      #   ^   #
      # $ $ $ #
      #@     !#
      #########
    `,
  },
  {
    name: "Store room",
    map: `
      --######
      ###   !#
      #. $## #
      # $  . #
      #.$ #  #
      ##  @ ##
      -######-
    `,
  },
  {
    name: "Bowling",
    map: `
      ###########
      #.^^      #
      ####### # #
      #!$ $$   @#
      #         #
      ###########
    `,
  },
  // The third room, past the hole and the grate on the map: grates.
  {
    name: "The Grate Journey",
    map: `
      ##############
      #       =    #
      # ! @   =   .#
      #       =    #
      #### #########
      -#   ###  #---
      -#   ###  #---
      -## ####  #---
      --# ####$$##--
      --#        #--
      --#  ###   #--
      --##########--
    `,
  },
  {
    name: "Split Grate",
    map: `
      #############
      #.  = $ =  .#
      #####@$ #####
      ----# $  !#--
      ----##  ###--
      -----####----
    `,
  },
  {
    name: "5-Pin Bowling",
    map: `
      --#######--
      --#.....#--
      --#     #--
      --#     #--
      --#=====#--
      ###=   =###
      #    $    #
      # #$$$$$# #
      #   ###   #
      #   @ !   #
      ###########
    `,
  },
  // The fourth room, down from the third: more than one player.
  {
    name: "Sacrifice",
    map: `
      #########
      #       #
      # @     #
      #       #
      #^^^.^^^#
      #       #
      # @   ! #
      #       #
      #########
    `,
  },
  {
    name: "Seeing Double",
    map: `
      #############
      #@^   #@ ^^ #
      #    ^#     #
      # ^   #^ ^  #
      #     #   ^ #
      # ^   #.    #
      #!   ^# ^ ^ #
      #############
    `,
  },
  {
    name: "Fling",
    map: `
      #####-------
      #^@^#-------
      #   ########
      #   ^@^ ####
      #    ^  = !#
      #       ####
      #. #########
      ####--------
    `,
  },
  {
    name: "Three Musketeers",
    map: `
      ##########
      #=  # ^  #
      #!=   @^ #
      #=  ##^ ^#
      ####### ##
      ----### ##
      ----#^@^^#
      ----###@##
      ------###-
    `,
  },
  {
    name: "Test Chamber 1",
    map: `
      ##########
      #   ##   #
      # o  x ! #
      #   ##   #
      # $ ######
      #    @#---
      #######---
    `,
  },
  {
    name: "Test Chamber 1+",
    map: `
      ##########
      #   ##   #
      # o x  ! #
      #   ##   #
      # $ #### #
      #    @##.#
      ##########
    `,
  },
];

// The map. Walk onto a door and press Enter to play its level. Doors are
// capital letters - A is the first level above, B the second - and a room can
// have as many as you like. Each lowercase letter is a ball held in place until
// the level with that letter, and every level before it, is solved: put "e" in
// the way out of a room holding doors A to E, and it opens once the whole room
// is done, in whatever order. Solving them lets you push the balls aside. The rest is the usual: # wall, space or
// - floor, @ where you start, $ a ball that's free from the start, and ^, =
// and ~ for holes, grates and cracked floor, which work the same as in a
// level. Plates and gates do too, but here they're % and &, because the small
// letters are locks.
//
// Two things to watch when you redraw it. Balls can be pushed onto doors, so a
// door straight in line with a gap is easy to bury: put doors off to one side.
// And make sure every gap in a wall has its ball: an open gap is a way round.
//
// The map is remembered by what it looks like, like the levels are: change it
// and everyone's balls go back to where they started (their solved levels
// stay solved).

const WORLD = `
  ########################
  # A B # F G#      #I  J#
  #  @  e    #  ### #    #
  #     #    h    =^h    #
  #C D E#  H #  ### #K   #
  ####################k###
  #P   #     #######L  M##
  #           ^^^  o    ##
  #   Q#     #######N  O##
  ###q##### ##############
  #       #      #--------
  #              #--------
  #  % %  #      #--------
  #       #      #--------
  ###&############--------
  --# #         #---------
  --#^#         #---------
  --#           #---------
  --###         #---------
  ----#         #---------
  ----###########---------
  ------------------------
`;
