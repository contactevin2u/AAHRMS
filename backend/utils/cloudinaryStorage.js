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
      resource_type: 'auto',
      overwrite: true,
      folder: '', // Already included in public_id
      transformation: [
        { quality: 'auto:low', fetch_format: 'auto' } // Optimize for smaller size
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
    if (!base64Data.startsWith('data:')) {
      // Try to detect type from base64 header
      if (base64Data.startsWith('JVBERi')) {
        // PDF magic bytes in base64
        uploadData = `data:application/pdf;base64,${base64Data}`;
      } else {
        uploadData = `data:image/jpeg;base64,${base64Data}`;
      }
    }

    const timestamp = Date.now();
    const publicId = `hrms/claims/${companyId}/${employeeId}/claim_${claimId || timestamp}`;

    const result = await cloudinary.uploader.upload(uploadData, {
      public_id: publicId,
      resource_type: 'auto', // Handles both images and PDFs
      overwrite: true,
      folder: ''
    });

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
