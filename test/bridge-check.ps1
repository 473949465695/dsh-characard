# End-to-end check of the dsh-characard bridge (v3: split fields + character card).
# Run from PowerShell 5.1:
#   $code = Get-Content -Raw -Encoding UTF8 .\test\bridge-check.ps1; Invoke-Expression $code

$ErrorActionPreference = 'Stop'

$profileDir = 'C:\Users\冯至纯\.dsh\profiles\desktop'
$statePath = Join-Path $profileDir 'dsh-persona.json'
if (Test-Path $statePath) {
  Copy-Item $statePath "$env:TEMP\dsh-persona-backup.json" -Force
  "backup: $env:TEMP\dsh-persona-backup.json"
}

$base = $null
foreach ($port in 3731, 35736, 24406, 32801) {
  try {
    $probe = Invoke-WebRequest -Method Post -Uri "http://127.0.0.1:$port/api/dsh-characard/get" -Body ([Text.Encoding]::UTF8.GetBytes('{}')) -ContentType 'application/json; charset=utf-8' -UseBasicParsing -TimeoutSec 3
    if ($probe.StatusCode -eq 200) { $base = "http://127.0.0.1:$port"; break }
  } catch {
    # try the next port
  }
}
if (-not $base) { throw 'bridge not reachable on 24406 or 32801' }
"bridge: $base"

$imageDir = Join-Path $profileDir 'dsh-persona-images'
$png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='
$dataUrl = "data:image/png;base64,$png"
$gif = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

function Post($action, $payload) {
  $json = if ($payload -is [string]) { $payload } else { $payload | ConvertTo-Json -Depth 20 -Compress }
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $response = Invoke-WebRequest -Method Post -Uri "$base/api/dsh-characard/$action" -Body $bytes -ContentType 'application/json; charset=utf-8' -UseBasicParsing
  return $response.Content | ConvertFrom-Json
}

function Fail($message) {
  Write-Host "FAIL: $message"
  exit 1
}

# --- 1. read the library
$state = Post 'get' '{}'
if (-not $state.ok) { Fail 'get did not answer ok' }
$activeId = $state.value.activeId
$baseIds = @($state.value.personas | ForEach-Object { $_.id })
$primary = $state.value.personas | Where-Object { $_.id -eq $activeId } | Select-Object -First 1
if (-not $primary) { Fail 'no active persona' }
"get: count=$($state.value.personas.Count) activeName=$($primary.name) bioLen=$($primary.bio.Length) active=$($state.active)"

# --- 2. export carries the split fields and the images array
$exported = Post 'export' '{}'
if ($exported.value.schema -ne 'dsh-persona/v2') { Fail "unexpected schema $($exported.value.schema)" }
$exportedPrimary = $exported.value.personas | Where-Object { $_.id -eq $activeId } | Select-Object -First 1
foreach ($field in @('name', 'bio', 'likes', 'relations', 'appearance', 'userRelation', 'specialty', 'style', 'rules', 'images')) {
  if (-not ($exportedPrimary.PSObject.Properties.Name -contains $field)) { Fail "export misses $field" }
}
"export: schema=$($exported.value.schema) count=$($exported.value.personas.Count) imagesOnPrimary=$($exportedPrimary.images.Count)"

# --- 2b. the Tavern card format returns one chara_card_v3 card for the active persona
$cardExport = Post 'export' (@{ format = 'v3'; id = $activeId } | ConvertTo-Json -Compress)
if ($cardExport.format -ne 'chara_card_v3') { Fail "v3 export format $($cardExport.format)" }
if ($cardExport.value.spec -ne 'chara_card_v3' -or $cardExport.value.spec_version -ne '3.0') { Fail 'v3 spec header missing' }
if ($cardExport.value.data.name -ne $primary.name) { Fail "v3 card name $($cardExport.value.data.name)" }
foreach ($section in @('个人简介', '喜好', '穿着外貌', '与用户关系', '说话方式', '必须遵守')) {
  if (-not $cardExport.value.data.description.Contains($section)) { Fail "v3 card misses $section" }
}
"v3-export: file=$($cardExport.fileName) descLen=$($cardExport.value.data.description.Length)"

# --- 3. save a throw-away persona with every split field filled
$fixture = @{
  name         = '测试人设乙'
  bio          = '一段简介。'
  likes        = '甜食。'
  relations    = '熟人。'
  appearance   = '旧外套。'
  userRelation = '主仆好友。'
  specialty    = '修钟。'
  style        = '懒散。'
  rules        = '别回怼。'
}
$saved = Post 'save' $fixture
$testId = $saved.personaId
$baseCount = $state.value.personas.Count
if ($saved.value.personas.Count -ne ($baseCount + 1)) { Fail "count should be $($baseCount + 1) after save" }
if ($saved.value.activeId -ne $activeId) { Fail 'save switched the active persona' }
"save: newId=$testId count=$($saved.value.personas.Count) activeUnchanged=True"

