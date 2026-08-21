import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {spawnSync} from 'node:child_process';

const RELEASE='GREAT_NECK_NAVIGATOR__GITHUB_DEPLOY__V0.18.0_GN-NAV18.0__SCCC0.12_UEC1.10_REVENUE_ENGINE0.3_PF0.14__UPLOAD_THIS_ZIP.zip';
const EXPECTED_SHA256='5474101fce929016cd0bc0a771cef5b7b1ffc12c86f096c40690153a31eeccf3';
const EXPECTED_ROOT='great-neck-navigator-v0.18.0/';
const EXPECTED_TREE='8f2201a29dec0700c03acce3c957337888ab01eca9fcddeaf6b5d07c449b6acb';
const EXPECTED_EXTRACTED_FILES=1795;
const EXPECTED_APP_FILES=1786;
const EXPECTED_APP_PATHS=1790;
const EXPECTED_SCCC_SHA256='5d183594bc9e23924c6c368c1ed1e88dc0e43856dd3040fe4195983da112272b';
const EXPECTED_REVENUE_SHA256='c6d09287a774a9990f0a2101b5089e87917e2f1e427dca8dd565706d5db4e79e';
const EXPECTED_PF_SHA256='dd46dbbfc59370a09cf4bc11b44b5961b37d362898a5a68309be882d5468aecf';
const EXPECTED_PREDECESSOR_SHA256='98263aebd8df56c41198f79e12716020c936eabe54afb081b3331462f829e858';
const EXPECTED_DONOR_SHA256='748b158a6fb2eaf7d3e085d1f891f0978bab15a621191f2ac4308f2cdc66afb1';

const zipPath=path.resolve(RELEASE);
const outBase=path.resolve('.render-source');
const releaseRoot=path.join(outBase,EXPECTED_ROOT.slice(0,-1));
const fail=m=>{console.error(`great-neck-carrier-error: ${m}`);process.exit(1)};
const ok=(v,m)=>{if(!v)fail(m)};
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
const readJson=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){fail(`cannot read ${p}: ${e.message}`)}};
const run=(cmd,args,cwd)=>{const r=spawnSync(cmd,args,{cwd,stdio:'inherit',env:process.env});if(r.error)fail(`${cmd} failed: ${r.error.message}`);if(r.status!==0)fail(`${cmd} ${args.join(' ')} exited ${r.status}`)};

ok(fs.existsSync(zipPath),`missing exact carrier ${RELEASE}`);
const zip=fs.readFileSync(zipPath);
const carrierSha=sha256(zip);
ok(carrierSha===EXPECTED_SHA256,`carrier SHA-256 mismatch: expected ${EXPECTED_SHA256}, got ${carrierSha}`);
ok(zip.length<250*1024*1024,'carrier exceeds 250 MiB bound');

let eocd=-1;
for(let i=zip.length-22;i>=Math.max(0,zip.length-22-0xffff);i--){
  if(zip.readUInt32LE(i)===0x06054b50){eocd=i;break;}
}
ok(eocd>=0,'ZIP end-of-central-directory record missing');
const disk=zip.readUInt16LE(eocd+4),cdDisk=zip.readUInt16LE(eocd+6),diskEntries=zip.readUInt16LE(eocd+8),entries=zip.readUInt16LE(eocd+10),cdSize=zip.readUInt32LE(eocd+12),cdOffset=zip.readUInt32LE(eocd+16);
ok(disk===0&&cdDisk===0&&diskEntries===entries,'multi-disk ZIP forbidden');
ok(entries>0&&entries<5000&&entries!==0xffff&&cdSize!==0xffffffff&&cdOffset!==0xffffffff,'ZIP64 or invalid entry count');
ok(cdOffset+cdSize<=zip.length,'central directory outside carrier');

