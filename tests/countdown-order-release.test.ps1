$ErrorActionPreference='Stop'
$global:orderReady=$false
$global:orderFailure=''
$global:orderCalls=[System.Collections.Generic.List[string]]::new()
function node {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$CliArgs)
    $global:LASTEXITCODE=0
    if($CliArgs[2] -eq 'time-travel'){
        $global:orderCalls.Add('bookmark')
        if($global:orderFailure -eq 'bookmark'){$global:LASTEXITCODE=1;return 'bookmark failed'}
        return 'test-bookmark'
    }
    $sql=$CliArgs[6]
    if($sql.StartsWith("SELECT 'widget_tables'")){
        $global:orderCalls.Add('baseline')
        return ConvertTo-Json -Compress -Depth 5 @(
            @{success=$true;results=@(@{metric='widget_tables';count=2})},
            @{success=$true;results=@(@{metric='widget_indexes';count=2})},
            @{success=$true;results=@(@{metric='item_columns';count=10})},
            @{success=$true;results=@(@{metric='pref_columns';count=5})}
        )
    }
    if($sql.StartsWith('SELECT COUNT(*) AS countdown_order_column')){
        $global:orderCalls.Add('check')
        if($global:orderFailure -eq 'schema'){$global:LASTEXITCODE=1;return 'schema failed'}
        return ConvertTo-Json -Compress -Depth 5 @(@{success=$true;results=@(@{countdown_order_column=$(if($global:orderReady){1}else{0})})})
    }
    if($sql.TrimStart().StartsWith('ALTER TABLE home_widget_preferences ADD COLUMN countdown_order')){
        if($sql.Contains('--') -or $CliArgs.Contains('--file')){throw 'Wrong SQL command boundaries'}
        $global:orderCalls.Add('migration')
        if($global:orderFailure -eq 'migration'){$global:LASTEXITCODE=1;return 'migration failed'}
        $global:orderReady=$true;return 'ok'
    }
    throw "Unexpected CLI arguments: $CliArgs"
}
try{
    & './scripts/apply-countdown-order.ps1' -CheckOnly | Out-Null
    if(($global:orderCalls -join ',') -ne 'baseline,check' -or $global:orderReady){throw 'CheckOnly wrote data'}
    $global:orderCalls.Clear()
    & './scripts/apply-countdown-order.ps1' | Out-Null
    if(($global:orderCalls -join ',') -ne 'baseline,check,bookmark,migration,check'){throw 'Wrong apply order'}
    $global:orderCalls.Clear()
    & './scripts/apply-countdown-order.ps1' | Out-Null
    if(($global:orderCalls -join ',') -ne 'baseline,check'){throw 'Repeated migration wrote data'}
    foreach($failure in @('schema','bookmark','migration')){
        $global:orderReady=$false;$global:orderFailure=$failure;$global:orderCalls.Clear();$caught=$false
        try{& './scripts/apply-countdown-order.ps1' | Out-Null}catch{$caught=$true}
        if(-not $caught -or $global:orderReady){throw "Did not stop on $failure failure"}
    }
    Write-Output 'PASS 0010 release checks, bookmark, apply, repeat and failure stop; zero production calls.'
    $global:LASTEXITCODE=0
}finally{Remove-Item Function:node}
