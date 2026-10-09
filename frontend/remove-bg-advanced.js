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
    const bgColorInt = image.getPixelColor(0, 0);
    const bgR = (bgColorInt >> 24) & 255;
    const bgG = (bgColorInt >> 16) & 255;
    const bgB = (bgColorInt >> 8) & 255;

    const isGreenKey = bgG > 200 && bgR < 50;
    const isMagentaKey = bgR > 200 && bgB > 200 && bgG < 50;

    const distance = (r1, g1, b1, r2, g2, b2) => {
      return Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2));
    };

    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      
      const dist = distance(r, g, b, bgR, bgG, bgB);
      
      // More aggressive threshold to completely destroy green edges
      const threshold = 120;
      const softEdge = 60;
      
      if (dist < threshold) {
        this.bitmap.data[idx + 3] = 0; 
      } else if (dist < threshold + softEdge) {
        let alpha = Math.floor(((dist - threshold) / softEdge) * 255);
        this.bitmap.data[idx + 3] = Math.min(this.bitmap.data[idx + 3], alpha);
        
        // Spill suppression: if it's green keyed, reduce green channel
        if (isGreenKey) {
           this.bitmap.data[idx + 1] = Math.min(g, Math.max(r, b));
        } else if (isMagentaKey) {
           // reduce magenta (r and b)
           this.bitmap.data[idx + 0] = Math.min(r, g);
           this.bitmap.data[idx + 2] = Math.min(b, g);
        }
      }
    });

    image.write(file);
    console.log(`Processed with spill suppression: ${file}`);
  }
}

removeBackground().catch(console.error);
