# Nine's message service

Nine needs somewhere to keep everyone's messages. This folder is that
somewhere: a small program (`worker.js`) that runs on Cloudflare's free plan,
and a database (`schema.sql`) for it to write into.

You don't need to install anything. It's all done in the browser, on
[dash.cloudflare.com](https://dash.cloudflare.com), and takes about ten
minutes. Nothing here costs money — the free plan allows 100,000 requests a
day, which is far more than this will ever use.

---

## 1. Make the database

1. Sign in to the Cloudflare dashboard (the same account you'll use for the
   Raspberry Pi is fine).
2. In the sidebar: **Storage & Databases → D1 SQL Database → Create**.
3. Name it `nine`, create it.
4. Open it, go to the **Console** tab, paste in everything from
   `schema.sql`, and run it.

You should end up with two empty tables, `messages` and `settings`.

## 2. Make the Worker

1. Sidebar: **Compute (Workers) → Workers & Pages → Create → Start with
   Hello World → Deploy**. Name it `nine`.
2. Once it's made, press **Edit code**.
3. Delete what's in the editor, paste in all of `worker.js`, and press
   **Deploy**.

## 3. Wire the two together

In the Worker's **Settings → Bindings**:

1. **Add → D1 database.** Variable name `DB` (exactly that, in capitals),
   database `nine`. Deploy.
The other three live one section over, under **Settings → Variables and
Secrets → + Add**, each row with a **Type** dropdown:

2. Type **Secret**, name `ADMIN_KEY`, value: a long password you make up.
   This is what lets you delete things — keep it somewhere safe.
3. Type **Secret**, name `SALT`, value: another long random string. It's
   used to scramble visitors' addresses so the same person can't flood the
   board, without ever storing the addresses themselves.
4. Type **Text**, name `ALLOWED_ORIGINS`, value: the sites allowed to use
   it, separated by commas. For example:

   ```
   https://liamdot.ca,http://localhost:8123
   ```

   Leave it out and anything is allowed, which is fine but untidy.

Deploy again after adding them.

If you'd rather keep `ADMIN_KEY` and `SALT` in a **Secrets Store** and bind
that instead, the Worker takes them that way too — same names either way.

## 4. Point the site at it

The Worker's address is on its overview page and looks like
`https://nine.<your-name>.workers.dev`. Put it in `projects/nine/config.js`:

```js
window.NINE_API = "https://nine.your-name.workers.dev";
```

Leave it as `""` and Nine falls back to saving messages in your own browser,
which is handy while you're working on it.

Then commit and push. From then on every copy of the site - your own on
localhost, and the real one once it's hosted (see `deploy/`) - shares the
same messages.

---

## Keeping an eye on it

`projects/nine/admin.html` — not linked from anywhere — lists recent and
reported messages, deletes them, puts unfairly reported ones back, and has
the kill switch. It asks for the `ADMIN_KEY` you set above and keeps it for
that browser tab only.

What's already in place without you doing anything:

- **the filter** — the same rude-word and link checks run in `worker.js`, so
  editing the page's own copy out gets you nowhere
- **a limit** — twelve new messages an hour from one address
- **reports** — two reports and a message hides itself until you look at it
- **the kill switch** — writing off, reading still on

If you change the word lists in `store.js`, change the matching ones at the
top of `worker.js` too, and paste the new `worker.js` into the dashboard.

## Looking inside

The D1 console is the quickest way to see what's there:

```sql
SELECT path, text, name, reports, hidden FROM messages ORDER BY at DESC LIMIT 20;
```

## What it answers

| Request | What it does |
| --- | --- |
| `GET /tree?path=4.7` | how many messages sit under each square, two levels deep |
| `GET /message?path=4.7.1.5` | the message at one spot |
| `GET /random` | a spot that has something written at it |
| `POST /message` | write or edit (`{ path, text, name, key }`) |
| `POST /delete` | remove your own (`{ path, key }`) |
| `POST /report` | flag one (`{ path }`) |
| `/admin/list`, `/admin/delete`, `/admin/show`, `/admin/writing` | yours, with the key |

The `key` is a secret the Worker hands back when a message is first written.
The browser keeps it so the same person can edit or delete their own message
later, and nobody else can.
