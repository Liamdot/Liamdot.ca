// Fractal Explorer
//
// The maths lives in fractal-math.js. This file handles drawing, zooming and
// the settings panel.
//
// This file is split into parts:
//   1. Settings    - the fractals, colour palettes and famous places
//   2. State       - where you're looking and how it's coloured
//   3. Drawing     - splitting the picture into strips for background workers,
//                    rough-to-sharp passes, and colouring
//   4. Input       - zoom, drag, pinch, keys and the settings panel
//   5. Sharing     - the link in the address bar, save image, copy link

// ===========================================================================
// 1. Settings
// ===========================================================================

// Each fractal: its name and where to start looking. flipY draws it upside
// down, which is how the Burning Ship is usually shown.
const FRACTALS = {
  mandelbrot: { name: "Mandelbrot set", x: -0.6,  y: 0 },
  julia:      { name: "Julia set",      x: 0,     y: 0 },
  ship:       { name: "Burning Ship",   x: -0.45, y: -0.5, flipY: true },
  tricorn:    { name: "Tricorn",        x: -0.3,  y: 0 },
};

// Colour palettes. Each is a list of colours the bands fade between, looping
// back to the start.
const PALETTES = {
  classic: { name: "Classic",   colors: ["#000764", "#206bcb", "#edffff", "#ffaa00", "#000200"] },
  fire:    { name: "Fire",      colors: ["#140000", "#8a1000", "#ff5a00", "#ffd000", "#fff8d6", "#ff5a00"] },
  ocean:   { name: "Ocean",     colors: ["#001524", "#15616d", "#78c0c0", "#ffecd1", "#15616d"] },
  neon:    { name: "Neon",      colors: ["#12002b", "#ff00c8", "#00e5ff", "#b4ff00", "#12002b"] },
  sunset:  { name: "Sunset",    colors: ["#2d1b4e", "#a4386b", "#ff6f61", "#ffd166", "#2d1b4e"] },
  mono:    { name: "Greyscale", colors: ["#000000", "#ffffff"] },
};

// Famous spots worth visiting. zoom 1 shows the whole fractal.
const PLACES = [
  { name: "The whole Mandelbrot set", fractal: "mandelbrot", x: -0.6, y: 0, zoom: 1 },
  { name: "Seahorse Valley",          fractal: "mandelbrot", x: -0.7453, y: 0.1127, zoom: 180 },
  { name: "Elephant Valley",          fractal: "mandelbrot", x: 0.2849, y: 0.0115, zoom: 250 },
  { name: "A mini Mandelbrot",        fractal: "mandelbrot", x: -1.7548776662, y: 0, zoom: 90 },
  { name: "Double spiral",            fractal: "mandelbrot", x: -0.7616, y: -0.08472, zoom: 3000 },
  { name: "Deep in Seahorse Valley",  fractal: "mandelbrot", x: -0.743643887037151, y: 0.13182590420533, zoom: 2e8 },
  { name: "Dragon Julia",             fractal: "julia", x: 0, y: 0, zoom: 1, julia: [-0.8, 0.156] },
  { name: "Spiral Julia",             fractal: "julia", x: 0, y: 0, zoom: 1, julia: [0.285, 0.01] },
  { name: "Rabbit Julia",             fractal: "julia", x: 0, y: 0, zoom: 1, julia: [-0.123, 0.745] },
  { name: "Lightning Julia",          fractal: "julia", x: 0, y: 0, zoom: 1, julia: [-0.7269, 0.1889] },
  { name: "The Burning Ship",         fractal: "ship", x: -0.45, y: -0.5, zoom: 1 },
  { name: "Ship's armada",            fractal: "ship", x: -1.762, y: -0.028, zoom: 40 },
];

// How far you can zoom before the computer runs out of decimal places and
// things turn blocky.
const MIN_SCALE = 5e-15;

// Each render goes through these block sizes, rough to sharp: first 16×16
// blocks (fast and blurry), then 4×4, then every pixel.
const PASSES = [16, 4, 1];

// The picture is split into horizontal strips this many pixels tall, which
// get worked out in parallel.
const STRIP_HEIGHT = 64;

// ===========================================================================
// 2. State
// ===========================================================================

// What you're looking at. x and y are the centre of the screen.
const view = {
  fractal: "mandelbrot",
  x: -0.6,
  y: 0,
  zoom: 1,
  julia: [-0.8, 0.156], // c for the Julia set
  palette: "classic",
  shift: 0,             // 0-1, slides the colours along
  bands: 40,            // how many escape steps one trip through the palette takes
  autoDetail: true,
  detail: 500,          // slider position when detail isn't automatic
};

