/**
 * Update Calculation Guide Changelog
 *
 * This script updates the CALCULATION_GUIDE.md with a new changelog entry
 * when calculation-related files are modified.
 *
 * Usage:
 *   node scripts/update-calculation-guide.js "Description of changes"
 *   node scripts/update-calculation-guide.js --check  (check for changes only)
 *
 * Monitored files:
 *   - backend/utils/otCalculation.js
 *   - backend/utils/statutory.js
 *   - backend/utils/finalSettlement.js
 *   - backend/routes/ess/clockin.js
 *   - backend/routes/payrollUnified.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GUIDE_PATH = path.join(__dirname, '../docs/CALCULATION_GUIDE.md');
const MONITORED_FILES = [
  'backend/utils/otCalculation.js',
  'backend/utils/statutory.js',
  'backend/utils/finalSettlement.js',
  'backend/routes/ess/clockin.js',
  'backend/routes/payrollUnified.js',
  'backend/routes/payrollAI.js'
];

function getVersion(content) {
  const match = content.match(/\*\*Version:\*\* (\d+\.\d+\.\d+)/);
  return match ? match[1] : '1.0.0';
}

function incrementVersion(version, type = 'patch') {
  const [major, minor, patch] = version.split('.').map(Number);
  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch':
    default: return `${major}.${minor}.${patch + 1}`;
  }
}

function getChangedFiles() {
  try {
    // Check for uncommitted changes in monitored files
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    const changedFiles = status.split('\n')
      .filter(line => line.trim())
      .map(line => line.substring(3).trim())
      .filter(file => MONITORED_FILES.some(mf => file.includes(mf.replace('backend/', ''))));

    return changedFiles;
  } catch (e) {
    return [];
  }
}

function getRecentCommitChanges() {
  try {
    // Get files changed in last commit
    const files = execSync('git diff-tree --no-commit-id --name-only -r HEAD', { encoding: 'utf8' });
    return files.split('\n')
      .filter(file => file.trim())
      .filter(file => MONITORED_FILES.some(mf => file.includes(mf.replace('backend/', ''))));
  } catch (e) {
    return [];
  }
}

function formatDate() {
  const now = new Date();
  const day = now.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[now.getMonth()];
  const year = now.getFullYear();
  return `${day} ${month} ${year}`;
}

function updateGuide(description, changedBy = 'System') {
  if (!fs.existsSync(GUIDE_PATH)) {
    console.error('Calculation guide not found:', GUIDE_PATH);
    process.exit(1);
  }

  let content = fs.readFileSync(GUIDE_PATH, 'utf8');

  // Get current version and increment
  const currentVersion = getVersion(content);
  const newVersion = incrementVersion(currentVersion);
  const date = formatDate();

  // Update version
  content = content.replace(
    /\*\*Version:\*\* \d+\.\d+\.\d+/,
    `**Version:** ${newVersion}`
  );

  // Update last updated date
  content = content.replace(
    /\*\*Last Updated:\*\* .+/,
    `**Last Updated:** ${date}`
  );

  // Add changelog entry after the header row
  const changelogEntry = `| ${newVersion} | ${date} | ${changedBy} | ${description} |`;
  content = content.replace(
    /(## Change History\n\n\| Version \| Date \| Changed By \| Description \|\n\|[-]+\|[-]+\|[-]+\|[-]+\|)/,
    `$1\n${changelogEntry}`
  );

  fs.writeFileSync(GUIDE_PATH, content);

  console.log(`\n✓ Calculation Guide Updated!`);
  console.log(`  Version: ${currentVersion} → ${newVersion}`);
  console.log(`  Date: ${date}`);
  console.log(`  Description: ${description}`);
  console.log(`\n  File: ${GUIDE_PATH}`);
}

function checkForChanges() {
  console.log('Checking for calculation-related file changes...\n');

  const uncommitted = getChangedFiles();
  const lastCommit = getRecentCommitChanges();

  console.log('Monitored files:');
  MONITORED_FILES.forEach(f => console.log(`  - ${f}`));

  console.log('\nUncommitted changes:');
  if (uncommitted.length === 0) {
    console.log('  (none)');
  } else {
    uncommitted.forEach(f => console.log(`  ✗ ${f}`));
  }

  console.log('\nLast commit changes:');
  if (lastCommit.length === 0) {
    console.log('  (none)');
  } else {
    lastCommit.forEach(f => console.log(`  • ${f}`));
  }

  if (uncommitted.length > 0 || lastCommit.length > 0) {
    console.log('\n⚠ Calculation files have been modified!');
    console.log('  Run: node scripts/update-calculation-guide.js "Your description"');
  } else {
    console.log('\n✓ No calculation-related changes detected.');
  }
}

// Main
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help') {
  console.log(`
Update Calculation Guide Changelog

Usage:
  node scripts/update-calculation-guide.js "Description of changes"
  node scripts/update-calculation-guide.js --check

Options:
  --check    Check for changes in monitored files without updating
  --help     Show this help message

Monitored files:
${MONITORED_FILES.map(f => `  - ${f}`).join('\n')}
  `);
  process.exit(0);
}

if (args[0] === '--check') {
  checkForChanges();
} else {
  const description = args.join(' ');
  updateGuide(description);
}
