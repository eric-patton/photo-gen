@echo off
call "%~dp0node_modules\.bin\tsx.cmd" "%~dp0cli\src\index.ts" %*
exit /b %errorlevel%
