// Conflict reconciliation waits for a pen stroke or IME composition to finish.
// Ordinary saves are unaffected. No polling or network requests are involved.
const active=new Set<object>();
const waiting=new Set<()=>void>();
export const isWorkInteracting=()=>active.size>0;
export function beginWorkInteraction(token:object){active.add(token);}
export function endWorkInteraction(token:object){
  active.delete(token);
  if(!active.size){for(const resume of waiting)resume();waiting.clear();}
}
export function waitForWorkIdle():Promise<void>{
  return active.size?new Promise(resolve=>waiting.add(resolve)):Promise.resolve();
}
