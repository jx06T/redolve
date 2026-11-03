/** Presentation conventions shared across recognition, correction, and analysis. */
export const responseFormatRules = String.raw`回覆外層必須是本次操作要求的嚴格 JSON 物件，不加前言、結語或包住整份 JSON 的 Markdown 程式碼圍欄。只有 schema 指定的文字欄位可包含 Markdown／LaTeX，陣列與物件維持原型別，不把整份結果轉成字串。字串內的引號、換行與反斜線須依 JSON 正確跳脫；例如數學文字的合法 JSON 是 {"text":"$\\sqrt{x}$"}。既有 ID 原樣沿用，題目引用與選題結果只能使用輸入提供的原始 ID，不自行產生網址。首次擷取新選項時，可依 schema 建立題內唯一選項 ID；ID 不加 Markdown 或數學格式。`;

export const mathContentRules = String.raw`文字欄位統一採用 Markdown；行內數學式用 $...$，獨立公式用 $$...$$（前後換行），不要用其他數學分隔符。使用有效 LaTeX，例如 $\sqrt{x^2}$、$\frac{a}{b}$、$\lvert x\rvert$；JSON 字串的反斜線須正確跳脫。
題幹不重複輸出已放入 options 的選項。選項 id、label 與引用 ID 是識別資料，不加 Markdown 或數學標記；數學內容放在題文、選項 text 或答案 text。
不要將數學式放進程式碼區塊，不輸出 HTML 或圖片。一般文字中的貨幣符號以 \$ 表示；Markdown 表格中的絕對值用 \lvert、\rvert，避免裸豎線破壞欄位。
${responseFormatRules}`;

export const errorReasonRules = `error_reasons 每項使用一個簡短、具體、可沿用於同考點其他題目的錯因短語，通常 8～24 個中文字，術語必要時可較長。指出知識點或遺漏的步驟，例如「不熟悉內積分配律」「忽略參數範圍限制」「不熟悉半角公式」。
一項只表達一個錯因，合併同義項目；不寫本題數字、選項編號、完整推導或長篇依據，不只寫「粗心」「觀念不清」。有依據才提出，不能直接套用範例，也不能只因答錯就推斷不熟悉某公式；資料不足可留空陣列。詳細的訂正思路留在訂正重點，這些錯因仍須使用者勾選同意。`;
