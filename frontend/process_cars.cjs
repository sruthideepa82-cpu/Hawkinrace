const { Jimp, intToRGBA } = require('jimp');
const fs = require('fs');

const cars = [
  { file: 'C:\\Users\\Sruthi\\.gemini\\antigravity-ide\\brain\\bd0e8ba1-7833-4021-9d0b-c98d80b5f2ab\\apex_vulcan_1791551030833.png', out: 'public/cars/car-orange-top.png' },
  { file: 'C:\\Users\\Sruthi\\.gemini\\antigravity-ide\\brain\\bd0e8ba1-7833-4021-9d0b-c98d80b5f2ab\\venom_verde_1791551043389.png', out: 'public/cars/car-green-top.png' },
  { file: 'C:\\Users\\Sruthi\\.gemini\\antigravity-ide\\brain\\bd0e8ba1-7833-4021-9d0b-c98d80b5f2ab\\shadow_gt_1791551055545.png', out: 'public/cars/car-blue-top.png' },
  { file: 'C:\\Users\\Sruthi\\.gemini\\antigravity-ide\\brain\\bd0e8ba1-7833-4021-9d0b-c98d80b5f2ab\\inferno_rs_1791551069404.png', out: 'public/cars/car-red-top.png' },
];

function colorDistance(r1, g1, b1, r2, g2, b2) {
  return Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2));
}

async function processImage(input, output) {
  try {
    const image = await Jimp.read(input);
    const bg = intToRGBA(image.getPixelColor(0, 0));
    
    let minX = image.bitmap.width, minY = image.bitmap.height, maxX = 0, maxY = 0;

    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      
      if (colorDistance(r, g, b, bg.r, bg.g, bg.b) < 110) {
        this.bitmap.data[idx + 3] = 0; // Set alpha to 0
      } else {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    });

    if (maxX >= minX && maxY >= minY) {
      image.crop({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
    }
    
    await image.write(output);
    console.log(`Saved ${output}`);
  } catch (err) {
    console.error(`Error processing ${input}:`, err);
  }
}

async function main() {
  for (const car of cars) {
    await processImage(car.file, car.out);
  }
}

main();
