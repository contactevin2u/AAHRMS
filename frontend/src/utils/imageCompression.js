/**
 * Image Compression Utility
 * Compresses images before upload to save bandwidth and storage
 *
 * Compression Settings:
 * - Attendance selfie: 640px width, 60% quality (~30-50 KB)
 * - Claim receipt: 1200px width, 70% quality (~80-150 KB)
 */

/**
 * Compress an image from a data URL
 * @param {string} dataUrl - Base64 data URL of the image
 * @param {Object} options - Compression options
 * @param {number} options.maxWidth - Maximum width in pixels
 * @param {number} options.quality - JPEG quality (0-1)
 * @returns {Promise<string>} - Compressed base64 data URL
 */
export const compressImage = (dataUrl, options = {}) => {
  const {
    maxWidth = 640,
    quality = 0.6
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
 * Compress an attendance selfie photo
 * Settings: 640px width, 60% quality (~30-50 KB)
 * @param {string} dataUrl - Base64 data URL of the image
 * @returns {Promise<string>} - Compressed base64 data URL
 */
export const compressAttendancePhoto = (dataUrl) => {
  return compressImage(dataUrl, {
    maxWidth: 640,
    quality: 0.6
  });
};

/**
 * Compress a claim receipt photo
 * Settings: 1200px width, 70% quality (~80-150 KB)
 * @param {string} dataUrl - Base64 data URL of the image
 * @returns {Promise<string>} - Compressed base64 data URL
 */
export const compressReceiptPhoto = (dataUrl) => {
  return compressImage(dataUrl, {
    maxWidth: 1200,
    quality: 0.7
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
  getBase64SizeKB
};
