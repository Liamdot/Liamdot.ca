// Shared nav bar behaviour for game pages: info panel + fullscreen.

(function () {
  const infoBtn = document.getElementById("info-btn");
  const panel = document.getElementById("info-panel");
  const fullBtn = document.getElementById("fullscreen-btn");
  const stage = document.getElementById("stage");

  function setInfo(open) {
    panel.hidden = !open;
    infoBtn.setAttribute("aria-expanded", open);
  }

  infoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setInfo(panel.hidden);
  });

  // close when clicking anywhere else or pressing Escape
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !panel.contains(e.target)) setInfo(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setInfo(false);
  });

  if (!stage.requestFullscreen) {
    fullBtn.hidden = true;
  } else {
    fullBtn.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else stage.requestFullscreen();
    });
  }
})();
