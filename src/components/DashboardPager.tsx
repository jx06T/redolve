import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type Panel = 'overview' | 'subjects' | 'todos' | 'tools';
const memory = new Map<string, Panel>();
const wideQuery = '(min-width: 768px)';
const storageKey = (account: string, wide: boolean) => `rdv:dashboard:panel:v1:${encodeURIComponent(account)}:${wide ? 'wide' : 'compact'}`;
const hashPanel = (hash: string): Panel | null => {
  const id = hash.replace(/^#dashboard-/, '');
  return ['overview','subjects','todos','tools'].includes(id) ? id as Panel : null;
};
const project = (id: Panel, wide: boolean, showTodo: boolean): Panel => wide ?
  id === 'subjects' ? 'overview' : id === 'todos' ? 'tools' : id : id === 'todos' && !showTodo ? 'overview' : id;
function read(account: string, wide: boolean, showTodo: boolean): Panel {
  const key = storageKey(account, wide);
  let id = memory.get(key);
  try { id ||= localStorage.getItem(key) as Panel || undefined; } catch { /* Memory remains available. */ }
  return id && ['overview','subjects','todos','tools'].includes(id) ? project(id,wide,showTodo) : 'overview';
}

export function DashboardPager({ account, showTodo, metrics, topics, subjects, todos, tools }: {
  account: string; showTodo: boolean; metrics: ReactNode; topics: ReactNode; subjects: ReactNode; todos: ReactNode; tools: ReactNode;
}) {
  const navigate=useNavigate(),location=useLocation();
  const [wide,setWide]=useState(()=>matchMedia(wideQuery).matches);
  const initialHash=useRef(hashPanel(location.hash)),interacted=useRef(false);
  const [active,setActive]=useState<Panel>(()=>initialHash.current?project(initialHash.current,wide,showTodo):read(account,wide,showTodo));
  const viewport=useRef<HTMLDivElement>(null),context=useRef(''),identity=useRef(account);
  const current=useRef(active),timer=useRef<number>(),programmatic=useRef<Panel|null>(null),expectedHash=useRef<string|null>(null);
  const panels:Panel[]=wide?['overview','tools']:['overview','subjects',...(showTodo?['todos' as const]:[]),'tools'];
  const signature=panels.join('|');const live=useRef({panels,account,wide,showTodo});live.current={panels,account,wide,showTodo};
  const labels:Record<Panel,string>={overview:wide?'複習進度':'複習重點',subjects:'各科進度',todos:'待辦',tools:wide?'日常工具':'倒數／探索'};
  const isVisible=(id:Panel)=>wide?(active==='overview'?id==='overview'||id==='subjects':id==='todos'||id==='tools'):active===id;
  const inactive=(id:Panel)=>isVisible(id)?{}:{inert:'', 'aria-hidden':true as const};
  const select=(id:Panel)=>{
    const focused=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const segment=focused?.closest<HTMLElement>('[data-dashboard-segment]')?.dataset.dashboardSegment;
    const visible=live.current.wide?(id==='overview'?['overview','subjects']:['todos','tools']):[id];
    if(segment&&!visible.includes(segment))focused?.blur();
    current.current=id;setActive(id);
    const key=storageKey(live.current.account,live.current.wide);memory.set(key,id);
    try{localStorage.setItem(key,id);}catch{/* Optional preference; no cloud mutation. */}
    const hash=`#dashboard-${id}`;expectedHash.current=hash;
    if(window.location.hash!==hash)navigate({pathname:location.pathname,search:location.search,hash},{replace:true,preventScrollReset:true});
  };
  const go=(id:Panel,smooth=true)=>{
    const el=viewport.current;if(!el)return;
    clearTimeout(timer.current);const target=project(id,live.current.wide,live.current.showTodo);
    select(target);programmatic.current=smooth?target:null;
    el.scrollTo({left:live.current.panels.indexOf(target)*el.clientWidth,behavior:smooth&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'auto'});
  };
  const settle=()=>{
    const el=viewport.current;if(!el?.clientWidth)return;
    if(programmatic.current){
      const target=live.current.panels.indexOf(programmatic.current)*el.clientWidth;
      if(Math.abs(el.scrollLeft-target)>2)return;
      programmatic.current=null;
    }
    const index=Math.max(0,Math.min(live.current.panels.length-1,Math.round(el.scrollLeft/el.clientWidth)));
    const id=live.current.panels[index];if(id!==current.current){interacted.current=true;select(id);}
  };
  useEffect(()=>{const media=matchMedia(wideQuery);const changed=()=>setWide(media.matches);media.addEventListener('change',changed);return()=>media.removeEventListener('change',changed);},[]);
  useLayoutEffect(()=>{
    const key=`${account}:${wide}:${signature}`;if(context.current===key)return;
    const accountChanged=identity.current!==account;
    const id=!interacted.current&&initialHash.current&&(!context.current||accountChanged)?project(initialHash.current,wide,showTodo):
      context.current&&identity.current===account&&context.current.startsWith(`${account}:${wide}:`)?project(current.current,wide,showTodo):read(account,wide,showTodo);
    context.current=key;identity.current=account;go(id,false);
  },[account,wide,signature]);
  useEffect(()=>{
    if(expectedHash.current&&location.hash!==expectedHash.current)return;
    expectedHash.current=null;const id=hashPanel(location.hash);
    if(id&&project(id,wide,showTodo)!==current.current)go(id,false);
  },[location.hash,wide,showTodo]);
  useEffect(()=>{
    const el=viewport.current;if(!el)return;let width=el.clientWidth;
    const resize=new ResizeObserver(()=>{if(el.clientWidth&&el.clientWidth!==width){width=el.clientWidth;go(current.current,false);}});
    resize.observe(el);el.addEventListener('scrollend',settle);
    const hashChanged=()=>{const id=hashPanel(window.location.hash);if(id)go(id,false);};window.addEventListener('hashchange',hashChanged);
    return()=>{resize.disconnect();el.removeEventListener('scrollend',settle);window.removeEventListener('hashchange',hashChanged);clearTimeout(timer.current);};
  },[]);
  const keys=(event:React.KeyboardEvent)=>{
    if(event.altKey||event.ctrlKey||event.metaKey||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();interacted.current=true;
    const index=live.current.panels.indexOf(current.current);
    const next=event.key==='Home'?0:event.key==='End'?live.current.panels.length-1:Math.max(0,Math.min(live.current.panels.length-1,index+(event.key==='ArrowRight'?1:-1)));
    go(live.current.panels[next]);
  };
  return <div className="flex min-h-0 flex-1 flex-col gap-2" data-dashboard-pager data-layout={wide?'wide':'compact'}>
    <div ref={viewport} data-dashboard-carousel tabIndex={0} aria-label="總覽面板，左右滑動切換"
      className="dashboard-carousel min-h-0 flex-1 outline-none"
      onKeyDown={e=>{if(e.target===e.currentTarget)keys(e);}}
      onPointerDown={()=>{interacted.current=true;programmatic.current=null;}} onWheel={()=>{programmatic.current=null;}}
      onScroll={()=>{clearTimeout(timer.current);timer.current=window.setTimeout(settle,140);}}>
      <div className="dashboard-grid" style={{'--dashboard-mobile-pages':showTodo?4:3} as React.CSSProperties}>
        {[0,1,2,...(showTodo?[3]:[])].map(index=><span key={index} aria-hidden="true" className="dashboard-snap" style={{left:`${index*(100/(showTodo?4:3))}%`}} />)}
        {/* Snap positions on wide layouts always represent two complete dashboard screens. */}
        <span aria-hidden="true" className="dashboard-wide-snap" style={{left:0}} /><span aria-hidden="true" className="dashboard-wide-snap" />
        <div data-dashboard-segment="overview" {...inactive('overview')} className="col-start-1 row-span-2 flex min-h-0 flex-col gap-3 md:contents">
          <div className="shrink-0 md:col-span-2 md:col-start-1 md:row-start-1 md:pb-3">{metrics}</div>
          <div className="min-h-0 flex-1 md:col-start-2 md:row-start-2 md:pl-3">{topics}</div>
        </div>
        <div data-dashboard-segment="subjects" {...inactive('subjects')} className="col-start-2 row-span-2 min-h-0 md:col-start-1 md:row-span-1 md:row-start-2 md:pr-3">{subjects}</div>
        {showTodo&&<div data-dashboard-segment="todos" {...inactive('todos')} className="col-start-3 row-span-2 min-h-0 md:pr-3">{todos}</div>}
        <div data-dashboard-segment="tools" {...inactive('tools')} className={'row-span-2 min-h-0 md:pl-3 '+(showTodo?'col-start-4':'col-start-3 md:col-span-2')}>{tools}</div>
      </div>
    </div>
    <nav aria-label="總覽面板" className="flex shrink-0 items-center justify-center gap-1" onKeyDown={keys}>
      {panels.map(id=><button key={id} type="button" aria-current={active===id?'page':undefined}
        onClick={()=>{interacted.current=true;go(id);}} className={'rounded-xl px-2 py-1.5 text-xs transition-colors '+(active===id?'bg-primary/10 font-medium text-primary':'text-text-muted hover:bg-neutral-100')}>{labels[id]}</button>)}
    </nav>
  </div>;
}
