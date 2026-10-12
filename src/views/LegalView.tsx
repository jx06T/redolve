import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSEO } from '../hooks/useSEO';

const operatorName = 'Redolve 維護者 jx06T';
const contactEmail = '50313tjx06@gmail.com';
const updatedAt = '2026 年 10 月 12 日';

function Contact() {
  return <a href={`mailto:${contactEmail}`} className="break-all text-text-muted underline underline-offset-4">{contactEmail}</a>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-3">
    <h2 className="text-lg font-semibold text-text-main">{title}</h2>
    {children}
  </section>;
}

function PrivacyPolicy() {
  return <>
    <Section title="一、適用範圍與聯絡方式">
      <p>本政策說明 {operatorName} 提供的 Redolve 網站及 PWA 如何處理資料，包含訪客模式、Google 登入、題庫、AI 分類、共用集、訂閱與單題分享。</p>
      <p>隱私、資料權利或帳號刪除問題，請聯絡 <Contact />。請勿在公開留言或檢舉內容中提交密碼、API 金鑰或不必要的個人資料。</p>
    </Section>
    <Section title="二、我們處理的資料">
      <p>登入時，我們從 Google 取得帳號識別碼、經驗證的電子郵件與名稱，用於建立帳號及驗證登入。我們不取得你的 Google 密碼，也不要求存取 Gmail、通訊錄或 Google Drive。</p>
      <p>使用題庫時，會處理題圖、來源、OCR 文字、分類與標籤、筆跡、文字筆記、訂正與封存狀態，以及你建立的自訂分類與偏好設定。</p>
      <p>使用首頁小組件時，會處理待辦文字、完成時間、倒數名稱與日期及顯示偏好。登入帳號的資料僅供本人使用，不會加入公開題目集，也不會傳送至 AI 辨識服務；訪客資料僅保存在目前瀏覽器。</p>
      <p>使用共用與訂閱時，會處理公開暱稱、集合內容與權限、受邀者的電子郵件、貢獻關係、訂閱、閱讀紀錄、星號、存入版本、分享連結與檢舉資料。建立 API 金鑰時，伺服器保存雜湊與識別前綴，不保存可直接使用的完整金鑰。</p>
      <p>為提供服務及排查問題，網站與基礎設施也會處理 IP 位址、瀏覽器資訊、請求路徑、時間、回應狀態與錯誤資訊；請求路徑可能包含搜尋字詞或分享識別碼。</p>
    </Section>
    <Section title="三、使用目的與你的選擇">
      <p>資料用於登入驗證、儲存與同步題庫、辨識與分類圖片、搜尋、執行共用權限、提供訂閱與分享、處理檢舉，以及維護安全與服務運作。</p>
      <p>你可以不登入而使用訪客題庫；不提供 Google 帳號資料就無法使用帳號雲端題庫、共用書寫與訂閱管理。不上傳圖片就無法進行圖片辨識；不公開或分享內容，就不會因這些操作提供給其他使用者。</p>
    </Section>
    <Section title="四、本機儲存與 Cookie">
      <p>訪客題圖、筆跡與筆記主要保存在目前瀏覽器的 IndexedDB。網站也使用 localStorage 保存偏好、篩選條件及待同步草稿，並以 Service Worker 快取應用程式的靜態檔案。</p>
      <p>登入使用必要的 Cookie；登入 Cookie 有效期目前為 7 天，Google 登入流程的驗證 Cookie 為 10 分鐘。網站不以這些 Cookie 進行廣告追蹤。</p>
      <p><strong>登出不等於清除本機資料。</strong> 帳號草稿會按帳號區分並可能留在該瀏覽器。使用共用裝置時，請先確認內容已同步或匯出，再依瀏覽器提供的方式清除本站資料。清除資料、無痕模式、儲存空間不足或更換瀏覽器，可能使本機題目或尚未同步的草稿消失。</p>
    </Section>
    <Section title="五、AI 圖片辨識">
      <p><strong>訪客模式不代表圖片不會傳送給 AI。</strong> 執行辨識、重新分析或需要 AI 重新分類的存入操作時，題圖及分類提示（包括分類名稱與識別碼）會經由伺服器傳送至第三方 AI 服務提供者；辨識結果可包含 OCR 文字、科目單元與關鍵字。離線或失敗的辨識可能在恢復連線後重試。</p>
      <p>目前採用的 AI 服務專案已啟用計費，依該方案的服務條款，輸入與輸出不會用於改善服務商的產品或模型；服務商仍可能為防止濫用、維護安全與法律要求暫時記錄或保留資料。這不代表零保留，也不代表資料只在臺灣處理。若未來變更供應商或資料使用方式，將更新本政策並依法另行告知或取得必要同意。</p>
      <p>請先遮蔽題圖中的姓名、學號、聯絡方式與其他不必要的個資，不要上傳敏感、機密或未獲授權交由 AI 處理的資料。</p>
    </Section>
    <Section title="六、服務供應商與處理地區">
      <p>本服務使用第三方基礎設施提供網站、API、資料庫及圖片儲存，也使用外部登入、AI 辨識與字型服務。目前使用的供應商列於本頁末尾，依各自的服務條款與隱私政策處理相關資料。載入外部字型時，瀏覽器會向字型服務商傳送連線所需的網路資訊。</p>
      <p>資料可能在臺灣及服務供應商或其受託服務商設施所在的其他國家或地區儲存、傳輸與處理。伺服器的執行位置不代表所有資料只儲存在該地區。</p>
    </Section>
    <Section title="七、公開、共用與再分享">
      <p>公開集合中的題目、來源、分類與公開暱稱可由其他人觀看；列入探索的內容也可被搜尋。私人或連結集合依其觀看與貢獻權限提供內容。共用筆跡、筆記的可見範圍依集合設定決定；自己貢獻的原題與個人題庫共用同一份筆跡及筆記。</p>
      <p><strong>新公開及私人集合都預設允許存入後再分享。</strong> 作者可以關閉此設定，但已獲准存入的版本與既有再分享授權不會因此自動回收。獨立單題分享連結的持有人可不登入觀看該版本，包括你選擇附上的本人筆跡或筆記；此連結不授予整個集合的權限。</p>
      <p>下架、移出集合或撤銷權限會影響之後的來源存取，不會自動刪除他人已獲准存入的版本。分享連結可由建立者撤銷，但無法收回他人已另行下載、截圖或轉傳的內容。涉及個資或侵權的移除請求，會另依適用法律處理。</p>
    </Section>
    <Section title="八、保存與刪除">
      <p>帳號及題庫資料在提供相應功能所需期間保存。刪除題目或集合、撤銷分享連結，是移除相應內容或存取關係；仍被已存入版本、有效分享或其他合法用途引用的圖片與筆跡，可能繼續保存。雲端備份、診斷紀錄與未清理的檔案也不會保證在操作當下立即消除。</p>
      <p>已完成待辦以臺灣日期計算，含當日保留七天，之後開啟小組件時清除文字內容；未完成待辦及事件倒數不會依此期限自動移除。雲端刪除會留下不含待辦文字的項目識別紀錄，以防離線重送還原已刪除的內容；舊裝置本機副本與備份不保證同時清除。</p>
      <p>目前沒有自助刪除整個帳號的功能。若要刪除帳號、題圖中的個資或其他資料，請透過本頁聯絡方式提出；我們會確認身分、檢查保留原因並依法處理。單純保留檔案以節省重複儲存，不會取代依法應處理的刪除要求。</p>
    </Section>
    <Section title="九、你的資料權利">
      <p>你可以依法請求查詢、閱覽或取得個人資料複本、補充或更正、停止蒐集處理利用，以及刪除資料。請透過 <Contact /> 說明請求，並提供辨識帳號或相關題目所需的最少資訊；我們可能請你以帳號電子郵件確認身分。</p>
      <p>公開暱稱、分類與相關內容可先透過設定及題目操作調整。部分請求可能影響登入、同步或分享功能；若依法必須保留資料或涉及他人權利，我們會說明處理範圍與原因，不要求你預先放棄法定權利。</p>
    </Section>
    <Section title="十、安全與政策更新">
      <p>我們使用 HTTPS、登入驗證與存取權限保護資料；本服務不是端對端加密的保管庫。維護者可能在處理故障、檢舉、安全事件或法律要求所需範圍內接觸資料。任何系統都無法保證完全沒有遺失或外洩風險；發生應通知的個資事件時，將依法處理與通知。</p>
      <p>政策修訂會更新本頁日期；涉及新的資料使用目的或依法須另行告知、取得同意的事項，將另行處理，不因本頁更新就視為你同意任意擴大用途。</p>
    </Section>
  </>;
}

