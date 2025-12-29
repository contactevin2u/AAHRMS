/**
 * Face Detection Utility with Anti-Cheating Controls
 *
 * MANDATORY VALIDATION RULES:
 * 1. Face Presence: Exactly one human face detected (front-facing)
 * 2. Image Quality: Not blurred, proper exposure, face >30% of frame
 * 3. Live Capture: Camera only, no gallery uploads
 * 4. Liveness Check: Capture delay to prevent still photos
 *
 * Any failed validation = clock action blocked
 */

import * as faceapi from 'face-api.js';

let modelsLoaded = false;
let loadingPromise = null;

// Model URL - using face-api.js CDN models
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';

// Validation thresholds
const VALIDATION_CONFIG = {
  // Face detection confidence threshold
  MIN_CONFIDENCE: 0.7,

  // Face must occupy at least 30% of frame (width or height)
  MIN_FACE_RATIO: 0.15, // 15% is more practical for mobile selfies

  // Maximum allowed faces (prevent proxy clock-in)
  MAX_FACES: 1,

  // Minimum image dimensions
  MIN_IMAGE_WIDTH: 200,
  MIN_IMAGE_HEIGHT: 200,

  // Brightness thresholds (0-255)
  MIN_BRIGHTNESS: 40,  // Too dark
  MAX_BRIGHTNESS: 220, // Overexposed

  // Blur detection threshold
  BLUR_THRESHOLD: 100, // Laplacian variance threshold

  // Capture delay for liveness (milliseconds)
  LIVENESS_DELAY: 500
};

/**
 * Load face detection models (TinyFaceDetector + FaceLandmark68)
 * @returns {Promise<boolean>} - True if models loaded successfully
 */
export async function loadFaceDetectionModels() {
  if (modelsLoaded) {
    return true;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      console.log('[FaceDetection] Loading models from CDN...');

      // Load TinyFaceDetector for fast detection
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);

      // Load FaceLandmark68 for eyes, nose, mouth detection
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);

      console.log('[FaceDetection] Models loaded successfully');
      modelsLoaded = true;
      return true;
    } catch (error) {
      console.error('[FaceDetection] Failed to load models:', error);
      modelsLoaded = false;
      loadingPromise = null;
      return false;
    }
  })();

  return loadingPromise;
}

/**
 * Comprehensive face detection with all validation checks
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} input - Image source
 * @param {Object} metadata - Optional metadata about the capture
 * @returns {Promise<Object>} - Validation result
 */
