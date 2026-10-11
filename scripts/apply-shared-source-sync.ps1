# Run from repository root. Requires completed 0005; applies additive 0006 only.
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
$readerCheckSql = "SELECT 'cache_tables' AS metric,COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('collection_search_cache_config','collection_search_versions','collection_search_user_versions'); SELECT 'cache_triggers' AS metric,COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name LIKE 'search_version_%'; SELECT 'progress_seq' AS metric,COUNT(*) AS count FROM pragma_table_info('items') WHERE name='progress_seq'; SELECT 'previous_status' AS metric,COUNT(*) AS count FROM pragma_table_info('items') WHERE name='previous_status'; SELECT 'source_triggers' AS metric,COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name IN ('source_work_shared_update','source_progress_shared_update');"
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

function Get-SourceSchema {
    $json = Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command',$readerCheckSql,'--json') -FailureMessage '讀取共用原題 schema 失敗'
    try { $results = $json | ConvertFrom-Json -ErrorAction Stop } catch { Show-ReaderDiagnostic $json; throw 'schema JSON 無效，停止' }
    $counts=@{}
    foreach($result in $results) {
        if($result.success -ne $true){throw 'schema 查詢未成功，停止'}
        foreach($row in $result.results){$counts[$row.metric]=[int]$row.count}
    }
    foreach($key in @('cache_tables','cache_triggers','progress_seq','previous_status','source_triggers')) {
        if(-not $counts.ContainsKey($key)){throw "缺少 schema 指標 $key，停止"}
    }
    if($counts.cache_tables -ne 3 -or $counts.cache_triggers -ne 28){throw '請先完成 0005_shared_search_cache.sql；本腳本不會套用前置 migration。'}
    $configSql="SELECT schema_version,ready,(SELECT COUNT(*) FROM collections co LEFT JOIN collection_search_versions v ON v.collection_id=co.id WHERE v.collection_id IS NULL) AS missing_versions FROM collection_search_cache_config WHERE id=1;"
    $configJson=Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command',$configSql,'--json') -FailureMessage '讀取版本設定失敗'
    try{$configResults=$configJson|ConvertFrom-Json -ErrorAction Stop}catch{Show-ReaderDiagnostic $configJson;throw '版本 JSON 無效，停止'}
    if($configResults.success -contains $false){throw '版本查詢未成功，停止'}
    $rows=@($configResults|ForEach-Object{$_.results})
    if($rows.Count -ne 1 -or $rows[0].ready -ne 1 -or $rows[0].schema_version -notin @(1,2) -or $rows[0].missing_versions -ne 0){throw '0005 設定未完整／版本不支援；停止，請檢查發布指南。'}
    $counts['version']=[int]$rows[0].schema_version
    return $counts
}
$before=Get-SourceSchema
Write-Output "目前：progress_seq=$($before.progress_seq)，previous_status=$($before.previous_status)，source_triggers=$($before.source_triggers)，schema_version=$($before.version)"
if($CheckOnly){Write-Output '唯讀檢查完成。部署要求：1、1、2、2；未寫入。';return}
if($before.progress_seq -eq 1 -and $before.previous_status -eq 1 -and $before.source_triggers -eq 2 -and $before.version -eq 2){Write-Output '0006 已完整，不需重跑。';return}
Invoke-ReaderWrangler -CommandArgs @('d1','time-travel','info','redolve-db') -FailureMessage '無法取得 Time Travel bookmark，停止'
if($before.progress_seq -eq 0){Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command','ALTER TABLE items ADD COLUMN progress_seq INTEGER NOT NULL DEFAULT 1;') -FailureMessage '新增 progress_seq 失敗，停止'}
if($before.previous_status -eq 0){Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command',"ALTER TABLE items ADD COLUMN previous_status TEXT NOT NULL DEFAULT 'unsolved';") -FailureMessage '新增 previous_status 失敗，停止'}
# Skip one-time ALTERs; handle each missing column above, including interrupted runs.
$ddl=(Get-Content -LiteralPath './worker/migrations/0006_shared_source_work.sql' -Encoding UTF8 | Where-Object{$_ -notmatch '^\s*--'}) -join ' '
$ddl=$ddl -replace 'ALTER TABLE items ADD COLUMN[^;]+;',''
Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command',$ddl) -FailureMessage '0006 trigger 安裝失敗，停止部署；可重新執行本腳本'
$after=Get-SourceSchema
if($after.progress_seq -ne 1 -or $after.previous_status -ne 1 -or $after.source_triggers -ne 2 -or $after.version -ne 2){throw '0006 驗證失敗，停止部署'}
Write-Output '0006 完成：progress_seq=1，previous_status=1，source_triggers=2，schema_version=2。可依核准流程推送。'
