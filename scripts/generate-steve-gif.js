const GIFEncoder = require('gif-encoder-2');
const fs = require('fs');
const path = require('path');

const W = 120;
const H = 160;
const frames = 24;

function getPixel(img, x, y) {
  return img[y * W + x];
}

function setPixel(img, x, y, idx) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  img[y * W + x] = idx;
}

function fillRect(img, x, y, w, h, colorIdx, outline = false) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (outline && (dx === 0 || dx === w - 1 || dy === 0 || dy === h - 1)) {
        setPixel(img, x + dx, y + dy, 0);
      } else {
        setPixel(img, x + dx, y + dy, colorIdx);
      }
    }
  }
}

function drawSteve(img, armAngle, legAngle, bodyBob) {
  const cx = 60;
  const baseY = 140;

  // Background
  for (let i = 0; i < W * H; i++) img[i] = 1;

  // legs
  const legLen = 20;
  const legW = 6;

  const rLegX = cx - 6;
  const rLegTop = baseY - 2 + Math.sin(legAngle) * 4;
  fillRect(img, rLegX, Math.round(rLegTop), legW, legLen, 5, true);
  fillRect(img, rLegX, Math.round(rLegTop) + legLen - 4, legW, 4, 9, true);

  const lLegX = cx + 2;
  const lLegTop = baseY - 2 + Math.sin(legAngle + Math.PI) * 4;
  fillRect(img, lLegX, Math.round(lLegTop), legW, legLen, 6, true);
  fillRect(img, lLegX, Math.round(lLegTop) + legLen - 4, legW, 4, 10, true);

  // Body
  const bodyY = baseY - 28 - Math.sin(bodyBob) * 2;
  fillRect(img, cx - 8, Math.round(bodyY), 16, 16, 4, true);
  fillRect(img, cx - 8, Math.round(bodyY) + 12, 16, 4, 5, true);

  // Arms
  const armLen = 18;
  const armW = 5;

  const rArmX = cx - 14;
  const rArmY = Math.round(bodyY - 2 + Math.sin(armAngle) * 5);
  fillRect(img, rArmX, rArmY, armW, armLen, 7, true);

  const lArmX = cx + 10;
  const lArmY = Math.round(bodyY - 2 + Math.sin(armAngle + Math.PI) * 5);
  fillRect(img, lArmX, lArmY, armW, armLen, 4, true);

  // Head
  const headY = bodyY - 12 + Math.sin(bodyBob) * 1.5;
  fillRect(img, cx - 7, Math.round(headY), 14, 14, 2, true);
  fillRect(img, cx - 7, Math.round(headY), 14, 4, 8, true);
  setPixel(img, cx - 3, Math.round(headY) + 5, 11);
  setPixel(img, cx + 2, Math.round(headY) + 5, 11);
  setPixel(img, cx - 1, Math.round(headY) + 9, 3);
  setPixel(img, cx, Math.round(headY) + 9, 3);
  setPixel(img, cx + 1, Math.round(headY) + 9, 3);
}

const encoder = new GIFEncoder(W, H);
encoder.setDelay(50);
encoder.setRepeat(0);
encoder.start();

// Palette: index 0-11 mapped to colors
const palette = [
  [0, 0, 0],       // 0: outline
  [26, 26, 46],    // 1: bg
  [220, 170, 131], // 2: skin
  [194, 138, 92],  // 3: skinDark
  [74, 110, 194],  // 4: shirt
  [42, 74, 122],   // 5: pants
  [26, 58, 106],   // 6: pantsDark
  [58, 90, 170],   // 7: shirtDark
  [89, 61, 41],    // 8: hair
  [90, 90, 90],    // 9: shoe
  [60, 60, 60],    // 10: shoeDark
  [74, 107, 140],  // 11: eyes
];

for (let f = 0; f < frames; f++) {
  const t = (f / frames) * Math.PI * 2;
  const armAngle = Math.sin(t) * 0.8;
  const legAngle = Math.sin(t + Math.PI) * 0.8;
  const bodyBob = t;

  const img = new Uint8Array(W * H);
  drawSteve(img, armAngle, legAngle, bodyBob);
  encoder.addFrame(img);
}

encoder.finish();

const buf = encoder.out.getData();
const outPath = path.join(__dirname, '..', 'public', 'steve-walk.gif');
fs.writeFileSync(outPath, buf);

// Also output frames as PNG using FFmpeg
console.log(`GIF saved: ${outPath} (${buf.length} bytes)`);

// Also create a raw RGB dump and convert with ffmpeg
const rgbData = Buffer.alloc(W * H * 3 * frames);
for (let f = 0; f < frames; f++) {
  const t = (f / frames) * Math.PI * 2;
  const armAngle = Math.sin(t) * 0.8;
  const legAngle = Math.sin(t + Math.PI) * 0.8;
  const bodyBob = t;

  const img = new Uint8Array(W * H);
  drawSteve(img, armAngle, legAngle, bodyBob);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = img[y * W + x];
      const c = palette[idx];
      const offset = (f * H * W + y * W + x) * 3;
      rgbData[offset] = c[0];
      rgbData[offset + 1] = c[1];
      rgbData[offset + 2] = c[2];
    }
  }
}

const rawPath = path.join(__dirname, '..', 'public', 'steve-walk.raw');
fs.writeFileSync(rawPath, rgbData);
console.log(`Raw frames saved: ${rawPath}`);
