// The ⏮ ⏯ ⏭ icons for the taskbar thumbnail buttons, drawn in code instead
// of shipped as image files. Shapes are on a 16×16 grid, rendered at 32×32
// (scale factor 2, crisp on high-DPI screens) with 4×4 supersampling for
// smooth edges.
const { nativeImage } = require("electron");

const SIZE = 32;
const UNIT = SIZE / 16;
const SAMPLES = 4;

const rect = (x, y, w, h) => (px, py) => px >= x && px <= x + w && py >= y && py <= y + h;

function triangle(a, b, c) {
  // Which side of the edge p→q the point lies on.
  const cross = (p, q, x, y) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  return (x, y) => {
    const d = [cross(a, b, x, y), cross(b, c, x, y), cross(c, a, x, y)];
    // Inside when the point isn't on both sides of the edges.
    return !(d.some((v) => v < 0) && d.some((v) => v > 0));
  };
}

const SHAPES = {
  play: [triangle([5, 3], [13, 8], [5, 13])],
  pause: [rect(4, 3, 3, 10), rect(9, 3, 3, 10)],
  next: [triangle([3, 3], [10, 8], [3, 13]), rect(11, 3, 2, 10)],
  previous: [rect(3, 3, 2, 10), triangle([13, 3], [6, 8], [13, 13])],
};

function draw(parts) {
  // BGRA, white with the coverage as alpha.
  const buffer = Buffer.alloc(SIZE * SIZE * 4);
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / UNIT;
          const y = (py + (sy + 0.5) / SAMPLES) / UNIT;
          if (parts.some((inside) => inside(x, y))) hits++;
        }
      }
      const alpha = Math.round((hits / (SAMPLES * SAMPLES)) * 255);
      const i = (py * SIZE + px) * 4;
      // Premultiplied: white at this alpha.
      buffer[i] = buffer[i + 1] = buffer[i + 2] = alpha;
      buffer[i + 3] = alpha;
    }
  }
  return nativeImage.createFromBitmap(buffer, { width: SIZE, height: SIZE, scaleFactor: 2 });
}

let cache = null;

/** { play, pause, next, previous } as NativeImages; built once, on first use (after app ready). */
function mediaIcons() {
  cache ??= Object.fromEntries(Object.entries(SHAPES).map(([name, parts]) => [name, draw(parts)]));
  return cache;
}

module.exports = { mediaIcons };
