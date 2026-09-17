// Name that Number
// Draw a digit and watch a small neural network guess what it is.
//
// The network itself was trained ahead of time (see model.js). This file:
//   1. Settings    - brush size and colours
//   2. The network - unpacking the trained weights and running them
//   3. Reading the drawing - shrinking it to 28×28 like the training digits
//   4. Drawing     - the network diagram, the guess and the tooltips
//   5. Input       - drawing with the mouse or a finger, buttons, keys

// ===========================================================================
// 1. Settings
// ===========================================================================

const PAD_SIZE = 280;          // the drawing pad is 280×280 pixels inside
const BRUSH = 22;              // brush thickness on the pad
const INK = "#222222";

const POSITIVE = "126, 224, 138"; // green: pushes the next neuron up
const NEGATIVE = "255, 107, 94";  // red: pushes the next neuron down
const LAYER_NAMES = ["input", "hidden layer 1", "hidden layer 2", "output"];

// ===========================================================================
// 2. The network
// ===========================================================================

// model.js stores each layer's weights as 8-bit numbers in base64 text.
// This turns them back into regular numbers.
const layers = MODEL.layers.map((layer) => {
  const text = atob(layer.weights);
  const weights = new Float32Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const byte = text.charCodeAt(i);
    weights[i] = (byte > 127 ? byte - 256 : byte) * layer.scale; // bytes above 127 are negative
  }
  return { inputs: layer.inputs, outputs: layer.outputs, weights, biases: Float32Array.from(layer.biases) };
});

// Runs the network on 784 pixel values (0 = blank, 1 = ink).
//
// Each neuron adds up its inputs, each multiplied by a weight, plus a bias.
// Hidden neurons then turn anything negative into 0 ("ReLU"). The 10 output
// numbers are turned into percentages that add up to 100% ("softmax").
function runNetwork(pixels) {
  const activations = [pixels];
  let values = pixels;

  layers.forEach((layer, index) => {
    const out = new Float32Array(layer.outputs);
    for (let neuron = 0; neuron < layer.outputs; neuron++) {
      let sum = layer.biases[neuron];
      const row = neuron * layer.inputs;
      for (let input = 0; input < layer.inputs; input++) {
        sum += layer.weights[row + input] * values[input];
      }
      const isLastLayer = index === layers.length - 1;
      out[neuron] = isLastLayer ? sum : Math.max(0, sum);
    }
    activations.push(out);
    values = out;
  });

  // softmax
  const scores = activations[activations.length - 1];
  const biggest = Math.max(...scores);
  const exps = scores.map((score) => Math.exp(score - biggest));
  const total = exps.reduce((a, b) => a + b, 0);
  const probabilities = exps.map((e) => e / total);

  return { activations, probabilities };
}

// Unpacks a 28×28 image stored in model.js into 784 values from 0 to 1.
function decodeDigit(base64) {
  const text = atob(base64);
  return Float32Array.from(text, (char) => char.charCodeAt(0) / 255);
}

// Checks this JavaScript gives the same answers as the Python that trained it.
for (const sample of MODEL.check) {
  const { probabilities } = runNetwork(decodeDigit(sample.pixels));
  const worst = Math.max(...probabilities.map((p, i) => Math.abs(p - sample.probabilities[i])));
  if (worst > 1e-3) console.warn("The network in the browser doesn't match the trained model:", worst);
}

// ===========================================================================
// 3. Reading the drawing
// ===========================================================================

const pad = document.getElementById("pad");
const padCtx = pad.getContext("2d", { willReadFrequently: true });

function makeCanvas(size) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  return canvas;
}

const shrunk = makeCanvas(28);
const shrunkCtx = shrunk.getContext("2d", { willReadFrequently: true });
const centered = makeCanvas(28);
const centeredCtx = centered.getContext("2d", { willReadFrequently: true });

