# OpenWA on Render Free

This is an API-only, single-session deployment using Baileys, not Chromium.
The image is pinned to OpenWA `v0.25.0` and an immutable digest:

```text
docker.io/rmyndharis/openwa:0.25.0@sha256:bb883bd67101b9c985649ebd4e7677dc7ecd9db034c2d164a8f3d522fdd4311d
```

The blueprint is [deploy/openwa/render.yaml](../deploy/openwa/render.yaml).
It creates only one `plan: free` web service, without a disk, external database,
Redis, MinIO, Docker socket or Docker daemon. Do not add `DOCKER_HOST`.
The root `render.yaml` belongs to the existing application and is not replaced.

## Accepted Limitations

- Operating hours: Monday-Friday, 09:00-12:30 and 14:00-17:30 in `Atlantic/Azores`, including daylight-saving changes. Public holidays are not configured.
- These are operator hours, not an enforced sending schedule. The blueprint does not schedule suspension, block out-of-hours API calls or provision a paid cron service. Any automatic sending must enforce the same windows in the application before being enabled.
- Render Free sleeps after 15 minutes without inbound traffic. The outbound WhatsApp connection is not a reliable keep-awake mechanism. Waking can take about a minute; the first application request may time out.
- Sleeping, restarting and redeploying discard SQLite files, Baileys credentials, session records, keys created via the API and local message history. A new QR can be required at 09:00, at 14:00, or after any idle period during working hours. Repeated pairing is accepted for this setup.
- There is no uptime guarantee, durable inbound-message archive or durable webhook retry queue. Do not use this instance as the application's system of record or as the only channel for urgent notifications.
- Free compute is limited to 512 MB and low CPU. One Baileys session and no full history/inbound media downloads reduce load, but do not guarantee freedom from out-of-memory restarts. Do not automatically upgrade to paid compute.
- Free hours are shared across the workspace (currently 750/month). Bandwidth and other platform limits still apply. Check Billing and spend controls; a free compute plan is not an unconditional guarantee against usage charges when a payment method is present. Render can also suspend unusually high outbound traffic.
- Baileys is an unofficial WhatsApp integration. Review WhatsApp terms and account-blocking risk, obtain recipient consent, and avoid unsolicited/bulk messaging.

## Create the Service

No live service has been created by this configuration change. Creation requires
access to the Render workspace and its GitHub connection. Never paste secrets into
chat, commit them, or put them in this document.

1. In Render, use **New > Blueprint** and connect the existing GitHub repository that contains this application. Choose the branch containing these files once they have been published by an authorised maintainer. No commit or push is part of this task.
2. Set **Blueprint Path** to `deploy/openwa/render.yaml`, not the root blueprint. Review the resource preview: exactly one Free web service and no paid resources. If `orey-acores-openwa` already names an unrelated service, choose a different name in the blueprint before applying, since Render can adopt an existing named resource.
3. Supply `API_MASTER_KEY` when prompted (`sync: false`). Use a unique password-manager-generated secret of at least 32 random characters. Render generates `API_KEY_PEPPER`; keep that value stable across deploys and blueprint syncs.
4. Apply the blueprint. The public image needs no registry credentials. Leave Docker command/entrypoint overrides empty: the image's entrypoint prepares `/app/data`, fixes ownership when started as root, drops to the `openwa` user, and runs `node dist/main`.
5. Wait for the service to become healthy on port `10000` at `/api/health/ready`. Record the actual HTTPS service URL shown by Render. No hostname has been reserved by this guide; do not infer the URL from the service name.

If the dashboard does not offer a custom Blueprint Path, create **New > Web
Service > Existing Image** with the exact image above, select **Free**, and enter
the environment variables and health-check path from the blueprint manually.
Do not select the application repository's Dockerfile: it builds a different app.
Do not create an additional service when the blueprint service already exists.

## Server-Side Application Configuration

Set the following in the application's Vercel environment (Production, and only
other environments that should control this WhatsApp account), then redeploy the
application to pick up the changed configuration:

