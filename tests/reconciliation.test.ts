import {test} from "node:test";
import assert from "node:assert/strict";
import {expandSourceQuote,validateEvidence} from "../lib/evidence.ts";
import {applyAnalysis,resolveFinding,currentSourceFingerprints} from "../lib/orders.ts";
import {currentArtworkHashes,paymentGate} from "../lib/gate.ts";
import {checked,fixture} from "./helpers.ts";

test("an abbreviated quote expands only into an exact ordered unique source span",()=>{
  const source="First confirmed value. Some intervening text. Last confirmed value.";
  assert.equal(expandSourceQuote("First confirmed value. ... Last confirmed value.",source),source);
  assert.equal(expandSourceQuote("Last confirmed value. ... First confirmed value.",source),null);
  assert.equal(expandSourceQuote("First invented value. ... Last confirmed value.",source),null);
  assert.equal(expandSourceQuote("First confirmed value. ... Last confirmed value.",source+source),null);
});

test("ellipsized citations are expanded and logged without disabling validation",()=>{
  const order=checked();
  const source=order.sources.find(s=>s.id==='brief')!;
  source.text='Quantity confirmed: 150 shirts. Additional notes. Final price confirmed: 1425 dollars.';
  const ai=structuredClone(fixture);ai.findings=[{...ai.findings[0],evidence:[{sourceId:'brief',value:'150',quote:'Quantity confirmed: 150 shirts. ... Final price confirmed: 1425 dollars.'}]}];
  const next=applyAnalysis(order,ai,{model:'test',demo:false,artworkHashes:currentArtworkHashes(order)});
  const fresh=next.analysis!.findings.find(f=>f.field===ai.findings[0].field)!;
  assert.equal(validateEvidence(fresh,next.sources).status,'verified');
  assert.ok(next.history.some(e=>e.type==='evidence_refreshed'));
  const invalid={...fresh,evidence:[{sourceId:'brief',value:'150',quote:'An invented quantity ... Final price confirmed: 1425 dollars.'}]};
  assert.equal(validateEvidence(invalid,next.sources).status,'invalid');
});

test("the same accepted value does not create a duplicate open issue on re-check",()=>{
  let order=checked();const q=order.analysis!.findings.find(f=>f.field==='quantity')!;
  order=resolveFinding(order,q.id,{type:'confirm',value:'150'});
  const ai=structuredClone(fixture);ai.findings=ai.findings.filter(f=>f.field==='quantity');
  ai.findings[0].evidence=[{sourceId:'brief',value:'...',quote:'...'}];
  const next=applyAnalysis(order,ai,{model:'test',demo:false,artworkHashes:currentArtworkHashes(order)});
  const qs=next.analysis!.findings.filter(f=>f.field==='quantity');
  assert.equal(qs.length,1);assert.equal(qs[0].status,'resolved');assert.equal(qs[0].id,q.id);
});

test("changed instructions or a different proposed value keep the field open",()=>{
  for(const mode of ['source','value','new-source','removed-source'] as const){
    let order=checked();const q=order.analysis!.findings.find(f=>f.field==='quantity')!;
    if(mode==='removed-source'){order.sources.push({id:'msg-1',kind:'message',name:'Prior instructions',text:'Please use 150 shirts.'});order.analysis!.sourceFingerprints=currentSourceFingerprints(order);}
    order=resolveFinding(order,q.id,{type:'confirm',value:'150'});
    if(mode==='source')order.sources[0].text+=' Changed quantity: 200.';
    if(mode==='removed-source')order.sources=order.sources.filter(s=>s.id!=='msg-1');
    if(mode==='new-source')order.sources.push({id:'new-msg',kind:'message',name:'New instruction',text:'Please make 200.'});
    const ai=structuredClone(fixture);ai.findings=ai.findings.filter(f=>f.field==='quantity');
    ai.findings[0].evidence=[{sourceId:'brief',value:'...',quote:'...'}];
    if(mode==='value'){ai.findings[0].suggestedValue='200';ai.proposedSpec.find(s=>s.field==='quantity')!.value='200';ai.pricing.quantity=200;}
    const next=applyAnalysis(order,ai,{model:'test',demo:false,artworkHashes:currentArtworkHashes(order)});
    assert.ok(next.analysis!.findings.some(f=>f.field==='quantity'&&f.status==='open'),mode);
    assert.equal(paymentGate(next).ok,false);
  }
});

test("a new artwork claim cannot overwrite pending correction requirements",()=>{
  let order=checked();const f=order.analysis!.findings.find(f=>f.field==='print_text')!;
  order=resolveFinding(order,f.id,{type:'require_artwork',requiredFields:[{field:'year',value:'2026'}],specValue:'FUN RUN 2026'});
  const ai=structuredClone(fixture);ai.findings=ai.findings.filter(x=>x.field==='print_text');
  ai.findings[0].requiresArtworkFix=true;ai.findings[0].suggestedValue='FUN RUN 2027';
  const next=applyAnalysis(order,ai,{model:'test',demo:false,artworkHashes:currentArtworkHashes(order)});
  assert.equal(next.analysis!.findings.find(x=>x.id===f.id)!.status,'awaiting_artwork');
  assert.ok(next.analysis!.findings.some(x=>x.id!==f.id&&x.field==='print_text'&&x.status==='open'));
  assert.equal(paymentGate(next).ok,false);
});

test("quoted ellipsis fragments are replaced with the actual full source span",()=>{
  const source='Front text: "FUN RUN 2026" / "Saturday, May 16" / "example.org"';
  const expanded=expandSourceQuote("Front text: ... 'Saturday, May 16' ...",source);
  assert.ok(expanded);assert.ok(source.includes(expanded));
  assert.equal(expandSourceQuote("Front text: ... 'Saturday, May 19' ...",source),null);
});

test("a repeated matching ink result stays attached to pending artwork verification",()=>{
  let order=checked();const ink=order.analysis!.findings.find(f=>f.field==='ink_colors')!;
  order=resolveFinding(order,ink.id,{type:'require_artwork',requiredFields:[{field:'ink_colors',value:'white, orange'}],specValue:'white, safety orange'});
  const ai=structuredClone(fixture);ai.findings=[{...ai.findings.find(f=>f.field==='ink_colors')!,requiresArtworkFix:false,suggestedValue:'white, orange',evidence:[{sourceId:'brief',value:'...',quote:'...'}]}];
  const next=applyAnalysis(order,ai,{model:'test',demo:false,artworkHashes:currentArtworkHashes(order)});
  assert.equal(next.analysis!.findings.filter(f=>f.field==='ink_colors').length,1);
  assert.equal(next.analysis!.findings.find(f=>f.id===ink.id)!.status,'awaiting_artwork');
});