# --- 4. upload an image into the top-left slot
$withImage = Post 'image' @{ id = $testId; slot = 0; dataUrl = $dataUrl }
$testPersona = $withImage.value.personas | Where-Object { $_.id -eq $testId } | Select-Object -First 1
if ($testPersona.images.Count -ne 1) { Fail 'image was not stored' }
if (-not $testPersona.images[0].dataUrl.StartsWith('data:image/png;base64,')) { Fail 'image data URL looks wrong' }
$onDisk = Join-Path $imageDir "$testId-0.png"
if (-not (Test-Path $onDisk)) { Fail 'image file missing on disk' }
"image: slot=$($testPersona.images[0].slot) bytes=$((Get-Item $onDisk).Length) fileExists=True"

# --- 5. replace it with a GIF and make sure the old PNG is gone
$replaced = Post 'image' @{ id = $testId; slot = 0; dataUrl = "data:image/gif;base64,$gif" }
$testPersona = $replaced.value.personas | Where-Object { $_.id -eq $testId } | Select-Object -First 1
if (-not $testPersona.images[0].dataUrl.StartsWith('data:image/gif;base64,')) { Fail 'replacement did not stick' }
if (Test-Path $onDisk) { Fail 'old png was not removed' }
$gifOnDisk = Join-Path $imageDir "$testId-0.gif"
if (-not (Test-Path $gifOnDisk)) { Fail 'gif file missing on disk' }
"image-replace: gif stored, png removed"

# --- 6. an unsupported format is rejected
$rejected = $false
try {
  Post 'image' @{ id = $testId; slot = 1; dataUrl = 'data:image/bmp;base64,AAAA' } | Out-Null
} catch {
  $rejected = $true
}
if (-not $rejected) { Fail 'bmp should be rejected' }
"image-reject: unsupported format refused"

# --- 7. export embeds the image, import restores it
$snapshot = Post 'export' '{}'
$withImageExport = $snapshot.value.personas | Where-Object { $_.id -eq $testId } | Select-Object -First 1
if ($withImageExport.images.Count -ne 1) { Fail 'export did not embed the image' }
$json = $snapshot.value | ConvertTo-Json -Depth 20 -Compress
$imported = Post 'import' @{ data = $json }
$expectedImport = $baseCount + 1
if ($imported.imported -ne $expectedImport) { Fail "import should bring $expectedImport personas, got $($imported.imported)" }
$importedPersona = $imported.value.personas | Where-Object { $_.name -eq '测试人设乙' -and $_.id -ne $testId } | Select-Object -First 1
if (-not $importedPersona) { Fail 'imported persona missing' }
if ($importedPersona.images.Count -ne 1) { Fail 'imported persona lost its image' }
$importedFile = Join-Path $imageDir "$($importedPersona.id)-0.gif"
if (-not (Test-Path $importedFile)) { Fail 'imported image file missing on disk' }
"import: imported=$($imported.imported) count=$($imported.value.personas.Count) importedImageSlot=$($importedPersona.images[0].slot)"

# --- 8. activate the throw-away persona, then put the original back
$activated = Post 'activate' @{ id = $testId; enabled = $true }
if ($activated.value.activeId -ne $testId) { Fail 'activate did not switch' }
$restored = Post 'activate' @{ id = $activeId; enabled = $true }
if ($restored.value.activeId -ne $activeId) { Fail 'restore did not switch back' }
"activate: switched and restored"

# --- 9. remove every persona this check created (test fixture + the imported copies); the user's library must stay untouched
foreach ($persona in (Post 'get' '{}').value.personas) {
  if ($baseIds -notcontains $persona.id) { Post 'delete' @{ id = $persona.id } | Out-Null }
}
if (Test-Path $gifOnDisk) { Fail 'deleted persona kept its image' }
if (Test-Path $importedFile) { Fail 'deleted imported persona kept its image' }
$afterDelete = Post 'get' '{}'
if ($afterDelete.value.personas | Where-Object { $_.id -eq $testId }) { Fail 'test persona is still present' }
if ($afterDelete.value.personas | Where-Object { $_.id -eq $importedPersona.id }) { Fail 'imported copy is still present' }
if ($afterDelete.value.personas.Count -ne $baseCount) { Fail "cleanup left $($afterDelete.value.personas.Count) personas, expected $baseCount" }
if ($afterDelete.value.activeId -ne $activeId) { Fail 'cleanup changed the active persona' }
"delete: count=$($afterDelete.value.personas.Count) activeId=$($afterDelete.value.activeId) imagesCleanedUp=True"

# --- 10. on-disk state is version 3 and still has the same active persona
$disk = Get-Content -Raw -Encoding UTF8 $statePath | ConvertFrom-Json
if ($disk.version -ne 3) { Fail "disk version is $($disk.version)" }
if ($disk.activeId -ne $activeId) { Fail 'disk activeId changed' }
if ($disk.personas.Count -ne $baseCount) { Fail "disk has $($disk.personas.Count) personas, expected $baseCount" }
"disk: version=$($disk.version) count=$($disk.personas.Count) activeId=$($disk.activeId)"

"bridge check ok"
