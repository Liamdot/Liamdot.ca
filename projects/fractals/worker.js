// A background worker. The page sends it strips of the picture to work out,
// and several of these run at once (one per processor core), so drawing is
// much faster than doing it all on the page itself.

importScripts("fractal-math.js");

self.onmessage = (event) => {
  const job = event.data;
  const values = FractalMath.computeStrip(job);
  // Hand the numbers back. Listing values.buffer "transfers" it instead of
  // copying it, which is faster.
  self.postMessage({ render: job.render, pass: job.pass, strip: job.strip, rowStart: job.rowStart, values }, [values.buffer]);
};
