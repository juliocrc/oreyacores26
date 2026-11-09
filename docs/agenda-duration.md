# Agenda inspection duration

Generic (`outro`, including legacy `Inspeção`) and new annual raft inspections
default to 180 working minutes. GI, hydraulic tests and reinspection retain their
specialized defaults. Existing annual durations and identifiable manual overrides
are preserved.

`resolveAgendaDuration` repairs the effective duration, not database rows: generic
raft inspections with 30/210 minutes and standard 15/15 or automatic-sync 0/0
buffers resolve to 180. Other durations, custom buffers, specialized inspection
types, deliveries, absences and expiration reminders are not reinterpreted.
Assistance sync no longer reuses delivery events and persists the resolved duration
when an inspection is normally synchronized. API PUT without a duration preserves
the existing effective duration. Moving events preserves working minutes; resizing
subtracts lunch instead of storing lunch as inspection time. Editing only the date
or technician preserves duration/buffer overrides.

## Ambiguity

AgendaEvento has no duration provenance or manual-override flag. A manual 30/210
with the generic type and default buffers is indistinguishable from an incorrect
generated value, including future requests with those exact values. It follows the
legacy resolution rule. Custom durations/buffers and specialized types are
identifiable and preserved. Timestamps do not reliably prove manual intent and
are not used as a heuristic. An exact distinction would require persisted
provenance and a separately reviewed migration, not a bulk 30/210 update.

## Schema And Rollout

The AgendaEvento default is aligned to 180 in all five Prisma variants and the
SQL bootstrap schema. OrdemServico's independent 210-minute default is unchanged.
No migration is necessary for this application fix: all application event creators
write explicit durations and existing rows are resolved at read/calculation time.
The declarative default applies to newly provisioned databases only until a future
schema rollout. External writers omitting duration against an existing database
still receive its old physical default, but generic inspection reads resolve it.
No database push, production write, migration execution or deployment is part of
this change.
