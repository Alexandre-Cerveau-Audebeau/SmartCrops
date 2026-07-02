using System.Diagnostics;
using Typesense;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SmartCrops.Core.Interfaces;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Infrastructure.ExternalApis.SearchIndex;

/// <summary>
/// Full Postgres → Typesense reindex (SMA-255 T2). Bootstraps the
/// <c>plants</c> collection when absent, loads every Plant with the includes
/// the document mapper needs (en/fr translations + Perenual xData), and pushes
/// them in one batched import with upsert semantics. Documents are keyed by
/// the Plant Guid, so re-running is idempotent (same count, no duplicates).
/// </summary>
public class TypesenseSearchIndexingService : ISearchIndexingService
{
    /// <summary>
    /// Documents per import batch. 536 plants × ~1 KB documents is a light
    /// payload; 200 keeps each request well under Typesense's defaults while
    /// avoiding hundreds of round-trips.
    /// </summary>
    private const int ImportBatchSize = 200;

    private readonly SmartCropsDbContext _db;
    private readonly ITypesenseClient _typesense;
    private readonly ILogger<TypesenseSearchIndexingService> _logger;

    public TypesenseSearchIndexingService(
        SmartCropsDbContext db,
        ITypesenseClient typesense,
        ILogger<TypesenseSearchIndexingService> logger)
    {
        _db = db;
        _typesense = typesense;
        _logger = logger;
    }

    public async Task<SearchReindexResult> ReindexAllAsync(CancellationToken ct = default)
    {
        var stopwatch = Stopwatch.StartNew();

        var collectionExisted = await EnsureCollectionAsync(ct);

        // Same include style as PlantRepository.ApplyListIncludes, but loading
        // BOTH languages (the index stores en and fr side by side) and the
        // Perenual xData that feeds the numeric facets.
        var plants = await _db.Plants
            .Include(p => p.Translations.Where(t => t.Language == "en" || t.Language == "fr"))
            .Include(p => p.PerenualData)
            .AsSplitQuery()
            .AsNoTracking()
            .ToListAsync(ct);

        var documents = plants.Select(PlantSearchDocumentMapper.ToDocument).ToList();

        var indexed = 0;
        var failures = new List<string>();
        if (documents.Count > 0)
        {
            // typesense-dotnet 8.5.0 exposes no CancellationToken overloads, so
            // explicit checkpoints before each engine call are the cancellation
            // contract on this path (the EF query above honors ct natively).
            ct.ThrowIfCancellationRequested();
            var responses = await _typesense.ImportDocuments(
                PlantsSearchCollection.Name, documents, ImportBatchSize, ImportType.Upsert);

            // Responses come back in document order, one per document.
            for (var i = 0; i < responses.Count; i++)
            {
                if (responses[i].Success)
                {
                    indexed++;
                    continue;
                }

                failures.Add($"{documents[i].Id} ({documents[i].ScientificName}): {responses[i].Error}");
            }
        }

        stopwatch.Stop();
        _logger.LogInformation(
            "Typesense reindex complete: collectionExisted={CollectionExisted} indexed={Indexed} failures={Failures} durationMs={DurationMs}",
            collectionExisted, indexed, failures.Count, stopwatch.ElapsedMilliseconds);

        return new SearchReindexResult(collectionExisted, indexed, stopwatch.ElapsedMilliseconds, failures);
    }

    /// <summary>
    /// Returns whether the collection already existed; creates it when absent.
    /// A concurrent reindex can win the create race between our 404 and our
    /// CreateCollection — that conflict is benign (the collection now exists),
    /// so it reports "existed" instead of surfacing a 409.
    /// </summary>
    private async Task<bool> EnsureCollectionAsync(CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        try
        {
            await _typesense.RetrieveCollection(PlantsSearchCollection.Name);
            return true;
        }
        catch (TypesenseApiNotFoundException)
        {
            _logger.LogInformation(
                "Typesense collection '{Collection}' absent — bootstrapping schema v{SchemaVersion}",
                PlantsSearchCollection.Name, PlantsSearchCollection.SchemaVersion);
            ct.ThrowIfCancellationRequested();
            try
            {
                await _typesense.CreateCollection(PlantsSearchCollection.Build());
                return false;
            }
            catch (TypesenseApiConflictException)
            {
                // Lost the bootstrap race with a concurrent reindex — the
                // collection exists now, which is all this method guarantees.
                _logger.LogInformation(
                    "Typesense collection '{Collection}' was created concurrently — continuing",
                    PlantsSearchCollection.Name);
                return true;
            }
        }
    }
}
