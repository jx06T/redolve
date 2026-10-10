# Exercises the release script with fake CLIs; never contacts Cloudflare.
$ErrorActionPreference = 'Stop'
$global:readerReleaseTestSchemaFixture = (Get-Content -LiteralPath './scripts/reader-ux-schema.sql' -Encoding UTF8) -join ' '
$global:readerReleaseTestStarredDdl = 'ALTER TABLE collection_item_reads ADD COLUMN starred INTEGER NOT NULL DEFAULT 0 CHECK(starred IN (0,1));'
$global:readerReleaseTestClassificationDdl = "ALTER TABLE saved_refs ADD COLUMN classification_state TEXT NOT NULL DEFAULT 'ready' CHECK(classification_state IN ('ready','pending','failed','manual'));"

function Assert-ReaderArgv($Actual, $Expected) {
    if ($Actual.Count -ne $Expected.Count) { throw "Wrong argument count: $($Actual.Count), expected $($Expected.Count)" }
    for ($readerIndex=0; $readerIndex -lt $Expected.Count; $readerIndex++) {
        if ($Actual[$readerIndex] -cne $Expected[$readerIndex]) { throw "Wrong argument at index ${readerIndex}: $($Actual[$readerIndex])" }
    }
}
function Invoke-ReaderFixture([string]$Cli, [object[]]$CliArgs) {
    $global:LASTEXITCODE=0
    if ($Cli -ne $global:readerReleaseTestExpectedCli) { throw "Unexpected CLI: $Cli" }
    $readerPrefix = if ($Cli -eq 'node') { './node_modules/wrangler/bin/wrangler.js' } else { 'wrangler' }
    $global:readerReleaseTestCalls.Add(@{Cli=$Cli;Arguments=@($CliArgs)})
    if ($CliArgs.Count -eq 5 -and $CliArgs[2] -eq 'time-travel') {
        Assert-ReaderArgv $CliArgs @($readerPrefix,'d1','time-travel','info','redolve-db')
        if ($global:readerReleaseTestFailBookmark) { $global:LASTEXITCODE=1 }
        return 'bookmark-fixture'
    }
    if ($CliArgs.Count -lt 7) { throw 'CLI prefix or SQL argument was split' }
    $readerSql = $CliArgs[6]
    if ($readerSql -eq $global:readerReleaseTestSchemaFixture) {
        Assert-ReaderArgv $CliArgs @($readerPrefix,'d1','execute','redolve-db','--remote','--command',$global:readerReleaseTestSchemaFixture,'--json')
        if ($global:readerReleaseTestFailSchema) { $global:LASTEXITCODE=1; return 'CLI failed' }
        return ConvertTo-Json -Compress -Depth 5 @(
            @{success=(-not $global:readerReleaseTestSchemaResultFailure);results=@(@{metric='reader_tables';count=$global:readerReleaseTestTables})},
            @{success=$true;results=@(@{metric='starred_column';count=$global:readerReleaseTestStarred})},
            @{success=$true;results=@(@{metric='classification_column';count=$global:readerReleaseTestClassification})}
        )
    }
    if ($readerSql -notin @($global:readerReleaseTestStarredDdl,$global:readerReleaseTestClassificationDdl)) { throw 'Unexpected SQL' }
    Assert-ReaderArgv $CliArgs @($readerPrefix,'d1','execute','redolve-db','--remote','--command',$readerSql)
    if ($readerSql -eq $global:readerReleaseTestClassificationDdl -and $global:readerReleaseTestFailClassification) { $global:LASTEXITCODE=1; return 'DDL failed' }
    if ($readerSql -eq $global:readerReleaseTestStarredDdl) { $global:readerReleaseTestStarred=1 } else { $global:readerReleaseTestClassification=1 }
    return 'ok'
}
function Reset-ReaderFixture([int]$Starred=0, [int]$Classification=0) {
    $global:readerReleaseTestTables=2; $global:readerReleaseTestStarred=$Starred; $global:readerReleaseTestClassification=$Classification
    $global:readerReleaseTestCalls=[System.Collections.Generic.List[object]]::new()
    $global:readerReleaseTestFailBookmark=$false; $global:readerReleaseTestFailSchema=$false
    $global:readerReleaseTestSchemaResultFailure=$false; $global:readerReleaseTestFailClassification=$false
}
function Get-ReaderDdlCount {
    return @($global:readerReleaseTestCalls | Where-Object { $_.Arguments.Count -ge 7 -and $_.Arguments[6] -like 'ALTER TABLE*' }).Count
}
function Invoke-ReaderScript {
    # Exercise the exact no-parameter command shown in the release guide for auto mode.
    if ($global:readerReleaseTestMode -eq 'auto') { & ./scripts/apply-reader-ux.ps1 }
    else { & ./scripts/apply-reader-ux.ps1 -WranglerMode $global:readerReleaseTestMode }
}
function Assert-ReaderStopped([int]$DdlCount=0) {
    $readerFailed=$false
    try { Invoke-ReaderScript 6>&1 | Out-Null } catch { $readerFailed=$true }
    if (-not $readerFailed -or (Get-ReaderDdlCount) -ne $DdlCount) { throw 'Failure did not stop as expected' }
}

