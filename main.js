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

// Every word in the line under the title gets its own silly hover effect.
// They're handed out in order and start again from the beginning, so the
// sentence can say anything you like.
const WORD_EFFECTS = ["spin", "jump", "wobble", "squish", "flip", "rainbow", "stretch"];

function sillyWords() {
  const line = document.querySelector(".intro");
  if (!line) return;
  const words = line.textContent.trim().split(/\s+/);
  line.replaceChildren(...words.flatMap((word, i) => {
    const span = document.createElement("span");
    span.className = `word ${WORD_EFFECTS[i % WORD_EFFECTS.length]}`;
    span.textContent = word;
    return i === words.length - 1 ? [span] : [span, " "];
  }));
}

sillyWords();

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

// Logo bump: add a class on hover and only remove it once the animation ends,
// so it always plays all the way through.
const wordmark = document.querySelector(".wordmark");
wordmark.addEventListener("mouseenter", () => wordmark.classList.add("bump"));
wordmark.addEventListener("animationend", (e) => {
  if (e.animationName === "ball-bump") wordmark.classList.remove("bump");
});
