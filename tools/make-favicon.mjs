/**
 * Builds the raster icons from public/favicon.svg.
 *
 * The favicon was a 184KB .ico holding nine sizes up to 256x256, eight of them
 * stored as uncompressed 32-bit bitmaps. It was 78% of everything the site
 * served: the game itself, all seven scripts, the stylesheet and the page, came
 * to 51KB together.
 *
 * Modern browsers take the SVG and need none of this. What is built here is the
 * fallback: a two-size .ico for Safari before 16 and for anything that asks for
 * /favicon.ico without being told to, and one apple-touch-icon for a phone home
 * screen. Together they are a few kilobytes.
 *
 *   node tools/make-favicon.mjs
 *
 * Run it after editing the SVG; the outputs are committed, so a normal build
 * never runs this and the repository keeps no image pipeline.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../test/helpers/browser.mjs';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** Sizes inside the .ico. 16 and 32 are the two a browser tab actually asks for. */
const ICO_SIZES = [16, 32];
const TOUCH_SIZE = 180;

const svg = fs.readFileSync(path.join(PUBLIC, 'favicon.svg'), 'utf8');
const browser = await launchBrowser();
const page = await (await browser.newContext()).newPage();
await page.setContent('<body style="margin:0">' + svg + '</body>');

/** Rasterises the SVG at one size, as either raw RGBA or a PNG. */
async function render(size, as) {
    return page.evaluate(async (options) => {
        const source = document.querySelector('svg').outerHTML;
        const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
        const image = new Image();
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
            image.src = url;
        });

        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = options.size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, options.size, options.size);
        URL.revokeObjectURL(url);

        if (options.as === 'png') {
            return canvas.toDataURL('image/png').split(',')[1];
        }
        return Array.from(ctx.getImageData(0, 0, options.size, options.size).data);
    }, { size: size, as: as });
}

/**
 * One BMP image inside an .ico: a header, the pixels bottom-up in BGRA, and an
 * AND mask. The mask is redundant when every pixel carries its own alpha, but
 * the format requires it, so it is written as zeroes.
 */
function bitmap(size, rgba) {
    const header = Buffer.alloc(40);
    const maskStride = Math.ceil(size / 8 / 4) * 4;
    const pixels = Buffer.alloc(size * size * 4);

    header.writeUInt32LE(40, 0);
    header.writeInt32LE(size, 4);
    header.writeInt32LE(size * 2, 8);  // the height covers image and mask
    header.writeUInt16LE(1, 12);
    header.writeUInt16LE(32, 14);
    header.writeUInt32LE(pixels.length + maskStride * size, 20);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const from = (y * size + x) * 4;
            const to = ((size - 1 - y) * size + x) * 4;
            pixels[to] = rgba[from + 2];
            pixels[to + 1] = rgba[from + 1];
            pixels[to + 2] = rgba[from];
            pixels[to + 3] = rgba[from + 3];
        }
    }

    return Buffer.concat([header, pixels, Buffer.alloc(maskStride * size)]);
}

const images = [];
for (const size of ICO_SIZES) {
    images.push({ size: size, data: bitmap(size, await render(size, 'rgba')) });
}

const directory = Buffer.alloc(6 + images.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(images.length, 4);

let offset = directory.length;
images.forEach((image, i) => {
    const entry = 6 + i * 16;
    directory.writeUInt8(image.size, entry);
    directory.writeUInt8(image.size, entry + 1);
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
});

const ico = Buffer.concat([directory, ...images.map(i => i.data)]);
fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), ico);

const touch = Buffer.from(await render(TOUCH_SIZE, 'png'), 'base64');
fs.writeFileSync(path.join(PUBLIC, 'apple-touch-icon.png'), touch);

await browser.close();

console.log('favicon.ico          ' + ico.length + ' bytes (' + ICO_SIZES.join(', ') + ')');
console.log('apple-touch-icon.png ' + touch.length + ' bytes (' + TOUCH_SIZE + ')');
console.log('favicon.svg          ' + Buffer.byteLength(svg) + ' bytes');
