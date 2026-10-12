import { Link } from 'react-router-dom';
import { BookOpen, Compass, Search, Settings, Users, Upload, PenTool, Keyboard } from 'lucide-react';
import { SHOW_SHORTCUTS_EVENT } from '../config/constants';
import { useSEO } from '../hooks/useSEO';

const pages = [
  { title: '總覽', icon: BookOpen, text: '左右滑動查看複習進度、待辦、倒數與公開探索，會記住上次查看的面板。也可點擊下方的面板名稱切換。待辦點擊文字即可編輯；倒數只供檢視，透過小組件三點菜單前往設定管理。共用與訂閱有更新時會顯示動態入口。', to: '/' },
  { title: '刷題', icon: PenTool, text: '在「我上傳／我存入／我共用中」切換來源。展開側欄，以科目樹、單元和狀態篩選，連續向下閱讀與書寫。', to: '/study' },
  { title: '搜尋', icon: Search, text: '找回個人題庫與可貢獻共用集中的題目。簡單檢視看題圖、來源及分類；完整檢視查閱筆跡與筆記。要訂正時，按「前往刷題」。', to: '/search' },
  { title: '探索', icon: Compass, text: '瀏覽與搜尋可公開探索的題目。明確訂閱題目集後，可在「延伸題目」持續觀看；存入題庫與訂閱是兩個不同操作。', to: '/explore' },
  { title: '延伸題目', icon: Users, text: '先選擇已訂閱的題目集，再閱讀完整題圖。可以存入、標星、分享或檢舉；標星不會自動存入個人題庫。', to: '/extended' },
  { title: '設定', icon: Settings, text: '調整筆觸、管理科目分類及個人檔案。公開暱稱、API 金鑰與預設上傳目的地在個人檔案；共用集管理與訂閱中心各有自己的分頁。', to: '/settings#profile' },
];
const steps = [
  { title: '加入題目', text: '點擊導覽列的上傳按鈕，可一次多選圖片，也可繼續加選。檢查縮圖與來源後開始上傳，等待 AI 辨識與分類；分類有誤時可手動調整。' },
  { title: '手寫訂正', text: '前往刷題，使用鋼筆、螢光筆或橡皮擦。Apple Pencil 可直接書寫，手指用來滑動；若要手指書寫，先在筆刷工具列開啟。題目下方也可輸入文字筆記。' },
  { title: '整理進度', text: '完成訂正後按題卡按鈕，或用懸浮按鈕完成當題並前往下一題。封存將題目移出待刷範圍；共用題的訂正與封存只影響自己的進度。' },
];

