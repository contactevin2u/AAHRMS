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
 * Convert PDF to image using pdf.js (for reliable OpenAI reading)
 */
async function convertPdfToImageLocal(pdfBase64) {
  try {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
    const { createCanvas } = require('canvas');

    // Remove data URL prefix if present
    const pdfData = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
    const pdfBuffer = Buffer.from(pdfData, 'base64');
    const pdfUint8Array = new Uint8Array(pdfBuffer);

    class NodeCanvasFactory {
      create(width, height) {
        const canvas = createCanvas(width, height);
        const context = canvas.getContext('2d');
        return { canvas, context };
      }
      reset(canvasAndContext, width, height) {
        canvasAndContext.canvas.width = width;
        canvasAndContext.canvas.height = height;
      }
      destroy(canvasAndContext) {
        canvasAndContext.canvas.width = 0;
        canvasAndContext.canvas.height = 0;
      }
    }

    const loadingTask = pdfjsLib.getDocument({
      data: pdfUint8Array,
      canvasFactory: new NodeCanvasFactory(),
      disableFontFace: true,
      isEvalSupported: false
    });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);

    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    context.fillStyle = 'white';
    context.fillRect(0, 0, viewport.width, viewport.height);

    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvasFactory: new NodeCanvasFactory()
    }).promise;

    // Return as JPEG base64
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch (error) {
    console.error('PDF to image conversion error:', error);
    throw new Error('Failed to convert PDF: ' + error.message);
  }
}

/**
 * Upload attendance photo to Cloudinary
 *
 * Compression settings for selfies:
 * - Width: 480px
 * - Quality: auto:low (maximum compression)
 * - Format: jpg
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
          crop: 'limit',
          quality: 'auto:low',
          format: 'jpg'
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
 * - Width: 1000px
 * - Quality: auto:low (max compression)
 * - Format: jpg (all converted to JPG including PDFs)
 * - Effect: sharpen (keeps text edges clear despite compression)
 * - PDFs: converted to JPG, page 1 only
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

    // Convert PDF to image FIRST for reliable OpenAI reading
    if (isPDF) {
      console.log('Converting PDF to image before upload...');
      try {
        uploadData = await convertPdfToImageLocal(uploadData);
        console.log('PDF converted to image successfully');
        isPDF = false; // Now it's an image
      } catch (convError) {
        console.error('PDF conversion failed:', convError.message);
        // Still upload as image placeholder - will need manual approval
        // Create a simple placeholder or keep trying with original
        isPDF = false; // Treat as image for upload
      }
    }

    const timestamp = Date.now();
    const publicId = `hrms/claims/${companyId}/${employeeId}/claim_${claimId || timestamp}`;

    const uploadOptions = {
      public_id: publicId,
      resource_type: 'image',
      overwrite: true,
      folder: '',
      transformation: [
        {
          width: 1000,
          crop: 'limit',
          quality: 'auto:low',
          format: 'jpg',
          effect: 'sharpen'  // Keep text edges clear
        }
      ]
    };

    const result = await cloudinary.uploader.upload(uploadData, uploadOptions);
    // Note: If PDF conversion failed, AI won't be able to read it = manual approval required

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

/**
 * Upload profile picture to Cloudinary
 *
 * Compression settings for profile pictures:
 * - Width/Height: 400px (square crop)
 * - Quality: auto:good (balance between quality and size)
 * - Format: jpg
 * - Face detection: center crop on face if detected
 *
 * @param {string} base64Data - Base64 encoded image (with or without data URI prefix)
 * @param {number} companyId - Company ID
 * @param {number} employeeId - Employee ID
 * @returns {Promise<string>} - Cloudinary secure URL
 */
async function uploadProfilePicture(base64Data, companyId, employeeId) {
  try {
    // Ensure proper data URI format
    let uploadData = base64Data;
    if (!base64Data.startsWith('data:')) {
      uploadData = `data:image/jpeg;base64,${base64Data}`;
    }

    const timestamp = Date.now();
    const publicId = `hrms/profiles/${companyId}/${employeeId}/avatar_${timestamp}`;

    const result = await cloudinary.uploader.upload(uploadData, {
      public_id: publicId,
      resource_type: 'image',
      overwrite: true,
      folder: '',
      transformation: [
        {
          width: 400,
          height: 400,
          crop: 'fill',
          gravity: 'face',  // Center on face if detected
          quality: 'auto:good',
          format: 'jpg'
        }
      ]
    });

    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary profile picture upload error:', error);
    throw new Error(`Failed to upload profile picture: ${error.message}`);
  }
}

module.exports = {
  uploadAttendance,
  uploadClaim,
  uploadProfilePicture,
  deleteFile,
  extractPublicId
};
