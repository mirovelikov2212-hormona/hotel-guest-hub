# M10.3 sandbox normalized room runtime reads

M10.3 keeps the M9 published snapshot as the automatic fallback and permits
normalized **room** authority only for a hotel whose `hotels.is_sandbox` value
is `true`.

Departments, department hours, contacts and request routing remain authoritative
from the M9 published snapshot. Their normalized runtime activation belongs to
M10.4 and must use a separate marker and release gate.

Deploy the code with both `runtimeReadsActivated=false` and
`runtimeRoomReadsActivated=false`. Do not activate production hotels and do not
deploy this milestone with `vercel --prod`.

## Release gate

Before activation, verify all of the following:

- the Vercel Preview build is successful;
- `npm test` and `npm run build` pass for the exact Git commit;
- the target is the sandbox slug `aquamarin-test`;
- the projection state is `ready` for the current published revision and
  checksum;
- normalized room counts and active room row parity succeed.

The activation service repeats the last three checks server-side. It rejects a
production hotel before reading or changing normalized room runtime state.

## Enable normalized rooms in the sandbox

Use a Preview URL that the operator can access and the same
`CONFIG_ADMIN_SECRET` configured in that Vercel environment.

```powershell
$PreviewUrl = "https://YOUR-PREVIEW.vercel.app"
$Headers = @{ Authorization = "Bearer $env:CONFIG_ADMIN_SECRET" }
$Body = @{ hotelSlug = "aquamarin-test"; enabled = $true } | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "$PreviewUrl/api/admin/config-projections/room-runtime-reads" `
  -Headers $Headers `
  -ContentType "application/json" `
  -Body $Body
```

A successful response has `ok=true`, `hotelSlug=aquamarin-test`, and
`runtimeRoomReadsActivated=true`. The legacy broad marker remains
`runtimeReadsActivated=false`.

## Immediate rollback

Rollback uses the same protected endpoint and can only target a sandbox hotel.

```powershell
$Body = @{ hotelSlug = "aquamarin-test"; enabled = $false } | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "$PreviewUrl/api/admin/config-projections/room-runtime-reads" `
  -Headers $Headers `
  -ContentType "application/json" `
  -Body $Body
```

Even while the marker is enabled, any room revision, checksum, count,
error-state or active-row parity drift automatically returns room authority to
the M9 snapshot. Department and routing runtime reads are never enabled by this
endpoint.
