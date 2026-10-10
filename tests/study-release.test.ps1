# Fake CLI checks only; never contacts Cloudflare.
$ErrorActionPreference='Stop'
$global:studyCalls=[System.Collections.Generic.List[object]]::new()
$global:studyTable=0
$global:studyColumns=0
$global:studyFailure=''
function global:node {
    $global:LASTEXITCODE=0
    $global:studyCalls.Add(@($args))
    if ($args[0] -ne './node_modules/wrangler/bin/wrangler.js') { throw 'CLI path split into characters' }
    if ($args[2] -eq 'time-travel') {
        if($global:studyFailure -eq 'bookmark') { $global:LASTEXITCODE=1 }
        return 'fixture bookmark'
    }
    if ($args.Count -lt 7 -or $args[2] -ne 'execute' -or $args[3] -ne 'redolve-db' -or $args[4] -ne '--remote') { throw 'Unexpected CLI invocation' }
    if ($args[-1] -eq '--json') {
        if($global:studyFailure -eq 'schema') { $global:LASTEXITCODE=7; return 'fixture query denied' }
        $starred=if($global:studyFailure -eq 'old-schema'){0}else{1}
        return @(@{success=$true;results=@(@{metric='reader_tables';count=2},@{metric='starred_column';count=$starred},@{metric='classification_column';count=1},@{metric='study_progress_table';count=$global:studyTable},@{metric='study_progress_columns';count=$global:studyColumns})}) | ConvertTo-Json -Depth 6 -Compress
    }
    if ($args[6] -notmatch 'CREATE TABLE IF NOT EXISTS collection_item_progress' -or $args[6] -match '-- Additive') { throw 'DDL must be one complete SQL argument without comments' }
    if($global:studyFailure -eq 'ddl') { $global:LASTEXITCODE=1; return 'fixture DDL failure' }
    $global:studyTable=1;$global:studyColumns=7
    return 'fixture applied'
}
try {
    & ./scripts/apply-study-ux.ps1 -WranglerMode local -CheckOnly | Out-Null
    if($global:studyCalls.Count -ne 1 -or $global:studyTable -ne 0) { throw 'CheckOnly mutated database' }
    $global:studyCalls.Clear()
    $output=(& ./scripts/apply-study-ux.ps1 -WranglerMode local) -join ' '
    if($global:studyCalls.Count -ne 4 -or $output -notmatch 'study_progress_columns=7') { throw 'Initial migration not verified' }
    $global:studyCalls.Clear()
    & ./scripts/apply-study-ux.ps1 -WranglerMode local | Out-Null
    if($global:studyCalls.Count -ne 1) { throw 'Repeated migration performed writes' }
    foreach($failure in @('schema','old-schema','bookmark','ddl')) {
        $global:studyCalls.Clear();$global:studyTable=0;$global:studyColumns=0;$global:studyFailure=$failure
        $stopped=$false
        try { & ./scripts/apply-study-ux.ps1 -WranglerMode local | Out-Null } catch { $stopped=$true }
        if(-not $stopped -or $global:studyTable -ne 0) { throw "Failure did not stop: $failure" }
    }
    $global:studyFailure='';$global:studyTable=1;$global:studyColumns=4
    $stopped=$false
    try { & ./scripts/apply-study-ux.ps1 -WranglerMode local | Out-Null } catch { $stopped=$true }
    if(-not $stopped) { throw 'Unexpected schema was accepted' }
    Write-Output 'PASS: study release CLI arguments, CheckOnly, repeat, validation and failure guards'
} finally { Remove-Item -LiteralPath Function:\node -ErrorAction SilentlyContinue }
