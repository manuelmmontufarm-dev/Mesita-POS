#!/usr/bin/env node
'use strict';

/**
 * Precompile the POS v2 front-end (public/pos-v2/*.jsx → public/pos-v2/dist/*.js)
 * and vendor the React UMD builds locally.
 *
 * Why: index.html used to ship @babel/standalone (~200 KB) and transpile all
 * nine JSX files IN THE BROWSER on every load — the single biggest cost of
 * the POS first paint. Compiling ahead of time removes Babel from the page
 * and lets every script load with `defer`.
 *
 * The dist/ and vendor/ outputs are COMMITTED so the Vercel build stays
 * untouched (`npx prisma generate` only) and never depends on devDependencies
 * being installed. Re-run after editing any .jsx:
 *
 *   npm run build:pos-v2
 */

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const SRC = path.join(__dirname, '..', 'public', 'pos-v2');
const DIST = path.join(SRC, 'dist');
const VENDOR = path.join(SRC, 'vendor');

// Same order as the <script> tags in index.html / pos-v2.html.
const FILES = [
  'data.jsx',
  'store-api.jsx',
  'ui.jsx',
  'floor.jsx',
  'cobro.jsx',
  'order.jsx',
  'history.jsx',
  'app.jsx',
  'auth-gate.jsx',
];

fs.mkdirSync(DIST, { recursive: true });
fs.mkdirSync(VENDOR, { recursive: true });

for (const file of FILES) {
  const src = fs.readFileSync(path.join(SRC, file), 'utf8');
  const out = babel.transformSync(src, {
    filename: file,
    presets: [['@babel/preset-react', { runtime: 'classic' }]],
    compact: true,
    comments: false,
    babelrc: false,
    configFile: false,
  });
  const dest = path.join(DIST, file.replace(/\.jsx$/, '.js'));
  fs.writeFileSync(dest, out.code + '\n');
  console.log(`  ${file} → dist/${path.basename(dest)} (${(out.code.length / 1024).toFixed(1)} KB)`);
}

// Boot entry — the old inline <script type="text/babel"> render call.
fs.writeFileSync(
  path.join(DIST, 'boot.js'),
  'ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(BootApp));\n',
);
console.log('  boot.js written');

// Vendor React UMD (pinned via devDependencies) — removes the unpkg
// third-party connection from the critical path.
for (const [pkg, file] of [
  ['react', 'react.production.min.js'],
  ['react-dom', 'react-dom.production.min.js'],
]) {
  const from = path.join(__dirname, '..', 'node_modules', pkg, 'umd', file);
  fs.copyFileSync(from, path.join(VENDOR, file));
  console.log(`  vendored ${file}`);
}

console.log('POS v2 build complete.');
