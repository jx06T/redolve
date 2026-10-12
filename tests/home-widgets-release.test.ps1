$ErrorActionPreference='Stop'
$global:widgetReleaseReady=$false
$global:widgetReleaseFailure=''
$global:widgetReleaseCalls=[System.Collections.Generic.List[string]]::new()
function node {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$CliArgs)
    $global:LASTEXITCODE=0
    if($CliArgs[2] -eq 'time-travel'){
        $global:widgetReleaseCalls.Add('bookmark')
        if($global:widgetReleaseFailure -eq 'bookmark'){$global:LASTEXITCODE=1;return 'bookmark failed'}
        return 'test-bookmark'
    }
    $sql=$CliArgs[6]
    if($sql.StartsWith("SELECT 'widget_tables'")){
        $global:widgetReleaseCalls.Add('check')
        if($global:widgetReleaseFailure -eq 'schema'){$global:LASTEXITCODE=1;return 'schema failed'}
        $ready=$global:widgetReleaseReady
        return ConvertTo-Json -Compress -Depth 5 @(
            @{success=$true;results=@(@{metric='widget_tables';count=$(if($ready){2}else{0})})},
            @{success=$true;results=@(@{metric='widget_indexes';count=$(if($ready){2}else{0})})},
            @{success=$true;results=@(@{metric='item_columns';count=$(if($ready){10}else{0})})},
            @{success=$true;results=@(@{metric='pref_columns';count=$(if($ready){5}else{0})})}
        )
    }
    if($sql.TrimStart().StartsWith('CREATE TABLE IF NOT EXISTS home_widget_items')){
        if($sql.Contains('--') -or $CliArgs.Contains('--file')){throw 'Wrong SQL command boundaries'}
        $global:widgetReleaseCalls.Add('migration')
        if($global:widgetReleaseFailure -eq 'migration'){$global:LASTEXITCODE=1;return 'migration failed'}
        $global:widgetReleaseReady=$true;return 'ok'
    }
    throw "Unexpected CLI arguments: $CliArgs"
}
try{
    & './scripts/apply-home-widgets.ps1' -CheckOnly | Out-Null
    if(($global:widgetReleaseCalls -join ',') -ne 'check' -or $global:widgetReleaseReady){throw 'CheckOnly wrote data'}
    $global:widgetReleaseCalls.Clear()
    & './scripts/apply-home-widgets.ps1' | Out-Null
    if(($global:widgetReleaseCalls -join ',') -ne 'check,bookmark,migration,check'){throw 'Wrong apply order'}
    $global:widgetReleaseCalls.Clear()
    & './scripts/apply-home-widgets.ps1' | Out-Null
    if(($global:widgetReleaseCalls -join ',') -ne 'check'){throw 'Repeated migration'}
    foreach($failure in @('schema','bookmark','migration')){
        $global:widgetReleaseReady=$false;$global:widgetReleaseFailure=$failure;$global:widgetReleaseCalls.Clear();$stopped=$false
        try{& './scripts/apply-home-widgets.ps1' | Out-Null}catch{$stopped=$true}
        if(-not $stopped){throw 'Failure did not stop'}
        if($failure -ne 'migration' -and $global:widgetReleaseCalls.Contains('migration')){throw 'Wrote despite failed prerequisite'}
    }
    Write-Output 'PASS: check-only, bookmark before migration, verify, repeat and failures stop; zero remote calls'
    $global:LASTEXITCODE=0
}finally{Remove-Item Function:\node}