let width = 0;          // canvas size in real screen pixels
let height = 0;
let pixelRatio = 1;     // screen pixels per CSS pixel (2 on most phones and Macs)
let escapes = null;     // one number per pixel: how fast it escaped, or -1 if it didn't
let image = null;       // the canvas pixels we colour in
let colorTable = null;  // the palette stretched into 1024 colours, for speed

// The render in progress.
let renderId = 0;       // goes up every time the view changes, so old results get ignored
let jobs = [];          // strips waiting to be worked out
let jobsTotal = 0;
let jobsDone = 0;
let stripPass = null;   // for each strip, the sharpest pass drawn so far
let renderStarted = 0;
let lastRenderTime = 0;

// ===========================================================================
// 3. Drawing
// ===========================================================================

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const readout = document.getElementById("readout");

// How much of the plane one CSS pixel covers. At zoom 1, about 3.2 units
// fit across the shorter side of the screen.
function baseScale() {
  return 3.2 / Math.min(width / pixelRatio, height / pixelRatio);
}

function scale() {
  return baseScale() / view.zoom;
}

function maxZoom() {
  return baseScale() / MIN_SCALE;
}

// The most steps to try before deciding a point never escapes. More steps
// show more detail but take longer, and deep zooms need more.
function maxSteps() {
  if (view.autoDetail) {
    return Math.round(Math.min(10000, 100 + 80 * Math.log2(Math.max(1, view.zoom))));
  }
  return Math.round(50 * 200 ** (view.detail / 1000)); // slider 0-1000 -> 50-10000
}

function isDrawing() {
  return jobsDone < jobsTotal;
}

// Screen position (CSS pixels) -> point on the plane.
function toPlane(sx, sy) {
  const flip = FRACTALS[view.fractal].flipY ? 1 : -1;
  const s = scale();
  return {
    x: view.x + (sx - width / pixelRatio / 2) * s,
    y: view.y + flip * (sy - height / pixelRatio / 2) * s,
  };
}

// Moves the view so that a point on the plane sits at a screen position.
function placeAt(point, sx, sy) {
  const flip = FRACTALS[view.fractal].flipY ? 1 : -1;
  const s = scale();
  view.x = point.x - (sx - width / pixelRatio / 2) * s;
  view.y = point.y - flip * (sy - height / pixelRatio / 2) * s;
}

// ---- background workers ----

// One worker per processor core (up to 8). If workers can't start - like
// when the page is opened straight from a file - we do the work on the page.
const workers = [];
try {
  const count = Math.min(navigator.hardwareConcurrency || 4, 8);
  for (let i = 0; i < count; i++) {
    const worker = new Worker("worker.js");
    worker.busy = false;
    worker.onmessage = (event) => {
      worker.busy = false;
      receiveStrip(event.data);
      sendJobs();
    };
    worker.onerror = () => {
      // Something went wrong in the workers: stop using them and start over.
      workers.length = 0;
      rerender();
    };
    workers.push(worker);
  }
} catch (error) {
  workers.length = 0;
}

// Starts a fresh render, throwing away the one in progress.
function rerender() {
  renderId++;
  const step = scale() / pixelRatio; // plane units per screen pixel
  const flip = FRACTALS[view.fractal].flipY ? 1 : -1;
  const settings = {
    render: renderId,
    fractal: view.fractal,
    julia: view.julia.slice(),
    max: maxSteps(),
    step,
    flip,
    width,
    left: view.x - (width / 2) * step,
    top: view.y - flip * (height / 2) * step,
  };

  // Every strip for the rough pass first, then the next pass, and so on.
  jobs = [];
  PASSES.forEach((block, pass) => {
    for (let rowStart = 0; rowStart < height; rowStart += STRIP_HEIGHT) {
      jobs.push({ ...settings, pass, block, strip: rowStart / STRIP_HEIGHT, rowStart, rowEnd: Math.min(height, rowStart + STRIP_HEIGHT) });
    }
  });
  jobsTotal = jobs.length;
  jobsDone = 0;
  stripPass = new Int8Array(Math.ceil(height / STRIP_HEIGHT)).fill(-1);
  renderStarted = performance.now();

  sendJobs();
  updateAddressBar();
}

// Gives waiting strips to any idle workers (or works on them here).
function sendJobs() {
  if (workers.length === 0) {
    workHere();
    return;
  }
  for (const worker of workers) {
    if (!worker.busy && jobs.length) {
      worker.busy = true;
      worker.postMessage(jobs.shift());
    }
  }
}

