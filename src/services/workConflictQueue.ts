// Visible cards can restore several conflicted drafts together. One dialog at
// a time keeps focus trapping and version choices attached to the right card.
const queue:object[]=[];
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(listener=>listener());
export const activeConflictDialog=()=>queue[0]||null;
export function subscribeConflictDialogs(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function registerConflictDialog(token:object){
 queue.push(token);notify();
 return()=>{const index=queue.indexOf(token);if(index>=0){queue.splice(index,1);notify();}};
}
