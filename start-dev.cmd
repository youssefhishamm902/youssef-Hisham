@echo off
set "SHOPIFY_CLI=%APPDATA%\nvm\v22.22.2\node_modules\@shopify\cli\bin\run.js"

if not exist "%SHOPIFY_CLI%" (
  set "SHOPIFY_CLI=%ProgramFiles%\nodejs\node_modules\@shopify\cli\bin\run.js"
)

node --network-family-autoselection-attempt-timeout=5000 "%SHOPIFY_CLI%" theme dev
