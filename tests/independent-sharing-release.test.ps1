# Simulated Wrangler only; no Cloudflare requests or real schema mutations.
$ErrorActionPreference='Stop'
$global:shareCalls=[System.Collections.Generic.List[object]]::new()
$global:shareState=@{allow_reshare=0;reshare_allowed=0;share_tables=0;share_trigger=0;share_view=0;share_indexes=0;source_triggers=2;source_columns=2}
$global:shareFailure=''
function global:node {
 $global:LASTEXITCODE=0;$global:shareCalls.Add(@($args))
 if($args[0] -ne './node_modules/wrangler/bin/wrangler.js'){throw 'CLI arguments split'}
 if($args[2] -eq 'time-travel'){if($global:shareFailure -eq 'bookmark'){$global:LASTEXITCODE=1};return 'fixture bookmark'}
 if($args[2] -ne 'execute' -or $args[4] -ne '--remote'){throw 'unexpected invocation'}
 $sql=$args[6]
 if($args[-1] -eq '--json'){
  if($global:shareFailure -eq 'auth'){$global:LASTEXITCODE=1;return '{"error":{"code":7403}}'}
  if($sql -match 'missing_share_refs'){
   $missing=if($global:shareFailure -eq 'audit'){1}else{0}
   return @(@{success=$true;results=@(@{missing_share_refs=$missing})})|ConvertTo-Json -Depth 6 -Compress
  }
  $rows=@();foreach($key in $global:shareState.Keys){$count=$global:shareState[$key];if($global:shareFailure -eq 'prereq' -and $key -eq 'source_triggers'){$count=0};$rows+=@{metric=$key;count=$count}}
  return @(@{success=$true;results=$rows})|ConvertTo-Json -Depth 6 -Compress
 }
 if($global:shareFailure -eq 'ddl'){$global:LASTEXITCODE=1;return 'fixture DDL error'}
 if($sql -match '^ALTER TABLE (collections|saved_snapshots) ADD COLUMN (allow_reshare|reshare_allowed)'){
  $key=$Matches[2];if($global:shareState[$key] -eq 1){throw 'duplicate ALTER'};$global:shareState[$key]=1
 }else{
  if($sql -match '--' -or $sql -match 'ALTER TABLE' -or $sql -notmatch 'CREATE VIEW IF NOT EXISTS asset_reference_inventory'){throw 'malformed tail SQL'}
  $global:shareState.share_tables=2;$global:shareState.share_trigger=1;$global:shareState.share_view=1;$global:shareState.share_indexes=4
 }
 return 'fixture applied'
}
try{
 & ./scripts/apply-independent-shares.ps1 -WranglerMode local -CheckOnly|Out-Null
 if($global:shareCalls.Count -ne 1 -or $global:shareState.allow_reshare -ne 0){throw 'CheckOnly mutated'}
 $global:shareCalls.Clear();& ./scripts/apply-independent-shares.ps1 -WranglerMode local|Out-Null
 if($global:shareCalls.Count -ne 7 -or $global:shareState.share_indexes -ne 4){throw 'initial install failed'}
 $global:shareCalls.Clear();& ./scripts/apply-independent-shares.ps1 -WranglerMode local|Out-Null
 if($global:shareCalls.Count -ne 1){throw 'repeat writes'}
 $global:shareState.reshare_allowed=0;$global:shareState.share_trigger=0
 & ./scripts/apply-independent-shares.ps1 -WranglerMode local|Out-Null
 if($global:shareState.reshare_allowed -ne 1 -or $global:shareState.share_trigger -ne 1){throw 'interrupted run not repaired'}
 foreach($failure in @('auth','prereq','bookmark','ddl','audit')){
  $global:shareCalls.Clear();$global:shareState.allow_reshare=0;$global:shareState.reshare_allowed=0;$global:shareState.share_tables=0;$global:shareFailure=$failure;$stopped=$false
  try{& ./scripts/apply-independent-shares.ps1 -WranglerMode local|Out-Null}catch{$stopped=$true}
  if(-not $stopped){throw "failure did not stop: $failure"}
  if($failure -ne 'audit' -and $global:shareState.allow_reshare -ne 0){throw "failure mutated: $failure"}
 }
 Write-Output 'PASS: 0007 CheckOnly, partial retry, repeat, permissions, bookmark, DDL and missing refs; simulated CLI only'
}finally{Remove-Item -LiteralPath Function:\node -ErrorAction SilentlyContinue}
