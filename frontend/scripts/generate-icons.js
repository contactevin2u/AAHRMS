/**
 * PWA Icon Generator Script
 *
 * To generate icons, you need to:
 * 1. Install sharp: npm install sharp --save-dev
 * 2. Run: node scripts/generate-icons.js
 *
 * OR use an online tool:
 * - https://realfavicongenerator.net/
 * - https://www.pwabuilder.com/imageGenerator
 *
 * Upload your logo and download the generated icons to public/icons/
 */

const fs = require('fs');
const path = require('path');

// Icon sizes needed for PWA
const iconSizes = [
  16, 32, 72, 96, 128, 144, 152, 167, 180, 192, 384, 512
];

// Splash screen sizes for iOS
const splashSizes = [
  { width: 640, height: 1136, name: 'splash-640x1136.png' },
  { width: 750, height: 1334, name: 'splash-750x1334.png' },
  { width: 1242, height: 2208, name: 'splash-1242x2208.png' },
  { width: 1125, height: 2436, name: 'splash-1125x2436.png' }
];

async function generateIcons() {
  try {
    const sharp = require('sharp');
    const inputImage = path.join(__dirname, '../public/mixue-logo.png');
    const outputDir = path.join(__dirname, '../public/icons');

    // Create output directory if not exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log('Generating PWA icons...\n');

    // Generate app icons
    for (const size of iconSizes) {
      const outputFile = path.join(outputDir, `icon-${size}x${size}.png`);

      await sharp(inputImage)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png()
        .toFile(outputFile);

      console.log(`Created: icon-${size}x${size}.png`);
    }

    // Generate splash screens
    console.log('\nGenerating splash screens...\n');

    for (const splash of splashSizes) {
      const outputFile = path.join(outputDir, splash.name);

      // Create splash with logo centered
      const logoSize = Math.min(splash.width, splash.height) * 0.3;
      const logo = await sharp(inputImage)
        .resize(Math.round(logoSize), Math.round(logoSize), { fit: 'contain' })
        .toBuffer();

      await sharp({
        create: {
          width: splash.width,
          height: splash.height,
          channels: 4,
          background: { r: 233, g: 30, b: 99, alpha: 1 } // #e91e63
        }
      })
        .composite([{
          input: logo,
          gravity: 'center'
        }])
        .png()
        .toFile(outputFile);

      console.log(`Created: ${splash.name}`);
    }

    console.log('\nAll icons generated successfully!');

  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log('Sharp module not found.');
      console.log('Please install it: npm install sharp --save-dev');
      console.log('\nAlternatively, use an online icon generator:');
      console.log('- https://realfavicongenerator.net/');
      console.log('- https://www.pwabuilder.com/imageGenerator');
      createPlaceholderIcons();
    } else {
      console.error('Error generating icons:', error);
    }
  }
}

// Create simple placeholder SVG icons
function createPlaceholderIcons() {
  const outputDir = path.join(__dirname, '../public/icons');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('\nCreating placeholder icons...');

  // Create a simple SVG placeholder
  const createSvgIcon = (size) => `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#e91e63"/>
  <text x="50%" y="50%" font-family="Arial" font-size="${size * 0.4}" fill="white" text-anchor="middle" dy=".35em">M</text>
</svg>`;

  for (const size of iconSizes) {
    const svgContent = createSvgIcon(size);
    fs.writeFileSync(
      path.join(outputDir, `icon-${size}x${size}.svg`),
      svgContent.trim()
    );
    console.log(`Created placeholder: icon-${size}x${size}.svg`);
  }

  console.log('\nNote: Replace these SVG placeholders with proper PNG icons.');
  console.log('Use https://www.pwabuilder.com/imageGenerator to generate them.');
}

generateIcons();
