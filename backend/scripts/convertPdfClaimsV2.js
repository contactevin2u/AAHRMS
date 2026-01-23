/**
 * Convert existing PDF claims to images using pdfjs-dist
 * Run: node scripts/convertPdfClaimsV2.js
 *
 * Note: CLOUDINARY_URL must be set in environment
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const pool = require('../db');
const cloudinary = require('../config/cloudinary');
const { verifyReceipt } = require('../utils/receiptAI');
const https = require('https');
const http = require('http');

async function fetchPdfBuffer(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        return fetchPdfBuffer(response.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

// Upload PDF to Cloudinary and use their PDF-to-image transformation
async function uploadPdfAndConvert(pdfBuffer, companyId, employeeId, claimId) {
  const base64Pdf = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
  const publicId = `hrms/claims/${companyId}/${employeeId}/claim_${claimId}_img`;

  // Upload PDF as image using page transformation (pg_1 = first page)
  const result = await cloudinary.uploader.upload(base64Pdf, {
    public_id: publicId,
    resource_type: 'image',
    overwrite: true,
    format: 'jpg',
    transformation: [
      { page: 1 },  // Get first page of PDF
      {
        width: 1000,
        crop: 'limit',
        quality: 'auto:low',
        effect: 'sharpen'
      }
    ]
  });

  return result.secure_url;
}


async function main() {
  console.log('=== Converting PDF Claims to Images (V2) ===\n');

  try {
    // Find claims with PDF URLs
    const result = await pool.query(`
      SELECT c.id, c.receipt_url, c.amount, c.status, c.ai_confidence,
             e.company_id, c.employee_id, e.name as employee_name
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.receipt_url IS NOT NULL
        AND c.receipt_url ILIKE '%.pdf%'
        AND c.status = 'pending'
      ORDER BY c.created_at DESC
    `);

    console.log(`Found ${result.rows.length} PDF claims to process\n`);

    let converted = 0;
    let autoApproved = 0;
    let failed = 0;

    for (const claim of result.rows) {
      console.log(`\nProcessing claim #${claim.id} (${claim.employee_name})...`);
      console.log(`  Amount: RM ${claim.amount}`);

      try {
        console.log('  Fetching PDF...');
        const pdfBuffer = await fetchPdfBuffer(claim.receipt_url);

        console.log('  Converting and uploading to Cloudinary...');
        const newImageUrl = await uploadPdfAndConvert(
          pdfBuffer,
          claim.company_id,
          claim.employee_id,
          claim.id
        );
        console.log(`  New URL: ${newImageUrl}`);
        converted++;

        // Re-run AI verification
        console.log('  Running AI verification...');
        const verification = await verifyReceipt(newImageUrl, parseFloat(claim.amount), claim.company_id, claim.id);

        console.log(`  AI: confidence=${verification.aiData?.confidence}, amount=${verification.aiData?.amount}`);
        console.log(`  Can Auto-Approve: ${verification.canAutoApprove}`);

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
            verification.aiData?.confidence || 'low',
            claim.id
          ]);
          console.log('  Updated with image URL - needs manual approval');
        }

      } catch (err) {
        console.log(`  ERROR:`, err);
        failed++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total PDFs: ${result.rows.length}`);
    console.log(`Converted: ${converted}`);
    console.log(`Auto-approved: ${autoApproved}`);
    console.log(`Failed: ${failed}`);
    console.log(`Needs manual: ${converted - autoApproved}`);

  } catch (error) {
    console.error('Script error:', error);
  } finally {
    await pool.end();
  }
}

main();
