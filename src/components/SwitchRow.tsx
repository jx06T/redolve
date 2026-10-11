import { useId } from 'react';
export function SwitchRow({label,description,checked,disabled,onChange}:{
  label:string;description?:string;checked:boolean;disabled?:boolean;onChange:(value:boolean)=>void;
}) {
  const id=useId();
  return <div className="flex items-center justify-between gap-5 rounded-xl border border-border-subtle p-4 py-0">
    <div><p id={id} className="text-sm font-medium">{label}</p>
      {description&&<p className="mt-1 text-xs text-text-muted">{description}</p>}</div>
    <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} disabled={disabled}
      onClick={()=>onChange(!checked)} className="flex h-11 w-14 shrink-0 items-center justify-center rounded-xl disabled:opacity-40">
      <span className={`block w-11 rounded-full p-0.5 transition-colors ${checked?'bg-primary':'bg-[#D1D5DB] dark:bg-[#4B5563]'}`}>
        <span className={`block h-5 w-5 rounded-full bg-surface shadow-xs transition-transform ${checked?'translate-x-5':''}`}/>
      </span>
    </button>
  </div>;
}
