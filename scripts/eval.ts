import {promises as fs} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {ExpectedSample,findVerificationCandidate,scoreFindings,summarizeScores} from "../lib/eval-score.ts";
import {currentArtworkHashes,sha256} from "../lib/gate.ts";
import {addArtworkVersion,applyAnalysis,newOrder,resolveFinding} from "../lib/orders.ts";
import {processArtworkRecheck} from "../lib/artwork-recheck.ts";
import {aiConfigured,aiModel,aiProvider} from "../lib/ai-config.ts";
import type {Order} from "../lib/types.ts";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const tuning=["riverside-5k","school-club","band-merch","company-retreat","clean-order","injection-email"];
const args=process.argv.slice(2);
let selected=[...tuning],checkOnly=false,initialOnly=false;
for(let i=0;i<args.length;i++){
  if(args[i]==="--set"){if(args[++i]!=="tuning")throw new Error("Only tuning is enabled. Held-out access stays disabled until the prompt is locked and reviewed.");}
  else if(args[i]==="--case"){selected=String(args[++i]??'').split(',');if(selected.some(c=>!tuning.includes(c))||new Set(selected).size!==selected.length)throw new Error("Choose only named tuning cases.");}
  else if(args[i]==="--check-only")checkOnly=true;
  else if(args[i]==="--initial-only")initialOnly=true;
  else throw new Error("Unknown eval argument: "+args[i]);
}
const runId=new Date().toISOString().replace(/[:.]/g,'-');
try{process.loadEnvFile(path.join(root,'.env.local'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
// Set before importing ai/sample/store, so staging never touches the app's .data.
process.env.DATA_DIR=path.join(root,'.eval-runs',runId,'data');
const {splitThread}=await import('../lib/sample.ts');
const {saveUpload,firstVersion}=await import('../lib/store.ts');
const json=async(file:string)=>JSON.parse(await fs.readFile(file,'utf8'));
const mimes:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.pdf':'application/pdf'};
const mime=(name:string)=>mimes[path.extname(name).toLowerCase()];
function safeFile(dir:string,name:string){if(typeof name!=="string"||path.basename(name)!==name||name==='.'||name==='..')throw new Error("Invalid sample filename");return path.join(dir,name);}

async function loadCase(name:string){
  const dir=path.join(root,'samples',name),meta=await json(path.join(dir,'order.json'));
  const expected=ExpectedSample.parse(await json(path.join(dir,'expected.json')));
  const brief=await fs.readFile(path.join(dir,'brief.md'),'utf8').catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return '';throw e;});
  const messages=splitThread(await fs.readFile(path.join(dir,'messages.txt'),'utf8'));
  const hashes:Record<string,string>={'order.json':sha256(await fs.readFile(path.join(dir,'order.json'))),'expected.json':sha256(await fs.readFile(path.join(dir,'expected.json'))),'brief.md':sha256(brief),'messages.txt':sha256(await fs.readFile(path.join(dir,'messages.txt')))};
  const ids=['brief',...messages.map((_,i)=>`msg-${i+1}`)];
  if(!Array.isArray(meta.designs))throw new Error(name+': designs must be an array');
  for(const d of meta.designs){if(typeof d.sourceId!=='string'||!Array.isArray(d.versions)||!d.versions.length)throw new Error(name+': malformed design');ids.push(d.sourceId);for(const file of d.versions){if(!mime(file))throw new Error('Unsupported sample file');hashes[file]=sha256(await fs.readFile(safeFile(dir,file)));}}
  if(new Set(ids).size!==ids.length)throw new Error(name+': duplicate source IDs');
  const issueIds=new Set(expected.issues.map(i=>i.id));
  if(issueIds.size!==expected.issues.length||new Set(expected.issues.map(i=>i.field)).size!==expected.issues.length)throw new Error(name+': duplicate issue ID or field');
  for(const issue of expected.issues){if(issue.sources.some(id=>!ids.includes(id)))throw new Error(name+': issue refers to unknown source');if(issue.requiresArtworkFix&&!issue.requiredFields?.length)throw new Error(name+': missing artwork requirements');}
  if(expected.injection&&(!ids.includes(expected.injection.sourceId)||expected.injection.mustStillReport.some(id=>!issueIds.has(id))))throw new Error(name+': invalid injection key');
  for(const c of expected.artworkChecks){const issue=expected.issues.find(i=>i.id===c.issueId);const design=meta.designs.find((d:{sourceId:string})=>d.sourceId===c.sourceId);if(!issue?.requiresArtworkFix||!design?.versions[c.version-1]||JSON.stringify(Object.keys(c.expect).sort())!==JSON.stringify(issue.requiredFields!.map(r=>r.field).sort()))throw new Error(name+': invalid artwork check');}
  return {name,dir,meta,expected,brief,messages,hashes};
}
type Sample=Awaited<ReturnType<typeof loadCase>>;
async function stageOrder(sample:Sample):Promise<Order>{
  const id=`eval-${sample.name}`;
  const sources:Order['sources']=[];
  if(sample.brief)sources.push({id:'brief',kind:'brief',name:'Order brief',text:sample.brief});
  sample.messages.forEach((m,i)=>sources.push({id:`msg-${i+1}`,kind:'message',...m}));
  for(const d of sample.meta.designs){const file=d.versions[0];const v=await saveUpload(id,file,await fs.readFile(safeFile(sample.dir,file)),mime(file)!);sources.push({id:d.sourceId,kind:'design',name:d.name,file:v.file,mimeType:v.mimeType,versions:[firstVersion(v)]});}
  return newOrder({id,title:sample.meta.title,customerName:sample.meta.customerName,customerEmail:sample.meta.customerEmail,sources});
}

async function main(){
  const samples:Sample[]=[];for(const name of selected)samples.push(await loadCase(name));
  console.log(`Validated ${samples.length} tuning cases. Held-out data was not read.`);
  if(checkOnly)return;
  if(!aiConfigured())throw new Error('Live AI configuration required; evaluation never uses demo fixtures.');
  const {analyzeOrder}=await import('../lib/ai.ts');
  const analyze=async(order:Order)=>{const started=Date.now();const raw=await analyzeOrder(order);if(raw.demo)throw new Error('Demo output is not evaluation');let checked=applyAnalysis(order,raw.analysis,{model:aiModel(),demo:false,artworkHashes:currentArtworkHashes(order)});checked=processArtworkRecheck(checked,raw.analysis);return {order:checked,raw:raw.analysis,latencyMs:Date.now()-started};};
  const provenance:Record<string,string>={};for(const f of ['lib/ai.ts','lib/ai-gateway.ts','lib/ai-config.ts','lib/artwork-ink-audit.ts','lib/order-size-audit.ts','lib/artwork-compare.ts','lib/artwork-recheck.ts','lib/artwork-rules.ts','lib/evidence.ts','lib/orders.ts','lib/types.ts','lib/eval-score.ts','scripts/eval.ts'])provenance[f]=sha256(await fs.readFile(path.join(root,f)));
  const rows:any[]=[];
  const report:any={kind:'Development tuning evaluation; not held-out or general accuracy',startedAt:new Date().toISOString(),model:aiModel(),provider:aiProvider(),initialOnly,fullTuningSet:selected.length===tuning.length,codeHashes:provenance,datasetHashes:Object.fromEntries(samples.map(s=>[s.name,s.hashes])),heldoutAccessed:false,promptLocked:false,matching:'One-to-one field, checkGroup, minimum severity; does not score semantic completeness of each finding',cases:rows};
  const output=path.join(root,'docs','eval');await fs.mkdir(output,{recursive:true});
  for(const sample of samples){
    const row:any={name:sample.name,status:'failed',artwork:[]};rows.push(row);
    try{
      console.log(`Checking ${sample.name}...`);
      const first=await analyze(await stageOrder(sample));
      row.initial=first;row.score=scoreFindings(sample.expected,first.order.analysis!.findings);row.status='ok';
      console.log(`${sample.name}: ${row.score.matched}/${row.score.expected} fields; ${row.score.falseBlocking.length} false blocking; ${row.score.invalidEvidence.length} invalid evidence`);
      if(!initialOnly&&sample.expected.artworkChecks.length){
        let pending=first.order;
        row.verificationFindingIds = {};
        for(const issue of sample.expected.issues){const candidate=findVerificationCandidate(issue,first.order.analysis!.findings);if(!candidate)continue;const match={findingId:candidate.id};row.verificationFindingIds[issue.id]=candidate.id;
          if(issue.requiresArtworkFix)pending=resolveFinding(pending,match.findingId,{type:'require_artwork',requiredFields:issue.requiredFields!,...(issue.correctValue?{specValue:issue.correctValue}:{})});
          else if(issue.correctValue)pending=resolveFinding(pending,match.findingId,{type:'confirm',value:issue.correctValue,typedByHand:true});
        }
        const groups=new Map<string,typeof sample.expected.artworkChecks>();
        for(const c of sample.expected.artworkChecks){const key=c.sourceId+':'+c.version;groups.set(key,[...(groups.get(key)??[]),c]);}
        // Current tuning samples each use one corrected design. Refuse unsupported combinations rather than mis-score them.
        if(groups.size!==1)throw new Error('This tuning runner requires one corrected source/version per sample');
        const checks=[...groups.values()][0],c=checks[0];const design=sample.meta.designs.find((d:{sourceId:string})=>d.sourceId===c.sourceId),file=design.versions[c.version-1];
        const v=await saveUpload(pending.id,file,await fs.readFile(safeFile(sample.dir,file)),mime(file)!);pending=addArtworkVersion(pending,c.sourceId,v);
        const recheck=await analyze(pending);row.recheck=recheck;
        for(const c of checks){const matched={findingId:row.verificationFindingIds[c.issueId]},finding=recheck.order.analysis!.findings.find(f=>f.id===matched.findingId);
          for(const [field,want] of Object.entries(c.expect)){const verification=recheck.order.analysis!.verifications?.find(v=>v.findingId===matched?.findingId&&v.field===field);const passed=want==='pass'?Boolean(verification?.matches&&verification.codeCheck==='pass'&&finding?.status==='resolved_by_artwork'):Boolean(finding&&finding.status!=='resolved_by_artwork'&&verification&&(!verification.matches||verification.codeCheck==='fail'));row.artwork.push({issueId:c.issueId,field,expected:want,passed,verification:verification??null});}
        }
        console.log(`${sample.name}: ${row.artwork.filter((a:any)=>a.passed).length}/${row.artwork.length} artwork checks passed`);
      }
    }catch(error){row.status='failed';row.error=error instanceof Error?error.message:String(error);console.error(`${sample.name}: ${row.error}`);}
    await fs.writeFile(path.join(output,`tuning-${runId}.json`),JSON.stringify(report,null,2));
  }
  report.summary=summarizeScores(rows);if(initialOnly){report.summary.targetsPassed=false;report.summary.artworkVerificationSkipped=true;}
  report.completedAt=new Date().toISOString();
  await fs.writeFile(path.join(output,`tuning-${runId}.json`),JSON.stringify(report,null,2));
  const cell=(v:unknown)=>String(v??'—').replaceAll('|','/').replace(/[\r\n]/g,' ');
  const summary=report.summary;
  const md=`# ProofPay tuning evaluation\n\nDevelopment data only. Not a general accuracy claim. Held-out files were not opened or run; prompt is not locked.\n\nStarted (UTC): ${report.startedAt}. Provider/model: ${report.provider} / ${report.model}.\n\nCompleted ${summary.completedCases}/${summary.selectedCases} selected orders. Full six-case tuning set: ${report.fullTuningSet}. Field-level recall: ${summary.recall===null?'not available':(summary.recall*100).toFixed(1)+'%'} (${summary.matched}/${summary.expected} on cases with initial scores). False blocking: ${summary.falseBlocking}. Invalid evidence findings: ${summary.invalidEvidence}. Artwork-fix classification: ${summary.artworkFixCorrect}/${summary.artworkFixAssessed} detected fields. Artwork checks: ${summary.artworkChecksPassed}/${summary.artworkChecks}. Targets passed: ${summary.targetsPassed}.\n\n| Case | Status | Detected/expected fields | False blocking | Invalid evidence | Artwork checks |\n|---|---|---|---|---|---|\n${rows.map(r=>`| ${r.name} | ${cell(r.status+(r.error?': '+r.error:''))} | ${r.score?r.score.matched+'/'+r.score.expected:'—'} | ${r.score?.falseBlocking.length??'—'} | ${r.score?.invalidEvidence.length??'—'} | ${r.artwork.filter((a:any)=>a.passed).length}/${r.artwork.length} |`).join('\n')}\n\nMatching follows samples/FORMAT.md: one finding per field/group with sufficient severity. A match does not prove that every sub-error or explanation was correct; inspect pipeline analyses and evidence in the companion JSON. Artwork requirements and known corrections come from the answer key after the initial check, simulating merchant decisions. Answer keys are never model input. Non-blocking clutter is recorded separately. A failed run cannot pass targets or publish aggregate recall. Initial-only runs cannot pass full targets. Token/cost totals are not measured here; per-call usage is emitted by the gateway logger. No automatic retries and no PayPal requests.\n\nHeld-out cases are visible in the repository; the author has not accessed them for this run. Held-out mode remains disabled until prompt lock. Code and dataset SHA256 fingerprints, initial observations, validated pipeline output, per-issue scores and re-check results are in the JSON.\n`;
  await fs.writeFile(path.join(output,`tuning-${runId}.md`),md);
  console.log(JSON.stringify(summary,null,2));console.log('Report: '+path.join(output,`tuning-${runId}.md`));
  if(!summary.targetsPassed)process.exitCode=1;
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
