$d = 'C:\Users\newye\AppData\Local\Temp\claude\e--boi\0bee0b0d-c310-483c-a127-fbee8095eeb1\scratchpad\fees'
foreach ($i in 10..96) {
  $f = "$d\p$i.json"
  if ((Test-Path $f) -and (Get-Item $f).Length -gt 200 -and $i -eq 10) { continue }
  for ($t = 1; $t -le 3; $t++) {
    $code = curl.exe -s -S -m 120 -o $f -w "%{http_code}" "https://exp.coj.go.th/api/v1/search?prov_id=$i"
    if ($code -eq '200') { break }; Start-Sleep -Seconds (2 * $t)
  }
  Add-Content "$d\_log.txt" "$i $code $((Get-Item $f -ErrorAction SilentlyContinue).Length)"
  Start-Sleep -Milliseconds 300
}
Add-Content "$d\_log.txt" 'DONE'
