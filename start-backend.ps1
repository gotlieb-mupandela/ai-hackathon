Set-Location "$PSScriptRoot\backend"
Write-Host "Starting NewEra backend on http://localhost:8000" -ForegroundColor Green
uvicorn main:app --reload
