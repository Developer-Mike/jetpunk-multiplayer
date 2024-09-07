@echo off

REM Copy the styles.css file to the dist folder
copy .\src\client\styles.css .\dist\client\styles.css

REM Make tampermonkey script variant with filled placeholders
REM Read .\dist\client\index.user.js, Replace SERVER_URL with http://localhost:3000", Save to .\dist\client\index.hr.user.js
powershell -Command "(gc .\dist\client\index.user.js) -replace 'SERVER_URL', 'http://localhost:3000' | Out-File -encoding ASCII .\dist\client\index.hr.user.js"

REM Start the server
cd .\dist
node .\index.js