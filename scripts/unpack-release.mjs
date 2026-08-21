import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';

const RELEASE='GREAT_NECK_NAVIGATOR__GITHUB_DEPLOY__V0.16.0_GN-NAV16.0__SCCC0.12_UEC1.10_REVENUE_ENGINE0.3_PF0.14__UPLOAD_THIS_ZIP.zip';
const SHA='9cb16653449af7ec7050e4367bb5c4911ac112b8ead6b4e4179dc5f96d2a00be';
const ROOT='great-neck-navigator-v0.16.0/';
const TREE='fc029088a5ebe37e5b4380aba317a21707dd467127687d02ce6a35aa31b8a7e1';
const PRE_TREE='7734fc42164a5de905ebc5d322fa16b14e614faddb6c12c787a7de1bd8db5fc0';
const SCCC='5d183594bc9e23924c6c368c1ed1e88dc0e43856dd3040fe4195983da112272b';
const REVENUE='c6d09287a774a9990f0a2101b5089e87917e2f1e427dca8dd565706d5db4e79e';
const PF='dd46dbbfc59370a09cf4bc11b44b5961b37d362898a5a68309be882d5468aecf';
const zipPath=path.resolve(RELEASE),outBase=path.resolve('.render-source'),releaseRoot=path.join(outBase,ROOT.slice(0,-1));
function fail(m){console.error(`great-neck-carrier-error: ${m}`);process.exit(1)}
function ok(v,m){if(!v)fail(m)}
function json(p){try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){fail(`cannot read ${p}: ${e.message}`)}}
function run(){const r=spawnSync('npm',['run','release:gate'],{cwd:releaseRoot,stdio:'inherit',env:process.env});if(r.error)fail(r.error.message);if(r.status!==0)fail(`release gate exited ${r.status}`)}

