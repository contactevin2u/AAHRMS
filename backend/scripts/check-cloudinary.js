require('dotenv').config();
const cloudinary = require('../config/cloudinary');

async function checkCloudinary() {
  try {
    console.log('Checking Cloudinary configuration...\n');

    // Check if configured
    const config = cloudinary.config();
    console.log('Cloud name:', config.cloud_name || 'NOT SET');
    console.log('API key:', config.api_key ? 'Set (hidden)' : 'NOT SET');
    console.log('API secret:', config.api_secret ? 'Set (hidden)' : 'NOT SET');

    if (!config.cloud_name || !config.api_key || !config.api_secret) {
      console.log('\nCloudinary is NOT properly configured!');
      console.log('Check your CLOUDINARY_URL environment variable.');
      process.exit(1);
    }

    // Test upload with a tiny test image (1x1 pixel red PNG)
    console.log('\nTesting upload...');
    const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

    const result = await cloudinary.uploader.upload(testImage, {
      public_id: 'hrms/test/connection_test',
      resource_type: 'image',
      overwrite: true
    });

    console.log('Upload successful!');
    console.log('URL:', result.secure_url);

    // Clean up test file
    await cloudinary.uploader.destroy('hrms/test/connection_test');
    console.log('Test file cleaned up.');

    console.log('\nCloudinary is working correctly!');
    process.exit(0);
  } catch (error) {
    console.error('\nCloudinary ERROR:');
    console.error('Message:', error.message);
    console.error('Code:', error.code);
    console.error('HTTP code:', error.http_code);
    console.error('Full error:', JSON.stringify(error, null, 2));
    process.exit(1);
  }
}

checkCloudinary();
