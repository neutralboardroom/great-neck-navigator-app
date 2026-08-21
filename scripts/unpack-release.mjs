import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';

const RELEASE = 'GREAT_NECK_NAVIGATOR__GITHUB_DEPLOY__V0.16.0_GN-NAV16.0__SCCC0.11_UEC1.9_REVENUE_ENGINE0.3_PF0.12__UPLOAD_THIS_ZIP.zip';
const EXPECTED_SHA256 = '03bacbaa260ecc950f8e47b1022b8204ca3d5af1f306569342223524c4cfb9c0';
const EXPECTED_ROOT = 'great-neck-navigator-v0.16.0/';
const EXPECTED_PRODUCT = 'GREAT NECK NAVIGATOR';
const EXPECTED_VERSION = '0.16.0';
const EXPECTED_BUILDER = 'GN-NAV16.0';
const EXPECTED_APP_TREE = 'd935d058629e48cdd1e6d5f9541b7c9f8eafcad822166387e9420d22922271dc';
const EXPECTED_PREDECESSOR_TREE = '7734fc42164a5de905ebc5d322fa16b14e614faddb6c12c787a7de1bd8db5fc0';
const EXPECTED_SCCC_SHA256 = '69cc0f684b44f2f79ced07cd384efd9a252cfa254dcadf87b5488c9b94ded11e';
const EXPECTED_REVENUE_SHA256 = 'c6d09287a774a9990f0a2101b5089e87917e2f1e427dca8dd565706d5db4e79e';
const zipPath = path.resolve(RELEASE);
const outBase = path.resolve('.render-source');
const releaseRoot = path.join(outBase, EXPECTED_ROOT.slice(0, -1));

function fail(message) { console.error(`great-neck-carrier-error: ${message}`); process.exit(1); }
function run(command,args,cwd){const r=spawnSync(command,args,{cwd,stdio:'inherit',env:process.env});if(r.error)fail(`${command} failed: ${r.error.message}`);if(r.status!==0)fail(`${command} ${args.join(' ')} exited ${r.status}`);}
function readJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){fail(`cannot read ${file}: ${e.message}`);}}

if(!fs.existsSync(zipPath)) fail(`missing exact release carrier: ${RELEASE}`);
const zip=fs.readFileSync(zipPath);
const actualSha=crypto.createHash('sha256').update(zip).digest('hex');
if(actualSha!==EXPECTED_SHA256) fail(`SHA-256 mismatch: expected ${EXPECTED_SHA256}, got ${actualSha}`);

