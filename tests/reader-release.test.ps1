# Exercises the release script with a fake CLI; never contacts Cloudflare.
$ErrorActionPreference = 'Stop'
function global:npx {
    $global:LASTEXITCODE = 0
    $readerInvocation = $args -join ' '
    $global:readerCalls.Add($readerInvocation)
    if ($readerInvocation -like '*time-travel*') {
        if ($global:readerFailBookmark) { $global:LASTEXITCODE=1 }
        return 'bookmark-fixture'
    }
    if ($readerInvocation -like '*ALTER TABLE collection_item_reads*') { $global:readerStarred=1; return 'ok' }
    if ($readerInvocation -like '*ALTER TABLE saved_refs*') { $global:readerClassification=1; return 'ok' }
    return ConvertTo-Json -Compress -Depth 5 @(@{results=@(@{metric='reader_tables';count=$global:readerTables})},@{results=@(@{metric='starred_column';count=$global:readerStarred})},@{results=@(@{metric='classification_column';count=$global:readerClassification})})
}
try {
    foreach($readerCase in @(@(0,0,2),@(1,0,1),@(0,1,1),@(1,1,0))) {
        $global:readerTables=2;$global:readerStarred=$readerCase[0];$global:readerClassification=$readerCase[1]
        $global:readerCalls=[System.Collections.Generic.List[string]]::new();$global:readerFailBookmark=$false
        & ./scripts/apply-reader-ux.ps1 | Out-Null
        if(($global:readerCalls | Where-Object { $_ -like '*ALTER TABLE*' }).Count -ne $readerCase[2]) { throw 'Wrong DDL count' }
        if($global:readerStarred -ne 1 -or $global:readerClassification -ne 1) { throw 'Missing column' }
    }
    $global:readerStarred=0;$global:readerClassification=0;$global:readerFailBookmark=$true
    $global:readerCalls=[System.Collections.Generic.List[string]]::new();$readerFailed=$false
    try { & ./scripts/apply-reader-ux.ps1 | Out-Null } catch { $readerFailed=$true }
    if(-not $readerFailed -or ($global:readerCalls | Where-Object { $_ -like '*ALTER TABLE*' }).Count -ne 0) { throw 'Failed bookmark did not stop DDL' }
    $global:readerFailBookmark=$false;$global:readerTables=0;$global:readerCalls=[System.Collections.Generic.List[string]]::new();$readerFailed=$false
    try { & ./scripts/apply-reader-ux.ps1 | Out-Null } catch { $readerFailed=$true }
    if(-not $readerFailed -or ($global:readerCalls | Where-Object { $_ -like '*ALTER TABLE*' }).Count -ne 0) { throw 'Missing sharing tables did not stop DDL' }
    Write-Output 'PASS: clean/partial/already-applied migration and bookmark/schema failure stops; zero remote calls'
} finally { Remove-Item Function:\npx }
