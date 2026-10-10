import { useEffect, useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { readAnchor, readScroll, rememberAnchor, rememberScroll } from '../services/navigationState';

export function QuestionStream<T extends {id:string}>({items,render,loadMore,hasMore,busy,focus}:{
  items:T[];render:(item:T,index:number)=>ReactNode;loadMore:()=>void;hasMore:boolean;busy:boolean;focus?:string;
}) {
  const parent=useRef<HTMLDivElement>(null);const location=useLocation();
  const account=useStore(s=>s.currentUser?.id||'guest');
  const positioned=useRef('');const guard=useRef(false);
  const restoration=useRef<number[]>([]);const restoring=useRef(false);
  const match=useStore(s=>s.inPageMatches[s.inPageCurrentIndex]);
  const v=useVirtualizer({count:items.length,getScrollElement:()=>parent.current,
    estimateSize:()=>800,overscan:0,getItemKey:i=>items[i].id,
    initialOffset:()=>readScroll(account,location.key)});
  useEffect(()=>{
    if(!items.length)return;
    const key=`${location.key}:${focus||''}`;
    if(positioned.current===key)return;
    if(focus){
      const i=items.findIndex(item=>item.id===focus);
      if(i<0){if(hasMore&&!busy)loadMore();return;}
      v.scrollToIndex(i,{align:'start'});
    }else {
      const anchor=readAnchor(account,location.key);const i=anchor?items.findIndex(item=>item.id===anchor.id):-1;
      if(anchor&&i<0&&hasMore){if(!busy)loadMore();return;}
      const restore=()=>{const offset=i>=0?v.getOffsetForIndex(i,'start')?.[0]:undefined;
        v.scrollToOffset(offset!==undefined?offset+(anchor?.relative||0):readScroll(account,location.key));};
      restoring.current=true;restore();restoration.current=[100,400,900].map(ms=>window.setTimeout(()=>{restore();if(ms===900)restoring.current=false;},ms));
    }
    positioned.current=key;
  },[items,focus,location.key,account,hasMore,busy,v,loadMore]);
  const stopRestoration=()=>{restoration.current.forEach(clearTimeout);restoring.current=false;};
  useEffect(()=>()=>restoration.current.forEach(clearTimeout),[location.key]);
  useEffect(()=>{if(!busy)guard.current=false;},[busy]);
  useEffect(()=>{
    if(!match?.startsWith('stream:'))return;const index=items.findIndex(i=>i.id===match.slice(7));
    if(index>=0)v.scrollToIndex(index,{align:'start'});
  },[match,items,v]);
  return <div ref={parent} data-reader className="max-h-[calc(100dvh-210px)] min-h-48 overflow-y-auto overscroll-contain"
    onWheel={stopRestoration} onTouchStart={stopRestoration} onPointerDown={stopRestoration}
    onScroll={e=>{
      const el=e.currentTarget;
      if(!restoring.current){rememberScroll(account,location.key,el.scrollTop);
        const row=v.getVirtualItems().find(r=>r.end>el.scrollTop);if(row)rememberAnchor(account,location.key,items[row.index].id,el.scrollTop-row.start);}
      if(hasMore&&!busy&&!guard.current&&el.scrollHeight-el.scrollTop-el.clientHeight<700){guard.current=true;loadMore();}
    }}>
    {focus&&!busy&&!hasMore&&!items.some(i=>i.id===focus)&&<p role="status" className="mb-3 rounded-xl bg-page-bg p-3 text-sm">指定題目不在目前條件中，或已無法存取。請清除篩選或返回上一頁。</p>}
    <div className="relative w-full" style={{height:v.getTotalSize()}}>
      {v.getVirtualItems().map(row=><div key={row.key} ref={v.measureElement} data-index={row.index}
        className="absolute left-0 top-0 w-full pb-5" style={{transform:`translateY(${row.start}px)`}}>
        {render(items[row.index],row.index)}</div>)}
    </div>
    {hasMore&&<button disabled={busy} onClick={loadMore}
      className="my-3 rounded-xl border border-border-subtle bg-surface px-4 py-2 text-sm">{busy?'載入中…':'載入更多題目'}</button>}
  </div>;
}
