# Run from repository root. Requires completed 0006; applies additive 0007 only.
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
            throw "Cloudflare 拒絕帳號／D1 存取（7403）；停止後續操作。先用相同 CLI 執行 whoami，確認帳號與登入方式；若使用 OAuth 則重新 login，若使用 API Token 則確認帳號範圍與 D1 權限。詳見 doc/SHARED_SOURCE_SYNC_RELEASE_2026-10-11.md。"
        }
        throw "$FailureMessage（Wrangler exit code: $readerExitCode）"
    }
    $readerStderr = @($readerLines | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] })
    if ($readerStderr.Count -gt 0) { Show-ReaderDiagnostic (($readerStderr | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine) }
    return ($readerLines | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
}


$readerCheckSql = "SELECT 'allow_reshare' AS metric,COUNT(*) AS count FROM pragma_table_info('collections') WHERE name='allow_reshare'; SELECT 'reshare_allowed' AS metric,COUNT(*) AS count FROM pragma_table_info('saved_snapshots') WHERE name='reshare_allowed'; SELECT 'share_tables' AS metric,COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('independent_shares','share_asset_refs'); SELECT 'share_trigger' AS metric,COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name='independent_share_asset_ready'; SELECT 'share_view' AS metric,COUNT(*) AS count FROM sqlite_master WHERE type='view' AND name='asset_reference_inventory'; SELECT 'share_indexes' AS metric,COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name IN ('idx_independent_shares_owner','idx_independent_shares_list','idx_independent_shares_expiry','idx_share_asset_refs_asset'); SELECT 'source_triggers' AS metric,COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name IN ('source_work_shared_update','source_progress_shared_update'); SELECT 'source_columns' AS metric,COUNT(*) AS count FROM pragma_table_info('items') WHERE name IN ('progress_seq','previous_status');"
function Get-ShareSchema {
 $json=Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command',$readerCheckSql,'--json') -FailureMessage '讀取單題分享 schema 失敗'
 try{$results=$json|ConvertFrom-Json -ErrorAction Stop}catch{Show-ReaderDiagnostic $json;throw 'schema JSON 無效，停止'}
 $counts=@{}
 foreach($result in $results){if($result.success -ne $true){throw 'schema 查詢失敗，停止'};foreach($row in $result.results){$counts[$row.metric]=[int]$row.count}}
 foreach($key in @('allow_reshare','reshare_allowed','share_tables','share_trigger','share_view','share_indexes','source_triggers','source_columns')){if(-not $counts.ContainsKey($key)){throw "缺少 schema 指標 $key，停止"}}
 if($counts.source_triggers -ne 2 -or $counts.source_columns -ne 2){throw '先完成 0006_shared_source_work.sql；本腳本不套用前置 migration。'}
 return $counts
}
function Test-ShareReady($state){return $state.allow_reshare -eq 1 -and $state.reshare_allowed -eq 1 -and $state.share_tables -eq 2 -and $state.share_trigger -eq 1 -and $state.share_view -eq 1 -and $state.share_indexes -eq 4}
$before=Get-ShareSchema
Write-Output "目前：allow_reshare=$($before.allow_reshare)，reshare_allowed=$($before.reshare_allowed)，share_tables=$($before.share_tables)，share_trigger=$($before.share_trigger)，share_view=$($before.share_view)，share_indexes=$($before.share_indexes)"
if($CheckOnly){Write-Output '唯讀檢查完成。部署要求依序：1、1、2、1、1、4；未寫入。';return}
if(Test-ShareReady $before){Write-Output '0007 已完整，不需重跑。';return}
Invoke-ReaderWrangler -CommandArgs @('d1','time-travel','info','redolve-db') -FailureMessage '無法取得 Time Travel bookmark，停止'
if($before.allow_reshare -eq 0){Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command','ALTER TABLE collections ADD COLUMN allow_reshare INTEGER NOT NULL DEFAULT 0 CHECK(allow_reshare IN (0,1));') -FailureMessage '新增 allow_reshare 失敗，停止'}
if($before.reshare_allowed -eq 0){Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command','ALTER TABLE saved_snapshots ADD COLUMN reshare_allowed INTEGER NOT NULL DEFAULT 0 CHECK(reshare_allowed IN (0,1));') -FailureMessage '新增 reshare_allowed 失敗，停止'}
$ddl=(Get-Content -LiteralPath './worker/migrations/0007_independent_question_shares.sql' -Encoding UTF8 | Where-Object{$_ -notmatch '^\s*--'}) -join ' '
$ddl=$ddl -replace 'ALTER TABLE[^;]+;',''
Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command',$ddl) -FailureMessage '0007 安裝失敗，停止部署；可重跑本腳本'
$after=Get-ShareSchema
if(-not (Test-ShareReady $after)){throw '0007 驗證失敗，停止部署'}
$audit="SELECT COUNT(*) AS missing_share_refs FROM independent_shares s LEFT JOIN share_asset_refs r ON r.token=s.token AND r.asset_id=s.image_asset_id WHERE r.token IS NULL;"
$auditJson=Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command',$audit,'--json') -FailureMessage '分享引用稽核失敗，停止部署'
try{$auditResults=$auditJson|ConvertFrom-Json -ErrorAction Stop}catch{Show-ReaderDiagnostic $auditJson;throw '稽核 JSON 無效，停止'}
$auditRows=@($auditResults|ForEach-Object{$_.results})
if($auditResults.success -contains $false -or $auditRows.Count -ne 1 -or $null -eq $auditRows[0].missing_share_refs -or $auditRows[0].missing_share_refs -ne 0){throw '分享資產引用缺失，停止部署'}
Write-Output 'missing_share_refs=0'
Write-Output '0007 完成：1、1、2、1、1、4；missing_share_refs=0。可依核准流程推送。'
