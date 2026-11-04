import {test} from "node:test";
import assert from "node:assert/strict";
import {auditArtworkInks} from "../lib/artwork-ink-audit.ts";
import {compareArtworkInkColors,parseInkColors} from "../lib/artwork-compare.ts";
import {validateEvidence} from "../lib/evidence.ts";
import type {AIAnalysis,Source} from "../lib/types.ts";

const sources: Source[] = [
  {id:"brief",kind:"brief",name:"Order brief",text:"Garment: navy.\nInk colors: 2 — white + safety orange\nQuantity: 10"},
  {id:"art",kind:"design",name:"Design",file:"art.png",mimeType:"image/png"},
];
function analysis(inks=["white","orange","yellow"]): AIAnalysis {
  return {summary:"No issues",proposedSpec:[{field:"ink_colors",value:"2 — white + safety orange",confidence:"high"}],findings:[],
    artworkReadings:[{sourceId:"art",textElements:["Example"],inkColors:inks}],pricing:{quantity:10,unitPrice:2,currency:"USD"}};
}

test("an omitted extra ink becomes one source-backed artwork finding",()=>{
  const before=analysis(); const result=auditArtworkInks(before,sources);
  assert.equal(before.findings.length,0);
  assert.equal(result.findings.length,1);
  const finding=result.findings[0];
  assert.equal(finding.field,"ink_colors");assert.equal(finding.requiresArtworkFix,true);assert.equal(finding.severity,"blocking");
  assert.ok(finding.evidence.some(e=>e.sourceId==='art'&&e.value.includes('yellow')));
  assert.ok(sources[0].text!.includes(finding.evidence.find(e=>e.sourceId==='brief')!.quote));
  assert.equal(validateEvidence(finding,sources).status,"unverified");
  assert.match(result.summary,/1 potential/);
});

test("matching inks do not create a false alarm or treat the garment as ink",()=>{
  const result=auditArtworkInks(analysis(["orange","white"]),sources);
  assert.equal(result.findings.length,0);
});

test("other supported inks and missing inks are checked without a sample-specific color rule",()=>{
  const textSources=structuredClone(sources);textSources[0].text="Ink colours: black + purple";
  const ai=analysis(["black"]);ai.proposedSpec[0].value="black and purple";
  const result=auditArtworkInks(ai,textSources);
  assert.equal(result.findings.length,1);assert.equal(result.findings[0].suggestedValue,"black and purple");
});

test("unsupported, ambiguous, missing, or ungrounded observations are not fabricated into color conflicts",()=>{
  for(const mode of ['unknown','missing','duplicate','wrong-source','unsupported-expectation','no-source','negative-source'] as const){
    const ai=analysis();const ss=structuredClone(sources);
    if(mode==='unknown')ai.artworkReadings![0].inkColors=['possibly gold'];
    if(mode==='missing')ai.artworkReadings=[];
    if(mode==='duplicate')ai.artworkReadings!.push(structuredClone(ai.artworkReadings![0]));
    if(mode==='wrong-source')ai.artworkReadings![0].sourceId='invented';
    if(mode==='unsupported-expectation')ai.proposedSpec[0].value='customer choice';
    if(mode==='no-source')ss[0].text='No explicit ink specification';
    if(mode==='negative-source')ss[0].text='Ink colors: not white or orange';
    assert.equal(auditArtworkInks(ai,ss).findings.length,0,mode);
  }
});

test("an existing ink issue gains current observation evidence without duplicate fields",()=>{
  const ai=analysis();ai.findings=[{field:'ink_colors',requiresArtworkFix:false,severity:'warning',title:'Review inks',explanation:'Review colors.',suggestedValue:'white, orange',customerQuestion:'Which inks?',evidence:[{sourceId:'art',value:'white',quote:'Old observation'}]}];
  const result=auditArtworkInks(ai,sources);
  assert.equal(result.findings.length,1);assert.equal(result.findings[0].requiresArtworkFix,true);
  assert.equal(result.findings[0].evidence.filter(e=>e.sourceId==='art').length,1);
  assert.match(result.findings[0].evidence.find(e=>e.sourceId==='art')!.value,/yellow/);
});

test("a color count is accepted only when it agrees with the named unique inks",()=>{
  assert.deepEqual(parseInkColors(['2 — white + safety orange']),['orange','white']);
  assert.equal(compareArtworkInkColors('2, white and orange',['white','orange']).codeCheck,'pass');
  assert.equal(parseInkColors(['3 — white + orange']),null);
  assert.equal(parseInkColors(['2-color front']),null);
  assert.equal(parseInkColors(['white or orange']),null);
});
