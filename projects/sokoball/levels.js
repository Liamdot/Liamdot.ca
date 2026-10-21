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
    name: "Newton",
    map: `
      #####
      # . #
      # . #
      #   #
      #   #
      #.  #
      # $ #
      ##$##
      ##$##
      #   #
      #@ !#
      #   #
      #####
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
  {
    name: "Please Hold",
    map: `
      ##########
      #     ####
      #  $     #
      #     #  #
      #     # ##
      #xxxxx# ##
      #=====# ##
      #     # ##
      # $o@ # ##
      #       ##
      #!   #  ##
      ##===#####
      -# . #####
      -#####----
    `,
  },
  {
    name: "Gridlock",
    map: `
      #############
      #@ x x x#####
      # x = x #= =#
      #x = x x# ] #
      # = x = #= =#
      #x x = x#####
      # x = x #####
      #x x x !#####
      #############
    `,
  },
  {
    name: "Escape the Room",
    map: `
      #########
      ###    ##
      ##o  $$ #
      #       #
      #  @    #
      #     .##
      ##    ###
      ##x######
      # $     #
      # .   ! #
      # .     #
      #       #
      #########
    `,
  },
  {
    name: "Holy Hallway",
    map: `
      #############
      #   ##!######
      # @ $$~~~~~.#
      #   #########
      #############
    `,
  },
  {
    name: "Herd Ringer",
    map: `
      #######
      #. #  #
      # @# @#
      #  #  #
      #~~#~~#
      #$ #  #
      #  # !#
      #######
    `,
  },
  {
    name: "There and Back Again",
    map: `
      ##########
      #   ~#####
      #   ?$ .##
      #   $#####
      # @ ~$ .##
      #   =#####
      #   ~  $.#
      #### #####
      ---# #----
      ---# #----
      ---#!#----
      ---###----
    `,
  },
  {
    name: "Blockade",
    map: `
      #########
      #       #
      #@   $$$#
      #       #
      #####ooo#
      ----#   #
      ----#   #
      ----# x #
      ----#x!x#
      ----#####
    `,
  },
  {
    name: "Doorstop",
    map: `
      ##########
      ######.###
      #     ^ ##
      # $$    ##
      # @     ##
      #      =##
      #===##==##
      #   #.  ##
      #   ##~  #
      #   ^   !#
      # @      #
      ##########
    `,
  },
  {
    name: "Juggle",
    map: `
      ######----------
      #! = ########---
      #=== =      #---
      #    =    . #---
      #    =      #---
      #    =####~####-
      #    =#       #-
      ##.##=#^##=##^##
      #.   =    =    #
      #    =    =    #
      # $  =    =    #
      #    =    =    #
      #    =~~~~=    #
      #xxxx=xxxx=    #
      #    =    =    #
      #    = $$ =  o #
      #    =    =    #
      # @  = @  = @  #
      #    =    =    #
      ############$=##
      ----------# $ #-
      ----------#####-
    `,
  },
];

// The map. Walk onto a door and press Enter to play its level. Doors are !,
// and a room can have as many as you like. Each * is a ball held in place
// until its level, and every level before it, is solved: put level 5's lock in
// the way out of a room holding the doors to levels 1 to 5, and it opens once
// the whole room is done, in whatever order. Solving them lets you push the
// balls aside. Which level each door and lock is for is in DOORS and LOCKS,
// under the map: [column, row, level], with columns and rows counted from 0
// at the top left of the map and levels from 1. The dev tools keep them up to
// date - easiest is to place doors and locks with those. The rest is the
// usual: # wall, space or - floor, @ where you start, $ a ball that's free
// from the start, and ^, = and ~ for holes, grates and cracked floor, which
// work the same as in a level. Plates and gates do too, but here they're %
// and &.
//
// Two things to watch when you redraw it. Balls can be pushed onto doors, so a
// door straight in line with a gap is easy to bury: put doors off to one side.
// And make sure every gap in a wall has its ball: an open gap is a way round.
//
// The map is remembered by what it looks like, like the levels are: change it
// and everyone's balls go back to where they started (their solved levels
// stay solved).

const WORLD = `
  -#######################
  -#! ! # !  #      #!  !#
  -# @  *    #  ### #    #
  -#    #    *    =^*    #
  -# ! !#! ! #  ### #!   #
  ####################*###
  #!! !#     #######!  !##
  #           ^^^  *    ##
  #!  !#     #######!  !##
  ###*##### ##############
  #      #   ! ###--------
  #  % % *     ####-------
  #      #     ~  #-------
  #      # !   ~ !#-------
  ###&#############-------
  --# #         #---------
  --# #  !   !  #---------
  --#           #---------
  --###  !      #---------
  ----#         #---------
  ----###########---------
  ------------------------
`;

const DOORS = [
  [2, 1, 1],  // First push
  [4, 1, 2],  // Long Way Around
  [3, 4, 3],  // Corner shop
  [5, 4, 4],  // BOGO
  [8, 1, 5],  // Island
  [7, 4, 6],  // Newton
  [9, 4, 7],  // Bowling
  [19, 1, 8],  // The Grate Journey
  [22, 1, 9],  // Split Grate
  [19, 4, 10],  // 5-Pin Bowling
  [18, 6, 11],  // Sacrifice
  [21, 6, 12],  // Seeing Double
  [18, 8, 13],  // Fling
  [21, 8, 14],  // Three Musketeers
  [1, 6, 15],  // Test Chamber 1
  [2, 6, 16],  // Test Chamber 1+
  [4, 6, 17],  // Please Hold
  [1, 8, 18],  // Gridlock
  [4, 8, 19],  // Escape the Room
  [11, 10, 20],  // Holy Hallway
  [9, 13, 21],  // Herd Ringer
  [15, 13, 22],  // There and Back Again
  [7, 16, 23],  // Blockade
  [11, 16, 24],  // Doorstop
  [7, 18, 25],  // Juggle
];

const LOCKS = [
  [6, 2, 4],  // BOGO
  [11, 3, 7],  // Bowling
  [18, 3, 7],  // Bowling
  [20, 5, 10],  // 5-Pin Bowling
  [17, 7, 14],  // Three Musketeers
  [3, 9, 19],  // Escape the Room
  [7, 11, 22],  // There and Back Again
];
