/* Генерация PWA-иконок из ddc.png (900×900, лого ЦЦР на белом).
   Area-average downscale (качественное уменьшение) + чистка краёв для maskable.
   Запуск: node scripts/gen-icons.js  → пишет в public/icons/. */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SRC = path.join(__dirname, '..', 'public', 'ddc.png');
const OUT = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

const src = PNG.sync.read(fs.readFileSync(SRC));

// Усредняющее уменьшение (box filter). Возвращает новый PNG size×size.
function downscale(size, { flattenWhite = false } = {}) {
  const dst = new PNG({ width: size, height: size });
  const sx = src.width / size, sy = src.height / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; a += src.data[i + 3]; n++;
        }
      }
      const di = (y * size + x) * 4;
      let R = r / n, G = g / n, B = b / n, A = a / n;
      if (flattenWhite && A < 250) { // альфу на белый фон (для iOS)
        const k = A / 255;
        R = R * k + 255 * (1 - k); G = G * k + 255 * (1 - k); B = B * k + 255 * (1 - k); A = 255;
      }
      dst.data[di] = R; dst.data[di + 1] = G; dst.data[di + 2] = B; dst.data[di + 3] = A;
    }
  }
  return dst;
}

// Maskable: белый фон + лого, крайняя рамка (артефакты сверху/снизу) забивается белым.
// Контент остаётся в safe-zone (центральные ~80%).
function maskable(size) {
  const img = downscale(size, { flattenWhite: true });
  const frame = Math.round(size * 0.10);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x < frame || x >= size - frame || y < frame || y >= size - frame) {
        const i = (y * size + x) * 4;
        img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = 255;
      }
    }
  }
  return img;
}

const write = (name, png) => { fs.writeFileSync(path.join(OUT, name), PNG.sync.write(png)); console.log('✓', name, png.width + '×' + png.height); };

write('icon-192.png', downscale(192));
write('icon-512.png', downscale(512));
write('icon-maskable-512.png', maskable(512));
write('apple-touch-180.png', downscale(180, { flattenWhite: true }));
console.log('Готово → public/icons/');
