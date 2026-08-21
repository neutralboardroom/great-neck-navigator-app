import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {spawnSync} from 'node:child_process';

const RELEASE='GREAT_NECK_NAVIGATOR__GITHUB_DEPLOY__V0.18.0_GN-NAV18.0__SCCC0.12_UEC1.10_REVENUE_ENGINE0.3_PF0.14__UPLOAD_THIS_ZIP.zip';
const ROOT='great-neck-navigator-v0.18.0/';
const zipPath=path.resolve(RELEASE),outBase=path.resolve('.render-source'),releaseRoot=path.join(outBase,ROOT.slice(0,-1));
const fail=m=>{console.error(`great-neck-carrier-error: ${m}`);process.exit(1)};
const ok=(v,m)=>{if(!v)fail(m)};
const readJson=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){fail(`cannot read ${p}: ${e.message}`)}};
const run=(cmd,args,cwd)=>{const r=spawnSync(cmd,args,{cwd,stdio:'inherit',env:process.env});if(r.error)fail(r.error.message);if(r.status!==0)fail(`${cmd} ${args.join(' ')} exited ${r.status}`)};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');

ok(fs.existsSync(zipPath),`missing exact carrier ${RELEASE}`);
const zip=fs.readFileSync(zipPath),carrierSha=hash(zip);
ok(zip.length<250*1024*1024,'carrier exceeds 250 MiB bound');
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
  ok(nameLen>0&&nameLen<4096,'bad ZIP name length');const name=zip.subarray(p+46,p+46+nameLen).toString('utf8').replaceAll('\\','/');p+=46+nameLen+extraLen+commentLen;
  ok(!(flags&1),`encrypted entry ${name}`);ok(compressed!==0xffffffff&&size!==0xffffffff&&local!==0xffffffff,`ZIP64 entry ${name}`);
  ok(name.startsWith(ROOT)&&!name.startsWith('/')&&!name.includes('../')&&!name.includes('/..')&&!name.includes('\0'),`unsafe path ${name}`);
  ok(!seen.has(name),`duplicate path ${name}`);seen.add(name);const mode=(attrs>>>16)&0xffff;ok((mode&0o170000)!==0o120000,`symlink forbidden ${name}`);
  if(name.endsWith('/'))continue;total+=size;ok(total<350*1024*1024,'uncompressed size bound exceeded');ok(zip.readUInt32LE(local)===0x04034b50,`bad local entry ${name}`);
  const localName=zip.readUInt16LE(local+26),localExtra=zip.readUInt16LE(local+28),start=local+30+localName+localExtra,end=start+compressed;ok(end<=zip.length,`entry outside ZIP ${name}`);
  const src=zip.subarray(start,end);let data;if(method===0)data=Buffer.from(src);else if(method===8)data=zlib.inflateRawSync(src);else fail(`unsupported compression ${method}`);ok(data.length===size,`size mismatch ${name}`);
  const rel=name.slice(ROOT.length);if(!rel)continue;const dest=path.resolve(releaseRoot,rel);ok(dest===releaseRoot||dest.startsWith(releaseRoot+path.sep),`path escape ${name}`);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data);if(mode){try{fs.chmodSync(dest,mode&0o777)}catch{}}files++;
}
for(const rel of ['package.json','GREAT_NECK_DEPLOYMENT_IDENTITY.json','scripts/qualify-release.mjs','app/server.js','app/SOURCE_FILE_MANIFEST.json','app/DEPLOYMENT_SOURCE_IDENTITY.json','app/governance/CURRENT_RELEASE_TRUTH__v0.18.0.json','app/governance/NO_LOSS_PREDECESSOR_AUDIT__GN_v0.18.0.json','app/data/great-neck-v18/community_value_capabilities.json'])ok(fs.existsSync(path.join(releaseRoot,rel)),`missing ${rel}`);
const id=readJson(path.join(releaseRoot,'GREAT_NECK_DEPLOYMENT_IDENTITY.json'));
ok(id.product==='GREAT NECK NAVIGATOR'&&id.productVersion==='0.18.0'&&id.builderVersion==='GN-NAV18.0'&&id.repository==='neutralboardroom/great-neck-navigator-app','product/repository identity mismatch');
ok(id.predecessor?.version==='0.16.0'&&id.parallelDonor?.version==='0.17.0'&&id.parallelDonor?.authority==='QUALIFIED_CAPABILITY_DONOR_ONLY','convergence lineage mismatch');
ok(id.coordination?.release==='0.12.0'&&id.coordination?.standard==='UEC-1.10'&&id.coordination?.registryVersion===8&&id.coordination?.throughSequence===106&&id.coordination?.authority==='COORDINATION_ONLY','SCCC mismatch');
ok(id.sharedRevenueLayer?.productRelease==='0.3.0'&&id.sharedRevenueLayer?.productAuthorityTransfer===false&&id.sharedRevenueLayer?.liveEffects===0,'Revenue Engine boundary mismatch');
ok(id.profileFactory?.version==='GN-PF-0.14.0'&&id.profileFactory?.sourceRecords===2473&&id.profileFactory?.residentFacingListings===2414&&id.profileFactory?.qualificationHeldNotPublic===59&&id.profileFactory?.explicitlyUnclaimed===82&&id.profileFactory?.claimStateUnknown===2332&&id.profileFactory?.liveSyncAuthorized===false,'Profile Factory mismatch');
ok(id.membershipMonthlyUsd===10&&id.publicUseFree===true&&id.freeBasicProfileClaimCorrectionSuppression===true&&id.paymentBuysTrustVerificationAccuracyOrClaimAuthority===false,'price/free-rights boundary mismatch');
ok(id.communityValue?.capabilityCount===11&&id.communityValue?.publicWorkspaceCount===4&&id.communityValue?.residentChoiceRequired===true,'community-value identity mismatch');
ok(id.manualContactAuthorized===0&&id.providerProof?.providerNativeStripeEvidencePresent===false&&id.providerProof?.liveCommerceAuthorized===false&&id.noLoss?.missingPredecessorPaths===0&&id.liveEffectsOpened===0,'live-effect/no-loss boundary mismatch');
const manifest=readJson(path.join(releaseRoot,'app','SOURCE_FILE_MANIFEST.json')),app=path.join(releaseRoot,'app'),exclude=new Set(manifest.exclusions);
function walk(d,base=''){let out=[];for(const ent of fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const rel=base?`${base}/${ent.name}`:ent.name,f=path.join(d,ent.name);if(ent.isSymbolicLink())fail(`app symlink ${rel}`);if(ent.isDirectory())out=out.concat(walk(f,rel));else if(ent.isFile()&&!exclude.has(rel)){const b=fs.readFileSync(f);out.push({path:rel,sha256:hash(b),sizeBytes:b.length})}}return out}
const records=walk(app),canonical=hash(Buffer.from(records.map(r=>`${r.path}\0${r.sha256}\0${r.sizeBytes}\n`).join('')));
ok(records.length===manifest.fileCountExcludingManifestAndSealMetadata&&canonical===manifest.canonicalSourceTreeSha256&&canonical===id.appSourceTreeSha256,'canonical source tree mismatch');
console.log(`great-neck-carrier-ok: sha256=${carrierSha}; files=${files}; sourceTree=${canonical}`);run('npm',['run','release:gate'],releaseRoot);console.log('great-neck-carrier-qualified: GREAT NECK NAVIGATOR v0.18.0 / GN-NAV18.0');
