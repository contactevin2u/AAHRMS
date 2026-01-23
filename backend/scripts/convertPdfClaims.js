/**
 * Convert existing PDF claims to images and re-verify with AI
 * Run: node scripts/convertPdfClaims.js
 */

require('dotenv').config();
const pool = require('../db');
const cloudinary = require('../config/cloudinary');
const { verifyReceipt, convertPdfToImage } = require('../utils/receiptAI');
const https = require('https');
const http = require('http');

async function fetchPdfAsBase64(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const base64 = `data:application/pdf;base64,${buffer.toString('base64')}`;
        resolve(base64);
      });
      response.on('error', reject);
    }).on('error', reject);
  });
}

async function uploadImageToCloudinary(imageBase64, companyId, employeeId, claimId) {
  const publicId = `hrms/claims/${companyId}/${employeeId}/claim_${claimId}_converted`;

  const result = await cloudinary.uploader.upload(imageBase64, {
    public_id: publicId,
    resource_type: 'image',
    overwrite: true,
    transformation: [
      {
        width: 1000,
        crop: 'limit',
        quality: 'auto:low',
        format: 'jpg',
        effect: 'sharpen'
      }
    ]
  });

  return result.secure_url;
}

async function main() {
  console.log('=== Converting PDF Claims to Images ===\n');

  try {
    // Find claims with PDF URLs (typically end with .pdf or have pdf in URL)
    const result = await pool.query(`
      SELECT c.id, c.receipt_url, c.amount, c.status, c.ai_confidence,
             e.company_id, c.employee_id, e.name as employee_name
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.receipt_url IS NOT NULL
        AND (c.receipt_url ILIKE '%.pdf%' OR c.ai_confidence = 'unreadable' OR c.ai_confidence IS NULL)
        AND c.status = 'pending'
      ORDER BY c.created_at DESC
    `);

    console.log(`Found ${result.rows.length} claims to process\n`);

    let converted = 0;
    let autoApproved = 0;
    let failed = 0;

    for (const claim of result.rows) {
      console.log(`\nProcessing claim #${claim.id} (${claim.employee_name})...`);
      console.log(`  Current URL: ${claim.receipt_url}`);
      console.log(`  Amount: RM ${claim.amount}`);
      console.log(`  AI Confidence: ${claim.ai_confidence || 'none'}`);

      try {
        // Check if it's a PDF URL
        const isPdf = claim.receipt_url.toLowerCase().includes('.pdf') ||
                      claim.receipt_url.toLowerCase().includes('pdf');

        let newImageUrl = claim.receipt_url;

        if (isPdf) {
          console.log('  Fetching PDF...');
          const pdfBase64 = await fetchPdfAsBase64(claim.receipt_url);

          console.log('  Converting PDF to image...');
          const imageBase64 = await convertPdfToImage(pdfBase64);

          console.log('  Uploading image to Cloudinary...');
          newImageUrl = await uploadImageToCloudinary(
            imageBase64,
            claim.company_id,
            claim.employee_id,
            claim.id
          );
          console.log(`  New URL: ${newImageUrl}`);
          converted++;
        }

        // Re-run AI verification
        console.log('  Running AI verification...');
        const verification = await verifyReceipt(newImageUrl, parseFloat(claim.amount), claim.company_id, claim.id);

        console.log(`  AI Result: confidence=${verification.aiData?.confidence}, amount=${verification.aiData?.amount}`);
        console.log(`  Can Auto-Approve: ${verification.canAutoApprove}`);

        // Update claim with new URL and AI data
        if (verification.canAutoApprove) {
          await pool.query(`
            UPDATE claims SET
              receipt_url = $1,
              ai_extracted_amount = $2,
              ai_extracted_merchant = $3,
              ai_extracted_date = $4,
              ai_confidence = $5,
              status = 'approved',
              auto_approved = TRUE,
              approved_at = NOW(),
              updated_at = NOW()
            WHERE id = $6
          `, [
            newImageUrl,
            verification.aiData?.amount,
            verification.aiData?.merchant,
            verification.aiData?.date,
            verification.aiData?.confidence,
            claim.id
          ]);
          console.log('  >>> AUTO-APPROVED!');
          autoApproved++;
        } else {
          // Just update URL and AI data, keep pending
          await pool.query(`
            UPDATE claims SET
              receipt_url = $1,
              ai_extracted_amount = $2,
              ai_extracted_merchant = $3,
              ai_extracted_date = $4,
              ai_confidence = $5,
              updated_at = NOW()
            WHERE id = $6
          `, [
            newImageUrl,
            verification.aiData?.amount,
            verification.aiData?.merchant,
            verification.aiData?.date,
            verification.aiData?.confidence || 'unreadable',
            claim.id
          ]);
          console.log('  Still needs manual approval');
        }

      } catch (err) {
        console.log(`  ERROR: ${err.message}`);
        failed++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total processed: ${result.rows.length}`);
    console.log(`PDFs converted: ${converted}`);
    console.log(`Auto-approved: ${autoApproved}`);
    console.log(`Failed: ${failed}`);
    console.log(`Still pending: ${result.rows.length - autoApproved - failed}`);

  } catch (error) {
    console.error('Script error:', error);
  } finally {
    await pool.end();
  }
}

main();
