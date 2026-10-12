# Additive 0010. Enables cross-device countdown order; previous schema remains usable.
param(
    [ValidateSet('auto','npx','local')][string]$WranglerMode='auto',
    [switch]$CheckOnly
)
$ErrorActionPreference='Stop'
$orderCheckOnly=$CheckOnly
# Reuse the established CLI runner and its 7403/error handling; this call is read-only.
. "$PSScriptRoot/apply-home-widgets.ps1" -WranglerMode $WranglerMode -CheckOnly
if($before.widget_tables -ne 2 -or $before.widget_indexes -ne 2 -or $before.item_columns -ne 10 -or $before.pref_columns -ne 5){throw '請先完成 0009_home_widgets.sql，未進行後續操作。'}
function Get-CountdownOrderColumn {
    $sql="SELECT COUNT(*) AS countdown_order_column FROM pragma_table_info('home_widget_preferences') WHERE name='countdown_order';"
    $json=Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command',$sql,'--json') -FailureMessage '無法讀取倒數排序 schema'
    try{$result=@($json | ConvertFrom-Json -ErrorAction Stop)}catch{Show-ReaderDiagnostic $json;throw '倒數排序 schema JSON 無效，停止。'}
    if($result.Count -ne 1 -or $result[0].success -ne $true -or @($result[0].results).Count -ne 1){throw '倒數排序 schema 查詢無效，停止。'}
    return [int]$result[0].results[0].countdown_order_column
}
$orderBefore=Get-CountdownOrderColumn
Write-Output "countdown_order_column=$orderBefore；跨裝置排序要求：1。"
if($orderCheckOnly){Write-Output '唯讀檢查完成；未套用 migration。';return}
if($orderBefore -eq 1){Write-Output '0010 已完成，未重複寫入。';return}
if($orderBefore -ne 0){throw '倒數排序 schema 無效，停止。'}
Invoke-ReaderWrangler -CommandArgs @('d1','time-travel','info','redolve-db') -FailureMessage '無法取得 Time Travel bookmark，停止'
$orderDdl=(Get-Content -LiteralPath "$PSScriptRoot/../worker/migrations/0010_countdown_order.sql" -Encoding UTF8 | Where-Object {$_ -notmatch '^\s*--'}) -join ' '
Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command',$orderDdl) -FailureMessage '0010 migration 失敗，停止'
if((Get-CountdownOrderColumn) -ne 1){throw '0010 schema 驗證未通過，停止。'}
Write-Output '0010 完成：countdown_order_column=1。'
