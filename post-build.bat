@echo off

REM Copy all remaining files from .\src to .\dist
xcopy .\src .\dist /E /Y /I

REM Make tampermonkey script variant with filled placeholders
REM Read .\dist\client\index.user.js, Replace SERVER_URL with http://localhost:3000", Save to .\dist\client\index.hr.user.js
powershell -Command "(gc .\dist\client\index.user.js) -replace 'SERVER_URL', 'http://localhost:3000' | Out-File -encoding ASCII .\dist\client\index.hr.user.js"