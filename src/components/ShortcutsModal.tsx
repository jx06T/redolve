import type { FC } from 'react';
import { PenTool, Highlighter, Eraser, Palette, CheckCircle2, Moon, HelpCircle, Undo2, Redo2, X } from 'lucide-react';
import { AppDialog } from './AppDialog';
import { useStore } from '../store/useStore';

export const ShortcutsModal: FC<{isOpen:boolean;onClose:()=>void}> = ({isOpen,onClose}) => {
  const colorCount=useStore(state=>Math.min(5,state.paletteColors.length));
  if(!isOpen)return null;
  const apple=/Mac|iPad|iPhone/i.test(navigator.platform);
  const modifier=apple?'Cmd':'Ctrl';
  const groups=[
    {title:'手寫與繪圖',items:[
      {key:'P',desc:'鋼筆',icon:PenTool},
      {key:'H',desc:'螢光筆',icon:Highlighter},
      {key:'E',desc:'橡皮擦',icon:Eraser},
      {key:colorCount>1?`1 – ${colorCount}`:'1',desc:'依工具列順序選取預設顏色',icon:Palette},
      {key:'[ / ]',desc:'減小／增大筆寬（1、2、4 pt）',icon:PenTool},
      {key:`${modifier} + Z`,desc:'復原筆跡或橡皮擦操作',icon:Undo2},
      {key:`${modifier} + Shift + Z`,desc:'重做筆跡或橡皮擦操作',icon:Redo2},
      ...(!apple?[{key:'Ctrl + Y',desc:'重做（另一組按鍵）',icon:Redo2}]:[]),
    ]},
    {title:'訂正與觸控手勢',items:[
      {key:`${modifier} + Enter`,desc:'完成當題訂正並前往下一題；已訂正時直接下一題',icon:CheckCircle2},
      {key:'雙指輕觸畫布',desc:'復原畫布操作',icon:Undo2},
      {key:'三指輕觸畫布',desc:'重做畫布操作',icon:Redo2},
    ]},
    {title:'系統操作',items:[
      {key:`${modifier} + D`,desc:'切換深淺色模式',icon:Moon},
      {key:'?（Shift + /）',desc:'開啟／關閉快捷鍵指南',icon:HelpCircle},
      {key:'Esc',desc:'關閉支援 Esc 的對話框或檢視器',icon:X},
    ]},
  ];
  return <AppDialog title="快捷鍵與手勢" onClose={onClose}>
    <p className="mb-4 text-xs leading-relaxed text-text-muted">Mac／iPad 使用 Cmd；Windows／Linux 使用 Ctrl。繪圖快捷鍵作用於最近操作的可見畫布，未操作畫布時使用目前題目。輸入筆記時，復原／重做由文字欄位處理。</p>
    <div className="space-y-5">
      {groups.map(group=><section key={group.title} className="space-y-2">
        <h3 className="text-sm font-semibold">{group.title}</h3>
        <dl className="space-y-2">{group.items.map(item=><div key={item.key} className="grid min-w-0 gap-2 rounded-2xl border border-border-subtle bg-page-bg p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <dt className="flex min-w-0 items-start gap-2 text-xs leading-relaxed"><item.icon aria-hidden="true" size={16} className="shrink-0 text-text-muted"/>{item.desc}</dt>
          <dd className="min-w-0 justify-self-end"><kbd className="inline-block max-w-full break-words rounded-xl border border-border-subtle bg-surface px-2.5 py-1 font-mono text-xs">{item.key}</kbd></dd>
        </div>)}</dl>
      </section>)}
    </div>
    <div className="mt-5 flex justify-end"><button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-primary/10 px-4 py-2 text-sm text-primary">關閉指南</button></div>
  </AppDialog>;
};
