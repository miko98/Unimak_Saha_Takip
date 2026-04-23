param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("desktop", "mobile")]
  [string]$Target,

  [Parameter(Mandatory = $true)]
  [string]$Version
)

$ErrorActionPreference = "Stop"

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
  throw "Version format must be semantic like 0.1.9"
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

$prefix = if ($Target -eq "desktop") { "desktop-v" } else { "mobile-v" }
$tag = "$prefix$Version"

Write-Host "Preparing release tag: $tag"

git fetch --tags origin

$existing = git tag -l $tag
if ($existing) {
  throw "Tag already exists locally: $tag"
}

$remoteExists = git ls-remote --tags origin "refs/tags/$tag"
if ($remoteExists) {
  throw "Tag already exists on remote: $tag"
}

git pull --ff-only origin main
git tag $tag
git push origin $tag

Write-Host ""
Write-Host "Done. Triggered release with tag: $tag"
