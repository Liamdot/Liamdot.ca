// Runs the solver off the page, so checking a big level doesn't freeze it.
//
// sokoball.js has nothing to do with the page, which is what lets it load in here
// unchanged. It's loaded with the same ?v= the page used - otherwise this could
// pick up a stale copy and check a level against rules the game no longer has.

importScripts(`sokoball.js${self.location.search}`);

self.onmessage = (e) => {
  try {
    const level = SOKOBALL.parse(e.data.text);
    self.postMessage(SOKOBALL.solve(level, e.data.budget));
  } catch (err) {
    self.postMessage({ result: "broken" });
  }
};
