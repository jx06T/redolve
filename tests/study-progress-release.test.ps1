$ErrorActionPreference='Stop'
$global:studyReady=$false
$global:studyPartial=$false
$global:studyFailure=''
$global:studyCalls=[System.Collections.Generic.List[string]]::new()
function node {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$CliArgs)
    $global:LASTEXITCODE=0
    if($CliArgs[2] -eq 'time-travel'){
        $global:studyCalls.Add('bookmark')
        if($global:studyFailure -eq 'bookmark'){$global:LASTEXITCODE=1;return 'bookmark failed'}
        return 'test-bookmark'
    }
    $sql=$CliArgs[6]
    if($sql.StartsWith("SELECT 'widget_tables'")){
        $global:studyCalls.Add('baseline')
        if($global:studyFailure -eq 'baseline'){$global:LASTEXITCODE=1;return '7403 not authorized'}
        return ConvertTo-Json -Compress -Depth 5 @(
            @{success=$true;results=@(@{metric='widget_tables';count=2})},
            @{success=$true;results=@(@{metric='widget_indexes';count=2})},
            @{success=$true;results=@(@{metric='item_columns';count=10})},
            @{success=$true;results=@(@{metric='pref_columns';count=5})}
        )
    }
    if($sql.StartsWith("SELECT 'progress_tables'")){
        $global:studyCalls.Add('schema')
        if($global:studyFailure -eq 'schema'){$global:LASTEXITCODE=1;return 'schema failed'}
        if($global:studyFailure -eq 'json'){return 'not json'}
        $values=@{progress_tables=3;progress_indexes=2;plan_columns=10;preference_columns=5;operation_columns=7}
        return ConvertTo-Json -Compress -Depth 5 @($values.Keys|ForEach-Object {@{success=$true;results=@(@{metric=$_;count=$(if($global:studyReady){$values[$_]}elseif($global:studyPartial -and $_ -eq 'progress_tables'){1}else{0})})}})
    }
    if($sql.TrimStart().StartsWith('CREATE TABLE IF NOT EXISTS study_progress_plans')){
        if($sql.Contains('--') -or $sql.Contains('0011') -or $CliArgs.Contains('--file')){throw 'Invalid migration boundaries'}
        $global:studyCalls.Add('migration')
        if($global:studyFailure -eq 'migration'){$global:LASTEXITCODE=1;return 'migration failed'}
        $global:studyReady=$true;return 'ok'
    }
    throw "Unexpected CLI arguments: $CliArgs"
}
try{
    & './scripts/apply-study-progress.ps1' -CheckOnly | Out-Null
    if(($global:studyCalls -join ',') -ne 'baseline,schema' -or $global:studyReady){throw 'CheckOnly wrote data'}
    $global:studyCalls.Clear();& './scripts/apply-study-progress.ps1' | Out-Null
    if(($global:studyCalls -join ',') -ne 'baseline,schema,bookmark,migration,schema'){throw 'Wrong apply order'}
    $global:studyCalls.Clear();& './scripts/apply-study-progress.ps1' | Out-Null
    if(($global:studyCalls -join ',') -ne 'baseline,schema'){throw 'Repeated migration wrote data'}
    foreach($failure in @('baseline','schema','json','bookmark','migration','partial')){
        $global:studyReady=$false;$global:studyFailure=$failure;$global:studyPartial=$failure -eq 'partial';$global:studyCalls.Clear();$caught=$false
        try{& './scripts/apply-study-progress.ps1' | Out-Null}catch{$caught=$true}
        if(-not $caught -or $global:studyReady){throw "Did not stop on $failure failure"}
    }
    Write-Output 'PASS 0012 release checks, partial schema, repeat and failure stop; zero production calls.'
    $global:LASTEXITCODE=0
}finally{Remove-Item Function:node}
