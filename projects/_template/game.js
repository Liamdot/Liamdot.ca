// Placeholder game: click the bouncing ball. Replace everything below the
// "your game" line with your own code.
//
// The canvas fills everything under the nav bar. W and H are its current size
// in CSS pixels and update whenever the window (or fullscreen) changes size.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W = 0;
let H = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

new ResizeObserver(resize).observe(canvas);
resize();

// Mouse/touch position in canvas coordinates.
function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// Your game ----------------------------------------------------------------

let ball, score, paused;

function reset() {
  ball = { x: W / 2, y: H / 2, vx: 240, vy: -200, r: 36 };
  score = 0;
  paused = false;
}

function update(dt) {
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  if (ball.x < ball.r || ball.x > W - ball.r) ball.vx *= -1;
  if (ball.y < ball.r || ball.y > H - ball.r) ball.vy *= -1;
  ball.x = Math.max(ball.r, Math.min(W - ball.r, ball.x));
  ball.y = Math.max(ball.r, Math.min(H - ball.r, ball.y));
}

function draw() {
  ctx.fillStyle = "#b6dd9a";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#e0453a";
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2f6b2a";
  ctx.font = "bold 28px -apple-system, Helvetica, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`score: ${score}`, 20, 44);

  if (paused) {
    ctx.textAlign = "center";
    ctx.fillText("paused", W / 2, H / 2);
  }
}

function overBall(p) {
  return p && Math.hypot(p.x - ball.x, p.y - ball.y) <= ball.r;
}

// Show a pointer while the mouse is over the ball (checked every frame, since
// the ball moves even when the mouse doesn't).
let pointer = null;
canvas.addEventListener("pointermove", (e) => (pointer = canvasPoint(e)));
canvas.addEventListener("pointerleave", () => (pointer = null));

function updateCursor() {
  const cursor = overBall(pointer) ? "pointer" : "default";
  if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
}

canvas.addEventListener("pointerdown", (e) => {
  if (overBall(canvasPoint(e))) {
    score++;
    ball.vx *= 1.1;
    ball.vy *= 1.1;
  }
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    paused = !paused;
    e.preventDefault();
  }
  if (e.code === "KeyR") reset();
});

// Main loop ----------------------------------------------------------------

let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!paused) update(dt);
  draw();
  updateCursor();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
