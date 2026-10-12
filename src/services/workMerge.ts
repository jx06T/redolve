import type { DrawData } from '../types';
import { DEFAULT_CALC_SPACE_HEIGHT } from '../config/constants';
export const sameWork=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

// A conservative three-way edit. Ambiguous insertion order/overlapping edits
// require a choice rather than silently changing the meaning of a note.
export function mergeNotes(base:string|undefined,local:string,cloud:string):string|null {
  if(local===cloud)return local;
  if(base===undefined)return null;
  if(local===base)return cloud;if(cloud===base)return local;
  const original=Array.from(base);
  const delta=(text:string)=>{
    const next=Array.from(text);let start=0,end=original.length,stop=next.length;
    while(start<end&&start<stop&&original[start]===next[start])start++;
    while(end>start&&stop>start&&original[end-1]===next[stop-1]){end--;stop--;}
    return{start,end,insert:next.slice(start,stop)};
  };
  const a=delta(local),b=delta(cloud);
  // Edits touching the same boundary (including two appends) are ambiguous.
  if(!(a.end<b.start||b.end<a.start))return null;
  const edits=[a,b].sort((x,y)=>y.start-x.start);
  for(const edit of edits)original.splice(edit.start,edit.end-edit.start,...edit.insert);
  return original.join('');
}

export function mergeInk(base:DrawData|undefined,local:DrawData,cloud:DrawData):DrawData|null {
  if(sameWork(local,cloud))return local;
  if(!base)return null;
  if(sameWork(local,base))return cloud;if(sameWork(cloud,base))return local;
  const prefix=(value:DrawData)=>value.strokes.length>=base.strokes.length&&
    base.strokes.every((stroke,i)=>sameWork(stroke,value.strokes[i]));
  // Erasing/reordering old strokes and moving the coordinate space are not an append.
  if(!prefix(local)||!prefix(cloud)||!sameWork(local.eraserMasks,base.eraserMasks)||
    !sameWork(cloud.eraserMasks,base.eraserMasks))return null;
  const height=(ink:DrawData)=>ink.calcSpaceHeight??DEFAULT_CALC_SPACE_HEIGHT;
  const geometry=(ink:DrawData)=>{
    // The current editor writes one height record whose atY is the viewport's
    // pixel height, not a vector translation. It differs between phone/iPad.
    const history=ink.expansions;
    const expansions=!history?.length||(history.length===1&&history[0].addedHeight===height(ink))?undefined:history;
    return{baseWidth:ink.baseWidth,baseHeight:ink.baseHeight,expansions};
  };
  if(!sameWork(geometry(local),geometry(cloud)))return null;
  // Establishing an initially blank canvas is allowed; existing coordinates cannot move.
  if(base.strokes.length&& !sameWork(geometry(base),geometry(local)))return null;
  if(height(local)<height(base)||height(cloud)<height(base))return null;
  const strokes=[...cloud.strokes];const ids=new Map(strokes.filter(s=>s.id).map(s=>[s.id!,s]));
  const additions=local.strokes.slice(base.strokes.length);
  const remote=cloud.strokes.slice(base.strokes.length);
  if([...additions,...remote].some(s=>!s.id))return null;
  for(const ink of [local,cloud]){
    const known=ink.strokes.flatMap(s=>s.id?[s.id]:[]);if(new Set(known).size!==known.length)return null;
  }
  for(const stroke of additions){
    const existing=ids.get(stroke.id!);
    if(existing){if(!sameWork(existing,stroke))return null;}
    else{strokes.push(stroke);ids.set(stroke.id!,stroke);}
  }
  return{...cloud,strokes,calcSpaceHeight:Math.max(height(local),height(cloud))};
}

// Rebase local undo snapshots on remote additions without letting undo remove them.
export function rebaseInkHistory(before:DrawData,after:DrawData,snapshot:Pick<DrawData,'strokes'|'eraserMasks'>):Pick<DrawData,'strokes'|'eraserMasks'>|null {
 const key=(s:DrawData['strokes'][number])=>s.id||JSON.stringify(s);
 if(new Set(before.strokes.map(key)).size!==before.strokes.length||new Set(snapshot.strokes.map(key)).size!==snapshot.strokes.length)return null;
 const previous=new Map(before.strokes.map(s=>[key(s),s]));
 const updated=new Map(after.strokes.map(s=>[key(s),s]));
 if(updated.size!==after.strokes.length||before.strokes.some(s=>!sameWork(updated.get(key(s)),s)))return null;
 const extra=after.strokes.filter(s=>!previous.has(key(s)));
 if(extra.some(s=>!s.id)||!sameWork(before.eraserMasks,after.eraserMasks))return null;
 const wanted=new Set(snapshot.strokes.map(key)),remote=new Set(extra.map(key));
 const strokes=after.strokes.filter(s=>wanted.has(key(s))||remote.has(key(s)));
 const positions=new Map(strokes.map((s,i)=>[key(s),i]));
 // An old erasure/reordering snapshot cannot be safely rebased using array indices.
 if(snapshot.strokes.some(s=>!sameWork(updated.get(key(s)),s)))return null;
 const eraserMasks=[];
 for(const mask of snapshot.eraserMasks){
  const original=snapshot.strokes[mask.strokeIdx];if(!original)return null;
  const strokeIdx=positions.get(key(original));if(strokeIdx===undefined)return null;
  eraserMasks.push({...mask,strokeIdx});
 }
 return{strokes,eraserMasks};
}

export function rebaseTextPosition(before:string,after:string,position:number):number {
 let prefix=0,suffix=0;
 while(prefix<before.length&&prefix<after.length&&before[prefix]===after[prefix])prefix++;
 while(suffix<before.length-prefix&&suffix<after.length-prefix&&before[before.length-1-suffix]===after[after.length-1-suffix])suffix++;
 if(position<=prefix)return position;
 if(position>=before.length-suffix)return Math.max(0,Math.min(after.length,position+after.length-before.length));
 return after.length-suffix;
}
