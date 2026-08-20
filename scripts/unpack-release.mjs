import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';

const RELEASE = 'GREAT_NECK_NAVIGATOR__GITHUB_DEPLOY__V0.10.0_GN-NAV10.0__UPLOAD_THIS_ZIP.zip';
const EXPECTED_SHA256 = 'ea26282ff37223a12dbccb4c11dc27e2c4178cfaecf1402730a2d0863a3fcc0d';
const EXPECTED_ROOT = 'great-neck-navigator-v0.10.0/';
const EXPECTED_PRODUCT = 'GREAT NECK NAVIGATOR';
const EXPECTED_VERSION = '0.10.0';
const EXPECTED_BUILDER = 'GN-NAV10.0';
const EXPECTED_SHARED_TREE = '1260d05a186ea9b9441f5c431ab4317d203c7dd558600c0bc88ea1f193cf538b';
const zipPath = path.resolve(RELEASE);
const outBase = path.resolve('.render-source');
const appRoot = path.join(outBase, EXPECTED_ROOT.slice(0, -1));

function fail(message) {
  console.error(`great-neck-carrier-error: ${message}`);
  process.exit(1);
}
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.error) fail(`${command} failed to start: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} ${args.join(' ')} exited ${result.status}`);
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`cannot read ${file}: ${error.message}`); }
}

if (!fs.existsSync(zipPath)) fail(`missing exact release carrier: ${RELEASE}`);
const zip = fs.readFileSync(zipPath);
const actualSha = crypto.createHash('sha256').update(zip).digest('hex');
if (actualSha !== EXPECTED_SHA256) fail(`SHA-256 mismatch: expected ${EXPECTED_SHA256}, got ${actualSha}`);

const minEocd = 22;
const maxComment = 0xffff;
const scanStart = Math.max(0, zip.length - minEocd - maxComment);
let eocd = -1;
for (let i = zip.length - minEocd; i >= scanStart; i--) {
  if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) fail('ZIP end-of-central-directory not found');
const diskNo = zip.readUInt16LE(eocd + 4);
const cdDisk = zip.readUInt16LE(eocd + 6);
const diskEntries = zip.readUInt16LE(eocd + 8);
const totalEntries = zip.readUInt16LE(eocd + 10);
const cdSize = zip.readUInt32LE(eocd + 12);
const cdOffset = zip.readUInt32LE(eocd + 16);
if (diskNo !== 0 || cdDisk !== 0 || diskEntries !== totalEntries) fail('multi-disk ZIP is not allowed');
if (totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) fail('ZIP64 carrier is not supported');
if (cdOffset + cdSize > zip.length) fail('central directory extends beyond ZIP');

fs.rmSync(outBase, { recursive: true, force: true });
fs.mkdirSync(outBase, { recursive: true });
let p = cdOffset;
let files = 0;
for (let n = 0; n < totalEntries; n++) {
  if (zip.readUInt32LE(p) !== 0x02014b50) fail(`bad central-directory signature at entry ${n}`);
  const flags = zip.readUInt16LE(p + 8);
  const method = zip.readUInt16LE(p + 10);
  const compSize = zip.readUInt32LE(p + 20);
  const uncompSize = zip.readUInt32LE(p + 24);
  const nameLen = zip.readUInt16LE(p + 28);
  const extraLen = zip.readUInt16LE(p + 30);
  const commentLen = zip.readUInt16LE(p + 32);
  const externalAttrs = zip.readUInt32LE(p + 38);
  const localOffset = zip.readUInt32LE(p + 42);
  const name = zip.subarray(p + 46, p + 46 + nameLen).toString('utf8').replaceAll('\\', '/');
  p += 46 + nameLen + extraLen + commentLen;
  if (flags & 0x1) fail(`encrypted ZIP entry not allowed: ${name}`);
  if (compSize === 0xffffffff || uncompSize === 0xffffffff || localOffset === 0xffffffff) fail(`ZIP64 entry not supported: ${name}`);
  if (!name.startsWith(EXPECTED_ROOT)) fail(`entry outside expected root: ${name}`);
  if (name.startsWith('/') || name.includes('../') || name.includes('/..') || name.includes('\0')) fail(`unsafe ZIP path: ${name}`);
  if (name.endsWith('/')) continue;
  if (zip.readUInt32LE(localOffset) !== 0x04034b50) fail(`bad local-file signature: ${name}`);
  const localNameLen = zip.readUInt16LE(localOffset + 26);
  const localExtraLen = zip.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + localNameLen + localExtraLen;
  const dataEnd = dataStart + compSize;
  if (dataEnd > zip.length) fail(`entry data exceeds ZIP: ${name}`);
  const compressed = zip.subarray(dataStart, dataEnd);
  let data;
  if (method === 0) data = Buffer.from(compressed);
  else if (method === 8) data = zlib.inflateRawSync(compressed);
  else fail(`unsupported compression method ${method}: ${name}`);
  if (data.length !== uncompSize) fail(`size mismatch after extraction: ${name}`);
  const rel = name.slice(EXPECTED_ROOT.length);
  if (!rel) continue;
  const dest = path.resolve(appRoot, rel);
  if (!(dest === appRoot || dest.startsWith(appRoot + path.sep))) fail(`path escapes app root: ${name}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, data);
  const unixMode = (externalAttrs >>> 16) & 0xffff;
  if (unixMode) { try { fs.chmodSync(dest, unixMode & 0o777); } catch {} }
  files++;
}

for (const rel of ['package.json','server.js','governance/CURRENT_RELEASE_TRUTH__v0.10.0.json','SOURCE_FILE_MANIFEST.json']) {
  if (!fs.existsSync(path.join(appRoot, rel))) fail(`extracted source missing ${rel}`);
}
const truth = readJson(path.join(appRoot, 'governance', 'CURRENT_RELEASE_TRUTH__v0.10.0.json'));
if (truth.product !== EXPECTED_PRODUCT || truth.version !== EXPECTED_VERSION || truth.builder !== EXPECTED_BUILDER) {
  fail(`Great Neck identity mismatch: ${truth.product} / ${truth.version} / ${truth.builder}`);
}
const manifest = readJson(path.join(appRoot, 'SOURCE_FILE_MANIFEST.json'));
if (manifest.canonicalSourceTreeSha256 !== EXPECTED_SHARED_TREE) fail(`source tree mismatch: ${manifest.canonicalSourceTreeSha256}`);

console.log(`great-neck-carrier-ok: SHA verified and ${files} files extracted to ${appRoot}`);
run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], appRoot);
run('npm', ['run', 'test:great-neck'], appRoot);
run('npm', ['run', 'check'], appRoot);
run('npm', ['run', 'predeploy:great-neck'], appRoot);
console.log(`great-neck-carrier-qualified: ${EXPECTED_PRODUCT} v${EXPECTED_VERSION} / ${EXPECTED_BUILDER}`);