const minEocd=22,maxComment=0xffff,scanStart=Math.max(0,zip.length-minEocd-maxComment);let eocd=-1;
for(let i=zip.length-minEocd;i>=scanStart;i--){if(zip.readUInt32LE(i)===0x06054b50){eocd=i;break;}}
if(eocd<0) fail('ZIP end-of-central-directory not found');
const diskNo=zip.readUInt16LE(eocd+4),cdDisk=zip.readUInt16LE(eocd+6),diskEntries=zip.readUInt16LE(eocd+8),totalEntries=zip.readUInt16LE(eocd+10),cdSize=zip.readUInt32LE(eocd+12),cdOffset=zip.readUInt32LE(eocd+16);
if(diskNo!==0||cdDisk!==0||diskEntries!==totalEntries) fail('multi-disk ZIP is not allowed');
if(totalEntries===0xffff||cdSize===0xffffffff||cdOffset===0xffffffff) fail('ZIP64 carrier is not supported');
if(cdOffset+cdSize>zip.length) fail('central directory extends beyond ZIP');
fs.rmSync(outBase,{recursive:true,force:true});fs.mkdirSync(outBase,{recursive:true});
let p=cdOffset,files=0;
for(let n=0;n<totalEntries;n++){
  if(zip.readUInt32LE(p)!==0x02014b50) fail(`bad central-directory signature at entry ${n}`);
  const flags=zip.readUInt16LE(p+8),method=zip.readUInt16LE(p+10),compSize=zip.readUInt32LE(p+20),uncompSize=zip.readUInt32LE(p+24),nameLen=zip.readUInt16LE(p+28),extraLen=zip.readUInt16LE(p+30),commentLen=zip.readUInt16LE(p+32),externalAttrs=zip.readUInt32LE(p+38),localOffset=zip.readUInt32LE(p+42);
  const name=zip.subarray(p+46,p+46+nameLen).toString('utf8').replaceAll('\\','/');p+=46+nameLen+extraLen+commentLen;
  if(flags&0x1) fail(`encrypted ZIP entry not allowed: ${name}`);
  if(compSize===0xffffffff||uncompSize===0xffffffff||localOffset===0xffffffff) fail(`ZIP64 entry not supported: ${name}`);
  if(!name.startsWith(EXPECTED_ROOT)) fail(`entry outside expected root: ${name}`);
  if(name.startsWith('/')||name.includes('../')||name.includes('/..')||name.includes('\0')) fail(`unsafe ZIP path: ${name}`);
  if(name.endsWith('/')) continue;
  if(zip.readUInt32LE(localOffset)!==0x04034b50) fail(`bad local-file signature: ${name}`);
  const localNameLen=zip.readUInt16LE(localOffset+26),localExtraLen=zip.readUInt16LE(localOffset+28),dataStart=localOffset+30+localNameLen+localExtraLen,dataEnd=dataStart+compSize;
  if(dataEnd>zip.length) fail(`entry data exceeds ZIP: ${name}`);
  const compressed=zip.subarray(dataStart,dataEnd);let data;
  if(method===0)data=Buffer.from(compressed);else if(method===8)data=zlib.inflateRawSync(compressed);else fail(`unsupported compression method ${method}: ${name}`);
  if(data.length!==uncompSize) fail(`size mismatch after extraction: ${name}`);
  const rel=name.slice(EXPECTED_ROOT.length);if(!rel) continue;
  const dest=path.resolve(releaseRoot,rel);if(!(dest===releaseRoot||dest.startsWith(releaseRoot+path.sep))) fail(`path escapes release root: ${name}`);
  fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data);
  const unixMode=(externalAttrs>>>16)&0xffff;if(unixMode){try{fs.chmodSync(dest,unixMode&0o777);}catch{}}
  files++;
}

for(const rel of ['package.json','GREAT_NECK_DEPLOYMENT_IDENTITY.json','scripts/qualify-release.mjs','app/server.js','app/GREAT_NECK_PRODUCT_IDENTITY.json','app/SOURCE_FILE_MANIFEST.json','app/DEPLOYMENT_SOURCE_IDENTITY.json','app/governance/CURRENT_RELEASE_TRUTH__v0.16.0.json','app/governance/NO_LOSS_PREDECESSOR_AUDIT__GN_v0.16.0.json']) if(!fs.existsSync(path.join(releaseRoot,rel))) fail(`extracted release missing ${rel}`);
const ident=readJson(path.join(releaseRoot,'GREAT_NECK_DEPLOYMENT_IDENTITY.json'));
if(ident.product!==EXPECTED_PRODUCT||ident.productVersion!==EXPECTED_VERSION||ident.builderVersion!==EXPECTED_BUILDER) fail('Great Neck deployment-root identity mismatch');
if(ident.repository!=='neutralboardroom/great-neck-navigator-app'||ident.appSourceTreeSha256!==EXPECTED_APP_TREE) fail('repository/source-tree identity mismatch');
if(ident.predecessor?.version!=='0.15.0'||ident.predecessor?.builder!=='GN-NAV15.0'||ident.predecessor?.sourceTreeSha256!==EXPECTED_PREDECESSOR_TREE) fail('predecessor identity mismatch');
if(ident.coordination?.current!=='SMARTER CORE COORDINATION CENTER (SCCC)'||ident.coordination?.release!=='0.11.0'||ident.coordination?.standard!=='UEC-1.9'||ident.coordination?.registryVersion!==7||ident.coordination?.throughSequence!==89||ident.coordination?.artifactSha256!==EXPECTED_SCCC_SHA256) fail('SCCC identity mismatch');
if(ident.sharedRevenueLayer?.name!=='SMARTER REVENUE ENGINE'||ident.sharedRevenueLayer?.productRelease!=='0.3.0'||ident.sharedRevenueLayer?.productReleaseSha256!==EXPECTED_REVENUE_SHA256||ident.sharedRevenueLayer?.separateFromSccc!==true||ident.sharedRevenueLayer?.productAuthorityTransfer!==false||ident.sharedRevenueLayer?.liveEffects!==0) fail('Revenue Engine identity mismatch');
if(ident.sharedRevenueLayer?.signedProductEventEnvelope!==true||ident.sharedRevenueLayer?.appendOnlyHashChainEvidence!==true||ident.sharedRevenueLayer?.openingCohortRetention!==true||ident.sharedRevenueLayer?.policyAwareOutboundReview!==true) fail('Revenue Engine safeguards mismatch');
if(ident.profileFactory?.version!=='GN-PF-0.12.0'||ident.profileFactory?.sourceRecords!==2068||ident.profileFactory?.residentFacingListings!==2043||ident.profileFactory?.qualificationHeldNotPublic!==25) fail('Factory identity/count mismatch');
if(ident.membershipMonthlyUsd!==10||ident.manualContactAuthorized!==0||ident.providerProof?.providerNativeStripeEvidencePresent!==false||ident.providerProof?.liveCommerceAuthorized!==false) fail('pricing/sales/provider boundary mismatch');

