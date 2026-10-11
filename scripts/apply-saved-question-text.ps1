# Run from repository root. Requires completed 0007; applies additive 0008 only.
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
        if ($readerAllOutput -match '"code"\s*:\s*7403\b|\[code:\s*7403\]') {
            throw "Cloudflare 拒絕帳號／D1 存取（7403）；停止後續操作。先用相同 CLI 執行 whoami，確認帳號與登入方式；若使用 OAuth 則重新 login，若使用 API Token 則確認帳號範圍與 D1 權限。詳見 doc/SAVED_QUESTION_TEXT_RELEASE_2026-10-12.md。"
        }
        throw "$FailureMessage（Wrangler exit code: $readerExitCode）"
    }
    $readerStderr = @($readerLines | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] })
    if ($readerStderr.Count -gt 0) { Show-ReaderDiagnostic (($readerStderr | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine) }
    return ($readerLines | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
}


$textCheckSql = "SELECT 'snapshot_tables' AS metric,COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('saved_refs','saved_snapshots','collection_items'); SELECT 'reshare_allowed' AS metric,COUNT(*) AS count FROM pragma_table_info('saved_snapshots') WHERE name='reshare_allowed'; SELECT 'source_text' AS metric,COUNT(*) AS count FROM pragma_table_info('saved_snapshots') WHERE name='source_text';"
function Get-TextSchema {
 $json=Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command',$textCheckSql,'--json') -FailureMessage '讀取題目內文 schema 失敗'
 try{$results=$json|ConvertFrom-Json -ErrorAction Stop}catch{Show-ReaderDiagnostic $json;throw 'schema JSON 無效，停止'}
 $counts=@{}
 foreach($result in $results){if($result.success -ne $true){throw 'schema 查詢失敗，停止'};foreach($row in $result.results){$counts[$row.metric]=[int]$row.count}}
 foreach($key in @('snapshot_tables','reshare_allowed','source_text')){if(-not $counts.ContainsKey($key)){throw "缺少 schema 指標 $key，停止"}}
 if($counts.snapshot_tables -ne 3 -or $counts.reshare_allowed -ne 1){throw '請先完成既有共用與 0007 migration；本腳本不套用前置 migration。'}
 return $counts
}
$before=Get-TextSchema
Write-Output "目前：source_text=$($before.source_text)；部署要求為 1。"
if($CheckOnly){Write-Output '唯讀檢查完成；未套用 migration 或回填。';return}
Invoke-ReaderWrangler -CommandArgs @('d1','time-travel','info','redolve-db') -FailureMessage '無法取得 Time Travel bookmark，停止'
if($before.source_text -eq 0){
 Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command','ALTER TABLE saved_snapshots ADD COLUMN source_text TEXT;') -FailureMessage '新增題目內文欄位失敗，停止'
}
$backfill=(Get-Content -LiteralPath './worker/migrations/0008_saved_question_text.sql' -Encoding UTF8 | Where-Object{$_ -notmatch '^\s*--'}) -join ' '
$backfill=$backfill -replace 'ALTER TABLE[^;]+;',''
Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command',$backfill) -FailureMessage '舊存入題內文回填失敗；可重跑本腳本'
$after=Get-TextSchema
if($after.source_text -ne 1){throw '0008 驗證失敗，停止部署'}
Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command','SELECT COUNT(*) AS legacy_text_unavailable FROM saved_snapshots WHERE source_text IS NULL;') -FailureMessage '無法查詢舊內文回填結果'
Write-Output '0008 完成。legacy_text_unavailable 是無法安全還原舊內文的筆數，不代表 migration 失敗；題圖與個人訂正不受影響。'