ok(fs.existsSync(zipPath),`missing exact carrier ${RELEASE}`);
const zip=fs.readFileSync(zipPath);
ok(crypto.createHash('sha256').update(zip).digest('hex')===SHA,'carrier SHA-256 mismatch');
ok(zip.length<250*1024*1024,'carrier exceeds size bound');
let eocd=-1;for(let i=zip.length-22;i>=Math.max(0,zip.length-22-0xffff);i--){if(zip.readUInt32LE(i)===0x06054b50){eocd=i;break}}
ok(eocd>=0,'ZIP end record missing');
const disk=zip.readUInt16LE(eocd+4),cdDisk=zip.readUInt16LE(eocd+6),diskEntries=zip.readUInt16LE(eocd+8),entries=zip.readUInt16LE(eocd+10),cdSize=zip.readUInt32LE(eocd+12),cdOffset=zip.readUInt32LE(eocd+16);
ok(disk===0&&cdDisk===0&&diskEntries===entries,'multi-disk ZIP forbidden');
ok(entries>0&&entries<5000&&entries!==0xffff&&cdSize!==0xffffffff&&cdOffset!==0xffffffff,'ZIP64 or invalid entry count');
ok(cdOffset+cdSize<=zip.length,'central directory outside carrier');
fs.rmSync(outBase,{recursive:true,force:true});fs.mkdirSync(outBase,{recursive:true});
let p=cdOffset,files=0,total=0;const seen=new Set();
for(let i=0;i<entries;i++){
  ok(zip.readUInt32LE(p)===0x02014b50,`bad central entry ${i}`);
  const flags=zip.readUInt16LE(p+8),method=zip.readUInt16LE(p+10),compressed=zip.readUInt32LE(p+20),size=zip.readUInt32LE(p+24),nameLen=zip.readUInt16LE(p+28),extraLen=zip.readUInt16LE(p+30),commentLen=zip.readUInt16LE(p+32),attrs=zip.readUInt32LE(p+38),local=zip.readUInt32LE(p+42);
  ok(nameLen>0&&nameLen<4096,'bad ZIP name length');
  const name=zip.subarray(p+46,p+46+nameLen).toString('utf8').replaceAll('\\','/');p+=46+nameLen+extraLen+commentLen;
  ok(!(flags&1),`encrypted entry ${name}`);ok(compressed!==0xffffffff&&size!==0xffffffff&&local!==0xffffffff,`ZIP64 entry ${name}`);
  ok(name.startsWith(ROOT)&&!name.startsWith('/')&&!name.includes('../')&&!name.includes('/..')&&!name.includes('\0'),`unsafe path ${name}`);
  ok(!seen.has(name),`duplicate path ${name}`);seen.add(name);
  const mode=(attrs>>>16)&0xffff;ok((mode&0o170000)!==0o120000,`symlink forbidden ${name}`);
  if(name.endsWith('/'))continue;
  total+=size;ok(total<300*1024*1024,'uncompressed size bound exceeded');ok(zip.readUInt32LE(local)===0x04034b50,`bad local entry ${name}`);
  const localName=zip.readUInt16LE(local+26),localExtra=zip.readUInt16LE(local+28),start=local+30+localName+localExtra,end=start+compressed;ok(end<=zip.length,`entry outside ZIP ${name}`);
  const src=zip.subarray(start,end);let data;if(method===0)data=Buffer.from(src);else if(method===8)data=zlib.inflateRawSync(src);else fail(`unsupported compression ${method}`);ok(data.length===size,`size mismatch ${name}`);
  const rel=name.slice(ROOT.length);if(!rel)continue;const dest=path.resolve(releaseRoot,rel);ok(dest===releaseRoot||dest.startsWith(releaseRoot+path.sep),`path escape ${name}`);
  fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data);if(mode){try{fs.chmodSync(dest,mode&0o777)}catch{}}files++;
}
ok(files===1751,`expected 1751 files, extracted ${files}`);
for(const rel of ['package.json','GREAT_NECK_DEPLOYMENT_IDENTITY.json','scripts/qualify-release.mjs','app/server.js','app/SOURCE_FILE_MANIFEST.json','app/DEPLOYMENT_SOURCE_IDENTITY.json'])ok(fs.existsSync(path.join(releaseRoot,rel)),`missing ${rel}`);
const id=json(path.join(releaseRoot,'GREAT_NECK_DEPLOYMENT_IDENTITY.json'));
ok(id.product==='GREAT NECK NAVIGATOR'&&id.productVersion==='0.16.0'&&id.builderVersion==='GN-NAV16.0'&&id.repository==='neutralboardroom/great-neck-navigator-app','product/repository identity mismatch');
ok(id.appSourceTreeSha256===TREE&&id.appSourceManifestFileCount===1742&&id.appTotalPathsIncludingSealMetadata===1746,'source tree identity mismatch');
ok(id.predecessor?.version==='0.15.0'&&id.predecessor?.sourceTreeSha256===PRE_TREE,'predecessor mismatch');
ok(id.coordination?.release==='0.12.0'&&id.coordination?.standard==='UEC-1.10'&&id.coordination?.registryVersion===8&&id.coordination?.throughSequence===106&&id.coordination?.artifactSha256===SCCC&&id.coordination?.authority==='COORDINATION_ONLY','SCCC mismatch');
ok(id.sharedRevenueLayer?.productRelease==='0.3.0'&&id.sharedRevenueLayer?.productReleaseSha256===REVENUE&&id.sharedRevenueLayer?.productAuthorityTransfer===false&&id.sharedRevenueLayer?.liveEffects===0,'Revenue Engine mismatch');
ok(id.profileFactory?.version==='GN-PF-0.14.0'&&id.profileFactory?.artifactSha256===PF&&id.profileFactory?.sourceRecords===2473&&id.profileFactory?.residentFacingListings===2414&&id.profileFactory?.qualificationHeldNotPublic===59&&id.profileFactory?.explicitlyUnclaimed===82&&id.profileFactory?.claimStateUnknown===2332&&id.profileFactory?.liveSyncAuthorized===false,'Profile Factory mismatch');
ok(id.membershipMonthlyUsd===10&&id.manualContactAuthorized===0&&id.providerProof?.providerNativeStripeEvidencePresent===false&&id.providerProof?.liveCommerceAuthorized===false,'pricing/provider boundary mismatch');
ok(id.noLoss?.predecessorPaths===1696&&id.noLoss?.missingPredecessorPaths===0&&id.noLoss?.addedSuccessorPaths===50&&id.noLoss?.status==='PASS_ZERO_MISSING_PREDECESSOR_PATHS','no-loss mismatch');
ok(id.launchState?.dedicatedRenderServicePresent===false&&id.launchState?.exactRuntimeParityProven===false&&id.launchState?.orphanedBootstrapPointerIsAuthority===false&&id.liveEffectsOpened===0,'launch/live-effect truth mismatch');
console.log(`great-neck-carrier-ok: exact SHA verified; ${files} files extracted to ${releaseRoot}`);run();console.log(`great-neck-carrier-qualified: GREAT NECK NAVIGATOR v0.16.0 / GN-NAV16.0 / ${TREE}`);
