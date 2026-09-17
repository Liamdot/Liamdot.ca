// Fractal math, shared by the page (app.js) and the background workers (worker.js).
//
// Every pixel is a number on the complex plane. We plug it into a formula
// over and over (z = z² + c for the Mandelbrot set) and count how many steps
// it takes to escape past a certain size. Points that never escape are
// inside the set (black); the rest are coloured by how fast they escaped.

(function (global) {
  // Points escape once they're further than this from 0 (squared). A big
  // number gives smoother colour bands.
  const BAILOUT = 256;

  // A smooth escape count, so colours blend instead of forming hard stripes.
  function smooth(steps, size2) {
    return steps + 1 - Math.log2(Math.log(size2) / 2);
  }

  // Each formula takes a point (x, y), the maximum number of steps, the
  // loop tolerance (explained below) and, for Julia sets, c. It returns how
  // fast the point escaped, or -1 if it never did.
  //
  // Loop shortcut: points inside the set use up every step, which is the
  // slowest part. But most of them settle into a loop, visiting the same few
  // values over and over. If z comes back to a value we saved earlier (to
  // within "tolerance"), it's stuck and will never escape, so we stop early.
  //
  // The formulas all share the same shape; only the line that updates zy
  // differs. They're written out separately because this runs millions of
  // times, and keeping each one simple makes it faster.
  const FORMULAS = {
    // z = z² + c, starting from z = 0, with c being the point
    mandelbrot(cx, cy, max, tolerance) {
      // Shortcut: points in the big heart shape and the circle to its left
      // never escape, so skip the slow part for them.
      const q = (cx - 0.25) ** 2 + cy * cy;
      if (q * (q + (cx - 0.25)) <= 0.25 * cy * cy || (cx + 1) ** 2 + cy * cy <= 0.0625) return -1;

      let zx = 0, zy = 0, zx2 = 0, zy2 = 0, i = 0;
      let savedX = 0, savedY = 0, nextSave = 8;
      while (i < max && zx2 + zy2 <= BAILOUT) {
        zy = 2 * zx * zy + cy;
        zx = zx2 - zy2 + cx;
        zx2 = zx * zx;
        zy2 = zy * zy;
        i++;
        if (Math.abs(zx - savedX) < tolerance && Math.abs(zy - savedY) < tolerance) return -1;
        if (i === nextSave) { savedX = zx; savedY = zy; nextSave *= 2; }
      }
      return i === max ? -1 : smooth(i, zx2 + zy2);
    },

    // z = z² + c again, but z starts at the point and c is fixed
    julia(zx, zy, max, tolerance, cx, cy) {
      let zx2 = zx * zx, zy2 = zy * zy, i = 0;
      let savedX = zx, savedY = zy, nextSave = 8;
      while (i < max && zx2 + zy2 <= BAILOUT) {
        zy = 2 * zx * zy + cy;
        zx = zx2 - zy2 + cx;
        zx2 = zx * zx;
        zy2 = zy * zy;
        i++;
        if (Math.abs(zx - savedX) < tolerance && Math.abs(zy - savedY) < tolerance) return -1;
        if (i === nextSave) { savedX = zx; savedY = zy; nextSave *= 2; }
      }
      return i === max ? -1 : smooth(i, zx2 + zy2);
    },

    // like Mandelbrot, but takes the absolute value (drops the minus signs) each step
    ship(cx, cy, max, tolerance) {
      let zx = 0, zy = 0, zx2 = 0, zy2 = 0, i = 0;
      let savedX = 0, savedY = 0, nextSave = 8;
      while (i < max && zx2 + zy2 <= BAILOUT) {
        zy = Math.abs(2 * zx * zy) + cy;
        zx = zx2 - zy2 + cx;
        zx2 = zx * zx;
        zy2 = zy * zy;
        i++;
        if (Math.abs(zx - savedX) < tolerance && Math.abs(zy - savedY) < tolerance) return -1;
        if (i === nextSave) { savedX = zx; savedY = zy; nextSave *= 2; }
      }
      return i === max ? -1 : smooth(i, zx2 + zy2);
    },

    // like Mandelbrot, but flips z upside down (its "conjugate") each step
    tricorn(cx, cy, max, tolerance) {
      let zx = 0, zy = 0, zx2 = 0, zy2 = 0, i = 0;
      let savedX = 0, savedY = 0, nextSave = 8;
      while (i < max && zx2 + zy2 <= BAILOUT) {
        zy = -2 * zx * zy + cy;
        zx = zx2 - zy2 + cx;
        zx2 = zx * zx;
        zy2 = zy * zy;
        i++;
        if (Math.abs(zx - savedX) < tolerance && Math.abs(zy - savedY) < tolerance) return -1;
        if (i === nextSave) { savedX = zx; savedY = zy; nextSave *= 2; }
      }
      return i === max ? -1 : smooth(i, zx2 + zy2);
    },
  };

  // Works out one horizontal strip of the picture (rows rowStart to rowEnd),
  // in blocks of "block" pixels, and returns one number per pixel.
  function computeStrip(job) {
    const { fractal, julia, max, left, top, step, flip, width, rowStart, rowEnd, block } = job;
    const formula = FORMULAS[fractal];
    const tolerance = Math.min(1e-10, step * 1e-4); // far smaller than a pixel, so the shortcut never shows
    const values = new Float32Array((rowEnd - rowStart) * width);

    for (let py = rowStart; py < rowEnd; py += block) {
      const cy = top + flip * py * step;
      const blockH = Math.min(block, rowEnd - py);
      for (let px = 0; px < width; px += block) {
        const value = formula(left + px * step, cy, max, tolerance, julia[0], julia[1]);
        const blockW = Math.min(block, width - px);
        for (let dy = 0; dy < blockH; dy++) {
          const start = (py - rowStart + dy) * width + px;
          values.fill(value, start, start + blockW);
        }
      }
    }
    return values;
  }

  global.FractalMath = { FORMULAS, computeStrip };
})(self);
