import type {AIAnalysis,Evidence,Source} from "./types.ts";

/** Conservative parser: only explicit, unique named sizes with integer counts. */
export function parseSizeCounts(value:string):Map<string,number>|null{
  const counts=new Map<string,number>();
  const rest=value.replace(/\b(XXXS|XXS|XXXL|XXL|XS|XL|[2-5]XL|S|M|L)\s*[:x×=]?\s*(\d+)\b/gi,(_,label:string,count:string)=>{
    const key=({XXL:'2XL',XXXL:'3XL'} as Record<string,string>)[label.toUpperCase()]??label.toUpperCase();
    if(counts.has(key))counts.set(key,NaN);else counts.set(key,Number(count));return '';
  }).replace(/[\s,/|;+]+/g,'');
  if(rest||!counts.size||[...counts.values()].some(n=>!Number.isSafeInteger(n)||n<0))return null;
  return counts;
}

export function auditOrderSizes(analysis:AIAnalysis,sources:Source[]):AIAnalysis{
  const quantity=analysis.pricing.quantity;
  if(quantity==null||!Number.isSafeInteger(quantity)||quantity<=0)return analysis;
  const texts=sources.filter(s=>s.kind!=='design'&&s.text&&sources.filter(t=>t.id===s.id).length===1);
  let quantityEvidence:Evidence|undefined;
  for(const source of texts){
    for(const match of source.text!.matchAll(/\bquantity\s*(?::|is|of)\s*(\d+)\b|\b(\d+)\s+(?:shirts|t-shirts|tees)\b/gi)){
      if(Number(match[1]??match[2])===quantity){quantityEvidence={sourceId:source.id,value:String(quantity),quote:match[0]};break;}
    }
    if(quantityEvidence)break;
  }
  if(!quantityEvidence)return analysis;
  const evidence:Evidence[]=[quantityEvidence],totals:number[]=[];
  for(const source of texts){
    for(const match of source.text!.matchAll(/\b(?:sizes|size breakdown)\s*:\s*([^\r\n.]+)/gi)){
      const counts=parseSizeCounts(match[1]);if(!counts)continue;
      const total=[...counts.values()].reduce((a,b)=>a+b,0);
      if(!Number.isSafeInteger(total)||total===quantity)continue;
      totals.push(total);evidence.push({sourceId:source.id,value:`${match[1].trim()} (sum ${total})`,quote:match[0]});
    }
  }
  if(!totals.length)return analysis;
  const result=structuredClone(analysis),existing=result.findings.find(f=>f.field==='size_breakdown');
  const proposed=result.proposedSpec.find(s=>s.field==='size_breakdown')?.value;
  const proposedCounts=proposed?parseSizeCounts(proposed):null;
  const suggested=proposedCounts&&[...proposedCounts.values()].reduce((a,b)=>a+b,0)===quantity?proposed!:null;
  const explanation=`The explicit size counts sum to ${[...new Set(totals)].join(' / ')}, while the extracted quantity is ${quantity} and is stated in a text source. Confirm the allocation of sizes; do not guess which sizes to add or remove.`;
  if(existing){existing.severity='blocking';existing.requiresArtworkFix=false;existing.explanation+=` ${explanation}`;
    for(const item of evidence)if(!existing.evidence.some(e=>e.sourceId===item.sourceId&&e.quote===item.quote))existing.evidence.push(item);
  }else result.findings.push({field:'size_breakdown',requiresArtworkFix:false,severity:'blocking',title:'Size counts do not add up to the order quantity',explanation,evidence,suggestedValue:suggested,customerQuestion:`Please confirm the complete size breakdown totaling ${quantity} shirts.`});
  result.summary=`AI flagged ${result.findings.length} potential issue(s) for review. Additional issues may remain; merchant and customer confirmation are required.`;
  return result;
}
