const fs = require('fs');
const path = require('path');

const ADDONS = [
  '@linuxcnc-node/core',
  '@linuxcnc-node/gcode',
  '@linuxcnc-node/hal'
];

const DEST_DIR = path.join(__dirname, '../build/Release');

// Ensure destination directory exists
if (!fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
}

console.log('Copying native addons...');

let copiedCount = 0;

for (const addon of ADDONS) {
  try {
    // Resolve package root via package.json
    // We treat @linuxcnc-node packages as having a standard structure with build/Release
    const pkgJsonPath = require.resolve(`${addon}/package.json`, { paths: [path.join(__dirname, '..')] });
    const pkgDir = path.dirname(pkgJsonPath);
    const sourceDir = path.join(pkgDir, 'build/Release');

    if (!fs.existsSync(sourceDir)) {
      console.warn(`⚠️  Source directory not found for ${addon}: ${sourceDir}`);
      continue;
    }

    const files = fs.readdirSync(sourceDir);
    for (const file of files) {
      if (file.endsWith('.node')) {
        const srcFile = path.join(sourceDir, file);
        const destFile = path.join(DEST_DIR, file);
        
        fs.copyFileSync(srcFile, destFile);
        console.log(`✅ Copied ${file} from ${addon}`);
        copiedCount++;
      }
    }
  } catch (err) {
    console.warn(`⚠️  Could not resolve or copy addons for ${addon}:`, err.message);
  }
}

if (copiedCount === 0) {
  console.warn('⚠️  No native addons were copied. This might be fine if specific addons are not installed.');
} else {
  console.log(`🎉 Successfully copied ${copiedCount} native addon(s).`);
}
