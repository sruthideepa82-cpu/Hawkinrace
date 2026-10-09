import { Jimp } from 'jimp';

const files = [
  'public/cars/ui-apex-vulcan.png',
  'public/cars/ui-venom-verde.png',
  'public/cars/ui-shadow-gt.png',
  'public/cars/ui-inferno-rs.png'
];

async function removeBackground() {
  for (const file of files) {
    const image = await Jimp.read(file);
    
    // Sample the background color at the top-left pixel (0,0)
    const bgColorInt = image.getPixelColor(0, 0);
    const bgR = (bgColorInt >> 24) & 255;
    const bgG = (bgColorInt >> 16) & 255;
    const bgB = (bgColorInt >> 8) & 255;

    console.log(`File: ${file} BG Color at 0,0: R:${bgR} G:${bgG} B:${bgB}`);

    const distance = (r1, g1, b1, r2, g2, b2) => {
      return Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2));
    };

    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      
      const dist = distance(r, g, b, bgR, bgG, bgB);
      
      // We know it's a solid green/magenta chroma key
      // Distance is in 3D RGB space. Max distance is sqrt(255^2*3) = 441.
      const threshold = 60;
      const softEdge = 40;
      
      if (dist < threshold) {
        this.bitmap.data[idx + 3] = 0; // Fully transparent
      } else if (dist < threshold + softEdge) {
        const alpha = Math.floor(((dist - threshold) / softEdge) * 255);
        this.bitmap.data[idx + 3] = Math.min(this.bitmap.data[idx + 3], alpha);
      }
    });

    image.write(file);
    console.log(`Processed: ${file}`);
  }
}

removeBackground().catch(console.error);
