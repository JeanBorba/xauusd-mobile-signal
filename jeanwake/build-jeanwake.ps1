$ErrorActionPreference = 'Continue'
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspace = Split-Path -Parent $project
$jdk = Get-ChildItem (Join-Path $workspace 'tools\java') -Directory | Select-Object -First 1
if (-not $jdk) { throw 'JDK 21 nao encontrado' }
$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = Join-Path $workspace 'android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = (Join-Path $env:JAVA_HOME 'bin') + ';C:\Program Files\Git\usr\bin;C:\Program Files\Git\bin;' + $env:Path
$gradle = Join-Path $workspace 'tools\gradle-9.6.1\bin\gradle.bat'
if (-not (Test-Path $gradle)) { throw 'Gradle nao encontrado' }
Set-Location $project
& $gradle --no-daemon --console=plain :app:assembleDebug
if ($LASTEXITCODE -ne 0) { throw 'Falha na compilacao Gradle' }
$apk = Join-Path $project 'app\build\outputs\apk\debug\app-debug.apk'
Write-Output ('APK pronto: ' + $apk)
Write-Output ('SHA256: ' + (Get-FileHash $apk -Algorithm SHA256).Hash)