if ((Test-Path Function:\npx) -or (Test-Path Function:\node)) { throw 'Run this test in a shell without custom node/npx functions' }
function global:npx { Invoke-ReaderFixture -Cli npx -CliArgs @($args) }
function global:node { Invoke-ReaderFixture -Cli node -CliArgs @($args) }
try {
    foreach ($global:readerReleaseTestMode in @('npx','local','auto')) {
        $global:readerReleaseTestExpectedCli = if ($global:readerReleaseTestMode -eq 'npx') { 'npx' } else { 'node' }
        foreach ($readerCase in @(@(0,0,2),@(1,0,1),@(0,1,1),@(1,1,0))) {
            Reset-ReaderFixture -Starred $readerCase[0] -Classification $readerCase[1]
            $readerOutput = (Invoke-ReaderScript) -join ' '
            if ((Get-ReaderDdlCount) -ne $readerCase[2]) { throw 'Wrong DDL count' }
            if ($global:readerReleaseTestStarred -ne 1 -or $global:readerReleaseTestClassification -ne 1) { throw 'Missing column' }
            if ($readerOutput -notlike '*reader_tables=2*' -or $readerOutput -notlike '*starred_column=1*' -or $readerOutput -notlike '*classification_column=1*') { throw 'Missing release metrics' }
            if ($readerCase[2] -eq 0 -and $global:readerReleaseTestCalls.Count -ne 1) { throw 'Already applied migration performed extra operations' }
        }
        Reset-ReaderFixture; $global:readerReleaseTestFailBookmark=$true; Assert-ReaderStopped
        Reset-ReaderFixture; $global:readerReleaseTestTables=0; Assert-ReaderStopped
        Reset-ReaderFixture; $global:readerReleaseTestFailSchema=$true; Assert-ReaderStopped
        Reset-ReaderFixture; $global:readerReleaseTestSchemaResultFailure=$true; Assert-ReaderStopped
        Reset-ReaderFixture; $global:readerReleaseTestClassification=2; Assert-ReaderStopped
        Reset-ReaderFixture; $global:readerReleaseTestFailClassification=$true; Assert-ReaderStopped -DdlCount 2
        if ($global:readerReleaseTestStarred -ne 1 -or $global:readerReleaseTestClassification -ne 0) { throw 'Wrong partial failure state' }
        $global:readerReleaseTestFailClassification=$false; $global:readerReleaseTestCalls.Clear()
        Invoke-ReaderScript | Out-Null
        if ((Get-ReaderDdlCount) -ne 1 -or $global:readerReleaseTestClassification -ne 1) { throw 'Retry did not apply only missing column' }
    }
    Write-Output 'PASS: 33 scenarios across npx/local/default auto; exact argument boundaries, guarded migration and partial-failure retry; zero remote calls'
} finally {
    Remove-Item Function:\npx
    Remove-Item Function:\node
}
