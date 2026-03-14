# Start the NewEra frontend dev server
Set-Location "$PSScriptRoot\frontend"
Write-Host "Starting NewEra frontend on http://localhost:3001 (see frontend/.env to change PORT)" -ForegroundColor Cyan
npm start
