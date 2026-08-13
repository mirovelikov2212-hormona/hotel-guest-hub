# M10.3 sandbox normalized runtime reads

M10.3 keeps the M9 published snapshot as the automatic fallback and permits
normalized room, department and routing authority only for a hotel whose
`hotels.is_sandbox` value is `true`.

Deploy the code with `runtimeReadsActivated=false`. Do not activate production
hotels and do not deploy this milestone with `vercel --prod`.

## Release gate

Before activation, verify all of the following:

- the Vercel Preview build is successful;
- `npm test` and `npm run build` pass for the exact Git commit;
- the target is the sandbox slug `aquamarin-test`;
- the projection state is `ready` for the current published revision and
  checksum;
- room, department and routing parity succeeds.

The activation service repeats the last three checks server-side. It rejects a
production hotel before reading or changing normalized runtime state.

## Enable the sandbox

Use a Preview URL that the operator can access and the same
`CONFIG_ADMIN_SECRET` configured in that Vercel environment.

```powershell
$PreviewUrl = "https://YOUR-PREVIEW.vercel.app"
$Headers = @{ Authorization = "Bearer $env:CONFIG_ADMIN_SECRET" }
$Body = @{ hotelSlug = "aquamarin-test"; enabled = $true } | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "$PreviewUrl/api/admin/config-projections/runtime-reads" `
  -Headers $Headers `
  -ContentType "application/json" `
  -Body $Body
```

A successful response has `ok=true`, `hotelSlug=aquamarin-test`, and
`runtimeReadsActivated=true`.

## Immediate rollback

Rollback uses the same protected endpoint and can only target a sandbox hotel.

```powershell
$Body = @{ hotelSlug = "aquamarin-test"; enabled = $false } | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "$PreviewUrl/api/admin/config-projections/runtime-reads" `
  -Headers $Headers `
  -ContentType "application/json" `
  -Body $Body
```

Even while the marker is enabled, any revision, checksum, count, error-state or
row-parity drift automatically returns runtime authority to the M9 snapshot.