// Without workers: do strips for ~14ms at a time, so the page doesn't freeze.
let workingHere = false;
function workHere() {
  if (workingHere) return;
  workingHere = true;
  requestAnimationFrame(function work() {
    const start = performance.now();
    while (jobs.length && performance.now() - start < 14) {
      const job = jobs.shift();
      receiveStrip({ ...job, values: FractalMath.computeStrip(job) });
    }
    if (jobs.length) requestAnimationFrame(work);
    else workingHere = false;
  });
}

// A finished strip: copy it into the picture and schedule a repaint.
function receiveStrip(result) {
  if (result.render !== renderId) return; // from an old view - ignore it

  // Strips can finish out of order, so never replace a sharp strip with a blurrier one.
  if (result.pass >= stripPass[result.strip]) {
    escapes.set(result.values, result.rowStart * width);
    stripPass[result.strip] = result.pass;
  }

  jobsDone++;
  if (!isDrawing()) lastRenderTime = performance.now() - renderStarted;
  schedulePaint();
}

let paintScheduled = false;
function schedulePaint() {
  if (paintScheduled) return;
  paintScheduled = true;
  requestAnimationFrame(() => {
    paintScheduled = false;
    paint();
    updateReadout();
  });
}

// ---- colours ----

// Turns the palette's colours into a smooth table of 1024 colours.
function buildColorTable() {
  const hex = PALETTES[view.palette].colors;
  const colors = hex.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const size = 1024;
  colorTable = new Uint8Array(size * 3);
  for (let i = 0; i < size; i++) {
    const t = (i / size) * colors.length;
    const a = colors[Math.floor(t)];
    const b = colors[(Math.floor(t) + 1) % colors.length]; // wraps back to the first colour
    const mix = t - Math.floor(t);
    for (let channel = 0; channel < 3; channel++) {
      colorTable[i * 3 + channel] = a[channel] + (b[channel] - a[channel]) * mix;
    }
  }
}

// Colours every pixel from its escape value. Cheap, so changing the palette
// is instant without re-rendering.
function paint() {
  const data = image.data;
  const bands = view.bands;
  const shift = view.shift;
  for (let i = 0, p = 0; i < escapes.length; i++, p += 4) {
    const value = escapes[i];
    if (value < 0) {
      data[p] = data[p + 1] = data[p + 2] = 0; // inside the set: black
    } else {
      const t = value / bands + shift;
      const index = Math.floor((t - Math.floor(t)) * 1024) * 3;
      data[p] = colorTable[index];
      data[p + 1] = colorTable[index + 1];
      data[p + 2] = colorTable[index + 2];
    }
    data[p + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

let pointerPlane = null; // the point under the mouse, for the readout

function updateReadout() {
  const zoomText = view.zoom < 1000 ? `${+view.zoom.toPrecision(3)}×` : `${view.zoom.toExponential(1).replace("e+", "e")}×`;
  const lines = [`zoom ${zoomText}   detail ${maxSteps()} steps`];
  if (pointerPlane) {
    const digits = Math.min(16, Math.max(4, Math.ceil(Math.log10(view.zoom)) + 3));
    lines.push(`x ${pointerPlane.x.toFixed(digits)}   y ${pointerPlane.y.toFixed(digits)}`);
  }
  lines.push(isDrawing() ? `drawing… ${Math.round((jobsDone / jobsTotal) * 100)}%` : `drawn in ${(lastRenderTime / 1000).toFixed(2)}s`);
  if (view.zoom >= maxZoom() * 0.999) lines.push("that's as deep as it goes!");
  readout.textContent = lines.join("\n");
}

// Makes the canvas match its size on screen (sharp on high-res screens).
function resize() {
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
  height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
  canvas.width = width;
  canvas.height = height;
  escapes = new Float32Array(width * height);
  image = ctx.createImageData(width, height);
  rerender();
}

// ===========================================================================
// 4. Input
// ===========================================================================

function clampZoom() {
  view.zoom = Math.min(Math.max(view.zoom, 0.25), maxZoom());
}

// Zooms by a factor, keeping the point at (sx, sy) on screen still.
function zoomAt(factor, sx, sy) {
  const point = toPlane(sx, sy);
  view.zoom *= factor;
  clampZoom();
  placeAt(point, sx, sy);
  rerender();
  syncPanel();
}

function screenCenter() {
  return [width / pixelRatio / 2, height / pixelRatio / 2];
}

function mousePos(e) {
  const rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

// Scroll wheel / trackpad zoom.
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const amount = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; // some mice scroll in lines, not pixels
  zoomAt(Math.exp(-amount * 0.002), ...mousePos(e));
}, { passive: false });

// Dragging with one finger or the mouse moves; two fingers pinch-zoom.
const pointers = new Map();
let gesture = null;

function startGesture() {
  const points = [...pointers.values()];
  if (points.length === 1) {
    gesture = { kind: "drag", anchor: toPlane(...points[0]) };
  } else if (points.length >= 2) {
    const [a, b] = points;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    gesture = { kind: "pinch", anchor: toPlane(...mid), distance: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom: view.zoom };
  } else {
    gesture = null;
  }
}

canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  try {
    canvas.setPointerCapture(e.pointerId); // keep getting moves even if the finger leaves the canvas
  } catch (error) {
    // some browsers refuse for certain pointers - dragging still works without it
  }
  pointers.set(e.pointerId, mousePos(e));
  canvas.classList.add("dragging");
  startGesture();
});

