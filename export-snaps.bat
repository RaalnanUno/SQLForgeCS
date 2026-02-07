@echo off
setlocal EnableExtensions EnableDelayedExpansion

echo Generating markdown snapshots and prompt index...
echo.

REM ================================================
REM 1) Copy specific root files to .md (if present)
REM ================================================
for %%F in (
  "program.cs"
) do (
  if exist "%%~F" (
    copy /y "%%~F" "%%~dpnF.md" >nul
    echo Copied root file: %%~F → %%~dpnF.md
  )
)

REM =======================================================
REM 2) Copy ALL .ts/.tsx under src to corresponding .md
REM =======================================================
for /r "servercs" %%F in ("*.cs") do (
  copy /y "%%~fF" "%%~dpnF.md" >nul
  echo Copied: %%~fF → %%~dpnF.md
)

for /r "Controllers" %%F in ("*.cs") do (
  copy /y "%%~fF" "%%~dpnF.md" >nul
  echo Copied: %%~fF → %%~dpnF.md
)

for /r "Models" %%F in ("*.cs") do (
  copy /y "%%~fF" "%%~dpnF.md" >nul
  echo Copied: %%~fF → %%~dpnF.md
)



for /r "reactui\src" %%F in (*.ts *.tsx) do (
  copy /y "%%~fF" "%%~dpnF.md" >nul
  echo Copied: %%~fF → %%~dpnF.md
)

for /r "shared" %%F in (*.ts *.tsx) do (
  copy /y "%%~fF" "%%~dpnF.md" >nul
  echo Copied: %%~fF → %%~dpnF.md
)


REM =======================================================
REM 3) Build prompt.md with path headers and relative links
REM =======================================================
set "ROOT=%CD%"
if exist "prompt.md" (
  del "prompt.md"
)

echo.
echo Building prompt.md index...
echo.

REM 3a) Root-level md files we generated
for %%F in (
  "package.md",
  "program.md"
) do (
  if exist "%%~F" (
    >>"prompt.md" echo ## %%~nxF
    >>"prompt.md" echo.
    >>"prompt.md" echo ^^![[%%~nxF]]
    >>"prompt.md" echo.
    echo Indexed root: %%~nxF
  )
)

REM 3b) All md files under src/** (includes subdirs)
for /r "servercs" %%F in (*.md) do (
  if /I not "%%~nxF"=="prompt.md" (
    set "abs=%%~fF"
    set "rel=!abs:%ROOT%\=!"
    set "rel=!rel:\=/!"
    set "orig=!rel:.md=.cs!"
    >>"prompt.md" echo ## !orig!
    >>"prompt.md" echo.
    >>"prompt.md" echo ^^![[!rel!]]
    >>"prompt.md" echo.
    echo Indexed: !orig!
  )
)

for /r "Controllers" %%F in (*.md) do (
  if /I not "%%~nxF"=="prompt.md" (
    set "abs=%%~fF"
    set "rel=!abs:%ROOT%\=!"
    set "rel=!rel:\=/!"
    set "orig=!rel:.md=.cs!"
    >>"prompt.md" echo ## !orig!
    >>"prompt.md" echo.
    >>"prompt.md" echo ^^![[!rel!]]
    >>"prompt.md" echo.
    echo Indexed: !orig!
  )
)

for /r "Models" %%F in (*.md) do (
  if /I not "%%~nxF"=="prompt.md" (
    set "abs=%%~fF"
    set "rel=!abs:%ROOT%\=!"
    set "rel=!rel:\=/!"
    set "orig=!rel:.md=.cs!"
    >>"prompt.md" echo ## !orig!
    >>"prompt.md" echo.
    >>"prompt.md" echo ^^![[!rel!]]
    >>"prompt.md" echo.
    echo Indexed: !orig!
  )
)

REM 3b) All md files under src/** (includes subdirs)
for /r "reactui\src" %%F in (*.md) do (
  if /I not "%%~nxF"=="prompt.md" (
    set "abs=%%~fF"
    set "rel=!abs:%ROOT%\=!"
    set "rel=!rel:\=/!"
    set "orig=!rel:.md=.ts!"
    >>"prompt.md" echo ## !orig!
    >>"prompt.md" echo.
    >>"prompt.md" echo ^^![[!rel!]]
    >>"prompt.md" echo.
    echo Indexed: !orig!
  )
)

for /r "shared" %%F in (*.md) do (
  if /I not "%%~nxF"=="prompt.md" (
    set "abs=%%~fF"
    set "rel=!abs:%ROOT%\=!"
    set "rel=!rel:\=/!"
    set "orig=!rel:.md=.ts!"
    >>"prompt.md" echo ## !orig!
    >>"prompt.md" echo.
    >>"prompt.md" echo ^^![[!rel!]]
    >>"prompt.md" echo.
    echo Indexed: !orig!
  )
)



echo.
echo ========================================
echo Finished!
echo Created markdown snapshots and prompt.md
echo ========================================

endlocal
pause
