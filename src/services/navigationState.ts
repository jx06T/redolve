import type { StudySource } from '../types/question';
export const sourceLabels:Record<StudySource,string>={owned:'我上傳',saved:'我存入',contributing:'我共用中'};
export function readSource(value:string|null):StudySource {
  return value==='saved'||value==='contributing'?value:'owned';
}
export function readerLocationKey(location:{key:string;pathname:string;search:string}) {
  // Direct document navigation can reuse the router's "default" history key.
  return JSON.stringify([location.key,location.pathname,location.search]);
}
const read=(key:string)=>{try{return sessionStorage.getItem(key);}catch{return null;}};
const write=(key:string,value:string)=>{try{sessionStorage.setItem(key,value);}catch{/* Browser storage may be unavailable. */}};
export function lastStudyUrl(account:string) {return read(`rdv:study:last:${account}`)||'/study?source=owned';}
export function rememberStudy(account:string,url:string,source:StudySource) {
  write(`rdv:study:last:${account}`,url);write(`rdv:study:source:${account}:${source}`,url);
}
export function rememberSearch(account:string,url:string,source:StudySource) {
  write(`rdv:search:last:${account}`,url);write(`rdv:search:source:${account}:${source}`,url);
}
export function searchUrl(account:string,from?:string) {
  if(from){const params=new URLSearchParams(from);params.delete('focus');return `/search?${params}`;}
  return read(`rdv:search:last:${account}`)||'/search?source=owned';
}
export function sourceUrl(account:string,source:StudySource,path='/study') {
  const prior=read(`rdv:${path==='/search'?'search':'study'}:source:${account}:${source}`);
  const query=prior?.split('?')[1]?.split('#')[0];
  const params=new URLSearchParams(query||'');params.set('source',source);params.delete('focus');
  return `${path}?${params}`;
}
export function savedStudyUrl(id:string) {return `/study?source=saved&focus=${encodeURIComponent(id)}`;}
export function workStudyUrl(collectionId:string,entryId?:string) {
  return `/study?source=contributing&collection_id=${encodeURIComponent(collectionId)}${entryId?`&focus=${encodeURIComponent(entryId)}`:''}`;
}
export function readScroll(account:string,key:string):number {
  const raw=Number(read(`rdv:scroll:${account}:${key}`));return Number.isFinite(raw)?Math.max(0,raw):0;
}
export function rememberScroll(account:string,key:string,top:number) {write(`rdv:scroll:${account}:${key}`,String(top));}
export function rememberAnchor(account:string,key:string,id:string,relative:number) {
  write(`rdv:anchor:${account}:${key}`,JSON.stringify({id,relative}));
}
export function readAnchor(account:string,key:string):{id:string;relative:number}|null {
  try{const value=JSON.parse(read(`rdv:anchor:${account}:${key}`)||'null');
    return value&&typeof value.id==='string'&&Number.isFinite(value.relative)?value:null;}catch{return null;}
}
