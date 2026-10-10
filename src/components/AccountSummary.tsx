import { useEffect, useState } from 'react';
import { BookOpen, Users } from 'lucide-react';
import { sharingApi, type Collection } from '../services/sharingApi';
import { OfflineSyncManager } from '../services/OfflineSyncManager';
import type { DashboardData, User } from '../types';
import { isGuestUser } from '../utils/guest';

export function AccountSummary({ user }: { user: User | null }) {
  const guest = isGuestUser(user);
  const [summary, setSummary] = useState<{
    nickname: string | null; total: number | null; collections: number | null; failed: boolean;
  } | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    setSummary(null);
    const load = async () => {
      if (guest) {
        const items = await OfflineSyncManager.getOfflineProblems();
        return { nickname: null, total: items.length, collections: null, failed: false };
      }
      const read = <T,>(path: string) => sharingApi<T>(path, 'GET', undefined, abort.signal);
      const [profile, dashboard, sets] = await Promise.allSettled([
        read<{ profile: { display_name: string } | null }>('/me/public-profile'),
        read<DashboardData>('/dashboard'),
        read<{ collections: Collection[] }>('/my/collections'),
      ]);
      return {
        nickname: profile.status === 'fulfilled' ? profile.value.profile?.display_name || null : null,
        total: dashboard.status === 'fulfilled' ? dashboard.value.summary.total : null,
        collections: sets.status === 'fulfilled' ? sets.value.collections.filter(c => c.role === 'owner' || c.role === 'contributor').length : null,
        failed: [profile, dashboard, sets].some(result => result.status === 'rejected'),
      };
    };
    void load().then(data => { if (!abort.signal.aborted) setSummary(data); })
      .catch(() => { if (!abort.signal.aborted) setSummary({ nickname: null, total: null, collections: null, failed: true }); });
    return () => abort.abort();
  }, [user?.id, guest, revision]);

  const nickname = guest ? '本機訪客' : summary?.nickname || user?.name || '尚未設定暱稱';
  const count = (value: number | null | undefined) => !summary ? '載入中…' : value == null ? '暫無法取得' : value.toLocaleString();
  return <section aria-label="帳號摘要" className="space-y-4">
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 text-lg font-semibold text-primary">
        {!guest && user?.image ? <img src={user.image} alt="" className="h-full w-full object-cover" /> : nickname.charAt(0)}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-text-muted">{guest ? '訪客模式' : '暱稱'}</p>
        <p className="break-words text-base font-semibold">{nickname}</p>
        {!guest && <p className="break-all text-xs text-text-muted">{user?.email}</p>}
      </div>
    </div>
    <dl className={`grid gap-3 ${guest ? '' : 'grid-cols-2'}`} aria-live="polite" aria-busy={!summary}>
      <div className="min-w-0 rounded-2xl border border-border-subtle bg-page-bg p-4">
        <dt className="flex items-center gap-2 text-xs text-text-muted"><BookOpen size={16} />{guest ? '本機題數' : '題庫總題數'}</dt>
        <dd className="mt-2 text-lg font-semibold"><span>{count(summary?.total)}</span>
          <span className="mt-1 block text-xs font-normal text-text-muted">{guest ? '保存在目前瀏覽器' : '包含上傳與存入的題目'}</span>
        </dd>
      </div>
      {!guest && <div className="min-w-0 rounded-2xl border border-border-subtle bg-page-bg p-4">
        <dt className="flex items-center gap-2 text-xs text-text-muted"><Users size={16} />貢獻集</dt>
        <dd className="mt-2 text-lg font-semibold"><span>{summary?.collections === 100 ? '100+' : count(summary?.collections)}</span>
          <span className="mt-1 block text-xs font-normal text-text-muted">自己建立或擔任貢獻者</span>
        </dd>
      </div>}
    </dl>
    {summary?.failed && <p role="status" className="text-xs text-text-muted">部分資訊暫時無法取得。
      <button type="button" onClick={() => setRevision(v => v + 1)} className="ml-2 min-h-11 underline underline-offset-4">重新讀取</button>
    </p>}
  </section>;
}
