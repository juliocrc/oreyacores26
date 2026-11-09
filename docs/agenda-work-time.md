# Agenda Work Time

## Integration Contract

The UI integration is intentionally left to the agenda UI owner. No `page.tsx`,
calendar, modal or shared agenda type was changed.

Import the component into the existing event detail/edit surface:

```tsx
import AgendaWorkTime from '@/modules/Agenda/AgendaWorkTime';

// Render only for a persisted AgendaEvento ID, not a synthetic expiry,
// absence, recurrence preview or legacy Agenda ID. Use key to reset local input.
<AgendaWorkTime
  key={event.id}
  eventId={Number(event.id)}
  onChange={() => { void reloadAgenda(); }}
/>
```

`reloadAgenda` above means the owning UI's existing event/metrics refresh, not a
new exported function. `ordemId?: number | null` may be provided only when the
caller already has an explicit OT selection. It prefills the association form;
it never associates on mount. `onChange` runs after a successful association or
time mutation. The component reads its own summary and links to the OT detail.
Without a linked OT it offers an existing OT ID input, a link to the existing OT
list, and an explicit **Associar OT** confirmation. There is no implicit OT
creation and no serial-based discovery.

## API

- `GET /api/agenda/:eventId/time`: linked OT summary, or `ordemId: null` and the event estimate.
- `POST /api/agenda/:eventId/time`: `{ action: 'link', ordemId: 123 }` explicitly persists `metadados.agendaEventId` on an existing OT.
- The same POST accepts `{ action: 'start' | 'pause' | 'complete', updatedAt?: string }` once associated.
- `GET/POST /api/ordens-servico/:id/tempos` uses the same owning helper and semantics.
- The shipped OT action `stop` remains a pause; `stop` with `status: 'concluida'` remains completion. Other client-supplied statuses cannot override the transition.
- Summaries expose `entries`, `activeEntry`, `totalMinutes`, `actualMinutes`, `estimatedMinutes`, `deltaMinutes`, `measuredAt`, `updatedAt`, `status`, `canEdit`, `ordemId`, `eventId`, and `source`.
- `actualMinutes` and `totalMinutes` include the running interval at `measuredAt`; all time amounts are minutes, possibly fractional. The component advances the running display locally.
- Missing/foreign records return 404; permissions return 403; stale revisions, duplicate starts, ambiguous links and conflicting writes return 409. Do not automatically replay mutations after a conflict or network failure. Re-read first.

## Storage And Semantics

`metadados.timeEntries` is the sole source of actual elapsed work for this
workflow, preserving the shipped OT timer's persisted data. A start opens an
interval, a pause closes it, a resume opens another, and completion closes any
active interval. Completion also works while paused or before starting (zero
measured time), without inventing an interval. Closed/cancelled OTs cannot restart.
Pause does not invent a drying or waiting-for-parts workflow transition.

Timestamp differences are authoritative, with no per-interval minimum-minute
rounding. Legacy closed entries without usable timestamps fall back to their
stored duration. Paused wall time never contributes. Neither the OT's
`durationMinutes` nor the event's estimate, date or buffers is rewritten. The
comparison uses the event estimate when explicitly linked, otherwise the OT
estimate. Data already overwritten by the old stop implementation is not
automatically reconstructed.

`OrdemServicoTempo` already exists, but the previous `/tempos` route reads and
writes metadata, not that table. This change deliberately does not migrate,
merge or dual-write it: summing two representations could double-count existing
work. Only this timer's metadata is reported. No schema or migration is needed.

Both routes require a real internal ADMIN/USER session, page visibility/edit
permissions, and the authorized active station scope. Agenda operations require
both agenda and OT permissions. An OT linked to an event also requires agenda
permission when accessed through `/tempos`. Linking requires matching non-null
station IDs on both records, even for administrators. An empty non-admin station
allowlist never grants global access. Technician attribution uses authenticated
staff identity, not the supplied `tecnico` field.

Writes compare the OT revision, original metadata and status, and compare the
event revision/status in the same transaction. Event revision advancement also
serializes competing associations to different OTs. Revisions advance even for
mutations in the same millisecond. Lost comparisons abort with 409, as do
transaction write conflicts. Audit rows are appended inside that transaction;
Auditoria is not a mutable timer or association store.

## Tradeoffs

- The association is one event to one OT. Existing ambiguous links are rejected, not chosen arbitrarily. Rebinding and deleting historical associations have no new UI or endpoint.
- The measured value is the OT's accumulated work, including intervals before association, not a reconstructed event-specific duration.
- Reverse lookup filters station-scoped metadata-bearing OTs in memory after a substring query, then compares the parsed numeric event ID exactly. This avoids provider-specific JSON queries and a migration, but is not an indexed relation. It is intended for event detail, not one request per calendar cell. No batch endpoint is added without a batch UI consumer.
- There is no new database uniqueness constraint. Other existing generic metadata writers must preserve `agendaEventId` and `timeEntries` and use optimistic revisions; this endpoint cannot prevent a later unconditional overwrite by unrelated writers. A future normalized relation would require a reviewed migration.
- Existing agenda/OT status-edit APIs are unchanged. In this workflow, use the time API for execution transitions; a generic status edit alone is not measured work. This timer completion is not a certification, billing or technical checklist validation endpoint.
- No browser end-to-end or real-database parallel-writer test is included. Unit tests exercise transitions, authorization scope, association conflicts, CAS failure paths, and the component's explicit actions.

## Verification

```sh
npm test -- --runTestsByPath src/lib/__tests__/ordem-work-time.test.ts src/modules/Agenda/AgendaWorkTime.test.tsx src/lib/__tests__/dashboard-routes.test.ts
npm run typecheck
```