| Variable | Value |
| --- | --- |
| `WHATSAPP_PROVIDER` | `openwa` |
| `OPENWA_BASE_URL` | Actual Render HTTPS origin, no `/api` suffix or trailing slash |
| `OPENWA_API_KEY` | Exactly the secret configured as Render `API_MASTER_KEY` |
| `OPENWA_SESSION_NAME` | `orey-acores` |

These names form the backend integration contract; deployment configuration alone
does not add an OpenWA adapter. Before enabling delivery, verify that the deployed
backend implements provider selection, authenticated session creation/start/QR,
status, text and audio sends using these exact names. The provider inspected when
this guide was prepared still used the previous providers, so integration remains
a separate backend prerequisite. Do not interpret populated environment variables
as proof that OpenWA is selected or that a message was delivered.

Keep all API calls server-side with `x-api-key`; the browser must use only the
application's authenticated, authorised routes. Do not expose `OPENWA_API_KEY`
through `NEXT_PUBLIC_*`, browser storage, QR URLs or client-side fetches. QR and
session-management routes must be restricted to the authorised administrator.
Removing the old provider examples from `.env.example` does not remove existing
Vercel secrets or change old fallback logic: review deployed provider selection
before testing so messages cannot silently use a paid provider.

The stable bootstrap key is intentionally used initially: on every empty boot,
OpenWA seeds the configured `API_MASTER_KEY` as an ADMIN key. A separately minted
session-scoped key would vanish with the SQLite database, and a session-scoped key
cannot create a replacement session. ADMIN has broad control, so limit Vercel and
Render access to trusted operators. Future least-privilege hardening should
separate bootstrap/session provisioning from delivery, with an unscoped OPERATOR
provisioning key and a session-scoped delivery key, and explicitly handle their
recreation after ephemeral resets.

**Sensitive logs:** OpenWA prints the full bootstrap key in its first-boot banner.
With ephemeral storage this can happen repeatedly. Restrict Render log access;
never share raw startup logs or screenshots. `API_KEY_PEPPER` is a separate
hashing secret, not the API credential. Changing the pepper while keys still exist
invalidates them. Changing `API_MASTER_KEY` alone does not rotate an already seeded
database: use the upstream key-rotation API and update Vercel together, or perform
an explicit clean redeploy/reset and re-pair. Ensure the old key no longer works.

## Daily Pairing and Checks

1. At 09:00 and 14:00 local Azores time, wake the service by opening its actual URL plus `/api/health/ready`. Wait for HTTP 200, retrying after cold start if necessary. A healthy API is not proof of a connected WhatsApp session.
2. Through the protected application integration, look up the session. After a reset, create `orey-acores` with `POST /api/sessions`, start it with `POST /api/sessions/{sessionId}/start`, and retrieve the QR with `GET /api/sessions/{sessionId}/qr`. Use the returned session ID for subsequent calls, rather than assuming the name is the ID. Honour the release's request/response contract linked below.
3. In WhatsApp on the phone, open **Linked Devices > Link a Device** and scan the fresh QR. Wait until session status is `READY`. Clear obsolete linked devices on the phone when repeated ephemeral pairings leave stale entries.
4. Send a harmless text and short audio clip only to a consenting test number. Confirm receipt on the recipient device and playback of the audio, not just an HTTP success response. If an outbound request times out after submission, check delivery before retrying to avoid duplicates.
5. At 12:30 and 17:30, stop the session through the protected operator control (`POST /api/sessions/{sessionId}/stop`) and stop application polling/sends. The service will become idle naturally. A later HTTP request can wake it again; idle sleep is not an access-control or scheduling mechanism.

Do not install a 24/7 uptime pinger or a paid scheduler. This operating model accepts
another QR after lunch or any idle/restart event. If automated business-hours
enforcement is mandatory, implement and test it in the backend separately; setting
`TZ` alone would not implement a schedule.

## Storage and Audio Budget

