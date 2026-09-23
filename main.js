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

// The top row floats up into the title. Rather than letting it cover the
// name, the title steps up out of the way - by exactly as much as that card
// needs, and never so far that it goes off the top of the page itself.
const header = document.querySelector("header");

function titleDodge(tile) {
  const float = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--float")) || 80;
  const lifted = tile.getBoundingClientRect().top - float;   // where the card will be
  // Measure the title where it sits at rest: it may already be stepped up
  // from the card you're moving off, and two lifts shouldn't stack.
  const already = document.body.classList.contains("title-up")
    ? parseFloat(getComputedStyle(document.body).getPropertyValue("--dodge")) || 0 : 0;
  const title = header.getBoundingClientRect();
  const needed = title.bottom + already - lifted + 6;
  const room = title.top + already;   // how far it can rise before leaving the screen itself
  return Math.max(0, Math.min(needed, room));
}

document.querySelector(".grid").addEventListener("pointerover", (e) => {
  const tile = e.target.closest(".tile");
  if (!tile || tile.contains(e.relatedTarget)) return;
  const dodge = titleDodge(tile);
  document.body.style.setProperty("--dodge", `${dodge}px`);
  document.body.classList.toggle("title-up", dodge > 0);
});

document.querySelector(".grid").addEventListener("pointerout", (e) => {
  const tile = e.target.closest(".tile");
  if (!tile || tile.contains(e.relatedTarget)) return;
  document.body.classList.remove("title-up");
});

// Logo bump: add a class on hover and only remove it once the animation ends,
// so it always plays all the way through.
const wordmark = document.querySelector(".wordmark");
wordmark.addEventListener("mouseenter", () => wordmark.classList.add("bump"));
wordmark.addEventListener("animationend", (e) => {
  if (e.animationName === "ball-bump") wordmark.classList.remove("bump");
});
