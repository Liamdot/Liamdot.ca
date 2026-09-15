const projectsEl = document.getElementById("projects");

function tileHTML(p) {
  const badge = p.badge ? `<span class="badge ${p.badge}">${p.badge}</span>` : "";
  return `
    <a class="tile" href="${p.url}">
      <div class="thumb">
        <img src="${p.thumb}" alt="">
        ${badge}
      </div>
      <h3>${p.title}</h3>
      <p>${p.blurb}</p>
    </a>`;
}

const newestFirst = [...PROJECTS].sort((a, b) => b.date.localeCompare(a.date));
projectsEl.innerHTML = newestFirst.length
  ? newestFirst.map(tileHTML).join("")
  : `<p class="empty">Nothing here yet. Check back soon.</p>`;

// Logo bump: add a class on hover and only remove it once the animation ends,
// so it always plays all the way through.
const wordmark = document.querySelector(".wordmark");
wordmark.addEventListener("mouseenter", () => wordmark.classList.add("bump"));
wordmark.addEventListener("animationend", (e) => {
  if (e.animationName === "ball-bump") wordmark.classList.remove("bump");
});