OpenWA has two distinct SQLite databases: `/app/data/openwa.sqlite` for data and
`/app/data/main.sqlite` for auth/audit. They must never be the same file.
In `v0.25.0`, both connections run their bundled migrations at boot with
`DATABASE_SYNCHRONIZE=false` and `MAIN_DATABASE_SYNCHRONIZE=false`, including on
empty files. Do not enable TypeORM synchronize or override the startup command to
solve an empty-schema issue. The image already creates writable `/app/data`;
Baileys creates auth state beneath `/app/data/baileys`. These paths are ephemeral,
not persistent mounts. No external database credentials are required.

`MEDIA_DOWNLOAD_ENABLED=false` skips inbound media downloads; it does not disable
outbound audio. `MEDIA_DOWNLOAD_MAX_BYTES=10485760` permits up to 10 MiB decoded
outbound media, matching the existing speech-synthesis cap. Base64 for 10 MiB is
13,981,016 bytes before the JSON envelope, so `BODY_SIZE_LIMIT=16mb` leaves room.
Do not lower the media cap to 5 MiB without also lowering the backend cap.
This is the OpenWA body limit, not an increase to Vercel's own request limits;
generate audio server-side instead of posting large base64 bodies from a browser.
Keep audio small and send serially on Free compute.

MP3 should be sent as ordinary playable audio, not mislabelled as a voice note
(`ptt=true` needs Ogg/Opus). Server-side media conversion is not enabled by this
blueprint; the application must use the correct audio payload/format.

## Verification and Troubleshooting

- Validate the YAML against the [Render schema](https://render.com/schema/render.yaml.json). With an authorised Render CLI installation, also run `render blueprints validate deploy/openwa/render.yaml` before applying. Schema validation alone cannot prove image startup, resource availability or WhatsApp connectivity.
- `401`: confirm Vercel uses the same bootstrap secret, with no whitespace, and that the pepper has not changed while the database survived. Do not print either secret during diagnosis.
- `403` on session creation: a session-scoped key cannot recreate a lost session; use the protected provisioning credential.
- `404` session after idle/redeploy: the database was reset; recreate, start and scan a new QR.
- `413` audio: check decoded size and base64 JSON size independently; also identify whether Vercel or OpenWA rejected the request.
- Healthy API but disconnected WhatsApp: pair and wait for `READY`; the health probe only reports API readiness.
- Docker socket/Redis connection failures: check that all built-in datastore flags, Redis, cache and queue remain false. No Docker socket should be mounted or configured.
- Migration/permission boot failure: compare the image pin, distinct absolute SQLite paths and unmodified entrypoint with the blueprint. Inspect redacted logs privately; no shell access is provided by Render Free.

No Render credentials, live deployment, live QR pairing or end-to-end delivery
validation are included in this change. Activation still requires workspace/GitHub
access, the actual Render URL, secret configuration in Render and Vercel, a backend
with the integration contract implemented, and the phone holder to scan the QR.

## Upstream References

- [Release](https://github.com/rmyndharis/OpenWA/releases/tag/v0.25.0)
- [Release environment reference](https://github.com/rmyndharis/OpenWA/blob/v0.25.0/.env.example)
- [Runtime configuration](https://github.com/rmyndharis/OpenWA/blob/v0.25.0/src/config/configuration.ts)
- [Database boot wiring](https://github.com/rmyndharis/OpenWA/blob/v0.25.0/src/app.module.ts)
- [Main database migrations](https://github.com/rmyndharis/OpenWA/blob/v0.25.0/src/database/main-connection.ts)
- [Image](https://github.com/rmyndharis/OpenWA/blob/v0.25.0/Dockerfile) and [entrypoint](https://github.com/rmyndharis/OpenWA/blob/v0.25.0/docker-entrypoint.sh)
- [Bootstrap key implementation](https://github.com/rmyndharis/OpenWA/blob/v0.25.0/src/modules/auth/auth.service.ts)
- [Session API contract](https://github.com/rmyndharis/OpenWA/blob/v0.25.0/src/modules/session/session.controller.ts)
- [Render Blueprint reference](https://render.com/docs/blueprint-spec), [prebuilt images](https://render.com/docs/deploying-an-image) and [Free limitations](https://render.com/docs/free)
