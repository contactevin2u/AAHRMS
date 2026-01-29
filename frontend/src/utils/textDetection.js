/**
 * Text Detection Utility for Call Log Photos
 * Uses Canvas API edge density + contrast analysis. No external libraries.
 */

const CONFIG = {
  EDGE_DENSITY_THRESHOLD: 0.08,
  MIN_CONTRAST_VARIANCE: 1500,
  MIN_BRIGHTNESS: 30,
  MAX_BRIGHTNESS: 235,
};

export async function detectTextFromBase64(base64Image) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        resolve(analyzeForText(img));
      } catch (err) {
        console.error('[TextDetection] Error:', err);
        resolve({ valid: false, message: 'Failed to analyze image.' });
      }
    };
    img.onerror = () => resolve({ valid: false, message: 'Failed to load image.' });
    img.src = base64Image;
  });
}

function analyzeForText(img) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const width = Math.min(400, img.naturalWidth || img.width);
  const height = Math.min(400, img.naturalHeight || img.height);
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const pixelCount = data.length / 4;

  let totalBrightness = 0;
  const grayData = new Uint8ClampedArray(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const gray = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    grayData[i] = gray;
    totalBrightness += gray;
  }
  const avgBrightness = totalBrightness / pixelCount;

  if (avgBrightness < CONFIG.MIN_BRIGHTNESS) {
    return { valid: false, message: 'Image is too dark. Please retake in better lighting.' };
  }
  if (avgBrightness > CONFIG.MAX_BRIGHTNESS) {
    return { valid: false, message: 'Image is too bright. Please retake.' };
  }

  let edgeCount = 0;
  const totalEdgePixels = (width - 2) * (height - 2);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const gx =
        -grayData[(y - 1) * width + (x - 1)] + grayData[(y - 1) * width + (x + 1)]
        - 2 * grayData[y * width + (x - 1)] + 2 * grayData[y * width + (x + 1)]
        - grayData[(y + 1) * width + (x - 1)] + grayData[(y + 1) * width + (x + 1)];
      const gy =
        -grayData[(y - 1) * width + (x - 1)] - 2 * grayData[(y - 1) * width + x] - grayData[(y - 1) * width + (x + 1)]
        + grayData[(y + 1) * width + (x - 1)] + 2 * grayData[(y + 1) * width + x] + grayData[(y + 1) * width + (x + 1)];
      if (Math.sqrt(gx * gx + gy * gy) > 50) edgeCount++;
    }
  }
  const edgeDensity = edgeCount / totalEdgePixels;

  let varianceSum = 0;
  for (let i = 0; i < pixelCount; i++) {
    const diff = grayData[i] - avgBrightness;
    varianceSum += diff * diff;
  }
  const contrastVariance = varianceSum / pixelCount;

  if (edgeDensity < CONFIG.EDGE_DENSITY_THRESHOLD || contrastVariance < CONFIG.MIN_CONTRAST_VARIANCE) {
    return { valid: false, message: 'This does not look like a call log.' };
  }

  return { valid: true, message: 'Text detected' };
}
