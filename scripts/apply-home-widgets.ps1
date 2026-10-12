# Run from repository root. Applies additive 0009; no production data is replaced.
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
            throw "Cloudflare 拒絕帳號／D1 存取（7403）；停止後續操作。先用相同 CLI 執行 whoami，確認帳號與登入方式；若使用 OAuth 則重新 login，若使用 API Token 則確認帳號範圍與 D1 權限。詳見 doc/HOME_WIDGETS_2026-10-12.md。"
        }
        throw "$FailureMessage（Wrangler exit code: $readerExitCode）"
    }
    $readerStderr = @($readerLines | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] })
    if ($readerStderr.Count -gt 0) { Show-ReaderDiagnostic (($readerStderr | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine) }
    return ($readerLines | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
}


function Get-WidgetSchema {
    $sql = "SELECT 'widget_tables' AS metric, COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('home_widget_items','home_widget_preferences'); SELECT 'widget_indexes' AS metric, COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name IN ('idx_home_widgets_active','idx_home_widgets_expiry'); SELECT 'item_columns' AS metric,COUNT(*) AS count FROM pragma_table_info('home_widget_items') WHERE name IN ('id','user_id','kind','text','target_date','completed_at','created_at','updated_at','row_version','deleted_at'); SELECT 'pref_columns' AS metric,COUNT(*) AS count FROM pragma_table_info('home_widget_preferences') WHERE name IN ('user_id','todos_visible','countdowns_visible','row_version','updated_at');"
    $json = Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command',$sql,'--json') -FailureMessage '無法讀取小組件 schema'
    try { $results = $json | ConvertFrom-Json -ErrorAction Stop } catch { Show-ReaderDiagnostic $json; throw 'schema JSON 無效，停止' }
    $counts = @{}
    foreach ($result in $results) {
        if ($result.success -ne $true) { throw 'schema 查詢失敗，停止' }
        foreach ($row in $result.results) { $counts[$row.metric] = [int]$row.count }
    }
    foreach ($metric in @('widget_tables','widget_indexes','item_columns','pref_columns')) {
        if (-not $counts.ContainsKey($metric)) { throw "缺少指標 $metric，停止" }
    }
    return $counts
}
$before = Get-WidgetSchema
Write-Output "目前：widget_tables=$($before.widget_tables)，widget_indexes=$($before.widget_indexes)，item_columns=$($before.item_columns)，pref_columns=$($before.pref_columns)；部署要求：2、2、10、5。"
if ($CheckOnly) { Write-Output '唯讀檢查完成；未套用 migration。'; return }
if ($before.widget_tables -eq 2 -and $before.widget_indexes -eq 2 -and $before.item_columns -eq 10 -and $before.pref_columns -eq 5) { Write-Output '0009 已完成，未重複寫入。'; return }
if (($before.item_columns -ne 0 -and $before.item_columns -ne 10) -or ($before.pref_columns -ne 0 -and $before.pref_columns -ne 5)) { throw '發現不完整的小組件表結構；停止，請先檢查資料庫。' }
Invoke-ReaderWrangler -CommandArgs @('d1','time-travel','info','redolve-db') -FailureMessage '無法取得 Time Travel bookmark，停止'
$ddl = (Get-Content -LiteralPath './worker/migrations/0009_home_widgets.sql' -Encoding UTF8 | Where-Object { $_ -notmatch '^\s*--' }) -join ' '
Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command',$ddl) -FailureMessage '0009 migration 失敗，停止發布'
$after = Get-WidgetSchema
if ($after.widget_tables -ne 2 -or $after.widget_indexes -ne 2 -or $after.item_columns -ne 10 -or $after.pref_columns -ne 5) { throw '0009 schema 驗證未通過，停止部署' }
Write-Output '0009 完成：widget_tables=2，widget_indexes=2，item_columns=10，pref_columns=5。'
