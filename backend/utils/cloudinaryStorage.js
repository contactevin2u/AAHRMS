/**
 * Cloudinary Storage Utilities
 *
 * Upload functions for attendance photos and claim receipts.
 * Files are organized in folders:
 * - hrms/attendance/{company_id}/{employee_id}/
 * - hrms/claims/{company_id}/{employee_id}/
 */

const cloudinary = require('../config/cloudinary');

/**
 * Upload attendance photo to Cloudinary
 *
 * Compression settings for selfies:
 * - Width: 480px (small, sufficient for face verification)
 * - Quality: auto:low (maximum compression)
 * - Format: jpg (best compression for photos)
 * - Target size: ~20-40KB
 *
 * @param {string} base64Data - Base64 encoded image (with or without data URI prefix)
 * @param {number} companyId - Company ID
 * @param {number} employeeId - Employee ID
 * @param {string} clockType - Type of clock action (clock_in_1, clock_out_1, clock_in_2, clock_out_2)
 * @returns {Promise<string>} - Cloudinary secure URL
 */
async function uploadAttendance(base64Data, companyId, employeeId, clockType) {
  try {
    // Ensure proper data URI format
    let uploadData = base64Data;
    if (!base64Data.startsWith('data:')) {
      uploadData = `data:image/jpeg;base64,${base64Data}`;
    }

    const timestamp = Date.now();
    const publicId = `hrms/attendance/${companyId}/${employeeId}/${clockType}_${timestamp}`;

    const result = await cloudinary.uploader.upload(uploadData, {
      public_id: publicId,
      resource_type: 'image',
      overwrite: true,
      folder: '',
      transformation: [
        {
          width: 480,
          crop: 'limit',        // Only shrink if larger, don't upscale
          quality: 'auto:low',  // Maximum compression
          fetch_format: 'jpg'   // Force JPG for best compression
        }
      ]
    });

    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary attendance upload error:', error);
    throw new Error(`Failed to upload attendance photo: ${error.message}`);
  }
}

/**
 * Upload claim receipt to Cloudinary (supports images and PDFs)
 *
 * Compression settings for receipts:
 * - Width: 1200px (large enough for text readability)
 * - Quality: auto:good (balanced compression, text stays clear)
 * - Format: auto (keeps PDF as PDF, images as optimal format)
 * - Flags: preserve_transparency (for PNG receipts)
 * - Target size: ~100-200KB, text still readable
 *
 * @param {string} base64Data - Base64 encoded file (with or without data URI prefix)
 * @param {number} companyId - Company ID
 * @param {number} employeeId - Employee ID
 * @param {number|string} claimId - Claim ID or timestamp for new claims
 * @returns {Promise<string>} - Cloudinary secure URL
 */
async function uploadClaim(base64Data, companyId, employeeId, claimId) {
  try {
    // Ensure proper data URI format
    let uploadData = base64Data;
    let isPDF = false;

    if (!base64Data.startsWith('data:')) {
      // Try to detect type from base64 header
      if (base64Data.startsWith('JVBERi')) {
        // PDF magic bytes in base64
        uploadData = `data:application/pdf;base64,${base64Data}`;
        isPDF = true;
      } else {
        uploadData = `data:image/jpeg;base64,${base64Data}`;
      }
    } else {
      // Check if it's a PDF from the data URI
      isPDF = base64Data.includes('application/pdf');
    }

    const timestamp = Date.now();
    const publicId = `hrms/claims/${companyId}/${employeeId}/claim_${claimId || timestamp}`;

    // Different settings for PDF vs images
    const uploadOptions = {
      public_id: publicId,
      resource_type: 'auto',
      overwrite: true,
      folder: ''
    };

    // Only apply image transformations for non-PDF files
    if (!isPDF) {
      uploadOptions.transformation = [
        {
          width: 1200,
          crop: 'limit',              // Only shrink if larger
          quality: 'auto:good',       // Good quality for text readability
          flags: 'preserve_transparency', // Keep transparency for PNGs
          fetch_format: 'auto'        // Let Cloudinary choose best format
        }
      ];
    }

    const result = await cloudinary.uploader.upload(uploadData, uploadOptions);

    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary claim upload error:', error);
    throw new Error(`Failed to upload claim receipt: ${error.message}`);
  }
}

/**
 * Delete a file from Cloudinary
 *
 * @param {string} publicId - The public ID of the file to delete
 * @returns {Promise<object>} - Deletion result
 */
async function deleteFile(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Extract public ID from Cloudinary URL
 *
 * @param {string} url - Cloudinary URL
 * @returns {string|null} - Public ID or null
 */
function extractPublicId(url) {
  if (!url || !url.includes('cloudinary.com')) return null;

  try {
    // URL format: https://res.cloudinary.com/cloud_name/image/upload/v123/public_id.ext
    const parts = url.split('/upload/');
    if (parts.length < 2) return null;

    const pathWithVersion = parts[1];
    // Remove version number if present (v123456/)
    const pathWithoutVersion = pathWithVersion.replace(/^v\d+\//, '');
    // Remove file extension
    const publicId = pathWithoutVersion.replace(/\.[^/.]+$/, '');

    return publicId;
  } catch {
    return null;
  }
}

module.exports = {
  uploadAttendance,
  uploadClaim,
  deleteFile,
  extractPublicId
};
