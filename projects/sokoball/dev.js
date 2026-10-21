// Sokoball's developer tools: for working on the campaign - its levels and the
// map - from the game itself. They only switch on when the page comes from
// your own computer (localhost), so the live site never shows them.
//
// Everything they change is written straight into levels.js, by serve.py,
// which is what makes them work: a page on its own can't write files. That
// means running the site with `python3 serve.py`, and restarting it if it was
// already running from before it learned how.
//
//   the "dev" button     opens the campaign: every level in order, to move,
//                        edit or remove, a way to add more, and the map
//   editing a level      the usual editor, plus "save to campaign"
//   editing the map      the editor with the map's own tools - start, doors and
//                        locks for each level, balls, holes, grates, cracked
//                        floor, plates and gates - and "save map"
//
// Moving or removing a level renumbers its door and lock on the map to match.

(() => {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (!local) return;

  const SAVE_URL = "/__dev/sokoball";
  const AFTER = "sokoball-dev-after";          // what to reopen after saving reloads the page
  const el = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  const tidy = (map) => SOKOBALL.writeRows(SOKOBALL.rowsOf(map));

  // ---- writing levels.js ----

  // `was` is each level's name as levels.js has it now, so the comment above
  // a level stays with it even if it's renamed. The map is the game's own,
  // with a character for each level's door and lock; it's only split into
  // levels.js's ! and * and their lists on the way out.
  function campaign() {
    return { levels: LEVELS.map(({ name, map }) => ({ name, was: name, map: tidy(map) })), world: WORLD_MAP };
  }

  async function send(next, after) {
    const { text, doors, locks } = SOKOBALL.splitWorld(next.world);
    try {
      const res = await fetch(SAVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Sokoball-Dev": "1" },
        body: JSON.stringify({ levels: next.levels, world: text, doors, locks }),
      });
      if (!res.ok) {
        // the server answered, so it's running: it said what was wrong, or it's
        // one from before it knew how to save
        const why = res.status === 400 ? await res.text() : "the server doesn't know how - restart python3 serve.py";
        flash(`Couldn't save to levels.js: ${why}`);
        return;
      }
      sessionStorage.setItem(AFTER, after);
      location.reload();
    } catch (e) {
      flash("Couldn't save to levels.js: the site needs to be running with python3 serve.py.");
    }
  }

  // Doors and locks on the map are for levels by position, so moving or
  // removing a level has to renumber them. `to(n)` is where level n ends up, or
  // null if it's gone. A gone level's door goes with it; its lock passes to the
  // level before it, so the way on still waits for the same levels.
  function renumber(world, to) {
    return Array.from(world, (ch) => {
      const door = SOKOBALL.doorNumber(ch);
      const lock = SOKOBALL.lockNumber(ch);
      if (door < 0 && lock < 0) return ch;
      let m = to(Math.max(door, lock));
      if (m === null && lock >= 0) {
        for (let k = lock - 1; k >= 0 && m === null; k--) m = to(k);
      }
      return m === null ? " " : door >= 0 ? SOKOBALL.doorChar(m) : SOKOBALL.lockChar(m);
    }).join("");
  }

  function move(i, j) {
    const next = campaign();
    if (j < 0 || j >= next.levels.length) return;
    [next.levels[i], next.levels[j]] = [next.levels[j], next.levels[i]];
    next.world = renumber(next.world, (n) => (n === i ? j : n === j ? i : n));
    send(next, "campaign");
  }

  function remove(i) {
    const next = campaign();
    next.levels.splice(i, 1);
    next.world = renumber(next.world, (n) => (n === i ? null : n > i ? n - 1 : n));
    send(next, "campaign");
  }

  function add(level) {
    const next = campaign();
    next.levels.push({ name: level.name || `Level ${next.levels.length + 1}`, map: tidy(level.map) });
    send(next, "campaign");
  }

  // ---- the campaign card ----

  let removing = -1;                           // asks twice before removing

  function showCampaign() {
    const doors = new Set(world.doors.values());
    const rows = LEVELS.map((lv, i) => `
      <div class="level-row mine">
        <span class="num">${i + 1}</span>
        <span class="name">${esc(lv.name)}${doors.has(i) ? "" : ` <em class="dev-note">no door</em>`}</span>
        <button class="tiny" data-dev="up" data-i="${i}" title="Earlier"${i === 0 ? " disabled" : ""}>&#9650;</button>
        <button class="tiny" data-dev="down" data-i="${i}" title="Later"${i === LEVELS.length - 1 ? " disabled" : ""}>&#9660;</button>
        <button class="tiny" data-dev="edit" data-i="${i}">edit</button>
        <button class="tiny danger" data-dev="remove" data-i="${i}">${removing === i ? "Are you sure?" : "remove"}</button>
      </div>`).join("");
    const options = save.mine.map((m) => `<option value="mine:${esc(m.id)}">${esc(m.name)}</option>`).join("");
    const card = $("levels");
    card.innerHTML = `
      <div class="card-head"><h2>Campaign</h2><button class="close" data-close aria-label="Close">&times;</button></div>
      <p class="sub">Only on your computer. Changes are written straight into levels.js.</p>
      <div class="level-list">${rows}</div>
      <h3>Add a level</h3>
      <div class="row dev-add">
        <select id="dev-add-from">
          <option value="draft">The level in the editor</option>
          ${options}
        </select>
        <button class="pill" data-dev="add">add</button>
      </div>
      <div class="row"><button class="pill strong" data-dev="map">edit the map</button></div>`;
    card.hidden = false;
  }

  // The card is the "my levels" card's, so its own clicks are caught first.
  $("levels").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-dev]");
    if (!btn) return;
    e.stopPropagation();
    const i = Number(btn.dataset.i);
    const what = btn.dataset.dev;
    if (what !== "remove") removing = -1;
    if (what === "up") move(i, i - 1);
    if (what === "down") move(i, i + 1);
    if (what === "edit") editLevel(i);
    if (what === "map") editMap();
    if (what === "remove") {
      if (removing !== i) {
        removing = i;
        showCampaign();
        return;
      }
      removing = -1;
      remove(i);
    }
    if (what === "add") {
      const from = $("dev-add-from").value;
      if (from === "draft") {
        if (draft.world) {
          flash("The editor has the map in it, not a level.");
          return;
        }
        const { problems } = draftLevel();
        if (problems.length) {
          flash(problems[0]);
          return;
        }
        add({ name: draft.name.trim(), map: draftText() });
      } else {
        const m = save.mine.find((x) => `mine:${x.id}` === from);
        if (m) add(m);
      }
    }
  }, true);

  // ---- editing a level or the map ----

  // Whatever was in the editor before is put back once you're done.
  function stash() {
    if (!draft.world && draft.campaign == null) save.devStash = save.draft;
  }

  function unstash() {
    const back = save.devStash;
    delete save.devStash;
    draft = back ? draftFrom(back.map, back.name, back.id) : draftFrom(STARTER);
    verdict = null;
    storeDraft();
  }

  function editLevel(i) {
    stash();
    draft = draftFrom(LEVELS[i].map, LEVELS[i].name, null);
    draft.campaign = i;
    verdict = null;
    storeDraft();
    setMode("make");
  }

  function editMap() {
    stash();
    draft = draftFrom(WORLD_MAP, "The map", null);
    draft.world = true;
    verdict = null;
    storeDraft();
    setMode("make");
  }

  function saveLevel() {
    const { problems } = draftLevel();
    if (problems.length) {
      flash(problems[0]);
      return;
    }
    const next = campaign();
    const i = draft.campaign;
    if (!next.levels[i]) return;
    next.levels[i] = { ...next.levels[i], name: draft.name.trim() || next.levels[i].name, map: draftText() };
    send(next, "make");
  }

  function saveMap() {
    try {
      SOKOBALL.parseWorld(draftText());
    } catch (e) {
      flash(e.message);
      return;
    }
    const next = campaign();
    next.world = draftText();
    unstash();
    send(next, "map");
  }

  function done() {
    unstash();
    setMode("play");
    showCampaign();
  }

  // ---- the map's tools ----

  let lockTool = null;                         // "door" or "lock" while one of those is chosen

  const mapTools = el(`
    <div class="tools dev-map-tools" hidden>
      <button class="tool" data-tool="#" title="Wall"><span class="swatch-wall"></span>wall</button>
      <button class="tool" data-tool=" " title="Floor"><span class="swatch-floor"></span>floor</button>
      <button class="tool" data-tool="@" title="Where you start"><span class="swatch-player"></span>start</button>
      <button class="tool" data-tool="$" title="A ball free from the start"><span class="swatch-ball"></span>ball</button>
      <button class="tool" data-tool="^" title="Hole"><span class="swatch-hole"></span>hole</button>
      <button class="tool" data-tool="=" title="Grate"><span class="swatch-grate"></span>grate</button>
      <button class="tool" data-tool="~" title="Cracked floor"><span class="swatch-cracked"></span>cracked</button>
      <button class="tool" data-tool="%" title="Plate: every gate on the map opens while every plate is down"><span class="swatch-plate"></span>plate</button>
      <button class="tool" data-tool="&amp;" title="Gate"><span class="swatch-gate"></span>gate</button>
      <button class="tool" data-map="door" title="The door to the level below"><span class="swatch-door"></span>door</button>
      <button class="tool" data-map="lock" title="A ball locked until the level below and every one before it are solved"><span class="swatch-lock"></span>lock</button>
      <label class="field dev-level">for level <select id="dev-map-level"></select></label>
    </div>`);
  $("tools").after(mapTools);
  const levelPick = mapTools.querySelector("#dev-map-level");
  levelPick.innerHTML = LEVELS.map((lv, i) => `<option value="${i}">${i + 1}. ${esc(lv.name)}</option>`).join("");

  function pickMapTool() {
    const n = Number(levelPick.value);
    chooseTool(lockTool === "lock" ? SOKOBALL.lockChar(n) : SOKOBALL.doorChar(n));
    for (const b of mapTools.querySelectorAll("[data-map]")) b.classList.toggle("on", b.dataset.map === lockTool);
  }

  mapTools.addEventListener("click", (e) => {
    const btn = e.target.closest(".tool");
    if (!btn) return;
    if (btn.dataset.map) {
      lockTool = btn.dataset.map;
      pickMapTool();
    } else {
      lockTool = null;
      chooseTool(btn.dataset.tool);
      for (const b of mapTools.querySelectorAll("[data-map]")) b.classList.remove("on");
    }
  });
  levelPick.addEventListener("change", () => { if (lockTool) pickMapTool(); });

  // ---- the editor's extra buttons ----

  const devButtons = el(`
    <div class="editor-buttons dev-buttons" hidden>
      <button class="pill strong" data-dev-editor="save-level">save to campaign</button>
      <button class="pill strong" data-dev-editor="save-map">save map</button>
      <button class="pill" data-dev-editor="done">done</button>
    </div>`);
  $("problems").after(devButtons);
  devButtons.addEventListener("click", (e) => {
    const what = (e.target.closest("[data-dev-editor]") || {}).dataset?.devEditor;
    if (what === "save-level") saveLevel();
    if (what === "save-map") saveMap();
    if (what === "done") done();
  });

  const devPill = el(`<button class="pill play-only" id="dev-btn" title="Only on your computer">dev</button>`);
  $("levels-btn").after(devPill);
  devPill.addEventListener("click", () => ($("levels").hidden ? showCampaign() : hideCards()));

  // Which of the editor's controls show depends on what's being edited.
  function refresh() {
    if (!draft) return;
    const onMap = Boolean(draft.world);
    const onLevel = !onMap && draft.campaign != null;
    $("tools").hidden = onMap;
    mapTools.hidden = !onMap;
    for (const row of document.querySelectorAll(".editor > .editor-buttons:not(.dev-buttons)")) row.hidden = onMap;
    devButtons.hidden = !onMap && !onLevel;
    devButtons.querySelector('[data-dev-editor="save-level"]').hidden = !onLevel;
    devButtons.querySelector('[data-dev-editor="save-map"]').hidden = !onMap;
    // map tools on the map, level tools on a level
    const doorOrLock = SOKOBALL.doorNumber(tool) >= 0 || SOKOBALL.lockNumber(tool) >= 0;
    if (onMap && !/^[#@$^=~%& ]$/.test(tool) && !doorOrLock) chooseTool(SOKOBALL.WALL);
    if (!onMap && doorOrLock) chooseTool(SOKOBALL.WALL);
  }

  // What's missing or wrong on the map: nothing here stops it being saved
  // except a map that can't be read at all.
  function showMapProblems(note) {
    let parsed;
    try {
      parsed = SOKOBALL.parseWorld(draftText());
    } catch (e) {
      note.className = "problems bad";
      note.textContent = e.message;
      return;
    }
    const found = new Set(parsed.doors.values());
    const notes = [];
    if (parsed.gate.some((g) => g) && !parsed.plates.length) notes.push("The map has gates but no plates to open them.");
    LEVELS.forEach((lv, i) => { if (!found.has(i)) notes.push(`No door yet for ${i + 1}. ${lv.name}.`); });
    for (const n of found) if (n >= LEVELS.length) notes.push(`A door is for level ${n + 1}, which doesn't exist.`);
    for (const n of parsed.locks.keys()) if (n >= LEVELS.length) notes.push(`A lock waits on level ${n + 1}, which doesn't exist.`);
    if (notes.length) {
      note.className = "problems bad";
      note.innerHTML = `<ul>${notes.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
    } else {
      note.className = "problems good";
      note.textContent = "Every level has a door. Save the map to put it in the game.";
    }
  }

  window.SOKOBALL_DEV = { refresh, showMapProblems };

  // The editor's draft, as the game loaded it, doesn't know it was the map or a
  // campaign level - only these tools can edit those, so they tell it.
  if (save.draft) {
    draft.world = Boolean(save.draft.world);
    draft.campaign = save.draft.campaign ?? null;
    if (mode === "make") showProblems();
  }

  // after a save, pick up where you were
  window.addEventListener("load", () => {
    const after = sessionStorage.getItem(AFTER);
    sessionStorage.removeItem(AFTER);
    if (after === "campaign") showCampaign();
    if (after === "make") setMode("make");
    if (after === "map") goToMap();
  });
})();
