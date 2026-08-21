import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';

const RELEASE = 'GREAT_NECK_NAVIGATOR__GITHUB_DEPLOY__V0.11.0_GN-NAV11.0__SCCC_REVENUE_ENGINE_V0.1.0__PF0.11__UPLOAD_THIS_ZIP.zip';
const EXPECTED_SHA256 = '650e9527205d2e00cce0d7c335aa286d9d1855d7c4d0a870597ab90eb5ea8b68';
const EXPECTED_ROOT = 'great-neck-navigator-v0.11.0/';
const EXPECTED_PRODUCT = 'GREAT NECK NAVIGATOR';
const EXPECTED_VERSION = '0.11.0';
const EXPECTED_BUILDER = 'GN-NAV11.0';
const EXPECTED_APP_TREE = 'd32c38f370425bf2c42f0484011629b98994ad498e447683108d5fd9f358f718';
const EXPECTED_REVENUE_ENGINE = '0.1.0';
const EXPECTED_REVENUE_SHA256 = 'a2a363eecb7981568b0347e5ce61b990807d60bc282b60fc9c4fe8da13a24b7d';
const zipPath = path.resolve(RELEASE);
const outBase = path.resolve('.render-source');
const releaseRoot = path.join(outBase, EXPECTED_ROOT.slice(0, -1));

function fail(message) { console.error(`great-neck-carrier-error: ${message}`); process.exit(1); }
function run(command,args,cwd){const r=spawnSync(command,args,{cwd,stdio:'inherit',env:process.env}); if(r.error)fail(`${command} failed: ${r.error.message}`); if(r.status!==0)fail(`${command} ${args.join(' ')} exited ${r.status}`);}
function readJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){fail(`cannot read ${file}: ${e.message}`);}}