// The training digits were all prepared the same way: the digit fits in a
// 20×20 box, placed in a 28×28 image so its "centre of mass" (the middle of
// all its ink) is in the centre. We do exactly that to your drawing, or the
// network gets confused by digits that are too small or off to one side.
function readDrawing() {
  const ink = padCtx.getImageData(0, 0, PAD_SIZE, PAD_SIZE).data;

  // 1. Find the box around the ink.
  let minX = PAD_SIZE, minY = PAD_SIZE, maxX = -1, maxY = -1;
  for (let y = 0; y < PAD_SIZE; y++) {
    for (let x = 0; x < PAD_SIZE; x++) {
      if (ink[(y * PAD_SIZE + x) * 4 + 3] > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // nothing drawn

  // 2. Shrink it so the longer side is 20 pixels.
  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const fit = 20 / Math.max(boxW, boxH);
  const w = Math.max(1, Math.round(boxW * fit));
  const h = Math.max(1, Math.round(boxH * fit));
  shrunkCtx.clearRect(0, 0, 28, 28);
  shrunkCtx.imageSmoothingEnabled = true;
  shrunkCtx.imageSmoothingQuality = "high";
  shrunkCtx.drawImage(pad, minX, minY, boxW, boxH, 0, 0, w, h);

  // 3. Find its centre of mass.
  const small = shrunkCtx.getImageData(0, 0, w, h).data;
  let total = 0, sumX = 0, sumY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const amount = small[(y * w + x) * 4 + 3];
      total += amount;
      sumX += amount * x;
      sumY += amount * y;
    }
  }

  // 4. Put it in a 28×28 image with the centre of mass in the middle.
  const offsetX = Math.round(13.5 - sumX / total);
  const offsetY = Math.round(13.5 - sumY / total);
  centeredCtx.clearRect(0, 0, 28, 28);
  centeredCtx.drawImage(shrunk, 0, 0, w, h, offsetX, offsetY, w, h);

  // 5. Read out how much ink is in each pixel, from 0 to 1.
  const final = centeredCtx.getImageData(0, 0, 28, 28).data;
  const pixels = new Float32Array(784);
  for (let i = 0; i < 784; i++) pixels[i] = final[i * 4 + 3] / 255;
  return pixels;
}

// ===========================================================================
// 4. Drawing
// ===========================================================================

const net = document.getElementById("net");
const netCtx = net.getContext("2d");
const tooltip = document.getElementById("tooltip");
const seesCtx = document.getElementById("sees").getContext("2d");

let result = null;   // the latest run of the network, or null if the pad is empty
let pixels = null;   // the 784 pixels it was run on
let positions = [];  // where each neuron is drawn: positions[layer][neuron] = { x, y, r }
let imageBox = null; // where the input image is drawn

// A 28×28 canvas showing some pixel values as white on black.
const inputImage = makeCanvas(28);
function paintPixels(ctx, values) {
  const image = ctx.createImageData(28, 28);
  for (let i = 0; i < 784; i++) {
    const v = values ? values[i] * 255 : 0;
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

// Works out where every neuron goes, based on the size of the panel.
function layout(width, height) {
  const top = 34;
  const bottom = height - 44;
  const imageSize = Math.max(60, Math.min(bottom - top, width * 0.2, 170));
  imageBox = { x: 18, y: (top + bottom) / 2 - imageSize / 2, size: imageSize };

  const columns = [imageBox.x + imageSize, width * 0.43, width * 0.66, width - 78];
  positions = [[]];
  for (let layer = 1; layer <= 3; layer++) {
    const count = layers[layer - 1].outputs;
    const spacing = (bottom - top) / count;
    const r = Math.max(3, Math.min(spacing * 0.36, layer === 3 ? 13 : 10));
    positions.push(Array.from({ length: count }, (_, i) => ({ x: columns[layer], y: top + (i + 0.5) * spacing, r })));
  }
}

// Mixes from a dark grey to a colour: amount 0 = dark, 1 = full colour.
function glow(amount, rgb) {
  const dark = [44, 44, 48];
  const [r, g, b] = rgb.split(",").map(Number);
  const mix = (from, to) => Math.round(from + (to - from) * amount);
  return `rgb(${mix(dark[0], r)}, ${mix(dark[1], g)}, ${mix(dark[2], b)})`;
}

function drawNetwork() {
  const ratio = window.devicePixelRatio || 1;
  const width = net.clientWidth;
  const height = net.clientHeight;
  if (net.width !== Math.round(width * ratio) || net.height !== Math.round(height * ratio)) {
    net.width = Math.round(width * ratio);
    net.height = Math.round(height * ratio);
  }
  netCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  netCtx.clearRect(0, 0, width, height);
  layout(width, height);

  const acts = result ? result.activations : null;

  // ---- connections ----
  netCtx.lineWidth = 1;

  // Input image -> hidden layer 1: brighter for neurons that lit up.
  const firstMax = acts ? Math.max(...acts[1], 1e-6) : 1;
  positions[1].forEach((neuron, i) => {
    const strength = acts ? acts[1][i] / firstMax : 0;
    netCtx.strokeStyle = `rgba(241, 237, 228, ${0.04 + strength * 0.4})`;
    netCtx.beginPath();
    netCtx.moveTo(imageBox.x + imageBox.size, imageBox.y + ((i + 0.5) / positions[1].length) * imageBox.size);
    netCtx.lineTo(neuron.x - neuron.r, neuron.y);
    netCtx.stroke();
  });

  // Hidden -> hidden and hidden -> output: how much each connection
  // contributed (the activation coming in times the weight).
  for (let layer = 2; layer <= 3; layer++) {
    const { weights, inputs } = layers[layer - 1];
    const from = positions[layer - 1];
    const to = positions[layer];

    let biggest = 1e-6;
    const contributions = new Float32Array(weights.length);
    for (let j = 0; j < to.length; j++) {
      for (let i = 0; i < from.length; i++) {
        const c = acts ? acts[layer - 1][i] * weights[j * inputs + i] : 0;
        contributions[j * inputs + i] = c;
        biggest = Math.max(biggest, Math.abs(c));
      }
    }

    for (let j = 0; j < to.length; j++) {
      for (let i = 0; i < from.length; i++) {
        const c = contributions[j * inputs + i];
        const strength = Math.abs(c) / biggest;
        if (acts && strength < 0.04) continue; // too faint to see - skip it
        netCtx.strokeStyle = acts
          ? `rgba(${c > 0 ? POSITIVE : NEGATIVE}, ${0.08 + strength * 0.85})`
          : "rgba(241, 237, 228, 0.05)";
        netCtx.lineWidth = acts ? 0.6 + strength * 1.8 : 1;
        netCtx.beginPath();
        netCtx.moveTo(from[i].x + from[i].r, from[i].y);
        netCtx.lineTo(to[j].x - to[j].r, to[j].y);
        netCtx.stroke();
      }
    }
  }

  // ---- input image ----
  paintPixels(inputImage.getContext("2d"), pixels);
  netCtx.imageSmoothingEnabled = false;
  netCtx.drawImage(inputImage, imageBox.x, imageBox.y, imageBox.size, imageBox.size);
  netCtx.strokeStyle = "#55555c";
  netCtx.lineWidth = 1.5;
  netCtx.strokeRect(imageBox.x, imageBox.y, imageBox.size, imageBox.size);

  // ---- neurons ----
  const guess = result ? result.probabilities.indexOf(Math.max(...result.probabilities)) : -1;
  for (let layer = 1; layer <= 3; layer++) {
    const values = layer === 3 && result ? result.probabilities : acts ? acts[layer] : null;
    const biggest = values && layer < 3 ? Math.max(...values, 1e-6) : 1;

    positions[layer].forEach((neuron, i) => {
      const amount = values ? values[i] / biggest : 0;
      netCtx.fillStyle = glow(amount, layer === 3 ? "255, 226, 122" : POSITIVE);
      netCtx.strokeStyle = layer === 3 && i === guess ? "#ffe27a" : "#55555c";
      netCtx.lineWidth = layer === 3 && i === guess ? 2.5 : 1.2;
      netCtx.beginPath();
      netCtx.arc(neuron.x, neuron.y, neuron.r, 0, Math.PI * 2);
      netCtx.fill();
      netCtx.stroke();

      // Output neurons get their digit and percentage beside them.
      if (layer === 3) {
        netCtx.fillStyle = i === guess ? "#ffe27a" : "#b5b5bd";
        netCtx.font = `${i === guess ? "700 " : ""}13px Menlo, Consolas, monospace`;
        netCtx.textBaseline = "middle";
        const percent = result ? ` ${Math.round(result.probabilities[i] * 100)}%` : "";
        netCtx.fillText(`${i}${percent}`, neuron.x + neuron.r + 8, neuron.y);
      }
    });
  }

  // ---- layer names ----
  netCtx.fillStyle = "#8a8a93";
  netCtx.font = "12px -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif";
  netCtx.textBaseline = "alphabetic";
  netCtx.textAlign = "center";
  const labelY = height - 16;
  netCtx.fillText("28×28 pixels", imageBox.x + imageBox.size / 2, labelY);
  netCtx.fillText(`${layers[0].outputs} neurons`, positions[1][0].x, labelY);
  netCtx.fillText(`${layers[1].outputs} neurons`, positions[2][0].x, labelY);
  netCtx.fillText("guess", positions[3][0].x + 14, labelY);
  netCtx.textAlign = "left";
}

// The big guess and the bars on the right.
const guessEl = document.getElementById("guess");
const guessLabel = document.getElementById("guess-label");
const guessSure = document.getElementById("guess-sure");
const barsEl = document.getElementById("bars");

const barRows = Array.from({ length: 10 }, (_, digit) => {
  const row = document.createElement("div");
  row.className = "bar-row";
  row.innerHTML = `<span>${digit}</span><span class="bar-track"><span class="bar-fill" style="width: 0%"></span></span><span class="bar-pct">0%</span>`;
  barsEl.append(row);
  return row;
});

function drawGuess() {
  if (!result) {
    guessLabel.textContent = "Draw something!";
    guessEl.textContent = "?";
    guessSure.innerHTML = "&nbsp;";
  } else {
    const best = Math.max(...result.probabilities);
    const digit = result.probabilities.indexOf(best);
    guessLabel.textContent = best > 0.5 ? "I think it's a" : "Maybe a…";
    guessEl.textContent = digit;
    guessSure.textContent = best > 0.9 ? `${Math.round(best * 100)}% sure` : best > 0.5 ? `${Math.round(best * 100)}% sure` : `only ${Math.round(best * 100)}% sure`;
  }

  const best = result ? Math.max(...result.probabilities) : -1;
  barRows.forEach((row, digit) => {
    const p = result ? result.probabilities[digit] : 0;
    row.classList.toggle("top", p === best);
    row.querySelector(".bar-fill").style.width = `${p * 100}%`;
    row.querySelector(".bar-pct").textContent = `${Math.round(p * 100)}%`;
  });
}

// Runs the network on the current drawing and redraws everything.
function update() {
  pixels = readDrawing();
  result = pixels ? runNetwork(pixels) : null;
  paintPixels(seesCtx, pixels);
  drawNetwork();
  drawGuess();
}

// Only update once per frame, however fast the mouse moves.
let updateQueued = false;
function queueUpdate() {
  if (updateQueued) return;
  updateQueued = true;
  requestAnimationFrame(() => {
    updateQueued = false;
    update();
  });
}

// ---- tooltips ----

const weightCanvas = makeCanvas(28);

// Shows what a neuron in hidden layer 1 looks for: its 784 weights as a picture.
function paintWeights(neuron) {
  const { weights, inputs } = layers[0];
  const row = weights.subarray(neuron * inputs, (neuron + 1) * inputs);
  const biggest = Math.max(...row.map(Math.abs), 1e-6);
  const ctx = weightCanvas.getContext("2d");
  const image = ctx.createImageData(28, 28);
  const [pr, pg, pb] = POSITIVE.split(",").map(Number);
  const [nr, ng, nb] = NEGATIVE.split(",").map(Number);
  for (let i = 0; i < 784; i++) {
    const amount = Math.abs(row[i]) / biggest;
    const [r, g, b] = row[i] > 0 ? [pr, pg, pb] : [nr, ng, nb];
    image.data[i * 4] = r * amount + 17 * (1 - amount);
    image.data[i * 4 + 1] = g * amount + 17 * (1 - amount);
    image.data[i * 4 + 2] = b * amount + 17 * (1 - amount);
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

function showTooltip(layer, neuron, x, y) {
  const value = result ? (layer === 3 ? result.probabilities[neuron] : result.activations[layer][neuron]) : null;
  tooltip.replaceChildren();

  const title = document.createElement("strong");
  const text = document.createElement("p");

  if (layer === 1) {
    title.textContent = `Hidden layer 1, neuron ${neuron + 1}`;
    const picture = document.createElement("canvas");
    picture.width = picture.height = 28;
    paintWeights(neuron);
    picture.getContext("2d").drawImage(weightCanvas, 0, 0);
    text.textContent = `Lights up for ink on the green parts, and is held back by ink on the red parts.${value !== null ? ` Right now: ${value.toFixed(2)}` : ""}`;
    tooltip.append(title, picture, text);
  } else if (layer === 2) {
    title.textContent = `Hidden layer 2, neuron ${neuron + 1}`;
    text.textContent = `Combines the patterns found by hidden layer 1.${value !== null ? ` Right now: ${value.toFixed(2)}` : ""}`;
    tooltip.append(title, text);
  } else {
    title.textContent = `Output for ${neuron}`;
    text.textContent = value !== null ? `The network is ${Math.round(value * 100)}% sure it's a ${neuron}.` : `Lights up when the network thinks it's a ${neuron}.`;
    tooltip.append(title, text);
  }

  tooltip.hidden = false;
  const card = net.parentElement;
  const left = x + 16 + tooltip.offsetWidth > card.clientWidth ? x - tooltip.offsetWidth - 16 : x + 16;
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, Math.min(y - 20, card.clientHeight - tooltip.offsetHeight - 8))}px`;
}

net.addEventListener("pointermove", (e) => {
  const rect = net.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  for (let layer = 1; layer <= 3; layer++) {
    const neuron = positions[layer].findIndex((p) => Math.hypot(p.x - x, p.y - y) <= p.r + 4);
    if (neuron !== -1) {
      showTooltip(layer, neuron, x, y);
      net.style.cursor = "help";
      return;
    }
  }
  tooltip.hidden = true;
  net.style.cursor = "";
});

net.addEventListener("pointerleave", () => { tooltip.hidden = true; });

new ResizeObserver(drawNetwork).observe(net);

// ===========================================================================
// 5. Input
// ===========================================================================

let lastPoint = null;

// Mouse/finger position in pad pixels (the pad is shown smaller or bigger than 280px).
function padPoint(e) {
  const rect = pad.getBoundingClientRect();
  return { x: ((e.clientX - rect.left) / rect.width) * PAD_SIZE, y: ((e.clientY - rect.top) / rect.height) * PAD_SIZE };
}

pad.addEventListener("pointerdown", (e) => {
  try {
    pad.setPointerCapture(e.pointerId);
  } catch (error) {
    // not every pointer can be captured - drawing still works
  }
  lastPoint = padPoint(e);
  padCtx.fillStyle = INK;
  padCtx.beginPath();
  padCtx.arc(lastPoint.x, lastPoint.y, BRUSH / 2, 0, Math.PI * 2);
  padCtx.fill();
  queueUpdate();
});

pad.addEventListener("pointermove", (e) => {
  if (!lastPoint) return;
  const point = padPoint(e);
  padCtx.strokeStyle = INK;
  padCtx.lineWidth = BRUSH;
  padCtx.lineCap = "round";
  padCtx.lineJoin = "round";
  padCtx.beginPath();
  padCtx.moveTo(lastPoint.x, lastPoint.y);
  padCtx.lineTo(point.x, point.y);
  padCtx.stroke();
  lastPoint = point;
  queueUpdate();
});

function stopDrawing() {
  lastPoint = null;
}
pad.addEventListener("pointerup", stopDrawing);
pad.addEventListener("pointercancel", stopDrawing);

function clearPad() {
  padCtx.clearRect(0, 0, PAD_SIZE, PAD_SIZE);
  update();
}

document.getElementById("clear-btn").addEventListener("click", clearPad);

// Draws one of the real handwritten digits the network was tested on.
let lastExample = -1;
document.getElementById("example-btn").addEventListener("click", () => {
  let pick;
  do {
    pick = Math.floor(Math.random() * MODEL.examples.length);
  } while (pick === lastExample && MODEL.examples.length > 1);
  lastExample = pick;

  const digit = decodeDigit(MODEL.examples[pick]);
  const small = makeCanvas(28);
  const smallCtx = small.getContext("2d");
  const image = smallCtx.createImageData(28, 28);
  for (let i = 0; i < 784; i++) {
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = 34; // same colour as the ink
    image.data[i * 4 + 3] = digit[i] * 255;
  }
  smallCtx.putImageData(image, 0, 0);

  padCtx.clearRect(0, 0, PAD_SIZE, PAD_SIZE);
  padCtx.imageSmoothingEnabled = true;
  padCtx.drawImage(small, 0, 0, PAD_SIZE, PAD_SIZE);
  update();
});

// Delete, Backspace or Escape clears the pad.
window.addEventListener("keydown", (e) => {
  if (["Delete", "Backspace", "Escape"].includes(e.key) && !e.metaKey && !e.ctrlKey) {
    clearPad();
  }
});

update();
