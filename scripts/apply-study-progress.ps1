# Additive 0012 only. Never apply the withdrawn 0011.
param(
    [ValidateSet('auto','npx','local')][string]$WranglerMode='auto',
    [switch]$CheckOnly
)
$ErrorActionPreference='Stop'
$studyCheckOnly=$CheckOnly
. "$PSScriptRoot/apply-home-widgets.ps1" -WranglerMode $WranglerMode -CheckOnly
if($before.widget_tables -ne 2 -or $before.widget_indexes -ne 2 -or $before.item_columns -ne 10 -or $before.pref_columns -ne 5){throw '請先完成 0009_home_widgets.sql，未進行後續操作。'}
$studyExpected=@{progress_tables=3;progress_indexes=2;plan_columns=10;preference_columns=5;operation_columns=7}
function Get-StudyProgressSchema {
    $sql="SELECT 'progress_tables' AS metric,COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('study_progress_plans','study_progress_preferences','study_progress_operations'); SELECT 'progress_indexes' AS metric,COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name IN ('idx_study_progress_active','idx_study_progress_operations_plan'); SELECT 'plan_columns' AS metric,COUNT(*) AS count FROM pragma_table_info('study_progress_plans') WHERE name IN ('id','user_id','name','unit','target_count','completed_count','created_at','updated_at','row_version','deleted_at'); SELECT 'preference_columns' AS metric,COUNT(*) AS count FROM pragma_table_info('study_progress_preferences') WHERE name IN ('user_id','visible','plan_order','row_version','updated_at'); SELECT 'operation_columns' AS metric,COUNT(*) AS count FROM pragma_table_info('study_progress_operations') WHERE name IN ('id','user_id','plan_id','delta','effect','applied','created_at');"
    $json=Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command',$sql,'--json') -FailureMessage '無法讀取學習計畫 schema'
    try{$result=@($json|ConvertFrom-Json -ErrorAction Stop)}catch{Show-ReaderDiagnostic $json;throw '學習計畫 schema JSON 無效，停止。'}
    if($result.Count -ne 5){throw '學習計畫 schema 查詢數量無效，停止。'}
    $metrics=@{}
    foreach($entry in $result){
        if($entry.success -ne $true -or @($entry.results).Count -ne 1 -or -not $studyExpected.ContainsKey([string]$entry.results[0].metric)){throw '學習計畫 schema 結果無效，停止。'}
        $metrics[[string]$entry.results[0].metric]=[int]$entry.results[0].count
    }
    if($metrics.Count -ne 5){throw '學習計畫 schema 指標不完整，停止。'}
    return $metrics
}
function Test-StudyProgressComplete($Metrics){
    foreach($metric in $studyExpected.Keys){if($Metrics[$metric] -ne $studyExpected[$metric]){return $false}}
    return $true
}
$studyBefore=Get-StudyProgressSchema
Write-Output "目前：progress_tables=$($studyBefore.progress_tables)，progress_indexes=$($studyBefore.progress_indexes)，plan_columns=$($studyBefore.plan_columns)，preference_columns=$($studyBefore.preference_columns)，operation_columns=$($studyBefore.operation_columns)"
if($studyCheckOnly){Write-Output '唯讀檢查完成；啟用要求依序 3、2、10、5、7，未套用 migration。';return}
if(Test-StudyProgressComplete $studyBefore){Write-Output '0012 已完成，未重複寫入。';return}
if(@($studyBefore.Values|Where-Object {$_ -ne 0}).Count -ne 0){throw '偵測到部分學習計畫 schema，請先檢查；未寫入。'}
Invoke-ReaderWrangler -CommandArgs @('d1','time-travel','info','redolve-db') -FailureMessage '無法取得 Time Travel bookmark，停止'
$studyDdl=(Get-Content -LiteralPath "$PSScriptRoot/../worker/migrations/0012_study_progress.sql" -Encoding UTF8|Where-Object {$_ -notmatch '^\s*--'}) -join ' '
Invoke-ReaderWrangler -CommandArgs @('d1','execute','redolve-db','--remote','--command',$studyDdl) -FailureMessage '0012 migration 失敗，停止'
if(-not (Test-StudyProgressComplete (Get-StudyProgressSchema))){throw '0012 schema 驗證未通過，停止。'}
Write-Output '0012 完成：3 表、2 索引、10／5／7 欄。現在可同步學習計畫。'
