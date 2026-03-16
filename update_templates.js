const fs = require('fs');
const path = require('path');

const img1Path = 'C:\\Users\\hp\\.gemini\\antigravity\\brain\\3f0033ec-9381-4573-b034-6971b3bb1634\\modern_certificate_template_1773153574249.png';
const img2Path = 'C:\\Users\\hp\\.gemini\\antigravity\\brain\\3f0033ec-9381-4573-b034-6971b3bb1634\\dark_premium_certificate_1773153591663.png';

const targetDir = 'g:\\certificate generator\\assets\\templates';
const dest1 = path.join(targetDir, 'template4.png');
const dest2 = path.join(targetDir, 'template5.png');

// Copy files
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}
fs.copyFileSync(img1Path, dest1);
fs.copyFileSync(img2Path, dest2);

// Read as base64
const b64_1 = fs.readFileSync(img1Path, { encoding: 'base64' });
const b64_2 = fs.readFileSync(img2Path, { encoding: 'base64' });

const dataURI1 = `data:image/png;base64,${b64_1}`;
const dataURI2 = `data:image/png;base64,${b64_2}`;

const templatesJsPath = 'g:\\certificate generator\\templates.js';
let content = fs.readFileSync(templatesJsPath, 'utf8');

// The file ends with:
//     "template3.png": "data:image/png;base64,..."
// };
// We need to inject our items before the closing brace.

content = content.replace(/\n\};\s*$/, `,\n    "template4.png": "${dataURI1}",\n    "template5.png": "${dataURI2}"\n};`);

fs.writeFileSync(templatesJsPath, content, 'utf8');

console.log("Successfully updated templates.js with template4.png and template5.png");
