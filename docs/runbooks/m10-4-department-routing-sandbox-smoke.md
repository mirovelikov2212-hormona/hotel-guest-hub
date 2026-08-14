# M10.4 department/routing sandbox activation

M10.4 activates normalized `departments` and `routing_rules` for one sandbox
hotel only. It does not activate normalized department/routing reads for
Production and it does not change the M10.3 room marker.

## Release gates

1. Apply the patch on a branch created from current `main`.
2. Run `npm ci`, `npm test`, and `npm run build`.
3. Push the branch and wait for the Vercel Preview created by the Git
   integration. Never run `vercel --prod`.
4. Confirm the Preview loads `/h/aquamarin-test` before activation.
5. Activate only `aquamarin-test` through the protected endpoint.
6. Verify the Supabase projection state still reports `ready`, exact
   revision/checksum parity, 5/5 departments, 32/32 routing rules, no
   projection error, `runtimeRoomReadsActivated=true`, and
   `runtimeDepartmentRoutingReadsActivated=true`.
7. Smoke guest request creation and the reception/housekeeping/maintenance
   staff views in the Preview.
8. Merge only after the controlled sandbox smoke passes. Production remains
   on the M9 snapshot fallback because the new marker is sandbox-only.

## PowerShell activation

Keep `CONFIG_ADMIN_SECRET` private. Read it interactively instead of placing it
in shell history.

```powershell
$PreviewUrl = "https://YOUR-PREVIEW.vercel.app"
$ShareToken = "YOUR_VERCEL_SHARE_TOKEN"
$ConfigAdminSecret = Read-Host "CONFIG_ADMIN_SECRET"

$Session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-WebRequest -UseBasicParsing `
  -Uri "$PreviewUrl/h/aquamarin-test?_vercel_share=$ShareToken" `
  -WebSession $Session | Out-Null

$Headers = @{ Authorization = "Bearer $ConfigAdminSecret" }
$Body = @{ hotelSlug = "aquamarin-test"; enabled = $true } | ConvertTo-Json

Invoke-RestMethod `
  -Method POST `
  -Uri "$PreviewUrl/api/admin/config-projections/department-routing-runtime-reads?_vercel_share=$ShareToken" `
  -WebSession $Session `
  -Headers $Headers `
  -ContentType "application/json" `
  -Body $Body
```

Expected response fields include:

- `ok: true`
- `hotelSlug: aquamarin-test`
- `runtimeDepartmentRoutingReadsActivated: true`
- the exact published `revisionId` and `sourceChecksum`

## Immediate rollback

Use the same request with `enabled = $false`. The M9 snapshot remains the
department/routing fallback and M10.3 normalized room reads remain independent.

```powershell
$Body = @{ hotelSlug = "aquamarin-test"; enabled = $false } | ConvertTo-Json
Invoke-RestMethod `
  -Method POST `
  -Uri "$PreviewUrl/api/admin/config-projections/department-routing-runtime-reads?_vercel_share=$ShareToken" `
  -WebSession $Session `
  -Headers $Headers `
  -ContentType "application/json" `
  -Body $Body
```
