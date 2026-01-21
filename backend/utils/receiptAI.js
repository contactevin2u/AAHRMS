const OpenAI = require('openai');
const crypto = require('crypto');
const pool = require('../db');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Convert PDF base64 to image base64 using pdf.js and canvas
 * @param {string} pdfBase64 - Base64 encoded PDF data
 * @returns {string} - Base64 encoded image (JPEG)
 */
async function convertPdfToImage(pdfBase64) {
  try {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
    const { createCanvas, Image } = require('canvas');

    // Remove data URL prefix if present
    const pdfData = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
    const pdfBuffer = Buffer.from(pdfData, 'base64');

    // Convert Buffer to Uint8Array (required by pdfjs-dist)
    const pdfUint8Array = new Uint8Array(pdfBuffer);

    // Create a custom canvas factory for pdfjs
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
        canvasAndContext.canvas = null;
        canvasAndContext.context = null;
      }
    }

    // Load the PDF with canvas factory
    const loadingTask = pdfjsLib.getDocument({
      data: pdfUint8Array,
      canvasFactory: new NodeCanvasFactory(),
      // Disable font/image loading that causes issues
      disableFontFace: true,
      isEvalSupported: false
    });
    const pdf = await loadingTask.promise;

    // Get the first page
    const page = await pdf.getPage(1);

    // Set scale for good quality (2x for clarity)
    const scale = 2.0;
    const viewport = page.getViewport({ scale });

    // Create canvas
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    // Fill with white background
    context.fillStyle = 'white';
    context.fillRect(0, 0, viewport.width, viewport.height);

    // Render page to canvas
    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvasFactory: new NodeCanvasFactory()
    }).promise;

    // Convert to JPEG base64
    const imageBase64 = canvas.toDataURL('image/jpeg', 0.9);
    return imageBase64;
  } catch (error) {
    console.error('PDF to image conversion error:', error);
    throw new Error('Failed to convert PDF to image: ' + error.message);
  }
}

/**
 * Check if the data is a PDF
 * @param {string} data - Base64 encoded data or URL
 * @returns {boolean}
 */
function isPdf(data) {
  return data.startsWith('data:application/pdf') || data.toLowerCase().endsWith('.pdf');
}

/**
 * Check if the data is a URL
 * @param {string} data - Data string to check
 * @returns {boolean}
 */
function isUrl(data) {
  return data.startsWith('http://') || data.startsWith('https://');
}

/**
 * Generate a hash from receipt image data for duplicate detection
 * @param {string} base64Image - Base64 encoded image data
 * @returns {string} - SHA256 hash of the image
 */
function generateReceiptHash(base64Image) {
  // Remove data URL prefix if present
  const imageData = base64Image.replace(/^data:.*?;base64,/, '');
  return crypto.createHash('sha256').update(imageData).digest('hex');
}

/**
 * Extract receipt information using GPT-4o-mini vision
 * @param {string} imageData - Base64 encoded image/PDF or URL
 * @returns {Object} - Extracted receipt data
 */
