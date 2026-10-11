$ErrorActionPreference='Stop'
$global:savedTextReleaseTextColumn=0
$global:savedTextReleaseFailure=''
$global:savedTextReleaseCalls=[System.Collections.Generic.List[string]]::new()
function node {
 param([Parameter(ValueFromRemainingArguments=$true)][string[]]$CliArgs)
 $global:LASTEXITCODE=0
 $sql=if($CliArgs.Count -gt 6){$CliArgs[6]}else{''}
 if($CliArgs[2] -eq 'time-travel'){
  $global:savedTextReleaseCalls.Add('bookmark')
  if($global:savedTextReleaseFailure -eq 'bookmark'){$global:LASTEXITCODE=1;return 'bookmark failed'}
  return 'test-bookmark'
 }
 if($sql.StartsWith("SELECT 'snapshot_tables'")){
  $global:savedTextReleaseCalls.Add('check')
  if($global:savedTextReleaseFailure -eq 'schema'){$global:LASTEXITCODE=1;return 'schema failed'}
  return ConvertTo-Json -Compress -Depth 5 @(
   @{success=$true;results=@(@{metric='snapshot_tables';count=3})},
   @{success=$true;results=@(@{metric='reshare_allowed';count=1})},
   @{success=$true;results=@(@{metric='source_text';count=$global:savedTextReleaseTextColumn})}
  )
 }
 if($sql -eq 'ALTER TABLE saved_snapshots ADD COLUMN source_text TEXT;'){
  $global:savedTextReleaseCalls.Add('alter');$global:savedTextReleaseTextColumn=1;return 'ok'
 }
 if($sql -match '^\s*UPDATE saved_snapshots SET source_text='){
  if($sql.Contains('ALTER TABLE') -or $sql.Contains('--')){throw 'Unsafe backfill command boundary'}
  $global:savedTextReleaseCalls.Add('backfill')
  if($global:savedTextReleaseFailure -eq 'backfill'){$global:LASTEXITCODE=1;return 'backfill failed'}
  return 'ok'
 }
 if($sql -match '^SELECT COUNT\(\*\) AS legacy_text_unavailable'){$global:savedTextReleaseCalls.Add('audit');return '0'}
 throw "Unexpected CLI arguments: $CliArgs"
}
try{
 & './scripts/apply-saved-question-text.ps1' -CheckOnly | Out-Null
 if(($global:savedTextReleaseCalls -join ',') -ne 'check' -or $global:savedTextReleaseTextColumn -ne 0){throw 'CheckOnly wrote data'}
 $global:savedTextReleaseCalls.Clear()
 & './scripts/apply-saved-question-text.ps1' | Out-Null
 if(($global:savedTextReleaseCalls -join ',') -ne 'check,bookmark,alter,backfill,check,audit'){throw 'Wrong apply order'}
 $global:savedTextReleaseCalls.Clear()
 & './scripts/apply-saved-question-text.ps1' | Out-Null
 if($global:savedTextReleaseCalls.Contains('alter')){throw 'Repeated ALTER'}
 foreach($failure in @('schema','bookmark','backfill')){
  $global:savedTextReleaseTextColumn=0;$global:savedTextReleaseFailure=$failure;$global:savedTextReleaseCalls.Clear();$stopped=$false
  try{& './scripts/apply-saved-question-text.ps1' | Out-Null}catch{$stopped=$true}
  if(-not $stopped -or $global:savedTextReleaseCalls.Contains('audit')){throw 'Failed migration continued'}
  if($failure -ne 'backfill' -and $global:savedTextReleaseCalls.Contains('alter')){throw 'Mutation despite failed prerequisite'}
  $global:savedTextReleaseFailure=''
  if($failure -eq 'backfill'){
   $global:savedTextReleaseCalls.Clear();& './scripts/apply-saved-question-text.ps1' | Out-Null
   if($global:savedTextReleaseCalls.Contains('alter') -or -not $global:savedTextReleaseCalls.Contains('audit')){throw 'Partial retry failed'}
  }
 }
 Write-Output 'PASS: check-only, bookmark before write, repeat, failure stops and partial retry; zero remote calls'
}finally{Remove-Item Function:\node}
