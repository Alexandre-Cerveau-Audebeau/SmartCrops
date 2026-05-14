# ADR-0002: Simplified BCP 47 subset for `LanguageCode` validation

- **Status**: Accepted
- **Date**: 2026-05-14
- **Deciders**: Alexandre (project owner)
- **Context**: CodeRabbit feedback on PR #41 (BCP 47 CHECK constraint on `PlantCommonName.LanguageCode`)

## Context

PR #41 introduced a database-level `CHECK` constraint and a shared C# regex constant (`SmartCrops.Core.Validation.ValidationPatterns.Bcp47LanguageCodeLowercase`) for `PlantCommonName.LanguageCode`. The regex enforces a structural pattern:

```
^[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|[0-9]{3}))?$
```

This is a **deliberate subset** of the full BCP 47 (RFC 5646) language tag grammar. The full grammar additionally supports:

- **Variant subtags** (e.g. `en-GB-oed` for Oxford English Dictionary spelling, `de-1996` for 1996 German orthography reform)
- **Extension subtags** (e.g. `de-DE-u-co-phonebk` for locale-specific sorting / calendars via the BCP 47 Extension U)
- **Private-use subtags** (e.g. `zh-CN-x-custom` for domain-specific custom localization)
- **Grandfathered tags** (e.g. `i-klingon`, kept for backwards compatibility with pre-RFC 5646 systems)

CodeRabbit's review of PR #41 (commit `bdd970e`, Extension harvest round 3, Comment 1 actionable/major) recommended formalizing the scope decision as an ADR for long-term discoverability and migration-planning support, following the precedent set by ADR-0001.

## Decision

`PlantCommonName.LanguageCode` (and any other column that adopts `ValidationPatterns.Bcp47LanguageCodeLowercase` in the future) accepts only:

- A mandatory **language subtag** of 2 or 3 lowercase letters (ISO 639-1 or ISO 639-3)
- An optional **script subtag** of 4 lowercase letters (e.g. `-hant`, `-latn`)
- An optional **region subtag** of either 2 lowercase letters or 3 digits (e.g. `-us`, `-419`)

All other BCP 47 subtags (variants, extensions, private-use, grandfathered) are rejected by design.

## Rationale

1. **The domain does not need the excluded subtags.** Plant common names vary by language and sometimes by region (`en-us` "tomato" vs `en-gb` "tomato"). The closest plausible use case for variants would be regional spelling differences, which are already covered by the `language-region` form. Extensions (locale-specific sorting) and private-use subtags (proprietary classifications) have no current or planned use case in the plant naming domain.

2. **Simpler regex is easier to reason about, test, and audit.** A fuller BCP 47 regex (matching variants and extensions correctly) is significantly more complex (50+ characters with optional alternations and quantifiers). The simplified form fits comfortably on one line and is exhaustively tested by 30 inline cases in `ValidationPatternsTests` (10 valid + 20 invalid/unsupported).

3. **Lowercase normalization aligns with PR #36's value converter.** PR #36 introduced a `ToLowerInvariant` value converter on `PlantCommonName.LanguageCode`. Per BCP 47 RFC 5646 §2.1.1, language tag comparison is case-insensitive, so storing `"fr-fr"` is semantically equivalent to `"fr-FR"`. The lowercase-only regex matches this normalization convention exactly.

4. **The persistence-layer CHECK is structural validation, not canonical formatting.** The objective is to reject garbage (`"francais"`, `"FR_US"`, empty strings, whitespace) — not to enforce BCP 47 canonical mixed-case casing. If a future API integration requires canonical mixed-case output, it will be applied as a presentation-layer formatter at the API mapping boundary, not in storage.

## Consequences

### Positive

- The regex is simple, readable, and self-documenting.
- The constant in `ValidationPatterns` has a single use case (regex pattern) with no edge cases around casing.
- The XML doc on the constant explicitly lists what's excluded, removing ambiguity for future readers.
- Application-layer validators (FluentValidation, planned in issue #42) consume the same constant without dealing with case-insensitive comparison logic.

### Negative

- Cannot store specialized orthography variants (e.g. `en-gb-oed` for Oxford English Dictionary spelling).
- Cannot store locale-specific extensions (e.g. phonebook collation).
- Cannot store custom private-use codes for proprietary classifications.
- If a future requirement demands fuller BCP 47 support, the change requires:
  1. Widening the regex in `ValidationPatterns.Bcp47LanguageCodeLowercase` (or adding a parallel constant for a richer use case).
  2. Generating a new EF Core migration that drops the current `CK_PlantCommonName_LanguageCode_Bcp47` and adds the widened constraint.
  3. Updating `ValidationPatternsTests` to cover the new valid cases without breaking the existing invalid cases.
  4. Updating this ADR to record the scope change.

The existing migration `20260514122816_AddBcp47CheckOnPlantCommonNameLanguageCode` is immutable by design (EF Core migration history must not be modified). The widening would land as a new migration on top of it.

## When to revisit

Trigger this ADR for re-evaluation if any of the following becomes a real requirement:

- International expansion that introduces requirements for regional spelling variants (e.g. `en-gb-oed`, `de-1996`)
- Integration with external taxonomic systems (Trefle, GBIF, Perenual) that emit BCP 47 tags with variant, extension, or private-use subtags that we need to preserve verbatim rather than normalize
- User research showing that the plant naming community uses extension or private-use subtags meaningfully
- A future regulatory or compliance requirement that mandates exact BCP 47 tag preservation

## Related

- PR #41 (merged at `d420273`): introduced the regex constant and the database CHECK constraint
- `src/backend/SmartCrops.Core/Validation/ValidationPatterns.cs`: the constant this ADR governs
- ADR-0001 (`docs/adr/0001-use-datetime-utc-not-datetimeoffset.md`): format template for this document
- Issue #42 (FluentValidation validator): future consumer of the same constant
- Issue #43 (model inspection refactor): related test architecture
- CodeRabbit Comment 1 on commit `bdd970e` (Extension harvest round 3): the actionable feedback that prompted this ADR