async function extractReceiptData(imageData) {
  try {
    let imageUrl = imageData;

    // Check if it's a URL (Cloudinary, etc.)
    if (isUrl(imageData)) {
      console.log('Processing image from URL...');
      // OpenAI Vision API can directly fetch URLs
      // But if it's a PDF URL, we need to fetch and convert
      if (isPdf(imageData)) {
        console.log('PDF URL detected, fetching and converting...');
        try {
          const https = require('https');
          const http = require('http');
          const protocol = imageData.startsWith('https') ? https : http;

          // Fetch the PDF
          const pdfBuffer = await new Promise((resolve, reject) => {
            protocol.get(imageData, (response) => {
              const chunks = [];
              response.on('data', chunk => chunks.push(chunk));
              response.on('end', () => resolve(Buffer.concat(chunks)));
              response.on('error', reject);
            }).on('error', reject);
          });

          // Convert PDF buffer to base64 for conversion
          const pdfBase64 = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
          imageUrl = await convertPdfToImage(pdfBase64);
          console.log('PDF fetched and converted successfully');
        } catch (pdfError) {
          console.error('PDF fetch/conversion failed:', pdfError.message);
          return {
            success: false,
            amount: null,
            merchant: null,
            date: null,
            confidence: 'unreadable',
            error: 'Failed to process PDF URL: ' + pdfError.message
          };
        }
      }
      // For regular image URLs, OpenAI can use them directly
      // imageUrl is already set to the URL
    } else if (isPdf(imageData)) {
      // Base64 PDF
      console.log('Converting PDF to image for AI processing...');
      try {
        imageUrl = await convertPdfToImage(imageData);
        console.log('PDF converted successfully');
      } catch (pdfError) {
        console.error('PDF conversion failed:', pdfError.message);
        return {
          success: false,
          amount: null,
          merchant: null,
          date: null,
          confidence: 'unreadable',
          error: 'Failed to convert PDF: ' + pdfError.message
        };
      }
    } else if (!imageData.startsWith('data:')) {
      // Raw base64 without prefix - assume JPEG
      imageUrl = `data:image/jpeg;base64,${imageData}`;
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this receipt image and extract the following information. Return ONLY a valid JSON object with no additional text or markdown formatting.

{
  "amount": <total amount as a number, use the final total/grand total if available>,
  "merchant": "<merchant/store name>",
  "date": "<date in YYYY-MM-DD format if visible, otherwise null>",
  "confidence": "<high if clearly readable, low if partially readable, unreadable if cannot extract>",
  "items_detected": <number of line items detected>,
  "currency": "<currency code if detected, default MYR>"
}

Important:
- For amount, extract the TOTAL/GRAND TOTAL, not subtotals
- If multiple totals exist, use the largest final amount
- If you cannot read the receipt clearly, set confidence to "unreadable" and amount to null
- Return ONLY the JSON object, no explanation`
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content || '';

    // Parse JSON response
    try {
      // Clean up response - remove markdown code blocks if present
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      }

      const data = JSON.parse(jsonStr);
      return {
        success: true,
        amount: data.amount,
        merchant: data.merchant || null,
        date: data.date || null,
        confidence: data.confidence || 'low',
        itemsDetected: data.items_detected || 0,
        currency: data.currency || 'MYR',
        rawResponse: content
      };
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      return {
        success: false,
        amount: null,
        merchant: null,
        date: null,
        confidence: 'unreadable',
        error: 'Failed to parse AI response',
        rawResponse: content
      };
    }
  } catch (error) {
    console.error('OpenAI API error:', error);
    return {
      success: false,
      amount: null,
      merchant: null,
      date: null,
      confidence: 'unreadable',
      error: error.message
    };
  }
}

/**
 * Check if a receipt is a duplicate (company-wide)
 * @param {string} receiptHash - SHA256 hash of the receipt
 * @param {number} companyId - Company ID for scope
 * @param {number} excludeClaimId - Optional claim ID to exclude (for updates)
 * @returns {Object} - Duplicate check result
 */
async function checkDuplicateReceipt(receiptHash, companyId, excludeClaimId = null) {
  try {
    let query = `
      SELECT c.id, c.employee_id, c.amount, c.claim_date, c.category, c.status,
             e.name as employee_name
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.receipt_hash = $1
        AND e.company_id = $2
        AND c.status != 'rejected'
    `;
    const params = [receiptHash, companyId];

    if (excludeClaimId) {
      query += ` AND c.id != $3`;
      params.push(excludeClaimId);
    }

    const result = await pool.query(query, params);

    if (result.rows.length > 0) {
      const duplicate = result.rows[0];
      return {
        isDuplicate: true,
        originalClaim: {
          id: duplicate.id,
          employeeId: duplicate.employee_id,
          employeeName: duplicate.employee_name,
          amount: duplicate.amount,
          date: duplicate.claim_date,
          category: duplicate.category,
          status: duplicate.status
        }
      };
    }

    return { isDuplicate: false, originalClaim: null };
  } catch (error) {
    console.error('Duplicate check error:', error);
    return { isDuplicate: false, originalClaim: null, error: error.message };
  }
}

/**
 * Check for similar receipts based on AI-extracted data (merchant + date + amount)
 * @param {string} merchant - Merchant name
 * @param {string} date - Receipt date
 * @param {number} amount - Receipt amount
 * @param {number} companyId - Company ID
 * @param {number} excludeClaimId - Optional claim ID to exclude
 * @returns {Object} - Similar receipt check result
 */
async function checkSimilarReceipt(merchant, date, amount, companyId, excludeClaimId = null) {
  try {
    if (!merchant || !date || !amount) {
      return { isSimilar: false, similarClaims: [] };
    }

    let query = `
      SELECT c.id, c.employee_id, c.amount, c.claim_date, c.category, c.status,
             c.ai_extracted_merchant, e.name as employee_name
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      WHERE e.company_id = $1
        AND c.status != 'rejected'
        AND c.ai_extracted_amount = $2
        AND c.ai_extracted_date = $3
        AND LOWER(c.ai_extracted_merchant) = LOWER($4)
    `;
    const params = [companyId, amount, date, merchant];

    if (excludeClaimId) {
      query += ` AND c.id != $5`;
      params.push(excludeClaimId);
    }

    const result = await pool.query(query, params);

    if (result.rows.length > 0) {
      return {
        isSimilar: true,
        similarClaims: result.rows.map(row => ({
          id: row.id,
          employeeId: row.employee_id,
          employeeName: row.employee_name,
          amount: row.amount,
          date: row.claim_date,
          category: row.category,
          status: row.status,
          merchant: row.ai_extracted_merchant
        }))
      };
    }

    return { isSimilar: false, similarClaims: [] };
  } catch (error) {
    console.error('Similar receipt check error:', error);
    return { isSimilar: false, similarClaims: [], error: error.message };
  }
}

/**
 * Full verification of a receipt for claim submission
 * @param {string} imageData - Base64 encoded receipt image/PDF or URL
 * @param {number} claimedAmount - Amount claimed by employee
 * @param {number} companyId - Company ID
 * @param {number} excludeClaimId - Optional claim ID to exclude (for updates)
 * @returns {Object} - Complete verification result
 */
async function verifyReceipt(imageData, claimedAmount, companyId, excludeClaimId = null) {
  const result = {
    canAutoApprove: false,
    requiresManualApproval: true,
    isRejected: false,
    rejectionReason: null,
    receiptHash: null,
    aiData: null,
    amountMatch: false,
    amountDifference: null,
    duplicateInfo: null,
    warnings: []
  };

  try {
    // Step 1: Generate receipt hash (only for base64 data, not URLs)
    if (!isUrl(imageData)) {
      result.receiptHash = generateReceiptHash(imageData);
    } else {
      // For URLs, use the URL itself as a simple hash (or skip hash-based duplicate check)
      result.receiptHash = crypto.createHash('sha256').update(imageData).digest('hex');
    }

    // Step 2: Check for exact duplicate (same image)
    const duplicateCheck = await checkDuplicateReceipt(result.receiptHash, companyId, excludeClaimId);
    if (duplicateCheck.isDuplicate) {
      result.isRejected = true;
      result.rejectionReason = `Duplicate receipt detected. This receipt was already submitted by ${duplicateCheck.originalClaim.employeeName} on claim #${duplicateCheck.originalClaim.id}.`;
      result.duplicateInfo = duplicateCheck.originalClaim;
      return result;
    }

    // Step 3: Extract receipt data with AI (handles PDF conversion and URLs automatically)
    const aiData = await extractReceiptData(imageData);
    result.aiData = aiData;

    // Step 4: Check if AI could read the receipt
    if (!aiData.success || aiData.confidence === 'unreadable' || aiData.amount === null) {
      result.requiresManualApproval = true;
      result.warnings.push('Could not automatically read receipt. Manual verification required.');
      return result;
    }

    // Step 5: Check for similar receipts (same merchant + date + amount from AI)
    const similarCheck = await checkSimilarReceipt(
      aiData.merchant,
      aiData.date,
      aiData.amount,
      companyId,
      excludeClaimId
    );
    if (similarCheck.isSimilar) {
      result.isRejected = true;
      const similar = similarCheck.similarClaims[0];
      result.rejectionReason = `Duplicate receipt detected. A similar receipt (same merchant, date, and amount) was already submitted by ${similar.employeeName} on claim #${similar.id}.`;
      result.duplicateInfo = similar;
      return result;
    }

    // Step 6: Compare amounts
    // RULE: Accept if claimed amount <= receipt amount (employee can claim less)
    // Only flag if claimed amount > receipt amount (over-claiming)
    const aiAmount = parseFloat(aiData.amount);
    const claimAmount = parseFloat(claimedAmount);
    result.amountDifference = claimAmount - aiAmount; // Positive = over-claim, Negative = under-claim

    // Amount is acceptable if claimed <= receipt (exact match or claiming less)
    result.amountMatch = (claimAmount <= aiAmount);

    if (!result.amountMatch) {
      // Employee is claiming MORE than the receipt shows - flag this
      result.requiresManualApproval = true;
      result.warnings.push(`Over-claim detected: Receipt shows ${aiData.currency} ${aiAmount.toFixed(2)}, but claimed amount is ${aiData.currency} ${claimAmount.toFixed(2)} (over by ${aiData.currency} ${result.amountDifference.toFixed(2)}).`);
      return result;
    }

    // Step 7: Check auto-approve limit (RM 100)
    if (claimAmount > 100) {
      result.requiresManualApproval = true;
      result.warnings.push('Claim amount exceeds RM 100. Manual approval required.');
      return result;
    }

    // All checks passed - can auto-approve
    result.canAutoApprove = true;
    result.requiresManualApproval = false;

    return result;
  } catch (error) {
    console.error('Receipt verification error:', error);
    result.requiresManualApproval = true;
    result.warnings.push(`Verification error: ${error.message}`);
    return result;
  }
}

module.exports = {
  generateReceiptHash,
  extractReceiptData,
  checkDuplicateReceipt,
  checkSimilarReceipt,
  verifyReceipt,
  convertPdfToImage,
  isPdf,
  isUrl
};
