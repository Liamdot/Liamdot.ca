// Nine - the little service that stores everyone's messages.
//
// This runs on Cloudflare (a "Worker") and keeps messages in a Cloudflare
// database called D1. Setup instructions are in README.md next to this file.
//
// What it does:
//   GET  /tree?path=4.7      how many messages sit under each square
//   GET  /message?path=...   the message at one spot
//   GET  /random             a spot that has something written at it
//   POST /message            write (or edit) a message
//   POST /report             flag a message; two reports hides it
//   /admin/...               your own tools, behind a secret key
//
// Everything the browser sends is checked again here, because anything done
// in the browser can be bypassed.

const LEVELS = 4;
const LIMIT = 500;              // longest message
const NAME_LIMIT = 20;
const PER_HOUR = 12;            // how many messages one person can write an hour
const HIDE_AFTER_REPORTS = 2;

// ---------------------------------------------------------------------------
// Keeping it clean. Keep this in step with ../filter.js, which does the same
// checks in the browser so people get told off before they press the button.
// ---------------------------------------------------------------------------

const SLURS = [
  "nigger", "nigga", "faggot", "fag", "tranny", "kike", "spic", "chink",
  "wetback", "paki", "retard", "coon", "dyke",
];

const RUDE = [
  "fuck", "fucking", "fucker", "shit", "bullshit", "bitch", "cunt", "whore",
  "slut", "wanker", "bastard", "dick", "cock", "pussy", "asshole", "arsehole",
  "twat", "prick", "rape", "rapist", "porn", "nazi", "kys",
];

function normalize(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[*#%]+/g, "?")
    .replace(/[0@]/g, "o").replace(/[1!|]/g, "i").replace(/3/g, "e")
    .replace(/4/g, "a").replace(/[$5]/g, "s").replace(/7/g, "t").replace(/8/g, "b")
    .replace(/[^a-z?]+/g, " ")
    .replace(/\b([a-z?])(?: ([a-z?]))+\b/g, (run) => run.replace(/ /g, ""))
    .replace(/(.)\1+/g, "$1")
    .trim();
}

function matches(word, banned) {
  const forms = [banned, `${banned}s`, `${banned}es`, `${banned}ed`, `${banned}ing`, `${banned}er`];
  return forms.some((form) => {
    if (word === form) return true;
    if (!word.includes("?")) return false;
    return word.length === form.length && new RegExp(`^${word.replace(/\?/g, "[a-z]")}$`).test(form);
  });
}

function blockedWord(text) {
  const spaced = normalize(text);
  const squashed = spaced.replace(/ /g, "");
  const words = spaced.split(" ").filter(Boolean);
  const squash = (w) => w.replace(/(.)\1+/g, "$1");

  const slur = SLURS.find((word) => squashed.includes(squash(word)));
  if (slur) return slur;
  return RUDE.find((banned) => words.some((word) => matches(word, squash(banned)))) || "";
}

const hasLink = (text) => /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|xyz|ru|link)\b/i.test(text);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validPath = (path, exact = LEVELS) =>
  typeof path === "string" && new RegExp(`^[1-9](\\.[1-9]){${exact - 1}}$`).test(path);

const validPrefix = (path) =>
  path === "" || (typeof path === "string" && /^[1-9](\.[1-9]){0,2}$/.test(path));

function cors(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim());
  const origin = request.headers.get("Origin") || "";
  const allow = allowed.includes("*") ? "*" : (allowed.includes(origin) ? origin : allowed[0] || "");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

const json = (data, request, env, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(request, env) },
  });

