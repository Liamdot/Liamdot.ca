const projectsEl = document.getElementById("projects");

function tileHTML(p) {
  return `
    <a class="tile" href="${p.url}" aria-label="${p.title}: ${p.blurb}">
      <div class="tile-card">
        <div class="thumb">
          <img src="${p.thumb}" alt="">
        </div>
        <div class="caption">
          <h3>${p.title}</h3>
          <p>${p.blurb}</p>
        </div>
      </div>
    </a>`;
}

const newestFirst = [...PROJECTS].sort((a, b) => b.date.localeCompare(a.date));
projectsEl.innerHTML = newestFirst.length
  ? newestFirst.map(tileHTML).join("")
  : `<p class="empty">Nothing here yet. Check back soon.</p>`;

// The names and descriptions lie on the page underneath the thumbnails, which
// float up to uncover them (see style.css). How far they float depends on how
// tall the tallest description is, which depends on the window width - so
// measure it here and let the CSS use the answer.
function measureCaptions() {
  let tallest = 0;
  for (const caption of document.querySelectorAll(".caption")) {
    const title = caption.querySelector("h3");
    const blurb = caption.querySelector("p");
    tallest = Math.max(tallest, title.offsetHeight + blurb.offsetHeight + 6);
  }
  if (!tallest) return;
  document.documentElement.style.setProperty("--caption-height", `${tallest}px`);
  document.documentElement.style.setProperty("--float", `${tallest + 16}px`);
}

measureCaptions();
window.addEventListener("resize", measureCaptions);
if (document.fonts) document.fonts.ready.then(measureCaptions); // fonts can change the height

// The top row floats up into the title. Rather than letting a card cover the
// name, the title steps up out of the way - but only when that card is
// really going to land on the words, and only by as much as it needs.
//
// Everything here is measured from resting layout positions (offsetTop and
// friends), never from getBoundingClientRect, because the title may be
// half-way through moving when you slide from one card to the next and a
// measurement taken mid-move would feed on itself.

const header = document.querySelector("header");
const grid = document.querySelector(".grid");
const CLEARANCE = 26;   // how much daylight to leave between title and card

// Where something sits on the page, ignoring any transform on it.
function restingTop(el) {
  let y = 0;
  for (let node = el; node; node = node.offsetParent) y += node.offsetTop;
  return y;
}

function restingLeft(el) {
  let x = 0;
  for (let node = el; node; node = node.offsetParent) x += node.offsetLeft;
  return x;
}

let title = null;   // the words' resting box, worked out below

// How wide the writing actually is - a paragraph is as wide as the page,
// but "The best projects on the internet." is not.
function textBox(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const box = range.getBoundingClientRect();
  range.detach();
  return box.width ? box : el.getBoundingClientRect();
}

// Only run while the title is at rest, so the measurements mean something.
function measureTitle() {
  const words = [document.querySelector(".wordmark"), document.querySelector(".intro")].filter(Boolean);
  if (!words.length) return;
  const wasUp = document.body.classList.contains("title-up");
  document.body.classList.remove("title-up");

  const boxes = words.map(textBox);
  const top = window.scrollY;
  title = {
    top: restingTop(header),
    bottom: Math.max(...boxes.map((b) => b.bottom + top)),
    left: Math.min(...boxes.map((b) => b.left)),
    right: Math.max(...boxes.map((b) => b.right)),
  };

  if (wasUp) document.body.classList.add("title-up");
}

measureTitle();
window.addEventListener("resize", measureTitle);
if (document.fonts) document.fonts.ready.then(measureTitle);

function titleDodge(tile) {
  if (!title) return 0;
  const float = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--float")) || 80;

  // Does this card land on the words at all? A card off to the right passes
  // the title by, however high it floats.
  const left = restingLeft(tile);
  const right = left + tile.offsetWidth;
  if (right < title.left || left > title.right) return 0;

  const lands = restingTop(tile) - float;
  const needed = title.bottom - lands + CLEARANCE;
  const room = title.top - window.scrollY;   // it can't rise past the top of the screen
  return Math.max(0, Math.min(needed, room));
}

grid.addEventListener("pointerover", (e) => {
  const tile = e.target.closest(".tile");
  if (!tile) return;
  const dodge = titleDodge(tile);
  document.body.style.setProperty("--dodge", `${dodge}px`);
  document.body.classList.toggle("title-up", dodge > 0);
});

grid.addEventListener("pointerout", (e) => {
  const tile = e.target.closest(".tile");
  if (!tile || tile.contains(e.relatedTarget)) return;
  if (!e.relatedTarget || !e.relatedTarget.closest(".tile")) document.body.classList.remove("title-up");
});

// Logo bump: add a class on hover and only remove it once the animation ends,
// so it always plays all the way through.
const wordmark = document.querySelector(".wordmark");
wordmark.addEventListener("mouseenter", () => wordmark.classList.add("bump"));
wordmark.addEventListener("animationend", (e) => {
  if (e.animationName === "ball-bump") wordmark.classList.remove("bump");
});
