/**
 * Face Detection Utility using face-api.js
 * Validates that a human face is present in the captured image
 */

import * as faceapi from 'face-api.js';

let modelsLoaded = false;
let loadingPromise = null;

// Model URL - using face-api.js CDN models
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';

/**
 * Load face detection models
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

      // Load TinyFaceDetector - lightweight and fast for mobile
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);

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
 * Detect faces in an image
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} input - Image source
 * @returns {Promise<Object>} - Detection result
 */
export async function detectFace(input) {
  if (!modelsLoaded) {
    const loaded = await loadFaceDetectionModels();
    if (!loaded) {
      return {
        success: false,
        faceDetected: false,
        error: 'Face detection models not loaded',
        message: 'Unable to load face detection. Please try again.'
      };
    }
  }

  try {
    // Use TinyFaceDetector for better mobile performance
    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 320,
      scoreThreshold: 0.5
    });

    const detections = await faceapi.detectAllFaces(input, options);

    if (detections.length === 0) {
      return {
        success: true,
        faceDetected: false,
        faceCount: 0,
        error: 'No face detected',
        message: 'No face detected in the photo. Please ensure your face is clearly visible.'
      };
    }

    if (detections.length > 1) {
      return {
        success: true,
        faceDetected: false,
        faceCount: detections.length,
        error: 'Multiple faces detected',
        message: 'Multiple faces detected. Please ensure only your face is in the photo.'
      };
    }

    // Single face detected - check quality
    const detection = detections[0];
    const score = detection.score;

    if (score < 0.7) {
      return {
        success: true,
        faceDetected: false,
        faceCount: 1,
        confidence: score,
        error: 'Low confidence detection',
        message: 'Face not clear enough. Please improve lighting or camera angle.'
      };
    }

    return {
      success: true,
      faceDetected: true,
      faceCount: 1,
      confidence: score,
      box: detection.box,
      message: 'Face detected successfully'
    };
  } catch (error) {
    console.error('[FaceDetection] Detection error:', error);
    return {
      success: false,
      faceDetected: false,
      error: error.message,
      message: 'Face detection failed. Please try again.'
    };
  }
}

/**
 * Detect face from base64 image
 * @param {string} base64Image - Base64 encoded image
 * @returns {Promise<Object>} - Detection result
 */
export async function detectFaceFromBase64(base64Image) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = async () => {
      const result = await detectFace(img);
      resolve(result);
    };

    img.onerror = () => {
      resolve({
        success: false,
        faceDetected: false,
        error: 'Image load failed',
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