function TermsOfService() {
  return <>
    <Section title="一、服務範圍與使用條件">
      <p>Redolve 由 {operatorName} 提供，是用於整理題圖、AI 分類、手寫訂正、複習，以及共用與訂閱題目集的學習工具。使用上傳、書寫、共用或分享功能前，請閱讀本條款及隱私權政策；不同意時，請停止使用相應功能。</p>
      <p>使用相關功能時，應遵守適用法律及該功能使用的第三方服務條款。本站文件不取代 Google、Cloudflare 等供應商的使用條件。</p>
    </Section>
    <Section title="二、帳號、金鑰與本機內容">
      <p>登入者應保護 Google 帳號、裝置與 API 金鑰，不冒用他人身分或交付自己的登入憑證。API 金鑰可代表帳號執行獲准操作，懷疑外洩時請立即撤銷。</p>
      <p>訪客內容與未同步草稿可能只存在目前瀏覽器。請留意同步狀態並備份重要資料；登出、封存與刪除是不同操作。雲端同步、裝置草稿與服務商備份都不構成永久保存的保證。</p>
    </Section>
    <Section title="三、上傳內容與必要授權">
      <p>你保有對自己內容原有的權利；上傳不會使 Redolve 取得內容所有權。你應確保有權上傳、交由 AI 分析，並依所選設定讓他人觀看、存入或再分享。購買講義、拍攝題目或取得檔案，不必然表示取得公開傳播或再授權的權利。</p>
      <p>為提供你要求的功能，你授權服務提供者及必要的基礎設施、AI 供應商，在該功能所需範圍內儲存、複製、傳輸、處理及展示內容。對 AI 供應商的資料處理方式，請見隱私權政策與其相關條款。</p>
      <p>公開或提供共用內容時，你也依設定授權獲准對象觀看與存入；開啟再分享時，包含以獨立單題連結展示獲准版本。這些授權不使接收者取得原著作的所有權，也不允許超出授權或法律範圍的利用。</p>
    </Section>
    <Section title="四、共用、訂閱與存入的差別">
      <p>貢獻者可依權限加入自己的原題並留下共用筆跡及筆記；訂閱者依觀看權限瀏覽集合，不因訂閱自動取得編輯權。自己的原題加入共用集後，仍與「我上傳」使用同一份筆跡及筆記，可見範圍依集合設定決定。</p>
      <p><strong>存入是保留獲准取得的當下版本。</strong> 訂閱本身不會存入題庫；已存入題目也不會自動跟隨來源更新。來源作者一般下架、刪除來源或撤權，不會自動刪除這份已存入版本。你可在功能允許時明確更新來源內容，自己的訂正另外保存。</p>
      <p>授權不涵蓋違法、侵權或未經同意公開的個資；相關內容仍可能因合法申訴、安全措施或法律要求被限制或移除。</p>
    </Section>
    <Section title="五、單題分享與撤銷">
      <p>新公開與私人集合預設允許存入後再分享，建立者可調整設定。關閉再分享或撤銷來源觀看權，不回收先前已獲准版本的再分享授權；後續取得或更新的版本依當時設定判定。</p>
      <p><strong>獨立單題連結可讓任何持有連結的人觀看。</strong> 分享固定版本可包含題圖、來源與分類，以及你選擇附上的本人筆跡或筆記，不包含其他貢獻者的筆跡層。私人集合也可能產生這種連結；接收者不會因此取得整個集合的存取權。</p>
      <p>連結可能被轉傳。建立者可以撤銷連結或設定期限，但不能收回已另行下載或截圖的內容。舊式單題連結的內容可能隨原題變更或在刪除原題後失效，與新的固定版本分享不同。</p>
    </Section>
    <Section title="六、禁止的使用方式">
      <p>不得上傳或分享侵權、違法、騷擾、冒名或未獲授權的個資與機密內容；不得竊取憑證、繞過存取限制、惡意大量請求，或干擾他人的資料與服務運作。自動化操作應使用支援的介面並遵守權限與流量限制。</p>
      <p>觀看、訂閱或存入他人內容，不代表可以任意轉售、重新發布、移除權利標示或另作模型訓練。請遵守作者授權、供應商限制與適用法律。</p>
    </Section>
    <Section title="七、檢舉與內容處理">
      <p>對公開內容的著作權、隱私或不當內容問題，可使用題目檢舉功能，或聯絡 <Contact />。請提供題目或集合連結、問題說明，以及證明權利或處理請求必要的資料，不要提供完整金鑰。</p>
      <p>為處理有合理依據的侵權申訴、違規、安全風險或法律要求，服務提供者可能限制內容、分享、集合權限或帳號功能，並視情況要求補充資料。若認為處理有誤，可透過同一聯絡方式提出說明。</p>
    </Section>
    <Section title="八、AI 與學習內容免責聲明">
      <p>AI 辨識、OCR、科目分類、關鍵字與使用者分享的解題內容可能有錯誤、遺漏或過時資訊，不代表教師、學校或考試單位的認定。請自行檢查題目分類、筆記與解答；本服務不保證成績、學習成果或任何特定結果。</p>
    </Section>
    <Section title="九、可用性、資料與責任範圍">
      <p>我們將盡力維持服務正常運作，並採取合理措施維護資料的安全與可用性。但服務可能因維護、網路、瀏覽器限制、供應商配額、同步衝突、故障或服務調整而暫停、延遲或變更，不保證持續無中斷或完全無錯誤。</p>
      <p><strong>本服務不保證使用者上傳或儲存的圖片、筆跡、筆記及其他資料永久存在或隨時可供存取。</strong> 本機草稿、雲端同步與備份都可能受到裝置、系統或第三方服務限制，不能視為永久保存的承諾。本服務提供學習與題庫整理功能，不應作為重要資料的唯一保存位置；請自行下載、匯出或另行備份重要內容，並留意同步狀態。本機草稿提示也不等於已完成雲端同步。</p>
      <p>在適用法律允許的範圍內，服務提供者不對非可歸責於其行為所造成的第三方服務中斷、使用者誤刪或未自行備份的損失負責。<strong>本條款不排除或限制依法不得免除的責任與使用者權利</strong>，包括法律對故意、重大過失或個人資料保護責任的規定。</p>
    </Section>
    <Section title="十、終止使用與條款更新">
      <p>你可以停止使用、撤銷自己建立的分享、刪除可管理的內容或提出帳號刪除要求。終止使用不會自動清除其他人已合法取得的版本、第三方另行保存的副本或依法需保存的紀錄；個資刪除仍依隱私權政策與適用法律處理。</p>
      <p>條款修訂會更新本頁日期。重大功能、授權或資料用途變更會依適用法律另行告知或取得必要同意，不追溯擴大你先前提供內容的授權。個別條款無效時，不影響其他有效條款；爭議及責任依適用法律處理，不以本頁排除法定救濟途徑。</p>
    </Section>
  </>;
}

