# Fake CLI only: never starts Wrangler or contacts Cloudflare.
$ErrorActionPreference='Stop'
$global:syncCalls=[System.Collections.Generic.List[object]]::new()
$global:syncState=@{progress_seq=0;previous_status=0;source_triggers=0;version=1}
$global:syncFailure=''
function global:node {
 $global:LASTEXITCODE=0;$global:syncCalls.Add(@($args))
 if($args[0] -ne './node_modules/wrangler/bin/wrangler.js'){throw 'scalar CLI split'}
 if($args[2] -eq 'time-travel'){if($global:syncFailure -eq 'bookmark'){$global:LASTEXITCODE=1};return 'fixture bookmark'}
 if($args[2] -ne 'execute' -or $args[4] -ne '--remote'){throw 'unexpected invocation'}
 $sql=$args[6]
 if($args[-1] -eq '--json'){
  if($global:syncFailure -eq 'auth'){$global:LASTEXITCODE=1;return '{"error":{"code":7403}}'}
  if($sql -match 'cache_tables'){
   $tables=if($global:syncFailure -eq 'prereq'){0}else{3}
   return @(@{success=$true;results=@(@{metric='cache_tables';count=$tables},@{metric='cache_triggers';count=28},@{metric='progress_seq';count=$global:syncState.progress_seq},@{metric='previous_status';count=$global:syncState.previous_status},@{metric='source_triggers';count=$global:syncState.source_triggers})})|ConvertTo-Json -Depth 6 -Compress
  }
  return @(@{success=$true;results=@(@{schema_version=$global:syncState.version;ready=1;missing_versions=0})})|ConvertTo-Json -Depth 6 -Compress
 }
 if($global:syncFailure -eq 'ddl'){$global:LASTEXITCODE=1;return 'fixture DDL error'}
 if($sql -match '^ALTER TABLE items ADD COLUMN (progress_seq|previous_status)'){
  $key=$Matches[1];if($global:syncState[$key] -eq 1){throw 'duplicate ALTER'};$global:syncState[$key]=1
 }else{
  if($sql -match '--' -or $sql -match 'ALTER TABLE' -or $sql -notmatch 'CREATE TRIGGER IF NOT EXISTS source_work_shared_update'){throw 'malformed tail SQL'}
  $global:syncState.source_triggers=2;$global:syncState.version=2
 }
 return 'fixture applied'
}
try{
 & ./scripts/apply-shared-source-sync.ps1 -WranglerMode local -CheckOnly|Out-Null
 if($global:syncCalls.Count -ne 2 -or $global:syncState.progress_seq -ne 0){throw 'CheckOnly mutated'}
 $global:syncCalls.Clear();& ./scripts/apply-shared-source-sync.ps1 -WranglerMode local|Out-Null
 if($global:syncCalls.Count -ne 8 -or $global:syncState.version -ne 2){throw 'initial install failed'}
 $global:syncCalls.Clear();& ./scripts/apply-shared-source-sync.ps1 -WranglerMode local|Out-Null
 if($global:syncCalls.Count -ne 2){throw 'repeat writes'}
 $global:syncState=@{progress_seq=1;previous_status=0;source_triggers=1;version=1}
 & ./scripts/apply-shared-source-sync.ps1 -WranglerMode local|Out-Null
 if($global:syncState.previous_status -ne 1 -or $global:syncState.source_triggers -ne 2){throw 'interrupted install not repaired'}
 foreach($failure in @('auth','prereq','bookmark','ddl')){
  $global:syncCalls.Clear();$global:syncState=@{progress_seq=0;previous_status=0;source_triggers=0;version=1};$global:syncFailure=$failure;$stopped=$false
  try{& ./scripts/apply-shared-source-sync.ps1 -WranglerMode local|Out-Null}catch{$stopped=$true}
  if(-not $stopped -or $global:syncState.progress_seq -ne 0){throw "failure didn't stop: $failure"}
 }
 Write-Output 'PASS: 0006 release CheckOnly, repeat, partial repair and failures; fake CLI only'
}finally{Remove-Item -LiteralPath Function:\node -ErrorAction SilentlyContinue}