const product=readJson(path.join(releaseRoot,'app','GREAT_NECK_PRODUCT_IDENTITY.json'));
if(product.product!=='GREAT NECK NAVIGATOR'||product.localProductVersion!=='0.16.0'||product.localBuilderVersion!=='GN-NAV16.0') fail('embedded product identity mismatch');
if(product.libraryAuthority?.predecessorVersion!=='0.15.0'||product.libraryAuthority?.factoryVersion!=='GN-PF-0.12.0'||product.libraryAuthority?.scccVersion!=='0.11.0'||product.libraryAuthority?.scccCoordinationStandard!=='UEC-1.9'||product.libraryAuthority?.smarterRevenueEngineProductRelease!=='0.3.0'||product.businessMembership?.monthlyUsd!==10) fail('embedded authority/pricing mismatch');
const current=readJson(path.join(releaseRoot,'app','governance','CURRENT_RELEASE_TRUTH__v0.16.0.json'));
if(current.version!=='0.16.0'||current.builder!=='GN-NAV16.0'||current.public?.directoryDisplayProfiles!==2043||current.businessMembership?.monthlyUsd!==10) fail('embedded current-release truth mismatch');
if(current.production?.v016Deployed!==false||current.production?.deploymentAuthorized!==false||current.production?.charging!==false) fail('source must not pre-claim deployment/commerce');
const noLoss=readJson(path.join(releaseRoot,'app','governance','NO_LOSS_PREDECESSOR_AUDIT__GN_v0.16.0.json'));
if(noLoss.predecessorPaths!==1694||noLoss.missingPredecessorPaths!==0||noLoss.status!=='PASS_ZERO_MISSING_PREDECESSOR_PATHS') fail('no-loss identity mismatch');
const provider=readJson(path.join(releaseRoot,'app','governance','PROVIDER_GATE_RECEIPT__STRIPE_TEST__GN_v0.16.0.json'));
if(provider.syntheticFixtureIsProviderProof!==false||provider.providerNativeEvidencePresent!==false||provider.liveCommerceAuthorized!==false) fail('Stripe proof boundary mismatch');
const appManifest=readJson(path.join(releaseRoot,'app','SOURCE_FILE_MANIFEST.json'));
const dep=readJson(path.join(releaseRoot,'app','DEPLOYMENT_SOURCE_IDENTITY.json'));
if(appManifest.canonicalSourceTreeSha256!==EXPECTED_APP_TREE||dep.canonicalSourceTreeSha256!==EXPECTED_APP_TREE||appManifest.fileCountExcludingManifest!==1731) fail('embedded app source tree mismatch');
console.log(`great-neck-carrier-ok: SHA verified and ${files} files extracted to ${releaseRoot}`);
run('npm',['run','release:gate'],releaseRoot);
console.log(`great-neck-carrier-qualified: ${EXPECTED_PRODUCT} v${EXPECTED_VERSION} / ${EXPECTED_BUILDER}`);
