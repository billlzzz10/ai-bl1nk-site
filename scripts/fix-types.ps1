# Fix all provider type errors
$providers = @(
    "local",
    "generic", 
    "bedrock",
    "cohere",
    "voyage",
    "gemini"
)

foreach ($provider in $providers) {
    $file = "src/providers/$provider.ts"
    Write-Host "Fixing $file..."
    
    # Read file
    $content = Get-Content $file -Raw
    
    # Add import if not exists
    if ($content -notmatch "import.*type-guards") {
        $content = $content -replace "(import.*UpstreamError.*from.*'../utils/errors';)", "`$1`r`nimport { getErrorMessage, isApiResponse } from '../utils/type-guards';"
    }
    
    # Fix error handling
    $content = $content -replace "const error = await response\.json\(\);", "const error: unknown = await response.json();"
    $content = $content -replace "error\.error\?\.message \|\| '", "getErrorMessage(error, '"
    $content = $content -replace "error\.message \|\| '", "getErrorMessage(error, '"
    
    # Fix data handling
    $content = $content -replace "const data = await response\.json\(\);", "const data: unknown = await response.json();`r`n        if (!isApiResponse(data)) {`r`n            throw new UpstreamError('Invalid response from $provider', '$provider');`r`n        }`r`n        "
    
    # Write back
    Set-Content $file $content -NoNewline
}

Write-Host "Done!"
