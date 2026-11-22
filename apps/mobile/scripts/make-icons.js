// Builds the launcher icons from assets/brand/app-logo.jpg (any size/aspect ratio):
//   assets/icon.png           1024×1024, logo centred on its own background colour (legacy/round icon, Play Store)
//   assets/adaptive-icon.png  1024×1024 foreground for Android adaptive icons; the logo is kept inside the
//                             central safe zone (launchers crop the outer third into a circle/squircle)
// The background colour is sampled from the logo's corner and printed for app.config.ts (adaptiveIcon).
// Run from apps/mobile:  node scripts/make-icons.js
const path = require('node:path');
const Jimp = require('jimp-compact');

const SRC = path.join(__dirname, '../assets/brand/app-logo.jpg');
const SIZE = 1024;

function hex(n) {
  return n.toString(16).padStart(2, '0');
}

/** Fades the outer `fraction` of the image to transparent, so its own background melts into the canvas colour. */
function featherEdges(img, fraction) {
  const { width: w, height: h } = img.bitmap;
  const band = Math.max(1, Math.round(Math.min(w, h) * fraction));
  img.scan(0, 0, w, h, function (x, y, idx) {
    const d = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (d < band) {
      const t = d / band;
      this.bitmap.data[idx + 3] = Math.round(this.bitmap.data[idx + 3] * t * t * (3 - 2 * t)); // smoothstep
    }
  });
  return img;
}

async function compose(src, bg, contentFraction, feather = 0) {
  const canvas = new Jimp(SIZE, SIZE, bg);
  const logo = src.clone();
  const max = Math.round(SIZE * contentFraction);
  logo.scaleToFit(max, max, Jimp.RESIZE_BICUBIC);
  if (feather) featherEdges(logo, feather);
  canvas.composite(logo, Math.round((SIZE - logo.bitmap.width) / 2), Math.round((SIZE - logo.bitmap.height) / 2));
  return canvas;
}

(async () => {
  const src = await Jimp.read(SRC);
  // Average a few corner pixels for the background colour.
  const samples = [
    [3, 3],
    [src.bitmap.width - 4, 3],
    [3, src.bitmap.height - 4],
    [src.bitmap.width - 4, src.bitmap.height - 4],
  ].map(([x, y]) => Jimp.intToRGBA(src.getPixelColor(x, y)));
  const avg = (k) => Math.round(samples.reduce((s, p) => s + p[k], 0) / samples.length);
  const [r, g, b] = [avg('r'), avg('g'), avg('b')];
  const bg = Jimp.rgbaToInt(r, g, b, 255);

  // Legacy icon: the logo covers the whole square (cropped slightly at the sides, where there is only background).
  await src.clone().cover(SIZE, SIZE).writeAsync(path.join(__dirname, '../assets/icon.png'));
  // Adaptive foreground: launchers mask it to a circle inside the central ~66%. The whole logo (including the
  // "SIIT" corners) must fit inside that circle, so it is drawn at 60%, and its tile edges are feathered into the
  // background colour so no square shows.
  await (await compose(src, bg, 0.6, 0.08)).writeAsync(path.join(__dirname, '../assets/adaptive-icon.png'));

  console.log(`background #${hex(r)}${hex(g)}${hex(b)}`.toUpperCase());
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