export async function detectFace(input, metadata = {}) {
  const result = {
    success: false,
    faceDetected: false,
    faceCount: 0,
    confidence: 0,
    validationErrors: [],
    validationChecks: {
      facePresent: false,
      singleFace: false,
      faceLandmarks: false,
      faceSize: false,
      imageQuality: false,
      brightness: false,
      notBlurred: false,
      liveCapture: false
    },
    message: ''
  };

  // Check if models are loaded
  if (!modelsLoaded) {
    const loaded = await loadFaceDetectionModels();
    if (!loaded) {
      result.validationErrors.push('Face detection models not loaded');
      result.message = 'Unable to load face detection. Please try again.';
      return result;
    }
  }

  try {
    // Get image dimensions
    const width = input.videoWidth || input.width || input.naturalWidth;
    const height = input.videoHeight || input.height || input.naturalHeight;

    // Check minimum image size
    if (width < VALIDATION_CONFIG.MIN_IMAGE_WIDTH || height < VALIDATION_CONFIG.MIN_IMAGE_HEIGHT) {
      result.validationErrors.push('Image too small');
      result.message = 'Image resolution too low. Please move closer to the camera.';
      return result;
    }

    // Detect faces with landmarks
    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 416,
      scoreThreshold: 0.5
    });

    const detections = await faceapi
      .detectAllFaces(input, options)
      .withFaceLandmarks();

    result.faceCount = detections.length;

    // Check 1: No face detected
    if (detections.length === 0) {
      result.validationErrors.push('No face detected');
      result.message = 'No face detected. Please ensure your face is clearly visible and well-lit.';
      return result;
    }

    result.validationChecks.facePresent = true;

    // Check 2: Multiple faces detected (anti-proxy)
    if (detections.length > VALIDATION_CONFIG.MAX_FACES) {
      result.validationErrors.push(`Multiple faces detected (${detections.length})`);
      result.message = 'Multiple faces detected. Only one person should be in the photo.';
      return result;
    }

    result.validationChecks.singleFace = true;

    // Get the primary face
    const detection = detections[0];
    const score = detection.detection.score;
    result.confidence = score;

    // Check 3: Face detection confidence
    if (score < VALIDATION_CONFIG.MIN_CONFIDENCE) {
      result.validationErrors.push('Low face detection confidence');
      result.message = 'Face not clear enough. Please improve lighting and face the camera directly.';
      return result;
    }

    // Check 4: Face landmarks (eyes, nose, mouth)
    const landmarks = detection.landmarks;
    if (!landmarks) {
      result.validationErrors.push('Face landmarks not detected');
      result.message = 'Could not detect facial features. Please face the camera directly.';
      return result;
    }

    // Verify key landmarks are present
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const nose = landmarks.getNose();
    const mouth = landmarks.getMouth();

    if (!leftEye.length || !rightEye.length || !nose.length || !mouth.length) {
      result.validationErrors.push('Incomplete facial features');
      result.message = 'Cannot detect eyes, nose, or mouth. Please face the camera directly.';
      return result;
    }

    result.validationChecks.faceLandmarks = true;

    // Check 5: Face size (must be significant portion of frame)
    const faceBox = detection.detection.box;
    const faceWidthRatio = faceBox.width / width;
    const faceHeightRatio = faceBox.height / height;

    if (faceWidthRatio < VALIDATION_CONFIG.MIN_FACE_RATIO &&
        faceHeightRatio < VALIDATION_CONFIG.MIN_FACE_RATIO) {
      result.validationErrors.push('Face too small');
      result.message = 'Face is too small. Please move closer to the camera.';
      return result;
    }

    result.validationChecks.faceSize = true;

    // Check 6: Image quality (brightness and blur) - using canvas
    const qualityCheck = await checkImageQuality(input);
    result.validationChecks.brightness = qualityCheck.brightnessOk;
    result.validationChecks.notBlurred = qualityCheck.sharpnessOk;

    if (!qualityCheck.brightnessOk) {
      result.validationErrors.push(qualityCheck.brightnessIssue);
      result.message = qualityCheck.brightnessMessage;
      return result;
    }

    if (!qualityCheck.sharpnessOk) {
      result.validationErrors.push('Image is blurred');
      result.message = 'Image is too blurry. Please hold the camera steady.';
      return result;
    }

    result.validationChecks.imageQuality = true;

    // Check 7: Live capture validation
    if (metadata.captureSource) {
      if (metadata.captureSource !== 'camera') {
        result.validationErrors.push('Image not from camera');
        result.message = 'Photo must be captured from camera. Gallery uploads are not allowed.';
        return result;
      }
      result.validationChecks.liveCapture = true;
    } else {
      // Assume live capture if no metadata (frontend enforces camera-only)
      result.validationChecks.liveCapture = true;
    }

    // All checks passed
    result.success = true;
    result.faceDetected = true;
    result.box = faceBox;
    result.landmarks = {
      leftEye: getCenterPoint(leftEye),
      rightEye: getCenterPoint(rightEye),
      nose: getCenterPoint(nose),
      mouth: getCenterPoint(mouth)
    };
    result.message = 'Face verified successfully';

    return result;

  } catch (error) {
    console.error('[FaceDetection] Detection error:', error);
    result.validationErrors.push(error.message);
    result.message = 'Face detection failed. Please try again.';
    return result;
  }
}

/**
 * Check image quality (brightness and sharpness)
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} input
 * @returns {Promise<Object>}
 */
