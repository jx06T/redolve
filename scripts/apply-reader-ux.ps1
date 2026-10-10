# Run from the repository root. Adds only missing columns; never reapplies 0001/0002.
param([ValidateSet('npx','local')][string]$WranglerMode='npx')
$ErrorActionPreference = 'Stop'
$readerCli = if($WranglerMode -eq 'local'){'node'}else{'npx'}
$readerCliArgs = if($WranglerMode -eq 'local'){@('./node_modules/wrangler/bin/wrangler.js')}else{@('wrangler')}
$readerCheckSql = (Get-Content -LiteralPath './scripts/reader-ux-schema.sql' -Encoding UTF8) -join ' '
function Get-ReaderColumns {
    $readerJson = & $readerCli @readerCliArgs d1 execute redolve-db --remote --command "$readerCheckSql" --json
    if ($LASTEXITCODE -ne 0) { throw '讀取 UI/UX schema 失敗，未進行後續操作' }
    $readerResults = $readerJson | ConvertFrom-Json
    $readerCounts = @{}
    foreach ($readerResult in $readerResults) {
        foreach ($readerMetric in $readerResult.results) { $readerCounts[$readerMetric.metric] = [int]$readerMetric.count }
    }
    if (-not $readerCounts.ContainsKey('starred_column') -or -not $readerCounts.ContainsKey('classification_column')) {
        throw '未取得兩項 schema 結果，未進行後續操作'
    }
    if (-not $readerCounts.ContainsKey('reader_tables') -or $readerCounts.reader_tables -ne 2) {
        throw '尚未具備共用 v2 必要資料表，停止新增欄位；請先確認既有 sharing schema。'
    }
    return $readerCounts
}
$readerBefore = Get-ReaderColumns
Write-Output "目前：starred_column=$($readerBefore.starred_column)，classification_column=$($readerBefore.classification_column)"
if ($readerBefore.starred_column -eq 1 -and $readerBefore.classification_column -eq 1) {
    Write-Output 'UI/UX migration 已套用，不需重跑。'
    return
}
# This is a current recovery reference, not an instruction to restore data.
& $readerCli @readerCliArgs d1 time-travel info redolve-db
if ($LASTEXITCODE -ne 0) { throw '無法取得目前 Time Travel bookmark，停止套用' }
foreach ($readerColumn in @('starred_column','classification_column')) {
    if ($readerBefore[$readerColumn] -notin @(0,1)) { throw '非預期的 schema，停止套用' }
    if ($readerBefore[$readerColumn] -eq 1) { continue }
    $readerDdl = if ($readerColumn -eq 'starred_column') {
        'ALTER TABLE collection_item_reads ADD COLUMN starred INTEGER NOT NULL DEFAULT 0 CHECK(starred IN (0,1));'
    } else {
        "ALTER TABLE saved_refs ADD COLUMN classification_state TEXT NOT NULL DEFAULT 'ready' CHECK(classification_state IN ('ready','pending','failed','manual'));"
    }
    & $readerCli @readerCliArgs d1 execute redolve-db --remote --command "$readerDdl"
    if ($LASTEXITCODE -ne 0) { throw "新增 $readerColumn 失敗；停止並保留輸出。腳本可重新查詢後補缺少的欄位。" }
}
$readerAfter = Get-ReaderColumns
if ($readerAfter.starred_column -ne 1 -or $readerAfter.classification_column -ne 1) { throw 'migration 後 schema 未通過' }
Write-Output 'UI/UX migration 確認完成：starred_column=1，classification_column=1。現在可以部署新版本。'
