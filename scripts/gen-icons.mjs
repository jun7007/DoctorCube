// public/icon.svg 에서 PWA용 PNG 아이콘을 만든다. 실행: npm run icons
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const pub = fileURLToPath(new URL('../public/', import.meta.url));
for (const size of [192, 512]) {
  await sharp(pub + 'icon.svg', { density: 300 }).resize(size, size).png().toFile(`${pub}icon-${size}.png`);
  console.log(`icon-${size}.png`);
}
