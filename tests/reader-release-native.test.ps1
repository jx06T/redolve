# Runs a real Node subprocess with a fixture; zero Cloudflare calls or DDL.
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
if (Test-Path Function:\node) { throw 'Run without a custom node function' }
$global:readerReleaseNativeNode = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$readerPreviousCase = $env:READER_RELEASE_TEST_CASE
$readerPreviousCalls = $env:READER_RELEASE_TEST_CALLS
$readerNativeOutputDir = Join-Path (Get-Location).Path '.wrangler/reader-native-test'
New-Item -ItemType Directory -Path $readerNativeOutputDir -Force | Out-Null
$env:READER_RELEASE_TEST_CALLS = Join-Path $readerNativeOutputDir 'calls.jsonl'
function global:node {
    & $global:readerReleaseNativeNode './tests/fixtures/reader-wrangler-cli.cjs' @args
    $global:LASTEXITCODE = $LASTEXITCODE
}
try {
    foreach ($readerNativeCase in @('success','success-stderr','json-error','stderr-error','invalid-json')) {
        $env:READER_RELEASE_TEST_CASE = $readerNativeCase
        Set-Content -LiteralPath $env:READER_RELEASE_TEST_CALLS -Value '' -Encoding UTF8
        $readerNativeMessages = [System.Collections.Generic.List[string]]::new()
        $readerNativeFailed = $false
        try {
            & ./scripts/apply-reader-ux.ps1 -WranglerMode local -CheckOnly 6>&1 | ForEach-Object { $readerNativeMessages.Add($_.ToString()) }
        } catch { $readerNativeFailed=$true; $readerNativeMessages.Add($_.Exception.Message) }
        $readerNativeText = $readerNativeMessages -join ' '
        $readerNativeCalls = @(Get-Content -LiteralPath $env:READER_RELEASE_TEST_CALLS | Where-Object { $_.Trim() })
        if ($readerNativeCalls.Count -ne 1) { throw 'CheckOnly/failure issued more than one schema query' }
        if ($readerNativeCase -like 'success*') {
            if ($readerNativeFailed -or $readerNativeText -notlike '*reader_tables=2*' -or $readerNativeText -notlike '*starred_column=0*') { throw "Read-only query failed: $readerNativeText" }
            if ($readerNativeCase -eq 'success-stderr' -and $readerNativeText -notlike '*fixture nonfatal stderr warning*') { throw 'Warning was lost' }
        } else {
            if (-not $readerNativeFailed) { throw "Failure case did not stop: $readerNativeCase" }
            $readerNativeExpected = switch ($readerNativeCase) {
                'json-error' { '*fixture authentication denied*' }
                'stderr-error' { '*fixture native stderr failure*' }
                'invalid-json' { '*fixture invalid JSON response*' }
            }
            if ($readerNativeText -notlike $readerNativeExpected) { throw "Original error was swallowed: $readerNativeText" }
            if ($readerNativeCase -eq 'stderr-error' -and $readerNativeText -notlike '*exit code: 7*') { throw 'Native exit code was lost' }
        }
    }
    Write-Output 'PASS: 5 native Node scenarios; stdout/stderr diagnostics, exit codes, read-only no-DDL guard; zero remote calls'
} finally {
    Remove-Item Function:\node
    Remove-Variable readerReleaseNativeNode -Scope Global
    $env:READER_RELEASE_TEST_CASE = $readerPreviousCase
    $env:READER_RELEASE_TEST_CALLS = $readerPreviousCalls
}
