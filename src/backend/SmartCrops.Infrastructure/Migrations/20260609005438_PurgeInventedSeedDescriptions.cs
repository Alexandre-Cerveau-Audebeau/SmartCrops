using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <summary>
    /// SMA-60 — data-only cleanup (no schema change). Removes the hand-authored
    /// "invented" seed descriptions so displayed text is sourced (Perenual/enrichment)
    /// rather than fabricated at seed time:
    /// <list type="bullet">
    ///   <item>(a) every FR <c>Description</c> is nulled — the FR seed prose was never
    ///   sourced (SMA-120/124 only ever wrote FR names, never descriptions), so a
    ///   non-null FR description is, by construction, one of the 30 invented seeds.</item>
    ///   <item>(b) the three Group-B EN descriptions with no sourceable Perenual
    ///   species (genus-only / absent) are nulled — left empty surfaces them for admin
    ///   review (there is no "needs-review" flag column by design).</item>
    ///   <item>(c) the two Group-B EN descriptions whose species IS in the Perenual
    ///   cache are PROMOTED from that cache (reads the stored JSON; no licensed text is
    ///   hard-coded here; a no-op where the cache is absent, e.g. a fresh DB).</item>
    /// </list>
    /// Pairs with the DataSeeder change (identity-only seed translations) so a fresh
    /// install never re-introduces the invented text.
    /// </summary>
    public partial class PurgeInventedSeedDescriptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // (a) NULL the 30 invented FR descriptions (any non-null FR description is
            // an invented seed — the ETL never authored FR descriptions).
            migrationBuilder.Sql("""
                UPDATE "PlantTranslations" SET "Description" = NULL
                WHERE "Language" = 'fr' AND "Description" IS NOT NULL;
                """);

            // (b) NULL the 3 Group-B EN descriptions with no sourceable species
            // (genus-only Tulipa/Dahlia, Rosa gallica absent) — never substitute a
            // genus description for a species; leave empty as the admin-review signal.
            migrationBuilder.Sql("""
                UPDATE "PlantTranslations" t SET "Description" = NULL
                FROM "Plants" p
                WHERE t."PlantId" = p."Id" AND t."Language" = 'en'
                  AND p."ScientificName" IN ('Dahlia pinnata', 'Tulipa gesneriana', 'Rosa gallica');
                """);

            // (c) PROMOTE the 2 Group-B EN descriptions whose exact/synonym species is
            // cached (Fragaria x ananassa = 8576, Matricaria recutita = 5167). Reads the
            // stored cache JSON — no licensed text is committed here; a no-op when the
            // PerenualRawCache row is absent (e.g. a fresh database).
            // Guarded so a matching cache row whose JSON is NULL or lacks 'description' is
            // skipped (a true no-op) rather than overwriting Description with NULL.
            migrationBuilder.Sql("""
                UPDATE "PlantTranslations" t SET "Description" = c."RawJson"->>'description'
                FROM "Plants" p
                INNER JOIN "PerenualRawCache" c ON c."Endpoint" = 'species-details'
                  AND ( (p."ScientificName" LIKE 'Fragaria%ananassa' AND c."ResourceId" = '8576')
                     OR (p."ScientificName" = 'Matricaria chamomilla' AND c."ResourceId" = '5167') )
                WHERE t."PlantId" = p."Id" AND t."Language" = 'en'
                  AND c."RawJson" IS NOT NULL
                  AND c."RawJson"->>'description' IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Data cleanup - invented text intentionally removed, no rollback.
        }
    }
}
