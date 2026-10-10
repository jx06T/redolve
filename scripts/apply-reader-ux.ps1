# Run from the repository root. Adds only missing columns; never reapplies 0001/0002.
param(
    [ValidateSet('auto','npx','local')][string]$WranglerMode='auto',
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$readerLocalCli = './node_modules/wrangler/bin/wrangler.js'
if ($WranglerMode -eq 'auto') {
    $WranglerMode = if (Test-Path -LiteralPath $readerLocalCli -PathType Leaf) { 'local' } else { 'npx' }
}
if ($WranglerMode -eq 'local' -and -not (Test-Path -LiteralPath $readerLocalCli -PathType Leaf)) {
    throw '找不到專案 Wrangler；請在 repository 根目錄安裝依賴，或使用 -WranglerMode npx。'
}
$readerCli = if($WranglerMode -eq 'local'){'node'}else{'npx'}
# Keep an array even with one argument: splatting a scalar string splits it into characters.
[string[]]$readerCliArgs = if($WranglerMode -eq 'local'){@($readerLocalCli)}else{@('wrangler')}
Write-Output "Wrangler 啟動方式：$WranglerMode"
$readerCheckSql = (Get-Content -LiteralPath './scripts/reader-ux-schema.sql' -Encoding UTF8) -join ' '
function Show-ReaderDiagnostic([string]$Output) {
    Write-Host 'Wrangler 原始輸出：'
    if ([string]::IsNullOrWhiteSpace($Output)) { Write-Host '(沒有輸出)' }
    else { Write-Host $Output }
}
function Invoke-ReaderWrangler([string[]]$CommandArgs, [string]$FailureMessage) {
    # Native stderr must not abort capture in Windows PowerShell 5.1, or PS7
    # sessions with PSNativeCommandUseErrorActionPreference enabled.
    $readerPreviousErrorAction = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $PSNativeCommandUseErrorActionPreference = $false
        $readerLines = @(& $readerCli @readerCliArgs @CommandArgs 2>&1)
        $readerExitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $readerPreviousErrorAction }
    $readerAllOutput = ($readerLines | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
    if ($readerExitCode -ne 0) {
        Show-ReaderDiagnostic $readerAllOutput
        throw "$FailureMessage（Wrangler exit code: $readerExitCode）"
    }
    $readerStderr = @($readerLines | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] })
    if ($readerStderr.Count -gt 0) { Show-ReaderDiagnostic (($readerStderr | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine) }
    return ($readerLines | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
}
function Get-ReaderColumns {
    $readerJson = Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command',$readerCheckSql,'--json') -FailureMessage '讀取 UI/UX schema 失敗，未進行後續操作'
    try { $readerResults = $readerJson | ConvertFrom-Json -ErrorAction Stop }
    catch {
        Show-ReaderDiagnostic $readerJson
        throw 'Wrangler 未回傳有效 schema JSON，未進行後續操作'
    }
    $readerCounts = @{}
    foreach ($readerResult in $readerResults) {
        if ($readerResult.success -eq $false) {
            Show-ReaderDiagnostic $readerJson
            throw 'Wrangler 回報 schema 查詢失敗，未進行後續操作'
        }
        foreach ($readerMetric in $readerResult.results) { $readerCounts[$readerMetric.metric] = [int]$readerMetric.count }
    }
    if (-not $readerCounts.ContainsKey('starred_column') -or -not $readerCounts.ContainsKey('classification_column')) {
        Show-ReaderDiagnostic $readerJson
        throw '未取得兩項 schema 結果，未進行後續操作'
    }
    if (-not $readerCounts.ContainsKey('reader_tables') -or $readerCounts.reader_tables -ne 2) {
        throw '尚未具備共用 v2 必要資料表，停止新增欄位；請先確認既有 sharing schema。'
    }
    return $readerCounts
}
$readerBefore = Get-ReaderColumns
Write-Output "目前：reader_tables=$($readerBefore.reader_tables)，starred_column=$($readerBefore.starred_column)，classification_column=$($readerBefore.classification_column)"
if ($CheckOnly) {
    Write-Output '唯讀檢查完成；未套用 migration。兩個欄位皆為 1 才具備部署所需 schema。'
    return
}
if ($readerBefore.starred_column -eq 1 -and $readerBefore.classification_column -eq 1) {
    Write-Output 'UI/UX migration 已套用，不需重跑。'
    return
}
if ($readerBefore.starred_column -notin @(0,1) -or $readerBefore.classification_column -notin @(0,1)) {
    throw '非預期的 schema，停止套用'
}
# This is a current recovery reference, not an instruction to restore data.
Invoke-ReaderWrangler -CommandArgs @('d1','time-travel','info','redolve-db') -FailureMessage '無法取得目前 Time Travel bookmark，停止套用'
foreach ($readerColumn in @('starred_column','classification_column')) {
    if ($readerBefore[$readerColumn] -eq 1) { continue }
    $readerDdl = if ($readerColumn -eq 'starred_column') {
        'ALTER TABLE collection_item_reads ADD COLUMN starred INTEGER NOT NULL DEFAULT 0 CHECK(starred IN (0,1));'
    } else {
        "ALTER TABLE saved_refs ADD COLUMN classification_state TEXT NOT NULL DEFAULT 'ready' CHECK(classification_state IN ('ready','pending','failed','manual'));"
    }
    Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command',$readerDdl) -FailureMessage "新增 $readerColumn 失敗；停止並保留輸出。腳本可重新查詢後補缺少的欄位。"
}
$readerAfter = Get-ReaderColumns
if ($readerAfter.starred_column -ne 1 -or $readerAfter.classification_column -ne 1) { throw 'migration 後 schema 未通過' }
Write-Output 'UI/UX migration 確認完成：reader_tables=2，starred_column=1，classification_column=1。現在可以部署新版本。'
