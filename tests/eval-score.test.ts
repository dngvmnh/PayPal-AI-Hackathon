import {test} from "node:test";
import assert from "node:assert/strict";
import {findVerificationCandidate,scoreFindings,summarizeScores,type ExpectedSample} from "../lib/eval-score.ts";
import type {Finding} from "../lib/types.ts";
const expected:ExpectedSample={set:'tuning',notes:'Synthetic scorer test',issues:[{id:'qty',field:'quantity',checkGroup:'quantity_sizes',minSeverity:'blocking',requiresArtworkFix:false,sources:['brief'],correctValue:'12'}],maxFalseBlocking:0,artworkChecks:[]};
const finding:Finding={id:'f1',field:'quantity',checkGroup:'quantity_sizes',severity:'blocking',requiresArtworkFix:false,status:'open',title:'Mismatch',explanation:'Different counts',suggestedValue:'12',customerQuestion:'Which count?',evidence:[{sourceId:'brief',value:'10',quote:'10'}],evidenceStatus:'verified'};
test('matching requires field, group and minimum severity',()=>{
  assert.equal(scoreFindings(expected,[finding]).matched,1);
  for(const f of [{...finding,field:'total_price' as const},{...finding,checkGroup:'pricing' as const},{...finding,severity:'warning' as const}])assert.equal(scoreFindings(expected,[f]).matched,0);
});
test('a duplicate blocking row is not counted as a second true positive',()=>{
  const s=scoreFindings(expected,[finding,{...finding,id:'f2'}]);
  assert.equal(s.matched,1);assert.deepEqual(s.falseBlocking,['f2']);
});
test('invalid evidence and artwork classification errors remain visible despite detection',()=>{
  const s=scoreFindings(expected,[{...finding,evidenceStatus:'invalid',requiresArtworkFix:true}]);
  assert.equal(s.matched,1);assert.deepEqual(s.invalidEvidence,['f1']);assert.equal(s.issues[0].artworkFixCorrect,false);
});
test('clean order does not manufacture a perfect recall and counts false blocks',()=>{
  const s=scoreFindings({...expected,issues:[]},[finding]);assert.equal(s.recall,null);assert.deepEqual(s.falseBlocking,['f1']);
});
test('missing injected issue is not counted as successful injection resistance',()=>{
  assert.equal(scoreFindings({...expected,injection:{sourceId:'msg-2',mustStillReport:['qty']}},[]).injectionResisted,false);
});
test('incomplete runs cannot publish a numeric aggregate recall or pass targets',()=>{
  const s=summarizeScores([{status:'ok',score:scoreFindings(expected,[finding]),artwork:[]},{status:'failed',artwork:[]}]);
  assert.equal(s.recall,null);assert.equal(s.targetsPassed,false);assert.equal(s.completedCases,1);
});
test('failed artwork verification prevents meeting targets',()=>{
  assert.equal(summarizeScores([{status:'ok',score:scoreFindings(expected,[finding]),artwork:[{passed:false}]}]).targetsPassed,false);
});

test('a below-threshold real finding can exercise verification without inflating detection recall',()=>{
  const warning={...finding,severity:'warning' as const};
  assert.equal(scoreFindings(expected,[warning]).matched,0);
  assert.equal(findVerificationCandidate(expected.issues[0],[warning])?.id,'f1');
  assert.equal(findVerificationCandidate(expected.issues[0],[]),undefined);
});
