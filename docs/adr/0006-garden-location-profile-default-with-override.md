# ADR-0006: Garden location is a profile default with a per-garden override, coalesced at read time

- **Status**: Accepted
- **Date**: 2026-09-12
- **Deciders**: Alexandre (project owner), decision T1 of the SMA-336 PR ③ pre-flight (`SMA-336 - PR3 pre-flight.md`, § A.2 and § A.4), implemented in PR 3a/5
- **Context**: the gardens dashboard needs a place per garden to fetch its weather; the frozen design promises « Une seule ville suffit pour tous vos jardins » and « vous pourrez en préciser une par jardin dans Réglages »

## Context

The weather widget (SMA-336) needs coordinates for every garden. Nothing geographic was usable before this lot: `ApplicationUser.City` is free text (empty on every DEV account), and `Garden.Hemisphere` / `Garden.LatitudeBand` are hand-set exposure inputs, not a position.

Three models were weighed:

1. **On the garden only**, the invitation copying one city onto every garden without one (the shape the 08/09 pre-flight recommended).
2. **On the profile only.**
3. **Both** — the account carries a DEFAULT, a garden may carry its OWN place (an override), and readers coalesce: `garden's own ?? account's default`.

The criterion that decided it is **a garden created after the invitation**. With (1), every new garden is unlocated again and the « 2/3 localisé » invitation returns on each creation, although the user already said one city was enough. With (2), the per-garden precision the design promises is impossible. With (3), a garden created tomorrow is located the day it exists, and any garden can still be pointed elsewhere.

## Decision

