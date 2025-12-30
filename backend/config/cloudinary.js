/**
 * Cloudinary Configuration
 *
 * Uses CLOUDINARY_URL from environment which contains:
 * cloudinary://API_KEY:API_SECRET@CLOUD_NAME
 */

const cloudinary = require('cloudinary').v2;

// Parse CLOUDINARY_URL and configure explicitly
const cloudinaryUrl = process.env.CLOUDINARY_URL;

if (cloudinaryUrl && cloudinaryUrl.startsWith('cloudinary://')) {
  // Parse: cloudinary://api_key:api_secret@cloud_name
  const match = cloudinaryUrl.match(/cloudinary:\/\/(\d+):([^@]+)@(.+)/);
  if (match) {
    cloudinary.config({
      cloud_name: match[3],
      api_key: match[1],
      api_secret: match[2],
      secure: true
    });
    console.log('Cloudinary configured for cloud:', match[3]);
  } else {
    console.error('Invalid CLOUDINARY_URL format');
  }
} else {
  console.warn('CLOUDINARY_URL not set - photo uploads will fail');
}

module.exports = cloudinary;