export function LegalView({ document }: { document: 'privacy' | 'terms' }) {
  const privacy = document === 'privacy';
  const title = privacy ? '隱私權政策' : '服務條款與免責聲明';
  useSEO({ title, description: privacy ? 'Redolve 的資料收集、本機與雲端儲存、AI 辨識、共用分享及資料權利說明。' : 'Redolve 的使用條件、內容授權、共用訂閱、單題分享及責任範圍。' });
  return <article className="mx-auto w-full max-w-3xl px-3 py-4 text-sm leading-7 text-text-main sm:px-6 sm:py-6">
    <Link to="/about" className="inline-flex min-h-11 items-center text-text-muted underline underline-offset-4">返回關於</Link>
    <header className="mb-8 mt-3 space-y-2 border-b border-border-subtle pb-5">
      <h1 className="text-2xl font-semibold leading-normal text-text-main">{title}</h1>
      <p className="text-text-muted">生效及最後更新日期：{updatedAt}</p>
    </header>
    <div className="space-y-8">{privacy ? <PrivacyPolicy /> : <TermsOfService />}</div>
    {privacy && <section className="mt-8 space-y-3" aria-labelledby="legal-providers">
      <h2 id="legal-providers" className="text-lg font-semibold text-text-main">目前使用的服務供應商</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>網站、API 與雲端儲存：Cloudflare。<a href="https://www.cloudflare.com/privacypolicy/" className="text-text-muted underline underline-offset-4">隱私權政策</a></li>
        <li>登入與字型：Google 登入、Google Fonts。<a href="https://policies.google.com/privacy?hl=zh-TW" className="text-text-muted underline underline-offset-4">隱私權政策</a></li>
        <li>AI 圖片辨識：Google Gemini API（已啟用計費專案）。<a href="https://ai.google.dev/gemini-api/terms" className="text-text-muted underline underline-offset-4">服務條款與資料使用說明</a></li>
      </ul>
    </section>}
    <footer className="mt-8 flex flex-wrap gap-x-6 border-t border-border-subtle pt-4">
      <Link to="/about" className="inline-flex min-h-11 items-center text-text-muted underline underline-offset-4">關於與使用說明</Link>
      <Link to={privacy ? '/about/terms' : '/about/privacy'} className="inline-flex min-h-11 items-center text-text-muted underline underline-offset-4">{privacy ? '服務條款與免責聲明' : '隱私權政策'}</Link>
    </footer>
  </article>;
}
