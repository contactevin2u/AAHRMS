/**
 * Cloudinary Configuration
 *
 * Uses CLOUDINARY_URL from .env file which contains:
 * cloudinary://API_KEY:API_SECRET@CLOUD_NAME
 */

const cloudinary = require('cloudinary').v2;

// Initialize Cloudinary - it automatically reads CLOUDINARY_URL from environment
cloudinary.config({
  secure: true // Always use HTTPS
});

module.exports = cloudinary;
