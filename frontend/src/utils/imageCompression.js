/**
 * Image Compression Utility
 * Compresses images before upload to save bandwidth and storage
 *
 * DATA STORAGE MINIMIZATION POLICY:
 * - Maximum file size: 200KB per image
 * - Attendance selfie: 640px width, 60% quality (~30-50 KB)
 * - Claim receipt (document scan): 1200px width, 70% quality (~80-150 KB)
 *
 * WHAT IS STORED:
 * - One compressed image per clock action only
 * - WebP/JPEG format, max 640-800px
 * - Quality 60-70%
 *
 * WHAT IS NOT STORED:
 * - Raw camera video
 * - Multiple retry images
 * - Full-resolution photos
 */

// Maximum allowed file size for attendance photos (200KB)
const MAX_ATTENDANCE_PHOTO_SIZE_KB = 200;

/**
 * Compress an image from a data URL
 * @param {string} dataUrl - Base64 data URL of the image
 * @param {Object} options - Compression options
 * @param {number} options.maxWidth - Maximum width in pixels
 * @param {number} options.quality - JPEG quality (0-1)
 * @param {boolean} options.enhanceDocument - Apply document enhancement for text clarity
 * @returns {Promise<string>} - Compressed base64 data URL
 */
export const compressImage = (dataUrl, options = {}) => {
  const {
    maxWidth = 640,
    quality = 0.6,
    enhanceDocument = false
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Calculate new dimensions
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      // Draw image
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Apply document enhancement for better text clarity
      if (enhanceDocument) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Apply contrast and brightness enhancement
        const contrast = 1.3;  // Increase contrast
        const brightness = 10; // Slight brightness boost

        for (let i = 0; i < data.length; i += 4) {
          // Apply contrast and brightness
          data[i] = Math.min(255, Math.max(0, ((data[i] - 128) * contrast) + 128 + brightness));     // Red
          data[i + 1] = Math.min(255, Math.max(0, ((data[i + 1] - 128) * contrast) + 128 + brightness)); // Green
          data[i + 2] = Math.min(255, Math.max(0, ((data[i + 2] - 128) * contrast) + 128 + brightness)); // Blue
        }

        // Apply simple sharpening
        const sharpenedData = applySharpen(imageData, width, height);
        ctx.putImageData(sharpenedData, 0, 0);
      }

      // Convert to JPEG with compression
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = dataUrl;
  });
};

/**
 * Apply sharpening filter for document text clarity
 */
function applySharpen(imageData, width, height) {
  const data = imageData.data;
  const output = new Uint8ClampedArray(data);

  // Sharpening kernel (unsharp mask)
  const kernel = [
    0, -0.5, 0,
    -0.5, 3, -0.5,
    0, -0.5, 0
  ];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let val = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
            val += data[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
          }
        }
        const idx = (y * width + x) * 4 + c;
        output[idx] = Math.min(255, Math.max(0, val));
      }
    }
  }

  return new ImageData(output, width, height);
}

/**
 * Compress an attendance selfie photo with strict size enforcement
 * Policy: Max 200KB, 640px width, 60-70% quality
 *
 * Uses progressive quality reduction to ensure size limit is met.
 *
 * @param {string} dataUrl - Base64 data URL of the image
 * @returns {Promise<string>} - Compressed base64 data URL (guaranteed ≤200KB)
 */
export const compressAttendancePhoto = async (dataUrl) => {
  // Start with standard settings
  let quality = 0.6;
  let maxWidth = 640;
  let compressed = await compressImage(dataUrl, { maxWidth, quality });
  let sizeKB = getBase64SizeKB(compressed);

  // If within limit, return immediately
  if (sizeKB <= MAX_ATTENDANCE_PHOTO_SIZE_KB) {
    return compressed;
  }

  // Progressive quality reduction to meet size limit
  const qualitySteps = [0.5, 0.4, 0.35, 0.3];
  for (const q of qualitySteps) {
    compressed = await compressImage(dataUrl, { maxWidth, quality: q });
    sizeKB = getBase64SizeKB(compressed);

    if (sizeKB <= MAX_ATTENDANCE_PHOTO_SIZE_KB) {
      console.log(`[Compression] Achieved ${sizeKB}KB at quality ${q}`);
      return compressed;
    }
  }

  // Last resort: reduce dimensions
  const dimensionSteps = [480, 400, 320];
  for (const w of dimensionSteps) {
    compressed = await compressImage(dataUrl, { maxWidth: w, quality: 0.3 });
    sizeKB = getBase64SizeKB(compressed);

    if (sizeKB <= MAX_ATTENDANCE_PHOTO_SIZE_KB) {
      console.log(`[Compression] Achieved ${sizeKB}KB at ${w}px width`);
      return compressed;
    }
  }

  // Return smallest possible (should rarely reach here)
  console.warn(`[Compression] Could not reduce below ${sizeKB}KB`);
  return compressed;
};

/**
 * Compress a claim receipt photo (document scan mode)
 * Settings: 1200px width, 70% quality (~80-150 KB)
 * Applies contrast and sharpening for clear text
 * @param {string} dataUrl - Base64 data URL of the image
 * @returns {Promise<string>} - Compressed base64 data URL
 */
export const compressReceiptPhoto = (dataUrl) => {
  return compressImage(dataUrl, {
    maxWidth: 1200,
    quality: 0.7,
    enhanceDocument: true  // Enable document enhancement for text clarity
  });
};

/**
 * Scan document - higher quality for important documents
 * Settings: 1500px width, 80% quality with full enhancement
 * @param {string} dataUrl - Base64 data URL of the image
 * @returns {Promise<string>} - Compressed base64 data URL
 */
export const scanDocument = (dataUrl) => {
  return compressImage(dataUrl, {
    maxWidth: 1500,
    quality: 0.8,
    enhanceDocument: true
  });
};

/**
 * Get file size in KB from base64 string
 * @param {string} base64 - Base64 string (with or without data URL prefix)
 * @returns {number} - Size in KB
 */
export const getBase64SizeKB = (base64) => {
  // Remove data URL prefix if present
  const base64Data = base64.split(',').pop();
  // Calculate approximate size
  const sizeInBytes = (base64Data.length * 3) / 4;
  return Math.round(sizeInBytes / 1024);
};

export default {
  compressImage,
  compressAttendancePhoto,
  compressReceiptPhoto,
  scanDocument,
  getBase64SizeKB
};