- The **same six nullable columns** live on `Gardens` and on `AspNetUsers`: `LocationName` (120), `LocationRegion` (120), `LocationCountry` (80 — a NAME, never an ISO code: the provider's search endpoint sends none), `Latitude`, `Longitude` (`double precision`), `LocationResolvedAt` (UTC, ADR-0001). No defaults: NULL everywhere IS « not located ». **Four CHECK constraints per table**, mirrored name for name on `Gardens` and `AspNetUsers`: `CK_<table>_Latitude_Range` (−90..90), `CK_<table>_Longitude_Range` (−180..180), `CK_<table>_Location_Pair` (never one coordinate without the other) and `CK_<table>_Location_Name` (never a pair without a name — a name being NULL or made only of whitespace is no name, whitespace in the sense of `string.IsNullOrWhiteSpace`, the rule the endpoints and `GeoLocation.Create` apply, spelled out as an explicit character class in SQL; review rounds 1 and 2 of PR 3a, K4 and K5). All four are NULL-tolerant: an unlocated row breaks none of them.
- **No time zone column.** The weather provider returns `tz_id` and the place's local time with every forecast; a stored copy would only be read when there is nothing to display anyway.
- **Read rule, written once**: `GeoLocation.From(garden) ?? GeoLocation.From(user)` (`SmartCrops.Core.Models.GeoLocation`). Every reader — `GET /api/gardens/{id}`, the weather aggregate — reports the effective location together with its source (`garden` / `profile` / null), so a settings dialog can offer « revert to the profile city » only where it means something.
- **Two writers, two resources**: `PUT`/`DELETE /api/gardens/{id}/location` (the override; clearing it means inheriting again) and `PUT`/`DELETE /api/auth/profile/location` (the default). Both accept a geocoding result as is — a name, coordinates in range — and never re-geocode.
- **Zero coupling with `City`** (decision Q2). The profile's free-text city is neither read, cleared nor rewritten by the location endpoints, and a profile update never touches the location. The dashboard's « use my profile city » link may pre-fill a search field with `City`; nothing more.
- **Pre-fill of the exposure inputs** (decision T12 / Q6): when a garden receives a location and has NO hemisphere or NO latitude band yet, the latitude fills them (`LatitudeBands.Derive`: north from 0°, « low » under 23.5°, « high » from 60° — both bounds recorded as arbitrary). A hand-set value is never overwritten, and clearing the location keeps them.

## Rationale

- One row for « one city for all gardens », zero copies, and a garden created later inherits without any gesture — the promise of the design, kept structurally rather than by a one-off copy.
- The override is a per-garden fact stored where it is read; the default is an account fact stored on the account. The GDPR export (art. 20) carries each where it is stored, never a resolved copy.
- Coalescing at read time costs one six-column projection of `AspNetUsers` per read, on the primary key — nothing a dashboard load notices.

## Alternatives considered and rejected

- **Copy the city onto every unlocated garden** — rejected: re-opens the invitation on every new garden, and a move means editing every garden.
- **A `Locations` table shared by foreign key** — rejected for this lot: sharing one row between gardens turns « change this garden's city » into a question (edit the row for everyone, or fork it?) that two columns per carrier do not raise.
- **Persisting the time zone** — rejected: `search.json` does not return it, `forecast.json` returns it every time, and writing it lazily would put a write inside a GET.

## Consequences

- Any new reader of a garden's place MUST go through `GeoLocation.From(garden) ?? GeoLocation.From(user)`; reading `Garden.Latitude` alone silently ignores the default.
- The six columns are duplicated on purpose across the two tables; a change to one set (a new column, a new constraint) applies to both, in the same migration.
- `PUT /api/gardens/{id}/location` bumps `UpdatedAt` through the shared interceptor: a garden that learnt where it is reads as « modified just now » on the dashboard. Assumed, documented at the endpoint.
- **The pre-fill leaves no provenance in the row** (review round 1 of PR 3a, C5). A pre-filled `Hemisphere` / `LatitudeBand` and a hand-set one are the same column: a later location in another hemisphere does not revisit them, and clearing the location keeps them. The derivation is therefore made VISIBLE where it happens — the endpoint logs, at Information level, the garden id and the derived words it wrote, never the place — and documented on the endpoint. Two alternatives were weighed and set aside for this lot: a provenance column (a schema extension to settle with the front, after the migration this lot already carries), and an on-the-fly « derived » flag computed from the stored latitude — rejected because it could only say « consistent with the stored latitude », which a hand-set value matches by coincidence (« N » / « mid » on a Lyon garden) and which a relocated garden's genuinely pre-filled value no longer does.

## When to revisit

- **A third carrier of a location appears** (a shared plot, a community garden) — the `Locations` table becomes worth its foreign keys.
- **The provider's search endpoint starts returning a time zone or an ISO country code** — the columns can grow, in one migration on both tables.
- **The pre-fill bounds (23.5° / 60°) collide with the exposure engine's own bands** — move the rule next to the engine and delete `LatitudeBands`.

## Related

- **ADR-0001** (DateTime UTC) — `LocationResolvedAt` follows it.
- **ADR-0005** — the same `AuthController` carries the profile location endpoints, for the same reason it carries the export.
- **SMA-336** PR 3a/5 (this lot), PR 3b/5 (the widget, the invitation, the settings section that will offer the override).
- Pre-flight report `SMA-336 - PR3 pre-flight.md` (2026-09-12), § A and § H.1 — the DEV figures (0 of 2 profile cities, 0 gardens located) the decision rests on.

## Amendments

- **2026-09-21 — the last-known entry is capped at 60 minutes** (SMA-387; WeatherAPI.com terms of service, caching limit on current conditions). `WeatherForecastCache.LastKnownTtl` — the « last known » entry of decision C7 of PR 3a, served stale while a refresh fails — was 24 hours, the ceiling the provider's terms allow for a forecast. The entry keeps the whole `forecast.json` answer, current conditions included, and the same terms cap the caching of current conditions at 60 minutes (https://www.weatherapi.com/terms.aspx, section « API »), so the entry is now capped at 60 minutes. The fresh entry (15 minutes) and the C7 rule — an absolute age, never renewed by a read — are unchanged; the C7 test proves the bound at the 60th minute, and a second test proves it at 59 and 61.
