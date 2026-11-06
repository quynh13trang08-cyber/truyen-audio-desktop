@echo off
chcp 65001 >nul
where node >nul 2>nul
if errorlevel 1 (
  echo Chua tim thay Node.js. Hay cai Node.js 22 tro len hoac dung GitHub Actions theo README.md.
  pause
  exit /b 1
)
call npm install
if errorlevel 1 goto :error
call npm run dist:win
if errorlevel 1 goto :error
echo.
echo Hoan tat. File cai dat nam trong thu muc dist.
pause
exit /b 0
:error
echo Co loi khi cai goi hoac dong goi. Xem thong bao phia tren.
pause
exit /b 1
