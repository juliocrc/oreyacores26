# GlobalFish AIS History

## Sources And Capabilities

- `/api/navios` supplies the real application fleet and its current station scope. The history route calls that same handler, preserving its authentication and list visibility rules. No vessel is injected on failure.
- `Navio` has `lat`, `lng`, and `aisUpdatedAt`, but no position-history relation. The existing vessel AIS route overwrites these fields and sets `aisUpdatedAt` to the fetch/save time. These fields are not sufficient evidence of an AIS observation within the last 48 hours and are deliberately excluded.
- The existing `/api/navios/[id]/ais` route contains an OpenWaters track adapter (`https://ais.openwaters.io/v1/vessels/{mmsi}/track`, `from`/`to`, GeoJSON LineString with `properties.times`). GlobalFish uses that existing contract independently, without calling its live-provider fan-out or writing to the database.
- The new history route makes one anonymous OpenWaters request per explicit user query. Anonymous access, coverage, freshness and availability are not guaranteed. The endpoint contract was found in the codebase, not verified against the live provider during this task. Authorization failures are shown, not replaced with sample positions.
- Marinesia history is marked premium in the existing adapter. AISStream, Pelyr and AISHub adapters supply positions, not a local historical archive. None is called by GlobalFish.
- The existing GFW and Skylight links are not an integrated event dataset. There is no verified fishing-event source in this module. AIS observations must not be labelled as fishing events, proven fishing grounds, dark-vessel detections or a measurement of fishing hours.
- OpenStreetMap supplies background tiles only, not vessel data.

## Matching And Window

The browser submits a vessel ID, not an arbitrary provider identifier. The server resolves its MMSI and IMO from the current application list. It requires a unique, valid MMSI; duplicate MMSIs are an error. Names are never used for identity matching. IMO is shown for verification, but this existing provider contract does not support IMO-only track lookup. An IMO-to-MMSI resolver would require a separately verified provider integration.

Each request freezes the UTC interval `[server now - 48 hours, server now]`. Only provider points with finite, in-range numeric coordinates and explicit timezone-bearing timestamps within that interval are retained. Points are sorted and deduplicated. Missing timestamps are never replaced with the current time, window boundaries or generated sample times.

Markers show actual returned observations. A dashed line connects available observations in time order; it does not assert the route taken between them. Empty history does not establish that AIS was disabled or that no fishing occurred. Querying is per vessel rather than an automatic fleet-wide provider fan-out.

## Credentials And Future Integration

No credentials are read or sent by the new route. No database migrations or writes are introduced. If anonymous history is unavailable, authorized history access needs provider permission and a deliberate server-side integration. Existing OpenWaters code elsewhere supports `OPENWATERS_AIS_TOKEN`/`AIS_TOKEN`, but the GlobalFish route intentionally does not use them. Provider-specific GFW/Skylight access and identity/event adapters would be needed to display their actual fishing-event products, with their coverage and latency documented. Their credentials alone would not establish a current 48-hour dataset.

## Verification

```sh
npx jest --runInBand --collectCoverage=false --runTestsByPath src/modules/globalfishazores/history.test.ts src/modules/globalfishazores/history-route.test.ts src/modules/globalfishazores/GlobalFishAzoresClient.test.tsx
npx eslint src/modules/globalfishazores src/app/api/globalfishazores src/app/globalfishazores/page.tsx
node src/modules/globalfishazores/check-map.cjs
```

The browser check uses an isolated in-memory esbuild harness with real React and installed React Leaflet components, mocked fleet/history responses, and blocked external requests. It checks markers, track, empty/error states, viewport fit and browser errors at 390px and 1440px. The harness substitutes Next's dynamic loader and uses minimal layout CSS; it is not a full authenticated Next.js navigation or production-theme visual test. A separate SSR test renders the actual Next dynamic-loading boundary without a browser window.