fs.rmSync(outBase,{recursive:true,force:true});
fs.mkdirSync(outBase,{recursive:true});
let p=cdOffset,files=0,total=0;
const seen=new Set();
for(let i=0;i<entries;i++){
  ok(p+46<=zip.length&&zip.readUInt32LE(p)===0x02014b50,`bad central-directory entry ${i}`);
  const flags=zip.readUInt16LE(p+8),method=zip.readUInt16LE(p+10),compressed=zip.readUInt32LE(p+20),size=zip.readUInt32LE(p+24),nameLen=zip.readUInt16LE(p+28),extraLen=zip.readUInt16LE(p+30),commentLen=zip.readUInt16LE(p+32),attrs=zip.readUInt32LE(p+38),local=zip.readUInt32LE(p+42);
  ok(nameLen>0&&nameLen<4096,'invalid ZIP name length');
  ok(p+46+nameLen+extraLen+commentLen<=zip.length,'central-directory entry outside carrier');
  const rawName=zip.subarray(p+46,p+46+nameLen).toString('utf8');
  const name=rawName.replaceAll('\\','/');
  p+=46+nameLen+extraLen+commentLen;
  ok(!(flags&1),`encrypted entry forbidden: ${name}`);
  ok(compressed!==0xffffffff&&size!==0xffffffff&&local!==0xffffffff,`ZIP64 entry forbidden: ${name}`);
  const segments=name.split('/');
  ok(name.startsWith(EXPECTED_ROOT)&&!name.startsWith('/')&&!name.includes('\0')&&!segments.includes('..')&&!segments.includes('.'),`unsafe or wrong-root path: ${name}`);
  ok(!seen.has(name),`duplicate ZIP path: ${name}`);seen.add(name);
  const unixMode=(attrs>>>16)&0xffff;
  ok((unixMode&0o170000)!==0o120000,`symbolic link forbidden: ${name}`);
  if(name.endsWith('/'))continue;
  ok(size<150*1024*1024,`entry exceeds size bound: ${name}`);
  total+=size;ok(total<350*1024*1024,'uncompressed carrier exceeds 350 MiB bound');
  ok(local+30<=zip.length&&zip.readUInt32LE(local)===0x04034b50,`bad local-file entry: ${name}`);
  const localFlags=zip.readUInt16LE(local+6),localMethod=zip.readUInt16LE(local+8),localNameLen=zip.readUInt16LE(local+26),localExtraLen=zip.readUInt16LE(local+28);
  ok(localFlags===flags&&localMethod===method,`local/central metadata mismatch: ${name}`);
  const localNameStart=local+30,localNameEnd=localNameStart+localNameLen;
  ok(localNameEnd+localExtraLen<=zip.length,'local name/extra outside carrier');
  const localName=zip.subarray(localNameStart,localNameEnd).toString('utf8').replaceAll('\\','/');
  ok(localName===name,`local/central filename mismatch: ${name}`);
  const start=localNameEnd+localExtraLen,end=start+compressed;
  ok(end<=zip.length,`compressed entry outside carrier: ${name}`);
  const src=zip.subarray(start,end);
  let data;
  if(method===0)data=Buffer.from(src);
  else if(method===8)data=zlib.inflateRawSync(src);
  else fail(`unsupported compression method ${method}: ${name}`);
  ok(data.length===size,`uncompressed size mismatch: ${name}`);
  const rel=name.slice(EXPECTED_ROOT.length);
  if(!rel)continue;
  const dest=path.resolve(releaseRoot,rel);
  ok(dest===releaseRoot||dest.startsWith(releaseRoot+path.sep),`path escapes release root: ${name}`);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,data);
  if(unixMode){try{fs.chmodSync(dest,unixMode&0o777)}catch{}}
  files++;
}
ok(files===EXPECTED_EXTRACTED_FILES,`extracted file count mismatch: expected ${EXPECTED_EXTRACTED_FILES}, got ${files}`);