// Who someone is, without keeping their address: a one-way scramble of it.
async function visitorId(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const data = new TextEncoder().encode(ip + (env.SALT || "nine"));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const setting = async (env, key, fallback) => {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return row ? row.value : fallback;
};

// ---------------------------------------------------------------------------
// What the site asks for
// ---------------------------------------------------------------------------

// How many messages are under each square, and under each of their squares
// too, so zooming in shows the right numbers straight away.
async function tree(path, request, env) {
  const depth = path === "" ? 0 : path.split(".").length;
  const childAt = depth * 2 + 1;       // where the next square's digit sits in "4.7.1.5"
  const grandchildAt = childAt + 2;
  const like = path === "" ? "%" : `${path}.%`;

  const { results } = await env.DB.prepare(
    `SELECT substr(path, ?, 1) AS child, substr(path, ?, 1) AS grandchild, COUNT(*) AS n
       FROM messages WHERE hidden = 0 AND path LIKE ?
       GROUP BY child, grandchild`
  ).bind(childAt, grandchildAt, like).all();

  const counts = Array(9).fill(0);
  const children = {};
  for (const row of results) {
    const child = Number(row.child);
    if (!(child >= 1 && child <= 9)) continue;
    counts[child - 1] += row.n;
    if (row.grandchild) {
      const grandchild = Number(row.grandchild);
      if (grandchild >= 1 && grandchild <= 9) {
        children[child] = children[child] || Array(9).fill(0);
        children[child][grandchild - 1] += row.n;
      }
    }
  }

  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE hidden = 0").first();
  const writing = await setting(env, "writing", "on");
  return json({ counts, children, total: total.n, writing }, request, env);
}

async function message(path, request, env) {
  if (!validPath(path)) return json({ error: "bad path" }, request, env, 400);
  const row = await env.DB.prepare(
    "SELECT text, name, at FROM messages WHERE path = ? AND hidden = 0"
  ).bind(path).first();
  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE hidden = 0").first();
  const writing = await setting(env, "writing", "on");
  return json({ message: row || null, total: total.n, writing }, request, env);
}

async function random(request, env) {
  const row = await env.DB.prepare(
    "SELECT path FROM messages WHERE hidden = 0 ORDER BY RANDOM() LIMIT 1"
  ).first();
  return json({ path: row ? row.path : null }, request, env);
}

async function write(body, request, env) {
  const { path, text = "", name = "", key = "" } = body;
  if (!validPath(path)) return json({ error: "bad path" }, request, env, 400);
  if (await setting(env, "writing", "on") !== "on") {
    return json({ error: "Writing is switched off at the moment." }, request, env, 403);
  }

  const clean = String(text).trim();
  const who = String(name).trim().slice(0, NAME_LIMIT);
  if (!clean) return json({ error: "Write something first." }, request, env, 400);
  if (clean.length > LIMIT) return json({ error: `Too long - ${LIMIT} characters at most.` }, request, env, 400);
  if (blockedWord(clean) || blockedWord(who)) {
    return json({ error: "Let's keep it friendly - that word isn't allowed." }, request, env, 400);
  }
  if (hasLink(clean)) return json({ error: "No links, sorry." }, request, env, 400);

  const ip = await visitorId(request, env);
  const now = Date.now();
  const existing = await env.DB.prepare("SELECT edit_key FROM messages WHERE path = ?").bind(path).first();

  if (existing) {
    // Only whoever wrote it can change it.
    if (!key || key !== existing.edit_key) {
      return json({ error: "Someone got here first." }, request, env, 409);
    }
    await env.DB.prepare("UPDATE messages SET text = ?, name = ?, at = ? WHERE path = ?")
      .bind(clean, who, now, path).run();
    return json({ ok: true, key }, request, env);
  }

  // New message: check they haven't been going at it.
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM messages WHERE ip_hash = ? AND at > ?"
  ).bind(ip, now - 3600_000).first();
  if (recent.n >= PER_HOUR) {
    return json({ error: "That's a lot of messages in one go - try again later." }, request, env, 429);
  }

  const editKey = crypto.randomUUID();
  try {
    await env.DB.prepare(
      "INSERT INTO messages (path, text, name, at, edit_key, ip_hash) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(path, clean, who, now, editKey, ip).run();
  } catch (e) {
    return json({ error: "Someone got here first." }, request, env, 409); // two people, same spot, same moment
  }
  return json({ ok: true, key: editKey }, request, env);
}

async function remove(body, request, env) {
  const { path, key } = body;
  if (!validPath(path)) return json({ error: "bad path" }, request, env, 400);
  const row = await env.DB.prepare("SELECT edit_key FROM messages WHERE path = ?").bind(path).first();
  if (!row || row.edit_key !== key) return json({ error: "not yours" }, request, env, 403);
  await env.DB.prepare("DELETE FROM messages WHERE path = ?").bind(path).run();
  return json({ ok: true }, request, env);
}

async function report(body, request, env) {
  const { path } = body;
  if (!validPath(path)) return json({ error: "bad path" }, request, env, 400);
  await env.DB.prepare(
    `UPDATE messages SET reports = reports + 1,
        hidden = CASE WHEN reports + 1 >= ? THEN 1 ELSE hidden END
      WHERE path = ?`
  ).bind(HIDE_AFTER_REPORTS, path).run();
  return json({ ok: true }, request, env);
}

// ---------------------------------------------------------------------------
// Your tools (need the admin key)
// ---------------------------------------------------------------------------

async function admin(url, request, env, body) {
  const key = request.headers.get("X-Admin-Key") || url.searchParams.get("key") || "";
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return json({ error: "no" }, request, env, 401);

  const action = url.pathname.split("/").pop();

  if (action === "list") {
    const only = url.searchParams.get("show") === "reported" ? "WHERE reports > 0" : "";
    const { results } = await env.DB.prepare(
      `SELECT path, text, name, at, reports, hidden FROM messages ${only} ORDER BY at DESC LIMIT 100`
    ).all();
    return json({ messages: results }, request, env);
  }

  if (action === "delete") {
    await env.DB.prepare("DELETE FROM messages WHERE path = ?").bind(body.path).run();
    return json({ ok: true }, request, env);
  }

  if (action === "show") { // un-hide something that was reported unfairly
    await env.DB.prepare("UPDATE messages SET hidden = 0, reports = 0 WHERE path = ?").bind(body.path).run();
    return json({ ok: true }, request, env);
  }

  if (action === "writing") { // the kill switch: "on" or "off"
    const value = body.writing === "off" ? "off" : "on";
    await env.DB.prepare(
      "INSERT INTO settings (key, value) VALUES ('writing', ?) ON CONFLICT(key) DO UPDATE SET value = ?"
    ).bind(value, value).run();
    return json({ ok: true, writing: value }, request, env);
  }

  return json({ error: "unknown" }, request, env, 404);
}

// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(request, env) });

    let body = {};
    if (request.method === "POST") {
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: "bad request" }, request, env, 400);
      }
    }

    try {
      if (url.pathname.startsWith("/admin/")) return await admin(url, request, env, body);

      const path = url.searchParams.get("path") || "";
      if (request.method === "GET" && url.pathname === "/tree") {
        if (!validPrefix(path)) return json({ error: "bad path" }, request, env, 400);
        return await tree(path, request, env);
      }
      if (request.method === "GET" && url.pathname === "/message") return await message(path, request, env);
      if (request.method === "GET" && url.pathname === "/random") return await random(request, env);
      if (request.method === "POST" && url.pathname === "/message") return await write(body, request, env);
      if (request.method === "POST" && url.pathname === "/delete") return await remove(body, request, env);
      if (request.method === "POST" && url.pathname === "/report") return await report(body, request, env);

      return json({ error: "not found" }, request, env, 404);
    } catch (e) {
      return json({ error: "something went wrong" }, request, env, 500);
    }
  },
};