canvas.addEventListener("pointermove", (e) => {
  pointerPlane = toPlane(...mousePos(e));
  if (!pointers.has(e.pointerId)) {
    if (!isDrawing()) updateReadout();
    return;
  }
  pointers.set(e.pointerId, mousePos(e));
  const points = [...pointers.values()];

  if (gesture && gesture.kind === "drag") {
    placeAt(gesture.anchor, ...points[0]);
    rerender();
  } else if (gesture && gesture.kind === "pinch" && points.length >= 2) {
    const [a, b] = points;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    view.zoom = gesture.zoom * (Math.hypot(a[0] - b[0], a[1] - b[1]) / gesture.distance);
    clampZoom();
    placeAt(gesture.anchor, ...mid);
    rerender();
    syncPanel();
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) canvas.classList.remove("dragging");
  startGesture(); // e.g. lifting one finger of a pinch carries on as a drag
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("pointerleave", () => { pointerPlane = null; });

canvas.addEventListener("dblclick", (e) => {
  zoomAt(e.shiftKey ? 0.5 : 2, ...mousePos(e));
});

// Right-click a point on the Mandelbrot set to see its Julia set.
canvas.addEventListener("contextmenu", (e) => {
  if (view.fractal !== "mandelbrot") return;
  e.preventDefault();
  const point = toPlane(...mousePos(e));
  view.julia = [+point.x.toFixed(6), +point.y.toFixed(6)];
  setFractal("julia");
});

// Keyboard shortcuts (ignored while typing in the panel).
window.addEventListener("keydown", (e) => {
  const focused = document.activeElement;
  if (focused && focused.closest("input, select, textarea")) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const step = 60; // pixels per arrow press
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };

  if (e.key === "+" || e.key === "=") zoomAt(1.5, ...screenCenter());
  else if (e.key === "-" || e.key === "_") zoomAt(1 / 1.5, ...screenCenter());
  else if (e.key === "r" || e.key === "R") resetView();
  else if (moves[e.key]) {
    const [cx, cy] = screenCenter();
    placeAt(toPlane(cx + moves[e.key][0], cy + moves[e.key][1]), cx, cy);
    rerender();
  } else return;
  e.preventDefault();
});

// ---- settings panel ----

const $ = (id) => document.getElementById(id);

function fillSelect(select, entries) {
  for (const [value, label] of entries) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
}

fillSelect($("fractal"), Object.entries(FRACTALS).map(([key, f]) => [key, f.name]));
fillSelect($("palette"), Object.entries(PALETTES).map(([key, p]) => [key, p.name]));
fillSelect($("places"), [["", "choose a place…"], ...PLACES.map((place, i) => [i, place.name])]);

// Puts the current settings into the panel's inputs.
function syncPanel() {
  $("fractal").value = view.fractal;
  $("palette").value = view.palette;
  $("shift").value = view.shift;
  $("bands").value = view.bands;
  $("auto-detail").checked = view.autoDetail;
  $("detail").value = view.autoDetail ? Math.round(1000 * Math.log(maxSteps() / 50) / Math.log(200)) : view.detail;
  $("julia-controls").hidden = view.fractal !== "julia";
  $("julia-re").value = view.julia[0];
  $("julia-im").value = view.julia[1];
}

function setFractal(key) {
  view.fractal = key;
  view.x = FRACTALS[key].x;
  view.y = FRACTALS[key].y;
  view.zoom = 1;
  $("places").value = "";
  syncPanel();
  rerender();
}

function resetView() {
  setFractal(view.fractal);
}

$("fractal").addEventListener("change", (e) => setFractal(e.target.value));

$("places").addEventListener("change", (e) => {
  const place = PLACES[e.target.value];
  if (!place) return;
  view.fractal = place.fractal;
  view.x = place.x;
  view.y = place.y;
  view.zoom = place.zoom;
  if (place.julia) view.julia = place.julia.slice();
  clampZoom();
  syncPanel();
  $("places").value = e.target.value;
  rerender();
});

for (const [index, id] of [[0, "julia-re"], [1, "julia-im"]]) {
  $(id).addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    if (Number.isNaN(value)) return;
    view.julia[index] = value;
    rerender();
  });
}