if(!fs.existsSync(zipPath)) fail(`missing exact release carrier: ${RELEASE}`);
const zip=fs.readFileSync(zipPath);
const actualSha=crypto.createHash('sha256').update(zip).digest('hex');
if(actualSha!==EXPECTED_SHA256) fail(`SHA-256 mismatch: expected ${EXPECTED_SHA256}, got ${actualSha}`);
const minEocd=22,maxComment=0xffff,scanStart=Math.max(0,zip.length-minEocd-maxComment); let eocd=-1;
for(let i=zip.length-minEocd;i>=scanStart;i--){if(zip.readUInt32LE(i)===0x06054b50){eocd=i;break;}}
if(eocd<0) fail('ZIP end-of-central-directory not found');
const diskNo=zip.readUInt16LE(eocd+4),cdDisk=zip.readUInt16LE(eocd+6),diskEntries=zip.readUInt16LE(eocd+8),totalEntries=zip.readUInt16LE(eocd+10),cdSize=zip.readUInt32LE(eocd+12),cdOffset=zip.readUInt32LE(eocd+16);
if(diskNo!==0||cdDisk!==0||diskEntries!==totalEntries) fail('multi-disk ZIP is not allowed');
if(totalEntries===0xffff||cdSize===0xffffffff||cdOffset===0xffffffff) fail('ZIP64 carrier is not supported');
if(cdOffset+cdSize>zip.length) fail('central directory extends beyond ZIP');
fs.rmSync(outBase,{recursive:true,force:true}); fs.mkdirSync(outBase,{recursive:true});
let p=cdOffset,files=0;
for(let n=0;n<totalEntries;n++){
  if(zip.readUInt32LE(p)!==0x02014b50) fail(`bad central-directory signature at entry ${n}`);
  const flags=zip.readUInt16LE(p+8),method=zip.readUInt16LE(p+10),compSize=zip.readUInt32LE(p+20),uncompSize=zip.readUInt32LE(p+24),nameLen=zip.readUInt16LE(p+28),extraLen=zip.readUInt16LE(p+30),commentLen=zip.readUInt16LE(p+32),externalAttrs=zip.readUInt32LE(p+38),localOffset=zip.readUInt32LE(p+42);
  const name=zip.subarray(p+46,p+46+nameLen).toString('utf8').replaceAll('\\','/'); p+=46+nameLen+extraLen+commentLen;
  if(flags&0x1) fail(`encrypted ZIP entry not allowed: ${name}`);
  if(compSize===0xffffffff||uncompSize===0xffffffff||localOffset===0xffffffff) fail(`ZIP64 entry not supported: ${name}`);
  if(!name.startsWith(EXPECTED_ROOT)) fail(`entry outside expected root: ${name}`);
  if(name.startsWith('/')||name.includes('../')||name.includes('/..')||name.includes('\0')) fail(`unsafe ZIP path: ${name}`);
  if(name.endsWith('/')) continue;
  if(zip.readUInt32LE(localOffset)!==0x04034b50) fail(`bad local-file signature: ${name}`);
  const localNameLen=zip.readUInt16LE(localOffset+26),localExtraLen=zip.readUInt16LE(localOffset+28),dataStart=localOffset+30+localNameLen+localExtraLen,dataEnd=dataStart+compSize;
  if(dataEnd>zip.length) fail(`entry data exceeds ZIP: ${name}`);
  const compressed=zip.subarray(dataStart,dataEnd); let data;
  if(method===0)data=Buffer.from(compressed); else if(method===8)data=zlib.inflateRawSync(compressed); else fail(`unsupported compression method ${method}: ${name}`);
  if(data.length!==uncompSize) fail(`size mismatch after extraction: ${name}`);
  const rel=name.slice(EXPECTED_ROOT.length); if(!rel) continue;
  const dest=path.resolve(releaseRoot,rel); if(!(dest===releaseRoot||dest.startsWith(releaseRoot+path.sep))) fail(`path escapes release root: ${name}`);
  fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.writeFileSync(dest,data);
  const unixMode=(externalAttrs>>>16)&0xffff; if(unixMode){try{fs.chmodSync(dest,unixMode&0o777);}catch{}}
  files++;
}
for(const rel of ['package.json','GREAT_NECK_DEPLOYMENT_IDENTITY.json','app/server.js','app/GREAT_NECK_PRODUCT_IDENTITY.json','app/SOURCE_FILE_MANIFEST.json']) if(!fs.existsSync(path.join(releaseRoot,rel))) fail(`extracted release missing ${rel}`);
const ident=readJson(path.join(releaseRoot,'GREAT_NECK_DEPLOYMENT_IDENTITY.json'));
if(ident.product!==EXPECTED_PRODUCT||ident.productVersion!==EXPECTED_VERSION||ident.builderVersion!==EXPECTED_BUILDER) fail('Great Neck deployment-root identity mismatch');
if(ident.repository!=='neutralboardroom/great-neck-navigator-app'||ident.appSourceTreeSha256!==EXPECTED_APP_TREE) fail('repository/source-tree identity mismatch');
if(ident.coordination?.current!=='SMARTER CORE COORDINATION CENTER (SCCC)'||ident.sharedRevenueLayer?.name!=='SMARTER REVENUE ENGINE'||ident.sharedRevenueLayer?.productRelease!==EXPECTED_REVENUE_ENGINE||ident.sharedRevenueLayer?.productReleaseSha256!==EXPECTED_REVENUE_SHA256||ident.sharedRevenueLayer?.separateFromSccc!==true) fail('SCCC / Revenue Engine role separation mismatch');
if(ident.sharedRevenueLayer?.currentPerRecordProofRequired!==true||ident.sharedRevenueLayer?.runtimeSecretHmacExecutionSealRequired!==true) fail('Revenue Engine proof/seal guard mismatch');
const appManifest=readJson(path.join(releaseRoot,'app','SOURCE_FILE_MANIFEST.json'));
if(appManifest.canonicalSourceTreeSha256!==EXPECTED_APP_TREE) fail(`embedded app source tree mismatch: ${appManifest.canonicalSourceTreeSha256}`);
console.log(`great-neck-carrier-ok: SHA verified and ${files} files extracted to ${releaseRoot}`);
run('npm',['run','release:gate'],releaseRoot);
console.log(`great-neck-carrier-qualified: ${EXPECTED_PRODUCT} v${EXPECTED_VERSION} / ${EXPECTED_BUILDER}`);
