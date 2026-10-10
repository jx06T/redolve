import { useEffect, useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { readAnchor, readScroll, rememberAnchor, rememberScroll, readerLocationKey } from '../services/navigationState';

export function QuestionStream<T extends {id:string;ids?:string[]}>({items,render,loadMore,hasMore,busy,focus,className,loadError=false,autoLoad=true}:{
  items:T[];render:(item:T,index:number)=>ReactNode;loadMore:()=>void;hasMore:boolean;busy:boolean;focus?:string;className?:string;loadError?:boolean;autoLoad?:boolean;
}) {
  const parent=useRef<HTMLDivElement>(null);const location=useLocation();
  const historyKey=readerLocationKey(location);
  const account=useStore(s=>s.currentUser?.id||'guest');
  const positioned=useRef('');const guard=useRef(false);
  const restoration=useRef<number[]>([]);const restoring=useRef(false);
  const match=useStore(s=>s.inPageMatches[s.inPageCurrentIndex]);
  const contains=(item:T,id:string)=>item.id===id||!!item.ids?.includes(id);
  const v=useVirtualizer({count:items.length,getScrollElement:()=>parent.current,
    estimateSize:()=>800,overscan:0,getItemKey:i=>items[i].id,
    initialOffset:()=>readScroll(account,historyKey)});
  useEffect(()=>{
    if(!items.length)return;
    const key=`${historyKey}:${focus||''}`;
    if(positioned.current===key)return;
    if(focus){
      const i=items.findIndex(item=>contains(item,focus));
      if(i<0){if(hasMore&&!busy&&!loadError)loadMore();return;}
      v.scrollToIndex(i,{align:'start'});
    }else {
      const anchor=readAnchor(account,historyKey);const i=anchor?items.findIndex(item=>contains(item,anchor.id)):-1;
      if(anchor&&i<0&&hasMore){if(!busy&&!loadError)loadMore();return;}
      const restore=()=>{const offset=i>=0?v.getOffsetForIndex(i,'start')?.[0]:undefined;
        v.scrollToOffset(offset!==undefined?offset+(anchor?.relative||0):readScroll(account,historyKey));};
      restoring.current=true;restore();restoration.current=[100,400,900].map(ms=>window.setTimeout(()=>{restore();if(ms===900)restoring.current=false;},ms));
    }
    positioned.current=key;
  },[items,focus,historyKey,account,hasMore,busy,v,loadMore,loadError]);
  const stopRestoration=()=>{restoration.current.forEach(clearTimeout);restoring.current=false;};
  useEffect(()=>()=>restoration.current.forEach(clearTimeout),[historyKey]);
  useEffect(()=>{if(!busy)guard.current=false;},[busy,items.length,historyKey]);
  const requestMore=()=>{if(!hasMore||busy||guard.current)return;guard.current=true;loadMore();};
  useEffect(()=>{
    if(!match?.startsWith('stream:'))return;const index=items.findIndex(i=>contains(i,match.slice(7)));
    if(index>=0)v.scrollToIndex(index,{align:'start'});
  },[match,items,v]);
  return <div ref={parent} data-reader aria-busy={busy} className={className||"max-h-[calc(100dvh-210px)] min-h-48 overflow-y-auto overscroll-contain"}
    onWheel={stopRestoration} onTouchStart={stopRestoration} onPointerDown={stopRestoration}
    onScroll={e=>{
      const el=e.currentTarget;
      if(!restoring.current){rememberScroll(account,historyKey,el.scrollTop);
        const row=v.getVirtualItems().find(r=>r.end>el.scrollTop);if(row)rememberAnchor(account,historyKey,items[row.index].id,el.scrollTop-row.start);}
      if(autoLoad&&!loadError&&el.scrollHeight-el.scrollTop-el.clientHeight<700)requestMore();
    }}>
    {focus&&!busy&&!hasMore&&!items.some(i=>contains(i,focus))&&<p role="status" className="mb-3 rounded-xl bg-page-bg p-3 text-sm">指定題目不在目前條件中，或已無法存取。請清除篩選或返回上一頁。</p>}
    <div className="relative w-full" style={{height:v.getTotalSize()}}>
      {v.getVirtualItems().map(row=><div key={row.key} ref={v.measureElement} data-index={row.index}
        className="absolute left-0 top-0 w-full pb-5" style={{transform:`translateY(${row.start}px)`}}>
        {render(items[row.index],row.index)}</div>)}
    </div>
    {hasMore&&<div className="flex justify-center py-6"><button type="button" disabled={busy} onClick={requestMore}
      className="rounded-xl border border-border-subtle bg-surface px-6 py-3 text-sm text-primary hover:bg-neutral-100 disabled:opacity-50">{busy?'載入中…':loadError?'重試載入更多':'載入更多題目'}</button></div>}
  </div>;
}
