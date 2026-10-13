import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

function addDirectoryToZip(zip, folderPath, relativePrefix = '', ignore = []) {
  if (!fs.existsSync(folderPath)) return;
  const items = fs.readdirSync(folderPath);

  for (const item of items) {
    if (ignore.includes(item)) continue;
    const itemPath = path.join(folderPath, item);
    const itemRelative = path.join(relativePrefix, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      const subZip = zip.folder(item);
      addDirectoryToZip(subZip, itemPath, itemRelative, ignore);
    } else {
      const content = fs.readFileSync(itemPath);
      zip.file(item, content);
    }
  }
}

async function generateZips() {
  console.log('Generating ZIP packages...');

  // 1. Source Code ZIP
  const srcZip = new JSZip();
  const ignoreList = ['node_modules', '.git', 'dist', '.aistudio', '.cache', 'public'];

  // Root files
  const rootFiles = [
    'package.json',
    'index.html',
    'vite.config.ts',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'metadata.json',
    'firebase-applet-config.json',
    'firestore.rules',
    'README.md'
  ];

  for (const f of rootFiles) {
    const fp = path.join(rootDir, f);
    if (fs.existsSync(fp)) {
      srcZip.file(f, fs.readFileSync(fp));
    }
  }

  // Add src folder
  const srcFolder = srcZip.folder('src');
  addDirectoryToZip(srcFolder, path.join(rootDir, 'src'), 'src');

  const srcBuffer = await srcZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(path.join(publicDir, 'nama-foods-source.zip'), srcBuffer);
  console.log('Created public/nama-foods-source.zip (' + (srcBuffer.length / 1024).toFixed(1) + ' KB)');

  // 2. Production dist ZIP
  const distDir = path.join(rootDir, 'dist');
  if (fs.existsSync(distDir)) {
    const distZip = new JSZip();
    addDirectoryToZip(distZip, distDir, '');
    const distBuffer = await distZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(path.join(publicDir, 'nama-foods-dist.zip'), distBuffer);
    console.log('Created public/nama-foods-dist.zip (' + (distBuffer.length / 1024).toFixed(1) + ' KB)');
  }

  console.log('ZIP packages generated successfully!');
}

generateZips().catch(console.error);
