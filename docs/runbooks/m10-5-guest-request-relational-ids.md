# M10.5 guest request relational IDs

M10.5 writes normalized `room_id` and `department_id` into new sandbox guest
requests only when both M10.3 room reads and M10.4 department/routing reads are
active for the exact current published revision and checksum.

Production keeps the existing M9 snapshot behavior. The relational authority is
stored as non-enumerable server-only runtime state and is not serialized into the
Guest Hub configuration sent to the browser.

## Release gates

1. Apply the patch on a branch created from commit `033a121` or its merged
   descendant.
2. Run `npm ci`, `npm test`, and `npm run build`.
3. Push the branch and use the Vercel Preview created by the Git integration.
   Never run `vercel --prod`.
4. Confirm `aquamarin-test` still reports both normalized runtime markers as
   active and exact revision/checksum parity.
5. Run reconciliation first with `apply = false`.
6. Continue only when every scanned row is resolvable and
   `unresolvedByReason` is empty.
7. Run the controlled apply for `aquamarin-test`, then repeat the dry-run and
   expect `scanned = 0`.
8. Create one new sandbox guest request and verify its `room_id` and
   `department_id` belong to the same hotel.

## PowerShell dry-run

Keep `CONFIG_ADMIN_SECRET` private and read it interactively.

```powershell
$PreviewUrl = "https://YOUR-PREVIEW.vercel.app"
$ShareToken = "YOUR_VERCEL_SHARE_TOKEN"
$ConfigAdminSecret = Read-Host "CONFIG_ADMIN_SECRET"
$Headers = @{ Authorization = "Bearer $ConfigAdminSecret" }
$Session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Invoke-WebRequest -UseBasicParsing `
  -Uri "$PreviewUrl/h/aquamarin-test?_vercel_share=$ShareToken" `
  -WebSession $Session | Out-Null

$Body = @{
  hotelSlug = "aquamarin-test"
  apply = $false
  limit = 100
} | ConvertTo-Json

Invoke-RestMethod `
  -Method POST `
  -Uri "$PreviewUrl/api/admin/config-projections/guest-request-relational-ids?_vercel_share=$ShareToken" `
  -WebSession $Session `
  -Headers $Headers `
  -ContentType "application/json" `
  -Body $Body
```

Expected before apply for the current sandbox is `ok = true`,
`unresolved = 0`, and `resolvable` equal to `scanned`.

## Controlled sandbox apply

Change only `apply` to `$true` and submit the same protected request. The
operation is bounded to 200 rows, uses hotel-scoped reads and writes, and refuses
Production hotels.

```powershell
$Body = @{
  hotelSlug = "aquamarin-test"
  apply = $true
  limit = 100
} | ConvertTo-Json

Invoke-RestMethod `
  -Method POST `
  -Uri "$PreviewUrl/api/admin/config-projections/guest-request-relational-ids?_vercel_share=$ShareToken" `
  -WebSession $Session `
  -Headers $Headers `
  -ContentType "application/json" `
  -Body $Body
```

There is no destructive rollback. The IDs are tenant-safe foreign keys that
point to the same normalized room and department already used by the activated
sandbox authority. If runtime parity drifts, new relational writes fail closed
and the reconciliation endpoint returns HTTP 409 without changing rows.
