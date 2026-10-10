import { LogIn } from 'lucide-react';
import { useStore } from '../store/useStore';

export function LoginNotice({description}:{description:string}) {
  const login=useStore(s=>s.setAuthModalOpen);
  return <section aria-label="登入提示" className="rounded-3xl border border-border-subtle bg-surface p-5 space-y-3">
    <h2 className="text-sm font-semibold">登入以使用此功能</h2>
    <p className="text-sm text-text-muted">{description}</p>
    <button onClick={()=>login(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary"><LogIn size={16}/>登入</button>
  </section>;
}
