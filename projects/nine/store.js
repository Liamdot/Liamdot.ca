// Where Nine keeps its messages.
//
// Two ways of working, same functions either way:
//
//   * no address set in config.js - everything lives in your own browser
//   * an address set             - everything lives in the little service in
//                                  server/, so all visitors see the same thing
//
// Reading is always instant, because app.js draws from a small pile of what's
// already been fetched (the "cache"). Anything missing is fetched in the
// background and the screen is redrawn when it lands.
//
// A spot is written as "4.7.1.5" - the square picked at each of the four levels.

(function (global) {
  const API = String(global.NINE_API || "").replace(/\/+$/, "");
  const ONLINE = Boolean(API);

  const SAVE_KEY = "nine-messages";
  const MINE_KEY = "nine-mine";        // which messages this browser may edit
  const LIMIT = 500;                    // longest a message can be
  const LEVELS = 4;                     // how many times you zoom in
  const TOTAL = 9 ** LEVELS;            // 6,561 spots

  // ---- keeping it clean ---------------------------------------------------
  //
  // Two lists. SLURS are blocked wherever they appear, even inside another
  // word. RUDE words are only blocked when they stand alone, so "Scunthorpe"
  // and "classic" don't get caught out.
  //
  // This runs in the visitor's own browser, so anyone who knows how can get
  // around it - it's here to tell people off politely before they press the
  // button. The copy inside server/worker.js is the one that really counts.
  const SLURS = [
    "nigger", "nigga", "faggot", "fag", "tranny", "kike", "spic", "chink",
    "wetback", "paki", "retard", "coon", "dyke",
  ];

  const RUDE = [
    "fuck", "fucking", "fucker", "shit", "bullshit", "bitch", "cunt", "whore",
    "slut", "wanker", "bastard", "dick", "cock", "pussy", "asshole", "arsehole",
    "twat", "prick", "rape", "rapist", "porn", "nazi", "kys",
  ];

  // Undoes the usual tricks: sh1t, ＳＨＩＴ, shiiiit, f*ck, f u c k.
  // Stars and hashes become "?", a stand-in for "some letter was hidden here".
  function normalize(text) {
    return String(text)
      .toLowerCase()
      .normalize("NFKD").replace(/[̀-ͯ]/g, "")       // accents, full-width letters
      .replace(/[*#%]+/g, "?")                                 // f*ck -> f?ck
      .replace(/[0@]/g, "o").replace(/[1!|]/g, "i").replace(/3/g, "e")
      .replace(/4/g, "a").replace(/[$5]/g, "s").replace(/7/g, "t").replace(/8/g, "b")
      .replace(/[^a-z?]+/g, " ")                               // everything else splits words
      .replace(/\b([a-z?])(?: ([a-z?]))+\b/g, (run) => run.replace(/ /g, "")) // f u c k -> fuck
      .replace(/(.)\1+/g, "$1")                                // shiiiit -> shit
      .trim();
  }

  // Does one word match a banned one, allowing for a hidden letter and the
  // usual endings?
  function matches(word, banned) {
    const endings = [banned, `${banned}s`, `${banned}es`, `${banned}ed`, `${banned}ing`, `${banned}er`];
    return endings.some((form) => {
      if (word === form) return true;
      if (!word.includes("?")) return false;
      // "f?ck" matches "fuck": ? stands for any single letter
      return word.length === form.length && new RegExp(`^${word.replace(/\?/g, "[a-z]")}$`).test(form);
    });
  }

  // Is this too rude to post? Returns the word it tripped on, or "".
  function blockedWord(text) {
    const spaced = normalize(text);
    const squashed = spaced.replace(/ /g, "");
    const words = spaced.split(" ").filter(Boolean);
    const squash = (word) => word.replace(/(.)\1+/g, "$1");

    const slur = SLURS.find((word) => squashed.includes(squash(word)));
    if (slur) return slur;
    return RUDE.find((banned) => words.some((word) => matches(word, squash(banned)))) || "";
  }

  // Links invite spam, and there's nowhere sensible for them to go.
  const hasLink = (text) => /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|xyz|ru|link)\b/i.test(text);

  // Says no before anything is sent, for the obvious cases.
  function checkText(text, name) {
    if (!text) return "Write something first.";
    if (text.length > LIMIT) return `Too long - ${LIMIT} characters at most.`;
    if (blockedWord(text) || blockedWord(name)) return "Let's keep it friendly - that word isn't allowed.";
    if (hasLink(text)) return "No links, sorry.";
    return "";
  }

  // ---- the browser's own saved bits --------------------------------------

  function read(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // saving can fail (private browsing) - everything still works for this visit
    }
  }

  // path -> true when it's only this browser, path -> secret key when online.
  // Either way: the messages this browser is allowed to change.
  let mine = read(MINE_KEY, {});
  const remember = (path, key) => { mine[path] = key || true; write(MINE_KEY, mine); };
  const forget = (path) => { delete mine[path]; write(MINE_KEY, mine); };

  // ---- what's been fetched so far ----------------------------------------

  const counts = new Map();     // "4.7" -> nine numbers, one per square below it
  const notes = new Map();      // "4.7.1.5" -> the message there, or null for empty
  const state = { total: 0, writing: true, trouble: "" };
  // Goes up every time something is written or deleted. An answer that was
  // asked for before a write is out of date by the time it lands, so it's
  // dropped rather than believed.
  let stamp = 0;
  const pending = new Map();    // one fetch per spot at a time

  // ---- messages in this browser only -------------------------------------

  const local = {
    messages: read(SAVE_KEY, {}),

    save() {
      write(SAVE_KEY, this.messages);
    },

    load(path) {
      const prefix = path ? `${path}.` : "";
      const found = Array(9).fill(0);
      for (const key in this.messages) {
        if (!key.startsWith(prefix)) continue;
        const square = Number(key.slice(prefix.length).split(".")[0]);
        if (square >= 1 && square <= 9) found[square - 1]++;
      }
      counts.set(path, found);
      // and one level deeper, so zooming in shows the right numbers at once
      for (let square = 1; square <= 9; square++) this.loadOne(prefix + square);
      state.total = Object.keys(this.messages).length;
      return Promise.resolve();
    },

    loadOne(path) {
      state.total = Object.keys(this.messages).length;
      if (path.split(".").length === LEVELS) {
        notes.set(path, this.messages[path] || null);
        return;
      }
      const prefix = `${path}.`;
      const found = Array(9).fill(0);
      for (const key in this.messages) {
        if (key.startsWith(prefix)) {
          const square = Number(key.slice(prefix.length).split(".")[0]);
          if (square >= 1 && square <= 9) found[square - 1]++;
        }
      }
      counts.set(path, found);
    },

    put(path, text, name) {
      const existing = this.messages[path];
      if (existing && !mine[path]) return Promise.resolve({ ok: false, why: "Someone got here first." });
      this.messages[path] = { text, name, at: Date.now() };
      this.save();
      remember(path);
      notes.set(path, this.messages[path]);
      return Promise.resolve({ ok: true });
    },

    remove(path) {
      delete this.messages[path];
      this.save();
      forget(path);
      notes.set(path, null);
      return Promise.resolve({ ok: true });
    },

    report() {
      return Promise.resolve({ ok: true });
    },

    randomPath() {
      const paths = Object.keys(this.messages);
      return Promise.resolve(paths.length ? paths[Math.floor(Math.random() * paths.length)] : null);
    },
  };

  // ---- messages everyone shares ------------------------------------------

  async function ask(route, options) {
    const response = await fetch(API + route, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || "no answer"), { data });
    return data;
  }

  const online = {
    async load(path) {
      const mark = stamp;
      const data = await ask(`/tree?path=${encodeURIComponent(path)}`);
      if (mark !== stamp) return;
      counts.set(path, data.counts);
      // the level below, so zooming in never shows the wrong numbers first
      const prefix = path ? `${path}.` : "";
      for (let square = 1; square <= 9; square++) {
        const below = data.children[square] || Array(9).fill(0);
        if (`${prefix}${square}`.split(".").length < LEVELS) counts.set(prefix + square, below);
      }
      state.total = data.total;
      state.writing = data.writing !== "off";
    },

    async loadOne(path) {
      if (path.split(".").length !== LEVELS) return;
      const mark = stamp;
      const data = await ask(`/message?path=${encodeURIComponent(path)}`);
      if (mark !== stamp) return;
      notes.set(path, data.message);
      if (typeof data.total === "number") state.total = data.total;
      if (data.writing) state.writing = data.writing !== "off";
    },

    async put(path, text, name) {
      try {
        const data = await ask("/message", {
          method: "POST",
          body: JSON.stringify({ path, text, name, key: mine[path] || "" }),
        });
        remember(path, data.key);
        notes.set(path, { text, name, at: Date.now() });
        return { ok: true };
      } catch (e) {
        return { ok: false, why: e.message };
      }
    },

    async remove(path) {
      try {
        await ask("/delete", { method: "POST", body: JSON.stringify({ path, key: mine[path] || "" }) });
        forget(path);
        notes.set(path, null);
        return { ok: true };
      } catch (e) {
        return { ok: false, why: e.message };
      }
    },

    async report(path) {
      try {
        await ask("/report", { method: "POST", body: JSON.stringify({ path }) });
        return { ok: true };
      } catch (e) {
        return { ok: false, why: e.message };
      }
    },

    async randomPath() {
      const data = await ask("/random");
      return data.path;
    },
  };

  // One message came or went: the squares above it are each one busier or one
  // quieter. Nudging the numbers here saves fetching every level again.
  function nudge(path, delta) {
    stamp++;
    const squares = path.split(".");
    for (let depth = 0; depth < squares.length; depth++) {
      const above = squares.slice(0, depth).join(".");
      const row = counts.get(above);
      if (row) row[Number(squares[depth]) - 1] = Math.max(0, row[Number(squares[depth]) - 1] + delta);
    }
    state.total = Math.max(0, state.total + delta);
  }

  const backend = ONLINE ? online : local;

  const Store = {
    LEVELS,
    TOTAL,
    LIMIT,
    online: ONLINE,

    // True while messages only live in this browser (shown in the info panel).
    isLocalOnly: !ONLINE,

    // Is writing switched off at the moment? (the kill switch)
    get writingOff() {
      return !state.writing;
    },

    // Set when the service can't be reached, so the page can say so.
    get trouble() {
      return state.trouble;
    },

    // Fetches whatever's needed to draw this spot. Runs at most once at a
    // time per spot; the promise says whether anything new arrived.
    fetchFor(path) {
      const deepest = path.split(".").filter(Boolean).length === LEVELS;
      if (pending.has(path)) return pending.get(path);

      const job = Promise.resolve()
        .then(() => (deepest ? backend.loadOne(path) : backend.load(path)))
        .then(() => { state.trouble = ""; return true; })
        .catch(() => { state.trouble = "Can't reach the message service - try again in a moment."; return false; })
        .finally(() => pending.delete(path));

      pending.set(path, job);
      return job;
    },

    // Has this spot been fetched yet? Used to show "…" instead of "empty".
    known(path) {
      return path.split(".").filter(Boolean).length === LEVELS ? notes.has(path) : counts.has(path);
    },

    // How many messages are under each of the nine squares here.
    counts(path) {
      return counts.get(path) || Array(9).fill(0);
    },

    // The message at a spot: an object, null for empty, undefined if not
    // fetched yet.
    get(path) {
      return notes.get(path);
    },

    total() {
      return state.total;
    },

    // Can this browser edit the message at this spot?
    isMine(path) {
      return Boolean(mine[path]);
    },

    // Writes a message. Gives back { ok: true } or { ok: false, why: "..." }.
    async put(path, text, name) {
      text = String(text).trim();
      name = String(name || "").trim().slice(0, 20);
      const why = checkText(text, name);
      if (why) return { ok: false, why };
      const isNew = !notes.get(path);
      const result = await backend.put(path, text, name);
      if (result.ok && isNew) nudge(path, 1);
      return result;
    },

    async remove(path) {
      if (!mine[path]) return { ok: false, why: "not yours" };
      const result = await backend.remove(path);
      if (result.ok) nudge(path, -1);
      return result;
    },

    report(path) {
      return backend.report(path);
    },

    // A random spot that has something written at it.
    randomPath() {
      return Promise.resolve(backend.randomPath()).catch(() => null);
    },
  };

  global.Store = Store;
})(window);
