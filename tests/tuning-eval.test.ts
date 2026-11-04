import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
const run=(args:string[])=>spawnSync(process.execPath,['--experimental-strip-types','scripts/eval.ts',...args],{cwd:process.cwd(),encoding:'utf8',timeout:30000});
test('all six named tuning fixtures validate without calling AI',()=>{
  const r=run(['--check-only']);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Validated 6 tuning cases/);
});
test('held-out set and path-like case arguments are refused before loading cases',()=>{
  for(const args of [['--set','heldout','--check-only'],['--case','../heldout','--check-only']]){
    const r=run(args);assert.notEqual(r.status,0);assert.match(r.stderr,/Held-out access stays disabled|Choose only named tuning cases/);assert.doesNotMatch(r.stdout,/Validated/);
  }
});