export function AboutView() {
  useSEO({ title: '關於與使用說明', description: '了解 Redolve 的錯題整理、AI 分類、手寫訂正、共用集與訂閱功能，以及基本操作方式。' });
  return <div className="mx-auto max-w-4xl space-y-5 px-1 py-2 sm:py-4">
    <header className="rounded-3xl border border-border-subtle bg-surface p-5 sm:p-7">
      <p className="text-sm text-text-muted">關於 Redolve</p>
      <h1 className="mt-2 text-2xl font-semibold">把錯題整理成自己的複習流程</h1>
      <p className="mt-3 text-sm leading-7 text-text-muted">Redolve 是適合 iPad、手機與電腦的 AI 錯題本。從截圖或照片開始，整理科目與單元，在題圖上手寫訂正，也能透過共用集和訂閱延伸練習。</p>
    </header>
    <section className="rounded-3xl border border-border-subtle bg-surface p-5 sm:p-7" aria-labelledby="about-start">
      <h2 id="about-start" className="flex items-center gap-2 text-lg font-semibold"><Upload size={20} />從第一題開始</h2>
      <ol className="mt-5 space-y-5">{steps.map((step, i) => <li key={step.title} className="flex gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm text-primary">{i + 1}</span>
        <div><h3 className="text-sm font-semibold">{step.title}</h3><p className="mt-1 text-sm leading-7 text-text-muted">{step.text}</p></div>
      </li>)}</ol>
    </section>
    <section aria-labelledby="about-pages">
      <h2 id="about-pages" className="mb-3 px-2 text-lg font-semibold">各頁面怎麼用</h2>
      <div className="grid gap-3 sm:grid-cols-2">{pages.map(page => <article key={page.title} className="rounded-3xl border border-border-subtle bg-surface p-5">
        <h3 className="flex items-center gap-2 font-semibold"><page.icon size={18} className="text-text-muted" />{page.title}</h3>
        <p className="mt-3 text-sm leading-7 text-text-muted">{page.text}</p>
        <Link to={page.to} className="mt-2 inline-flex min-h-11 items-center text-sm text-text-muted underline underline-offset-4">前往{page.title}</Link>
      </article>)}</div>
    </section>
    <section className="rounded-3xl border border-border-subtle bg-surface p-5 sm:p-7" aria-labelledby="about-sharing">
      <h2 id="about-sharing" className="text-lg font-semibold">上傳、存入、共用與訂閱的差別</h2>
      <dl className="mt-4 space-y-4 text-sm">
        <div><dt className="font-semibold">我上傳</dt><dd className="mt-1 leading-7 text-text-muted">自己的原題與私人訂正。可把原題加入自己建立、或有貢獻權限的共用集，原題仍留在自己的題庫。</dd></div>
        <div><dt className="font-semibold">我存入</dt><dd className="mt-1 leading-7 text-text-muted">把獲准存入的他人題目保留在自己的題庫，另外做自己的訂正。存入時保留當下內容；之後可維持這份內容，或主動更新來源，不會因訂閱而自動更新。</dd></div>
        <div><dt className="font-semibold">我共用中</dt><dd className="mt-1 leading-7 text-text-muted">在可貢獻的集合一起書寫與做筆記，檢視其他貢獻者的共用內容。自己貢獻的原題與「我上傳」共用同一份筆跡與筆記；在他人原題上的共用作業則另外儲存。</dd></div>
        <div><dt className="font-semibold">訂閱</dt><dd className="mt-1 leading-7 text-text-muted">追蹤題目集並觀看目前獲准存取的內容，不會把整個集合複製進自己的題庫。想自己訂正時先存入。獲准建立的獨立單題分享，任何持連結的人都可觀看該版本，但不會因此取得整個集合的權限。</dd></div>
      </dl>
    </section>
    <section className="rounded-3xl border border-border-subtle bg-surface p-5 sm:p-7" aria-labelledby="about-tips">
      <h2 id="about-tips" className="text-lg font-semibold">常用操作</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-text-muted">
        <li>Ctrl／Cmd + Z 復原、Ctrl／Cmd + Shift + Z 重做。輸入筆記時作用於文字，其餘繪圖操作作用於目前使用的畫布。</li>
        <li>Ctrl／Cmd + Enter 完成當題訂正並下一題；已訂正時直接下一題。</li>
        <li>手機刷題時，再點底部刷題按鈕可展開或收起側欄；科目樹也可暫時收起。</li>
        <li>可先用訪客模式試用，本機內容保存在目前瀏覽器。登入後可使用雲端題庫及共用、訂閱功能。</li>
      </ul>
      <button type="button" onClick={() => window.dispatchEvent(new Event(SHOW_SHORTCUTS_EVENT))} className="mt-4 flex min-h-11 items-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-sm text-primary"><Keyboard size={16} />查看完整快捷鍵與手勢</button>
    </section>
    <section className="px-2 py-4" aria-labelledby="about-policies">
      <h2 id="about-policies" className="text-lg font-semibold">隱私與服務條款</h2>
      <p className="mt-3 text-sm leading-7 text-text-muted">了解資料如何儲存與使用，以及上傳、共用、存入和分享內容時的權利與責任。</p>
      <div className="mt-2 flex flex-wrap gap-x-6">
        <Link to="/about/privacy" className="inline-flex min-h-11 items-center text-sm text-text-muted underline underline-offset-4">隱私權政策</Link>
        <Link to="/about/terms" className="inline-flex min-h-11 items-center text-sm text-text-muted underline underline-offset-4">服務條款與免責聲明</Link>
      </div>
    </section>
  </div>;
}