for(const rel of ['package.json','GREAT_NECK_DEPLOYMENT_IDENTITY.json','scripts/qualify-release.mjs','app/package.json','app/server.js','app/SOURCE_FILE_MANIFEST.json','app/DEPLOYMENT_SOURCE_IDENTITY.json','app/governance/CURRENT_RELEASE_TRUTH__v0.18.0.json','app/governance/NO_LOSS_PREDECESSOR_AUDIT__GN_v0.18.0.json','app/governance/PARALLEL_RELEASE_CONVERGENCE_RECEIPT__GN_v0.18.0.json','app/governance/PROVIDER_GATE_RECEIPT__STRIPE_TEST__GN_v0.18.0.json']){
  ok(fs.existsSync(path.join(releaseRoot,rel)),`extracted release missing ${rel}`);
}
const id=readJson(path.join(releaseRoot,'GREAT_NECK_DEPLOYMENT_IDENTITY.json'));
ok(id.product==='GREAT NECK NAVIGATOR'&&id.productVersion==='0.18.0'&&id.builderVersion==='GN-NAV18.0'&&id.repository==='neutralboardroom/great-neck-navigator-app','product/repository identity mismatch');
ok(id.appSourceTreeSha256===EXPECTED_TREE&&id.appSourceManifestFileCount===EXPECTED_APP_FILES&&id.appTotalPathsIncludingSealMetadata===EXPECTED_APP_PATHS,'source tree identity mismatch');
ok(id.predecessor?.version==='0.16.0'&&id.predecessor?.artifactSha256===EXPECTED_PREDECESSOR_SHA256&&id.predecessor?.sourceTreeSha256==='fc029088a5ebe37e5b4380aba317a21707dd467127687d02ce6a35aa31b8a7e1','predecessor identity mismatch');
ok(id.parallelDonor?.version==='0.17.0'&&id.parallelDonor?.artifactSha256===EXPECTED_DONOR_SHA256&&id.parallelDonor?.predecessor===false&&id.parallelDonor?.disposition==='CAPABILITY_DONOR_ONLY','parallel-donor identity mismatch');
ok(id.coordination?.release==='0.12.0'&&id.coordination?.standard==='UEC-1.10'&&id.coordination?.registryVersion===8&&id.coordination?.throughSequence===106&&id.coordination?.artifactSha256===EXPECTED_SCCC_SHA256&&id.coordination?.authority==='COORDINATION_ONLY','SCCC identity mismatch');
ok(id.sharedRevenueLayer?.productRelease==='0.3.0'&&id.sharedRevenueLayer?.productReleaseSha256===EXPECTED_REVENUE_SHA256&&id.sharedRevenueLayer?.productAuthorityTransfer===false&&id.sharedRevenueLayer?.liveEffects===0,'Revenue Engine boundary mismatch');
ok(id.profileFactory?.version==='GN-PF-0.14.0'&&id.profileFactory?.artifactSha256===EXPECTED_PF_SHA256&&id.profileFactory?.sourceRecords===2473&&id.profileFactory?.residentFacingListings===2414&&id.profileFactory?.qualificationHeldNotPublic===59&&id.profileFactory?.explicitlyUnclaimed===82&&id.profileFactory?.claimStateUnknown===2332&&id.profileFactory?.liveSyncAuthorized===false,'Profile Factory identity mismatch');
ok(id.membershipMonthlyUsd===10&&id.manualContactAuthorized===0&&id.providerProof?.providerNativeStripeEvidencePresent===false&&id.providerProof?.syntheticFixtureIsProviderProof===false&&id.providerProof?.liveCommerceAuthorized===false&&id.noLoss?.missingPredecessorPaths===0&&id.liveEffectsOpened===0,'pricing/provider/no-loss/live-effect boundary mismatch');
const manifest=readJson(path.join(releaseRoot,'app','SOURCE_FILE_MANIFEST.json'));
ok(manifest.deploymentProductVersion==='0.18.0'&&manifest.deploymentBuilderVersion==='GN-NAV18.0'&&manifest.fileCountExcludingManifest===EXPECTED_APP_FILES&&manifest.canonicalSourceTreeSha256===EXPECTED_TREE,'source manifest mismatch');
console.log(`great-neck-carrier-ok: sha256=${carrierSha}; files=${files}; sourceTree=${EXPECTED_TREE}`);
run('npm',['run','release:gate'],releaseRoot);
console.log('great-neck-carrier-qualified: GREAT NECK NAVIGATOR v0.18.0 / GN-NAV18.0');