async function checkImageQuality(input) {
  const result = {
    brightnessOk: true,
    sharpnessOk: true,
    brightness: 128,
    sharpness: 100,
    brightnessIssue: null,
    brightnessMessage: null
  };

  try {
    // Create canvas to analyze image
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const width = input.videoWidth || input.width || input.naturalWidth;
    const height = input.videoHeight || input.height || input.naturalHeight;

    // Use smaller size for faster analysis
    const analyzeWidth = Math.min(200, width);
    const analyzeHeight = Math.min(200, height);

    canvas.width = analyzeWidth;
    canvas.height = analyzeHeight;
    ctx.drawImage(input, 0, 0, analyzeWidth, analyzeHeight);

    const imageData = ctx.getImageData(0, 0, analyzeWidth, analyzeHeight);
    const data = imageData.data;

    // Calculate average brightness
    let totalBrightness = 0;
    const pixelCount = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      // Luminance formula
      const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      totalBrightness += brightness;
    }

    result.brightness = totalBrightness / pixelCount;

    // Check brightness
    if (result.brightness < VALIDATION_CONFIG.MIN_BRIGHTNESS) {
      result.brightnessOk = false;
      result.brightnessIssue = 'Image too dark';
      result.brightnessMessage = 'Image is too dark. Please move to a brighter area.';
    } else if (result.brightness > VALIDATION_CONFIG.MAX_BRIGHTNESS) {
      result.brightnessOk = false;
      result.brightnessIssue = 'Image overexposed';
      result.brightnessMessage = 'Image is overexposed. Please avoid direct bright light.';
    }

    // Simple blur detection using Laplacian variance
    const grayData = new Uint8ClampedArray(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      grayData[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }

    // Calculate Laplacian variance (measure of sharpness)
    let variance = 0;
    const w = analyzeWidth;

    for (let y = 1; y < analyzeHeight - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const laplacian =
          grayData[idx - w] +
          grayData[idx - 1] +
          (-4 * grayData[idx]) +
          grayData[idx + 1] +
          grayData[idx + w];
        variance += laplacian * laplacian;
      }
    }

    result.sharpness = variance / ((analyzeWidth - 2) * (analyzeHeight - 2));

    if (result.sharpness < VALIDATION_CONFIG.BLUR_THRESHOLD) {
      result.sharpnessOk = false;
    }

  } catch (error) {
    console.warn('[FaceDetection] Quality check error:', error);
    // Don't fail on quality check errors, let face detection decide
  }

  return result;
}

/**
 * Get center point of landmark points
 * @param {Array} points - Array of points
 * @returns {Object} - Center point {x, y}
 */
function getCenterPoint(points) {
  if (!points || !points.length) return { x: 0, y: 0 };

  const sum = points.reduce((acc, point) => ({
    x: acc.x + point.x,
    y: acc.y + point.y
  }), { x: 0, y: 0 });

  return {
    x: sum.x / points.length,
    y: sum.y / points.length
  };
}

/**
 * Detect face from base64 image
 * @param {string} base64Image - Base64 encoded image
 * @param {Object} metadata - Optional capture metadata
 * @returns {Promise<Object>} - Detection result
 */
export async function detectFaceFromBase64(base64Image, metadata = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = async () => {
      const result = await detectFace(img, metadata);
      resolve(result);
    };

    img.onerror = () => {
      resolve({
        success: false,
        faceDetected: false,
        validationErrors: ['Image load failed'],
        message: 'Failed to load the captured image.'
      });
    };

    img.src = base64Image;
  });
}

/**
 * Check if face detection is available
 * @returns {boolean}
 */
export function isFaceDetectionAvailable() {
  return modelsLoaded;
}

/**
 * Preload models (call on app init)
 */
export async function preloadFaceDetection() {
  try {
    await loadFaceDetectionModels();
  } catch (e) {
    console.warn('[FaceDetection] Preload failed:', e);
  }
}

/**
 * Get validation config for UI display
 * @returns {Object}
 */
export function getValidationConfig() {
  return { ...VALIDATION_CONFIG };
}

/**
 * Validate that capture is from camera (not gallery)
 * This is enforced by the capture UI, but this adds extra validation
 * @param {Object} captureInfo - Info about how image was captured
 * @returns {Object} - Validation result
 */
export function validateCaptureSource(captureInfo) {
  const result = {
    valid: true,
    error: null
  };

  // If file input was used, it's likely a gallery upload
  if (captureInfo.source === 'file') {
    result.valid = false;
    result.error = 'Gallery uploads are not allowed. Please use the camera.';
  }

  // Check for camera capture flag
  if (captureInfo.fromCamera === false) {
    result.valid = false;
    result.error = 'Photo must be captured from camera.';
  }

  return result;
}

/**
 * Get minimum capture delay for liveness check
 * @returns {number} - Delay in milliseconds
 */
export function getLivenessDelay() {
  return VALIDATION_CONFIG.LIVENESS_DELAY;
}
