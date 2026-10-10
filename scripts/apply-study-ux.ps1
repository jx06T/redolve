# Run from repository root. Requires existing 0003; adds only private study progress.
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
$readerCheckSql = (Get-Content -LiteralPath './scripts/study-ux-schema.sql' -Encoding UTF8) -join ' '
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
if ($readerBefore.starred_column -ne 1 -or $readerBefore.classification_column -ne 1) { throw '先完成既有 0003 migration；本腳本不重跑舊版 migration。' }
if (-not $readerBefore.ContainsKey('study_progress_table') -or -not $readerBefore.ContainsKey('study_progress_columns')) { throw '未取得共用題個人進度 schema 結果，停止套用。' }
Write-Output "目前：study_progress_table=$($readerBefore.study_progress_table)，study_progress_columns=$($readerBefore.study_progress_columns)"
if (($readerBefore.study_progress_table -eq 1 -and $readerBefore.study_progress_columns -ne 7) -or ($readerBefore.study_progress_table -eq 0 -and $readerBefore.study_progress_columns -ne 0)) { throw '非預期個人進度 schema，停止套用。' }
if ($CheckOnly) { Write-Output '唯讀檢查完成；未套用 migration。發布前必須為 table=1、columns=7。'; return }
if ($readerBefore.study_progress_table -eq 1) { Write-Output '個人進度 migration 已確認，不需重跑。'; return }
Invoke-ReaderWrangler -CommandArgs @('d1','time-travel','info','redolve-db') -FailureMessage '無法取得 Time Travel bookmark，停止套用'
$readerDdl = (Get-Content -LiteralPath './worker/migrations/0004_study_progress.sql' -Encoding UTF8 | Where-Object { $_ -notmatch '^\s*--' }) -join ' '
Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command',$readerDdl) -FailureMessage '新增個人進度表失敗；停止發布並保留輸出'
$readerAfter = Get-ReaderColumns
if ($readerAfter.study_progress_table -ne 1 -or $readerAfter.study_progress_columns -ne 7) { throw '新增個人進度 schema 驗證失敗，停止發布。' }
Write-Output '刷題修正 migration 確認完成：study_progress_table=1，study_progress_columns=7。現在可以推送部署新版本。'
