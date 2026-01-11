# Fix syntax errors from previous script
$files = Get-ChildItem "src/providers/*.ts"

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    
    # Fix broken getErrorMessage calls
    $content = $content -replace "getErrorMessage\(error, '([^']+)',\s*'([^']+)'\s*\);", "getErrorMessage(error, '`$1'),`r`n                '`$2'`r`n            );"
    
    Set-Content $file.FullName $content -NoNewline
}

Write-Host "Fixed syntax errors!"