$("palette").addEventListener("change", (e) => {
  view.palette = e.target.value;
  buildColorTable();
  paint();
  updateAddressBar();
});

$("shift").addEventListener("input", (e) => {
  view.shift = parseFloat(e.target.value);
  paint();
  updateAddressBar();
});

$("bands").addEventListener("input", (e) => {
  view.bands = parseFloat(e.target.value);
  paint();
  updateAddressBar();
});

$("detail").addEventListener("input", (e) => {
  view.autoDetail = false;
  view.detail = parseInt(e.target.value, 10);
  $("auto-detail").checked = false;
  rerender();
});

$("auto-detail").addEventListener("change", (e) => {
  view.autoDetail = e.target.checked;
  syncPanel();
  rerender();
});

$("zoom-in").addEventListener("click", () => zoomAt(2, ...screenCenter()));
$("zoom-out").addEventListener("click", () => zoomAt(0.5, ...screenCenter()));
$("reset").addEventListener("click", resetView);

// Collapse / expand the panel.
$("panel-toggle").addEventListener("click", () => {
  const body = $("panel-body");
  body.hidden = !body.hidden;
  $("panel-toggle").setAttribute("aria-expanded", !body.hidden);
});

// ===========================================================================
// 5. Sharing
// ===========================================================================

// Keeps the address bar in sync with the view, so the link always opens
// exactly what you're looking at. (Waits a moment so it doesn't update on
// every tiny movement.)
let addressTimer = 0;
function updateAddressBar() {
  clearTimeout(addressTimer);
  addressTimer = setTimeout(() => {
    const params = new URLSearchParams({
      f: view.fractal,
      x: view.x,
      y: view.y,
      z: +view.zoom.toPrecision(6),
      p: view.palette,
      s: view.shift,
      b: view.bands,
      d: view.autoDetail ? "auto" : view.detail,
    });
    if (view.fractal === "julia") params.set("c", view.julia.join(","));
    history.replaceState(null, "", `#${params}`);
  }, 300);
}

// Reads a view from the address bar, if there is one.
function readAddressBar() {
  const params = new URLSearchParams(location.hash.slice(1));
  const number = (key, fallback) => {
    const value = parseFloat(params.get(key));
    return Number.isFinite(value) ? value : fallback;
  };

  if (FRACTALS[params.get("f")]) view.fractal = params.get("f");
  view.x = number("x", FRACTALS[view.fractal].x);
  view.y = number("y", FRACTALS[view.fractal].y);
  view.zoom = number("z", 1);
  if (PALETTES[params.get("p")]) view.palette = params.get("p");
  view.shift = Math.min(1, Math.max(0, number("s", view.shift)));
  view.bands = Math.min(200, Math.max(4, number("b", view.bands)));
  if (params.has("d") && params.get("d") !== "auto") {
    view.autoDetail = false;
    view.detail = Math.min(1000, Math.max(0, number("d", view.detail)));
  }
  const c = (params.get("c") || "").split(",").map(parseFloat);
  if (c.length === 2 && c.every(Number.isFinite)) view.julia = c;
}

$("save").addEventListener("click", () => {
  canvas.toBlob((blob) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${view.fractal}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
});

$("copy-link").addEventListener("click", async () => {
  clearTimeout(addressTimer);
  updateAddressBar();
  await new Promise((resolve) => setTimeout(resolve, 350)); // let the address bar catch up
  const button = $("copy-link");
  try {
    await navigator.clipboard.writeText(location.href);
    button.textContent = "copied!";
  } catch (e) {
    prompt("Copy this link:", location.href);
  }
  setTimeout(() => { button.textContent = "copy link"; }, 1500);
});

// ---- start ----

readAddressBar();
buildColorTable();
syncPanel();
if (window.innerWidth < 600) $("panel-toggle").click(); // start with the panel folded up on phones
new ResizeObserver(resize).observe(canvas);
