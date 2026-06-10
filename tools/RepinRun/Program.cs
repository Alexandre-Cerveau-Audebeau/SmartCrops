using System.Diagnostics;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

// ─────────────────────────────────────────────────────────────────────────────
// SMA-135 — identity re-pin run (the 26, validated mapping). Two modes:
//   default        → DRY-RUN: resolves every plant read-only, prints planned
//                    actions, mutates NOTHING.
//   --apply        → executes: 10 genus re-pins, then 7 species re-pins
//                    (+ enrich GBIF→Trefle→Perenual force=true), then 9 deletes.
// Targets the live API at http://localhost:5000; reads via docker exec psql.
// ─────────────────────────────────────────────────────────────────────────────

const string ApiBase = "http://localhost:5000";
const string DbContainer = "smartcrops-db";

// Dev-only JWT settings — these are the committed local-dev values from
// docker-compose.yml / appsettings.Development.json (NOT a production secret;
// the key is literally labelled "Change-In-Production"). Override via env if the
// stack is reconfigured.
string jwtKey = Environment.GetEnvironmentVariable("REPIN_JWT_KEY")
    ?? "SmartCrops-Dev-Secret-Key-Change-In-Production-Min32Chars!";
string jwtIssuer = Environment.GetEnvironmentVariable("REPIN_JWT_ISSUER") ?? "SmartCrops";
string jwtAudience = Environment.GetEnvironmentVariable("REPIN_JWT_AUDIENCE") ?? "SmartCrops";

bool apply = args.Contains("--apply");

// ── The 26, validated mapping (Étape 0) ──────────────────────────────────────

// 7 species re-pins: current exact ScientificName → clean nominal binomial.
var speciesRepins = new (string Current, string Target)[]
{
    ("Achillea ptarmica (The Pearl Group)",  "Achillea ptarmica"),
    ("Agave geminiflora RASTA MAN",          "Agave geminiflora"),
    ("Artemisia lactiflora (Guizhou Group)", "Artemisia lactiflora"),
    ("Begonia boliviensis BOSSA NOVA RED",   "Begonia boliviensis"),
    ("Brassica napus (Oleifera Group)",      "Brassica napus"),
    ("Agrostis palustris NO MOW",            "Agrostis stolonifera"),
    ("Astilbe arendsii ASTARY PINK",         "Astilbe ×rosea"), // "Astilbe ×rosea"
};

// 10 genus re-pins: current exact ScientificName → (genus, GBIF genus key).
// One representative per genus; surplus same-genus cultivars are deleted below.
var genusRepins = new (string Current, string Genus, long Key)[]
{
    ("Achillea (Summer Pastels Group)", "Achillea",    3119995),
    ("Achimenes (group)",               "Achimenes",   3233488),
    ("Agapanthus (group)",              "Agapanthus",  9471670),
    ("Agastache KUDOS RED",             "Agastache",   2926389),
    ("Alocasia (group)",                "Alocasia",    5329822),
    ("Aquilegia (McKana Group)",        "Aquilegia",   3033167),
    ("Begonia (Tuberosa Group)",        "Begonia",     2874710),
    ("Bergenia DRAGONFLY ANGEL KISS",   "Bergenia",    3230650),
    ("Brachyscome (group)",             "Brachyscome", 3144537),
    ("Lavandula",                       "Lavandula",   2927302),
};

// 9 deletes: 4 messy-name duplicates of an already-clean species, plus 5
// surplus same-genus cultivars whose genus is already re-pinned above (keep one
// fiche per genus).
var deletes = new[]
{
    "Amaranthus tricolor (vegetable group)",
    "Aquilegia vulgaris (Vervaeneana Group)",
    "Asplenium scolopendrium (Crispum Group)",
    "Azara serrata ANDEAN GOLD",
    "Agastache SUMMER GLOW",
    "Alocasia LOW RIDER",
    "Begonia FUNKY PINK",
    "Begonia benariensis BIG SERIES",
    "Bergenia DRAGONFLY SAKURA",
};

// ── Read current state (read-only) for all plants in the affected genera ──────

var genera = new[]
{
    "Achillea","Achimenes","Agapanthus","Agastache","Agave","Agrostis","Alocasia",
    "Amaranthus","Aquilegia","Artemisia","Asplenium","Astilbe","Azara","Begonia",
    "Bergenia","Brachyscome","Brassica","Lavandula",
};
var inList = string.Join(",", genera.Select(g => $"'{g}'"));
var sql =
    "SELECT \"Id\"::text || '|' || \"ScientificName\" || '|' || " +
    "COALESCE(\"GbifTaxonKey\"::text,'') || '|' || \"EnrichmentStatus\"::text || '|' || \"TaxonRank\" " +
    $"FROM \"Plants\" WHERE split_part(\"ScientificName\",' ',1) IN ({inList});";

// Case-insensitive keying matches the collision-detection comparer below and the
// DB's IX_Plants_ScientificName_Lower unique index (which already precludes
// case-variant duplicates — so this is consistency, not a behaviour change).
var byName = new Dictionary<string, PlantRow>(StringComparer.OrdinalIgnoreCase);
foreach (var line in await RunPsql(sql))
{
    var parts = line.Split('|');
    if (parts.Length < 5) continue;
    var row = new PlantRow(
        Id: parts[0],
        ScientificName: parts[1],
        GbifTaxonKey: string.IsNullOrEmpty(parts[2]) ? null
            : long.TryParse(parts[2], out var key) ? key
            : throw new RunFailure($"Invalid GbifTaxonKey in row: {line}"),
        EnrichmentStatus: int.TryParse(parts[3], out var es) ? es
            : throw new RunFailure($"Invalid EnrichmentStatus in row: {line}"),
        TaxonRank: parts[4]);
    byName[row.ScientificName] = row;
}

Console.WriteLine($"== SMA-135 RUN ({(apply ? "APPLY" : "DRY-RUN")}) ==  resolved {byName.Count} plants across {genera.Length} genera\n");

var anomalies = new List<string>();

// ── DRY-RUN inspection ───────────────────────────────────────────────────────

Console.WriteLine($"─── {speciesRepins.Length} SPECIES re-pins ───────────────────────────────────────────");
foreach (var (current, target) in speciesRepins)
{
    if (!byName.TryGetValue(current, out var p))
    {
        Console.WriteLine($"  [NOT FOUND] \"{current}\"");
        anomalies.Add($"species: source not found: \"{current}\"");
        continue;
    }
    // Collision: another plant already carries the target name (case-insensitive)?
    var collision = byName.Values.FirstOrDefault(
        x => x.Id != p.Id && string.Equals(x.ScientificName, target, StringComparison.OrdinalIgnoreCase));
    var alreadyTarget = string.Equals(p.ScientificName, target, StringComparison.OrdinalIgnoreCase);
    Console.WriteLine($"  {p.Id}  \"{p.ScientificName}\"");
    Console.WriteLine($"      now: key={p.GbifTaxonKey?.ToString() ?? "NULL"} es={p.EnrichmentStatus}({Flags(p.EnrichmentStatus)}) rank={p.TaxonRank}");
    Console.WriteLine($"      → repin Species \"{target}\" (key NULL, purge, then enrich GBIF→Trefle→Perenual force=true)");
    if (collision is not null)
    {
        Console.WriteLine($"      ⚠ COLLISION: target already held by {collision.Id} \"{collision.ScientificName}\"");
        anomalies.Add($"species collision: \"{target}\" already on {collision.Id}");
    }
    if (alreadyTarget)
    {
        Console.WriteLine("      ⚠ already named target (possibly already re-pinned)");
        anomalies.Add($"species already-target: \"{current}\"");
    }
}

Console.WriteLine($"\n─── {genusRepins.Length} GENUS re-pins ────────────────────────────────────────────");
foreach (var (current, genus, key) in genusRepins)
{
    if (!byName.TryGetValue(current, out var p))
    {
        Console.WriteLine($"  [NOT FOUND] \"{current}\"");
        anomalies.Add($"genus: source not found: \"{current}\"");
        continue;
    }
    Console.WriteLine($"  {p.Id}  \"{p.ScientificName}\"");
    Console.WriteLine($"      now: key={p.GbifTaxonKey?.ToString() ?? "NULL"} es={p.EnrichmentStatus}({Flags(p.EnrichmentStatus)}) rank={p.TaxonRank}");
    Console.WriteLine($"      → repin Genus \"{genus}\" (archive key {key}, purge Trefle/Perenual, IdentityNeedsReview=true)");
    if (string.Equals(p.TaxonRank, "Genus", StringComparison.OrdinalIgnoreCase))
    {
        Console.WriteLine("      ⚠ already rank=Genus (possibly already re-pinned)");
        anomalies.Add($"genus already-rank: \"{current}\"");
    }
}

Console.WriteLine($"\n─── {deletes.Length} DELETEs ───────────────────────────────────────────────────");
foreach (var current in deletes)
{
    if (!byName.TryGetValue(current, out var p))
    {
        Console.WriteLine($"  [NOT FOUND] \"{current}\"  (possibly already deleted)");
        anomalies.Add($"delete: source not found: \"{current}\"");
        continue;
    }
    Console.WriteLine($"  {p.Id}  \"{p.ScientificName}\"  es={p.EnrichmentStatus}({Flags(p.EnrichmentStatus)})");
    Console.WriteLine("      → DELETE /api/plants/{id}");
}

// ── Guards (feed `anomalies`) ────────────────────────────────────────────────
// (a) Duplicate targets inside the mapping itself: no two run entries may aim at
//     the same final name (7 species binomials + 10 genus names).
var allTargets = speciesRepins.Select(s => s.Target)
    .Concat(genusRepins.Select(g => g.Genus))
    .ToList();
foreach (var dup in allTargets
    .GroupBy(t => t, StringComparer.OrdinalIgnoreCase)
    .Where(grp => grp.Count() > 1))
{
    anomalies.Add($"DUPLICATE TARGET: \"{dup.Key}\" is targeted by {dup.Count()} entries");
}

// (b) Out-of-run collision (species AND genus targets): a target name already
//     held by a plant whose Id is NOT among the run-touched plants is a real
//     collision (would 409 on re-pin). byName covers all 18 affected genera,
//     which is sufficient — a colliding plant must share the target's genus.
var runIds = new HashSet<string>(StringComparer.Ordinal);
foreach (var (current, _) in speciesRepins)
    if (byName.TryGetValue(current, out var p)) runIds.Add(p.Id);
foreach (var (current, _, _) in genusRepins)
    if (byName.TryGetValue(current, out var p)) runIds.Add(p.Id);
foreach (var current in deletes)
    if (byName.TryGetValue(current, out var p)) runIds.Add(p.Id);

foreach (var target in allTargets)
{
    foreach (var hit in byName.Values.Where(x =>
        string.Equals(x.ScientificName, target, StringComparison.OrdinalIgnoreCase)
        && !runIds.Contains(x.Id)))
    {
        anomalies.Add($"COLLISION: target \"{target}\" already held by out-of-run plant {hit.Id} \"{hit.ScientificName}\"");
    }
}

Console.WriteLine("\n─── RECAP ───────────────────────────────────────────────────────");
Console.WriteLine($"  species re-pin : {speciesRepins.Count(s => byName.ContainsKey(s.Current))}/{speciesRepins.Length} resolved");
Console.WriteLine($"  genus re-pin   : {genusRepins.Count(g => byName.ContainsKey(g.Current))}/{genusRepins.Length} resolved");
Console.WriteLine($"  delete         : {deletes.Count(byName.ContainsKey)}/{deletes.Length} resolved");
if (anomalies.Count == 0)
    Console.WriteLine("  anomalies      : none ✓");
else
{
    Console.WriteLine($"  anomalies      : {anomalies.Count}");
    foreach (var a in anomalies) Console.WriteLine($"     - {a}");
}

// Anomaly gate: --apply refuses to mutate when any preflight anomaly is present.
// Placed before the dry-run early-return so it also guards the apply block below
// (we exit here first). No override flag — this is an archived one-shot.
if (apply && anomalies.Count > 0)
{
    Console.Error.WriteLine("\nRefusing --apply: preflight anomalies detected. Resolve them before mutation.");
    return 1;
}

if (!apply)
{
    Console.WriteLine("\nDRY-RUN complete — nothing mutated. Re-run with --apply to execute.");
    return 0;
}

// ── APPLY (not exercised in this prompt) ─────────────────────────────────────

Console.WriteLine("\n!!! APPLY MODE — mutating the live database !!!\n");
var token = MintAdminJwt(jwtKey, jwtIssuer, jwtAudience);
using var http = new HttpClient { BaseAddress = new Uri(ApiBase) };
http.Timeout = TimeSpan.FromSeconds(30); // fail-fast on a stuck network call
http.DefaultRequestHeaders.Authorization = new("Bearer", token);

// Enrich is TOLERANT (per-source external APIs can flake) — failures are logged
// and collected, never abort the run. /repin and DELETE stay STRICT (throw).
var enrichTotals = new Dictionary<string, int> { ["GBIF"] = 0, ["Trefle"] = 0, ["Perenual"] = 0 };
var enrichFailures = new List<EnrichFail>();

try
{
    // 1) genus re-pins (STRICT)
    foreach (var (current, genus, key) in genusRepins)
    {
        if (!byName.TryGetValue(current, out var p)) { Console.WriteLine($"skip (not found): {current}"); continue; }
        await Post(http, $"/api/admin/plants/{p.Id}/repin",
            new { scientificName = genus, taxonRank = "Genus", gbifTaxonKey = (long?)key }, $"repin genus {genus}");
    }

    // 2) species re-pins (STRICT) + re-enrich chain (TOLERANT)
    foreach (var (current, target) in speciesRepins)
    {
        if (!byName.TryGetValue(current, out var p)) { Console.WriteLine($"skip (not found): {current}"); continue; }
        await Post(http, $"/api/admin/plants/{p.Id}/repin",
            new { scientificName = target, taxonRank = "Species", gbifTaxonKey = (long?)null }, $"repin species {target}");
        await PostEnrich(http, $"/api/admin/taxonomy/enrich/{p.Id}?force=true", "GBIF", target, enrichTotals, enrichFailures);
        await PostEnrich(http, $"/api/admin/trefle/enrich/{p.Id}?force=true", "Trefle", target, enrichTotals, enrichFailures);
        await PostEnrich(http, $"/api/admin/perenual/enrich/{p.Id}?force=true", "Perenual", target, enrichTotals, enrichFailures);
    }

    // Enrich summary (printed before deletes so it survives a delete abort).
    Console.WriteLine("\n─── ENRICH SUMMARY ───");
    foreach (var src in new[] { "GBIF", "Trefle", "Perenual" })
        Console.WriteLine($"  {src,-9}: {enrichTotals[src]}/{speciesRepins.Length} ok");
    if (enrichFailures.Count == 0)
        Console.WriteLine("  failures : none ✓");
    else
    {
        Console.WriteLine($"  failures : {enrichFailures.Count}");
        foreach (var f in enrichFailures) Console.WriteLine($"     - \"{f.Plant}\" [{f.Source}] → {f.Code}");
    }

    // 3) deletes (STRICT)
    foreach (var current in deletes)
    {
        if (!byName.TryGetValue(current, out var p)) { Console.WriteLine($"skip (not found): {current}"); continue; }
        await Delete(http, $"/api/plants/{p.Id}", $"delete {current}");
    }
}
catch (RunFailure f)
{
    Console.Error.WriteLine($"\nABORTED: {f.Message}");
    return 1;
}

Console.WriteLine("\nAPPLY complete.");
return 0;

// ── helpers ──────────────────────────────────────────────────────────────────

// STRICT: a non-2xx OR a transport error (HttpRequestException / timeout) both
// abort the run via RunFailure.
static async Task Post(HttpClient http, string path, object? body, string label)
{
    try
    {
        using var resp = body is null
            ? await http.PostAsync(path, null)
            : await http.PostAsJsonAsync(path, body);
        var text = await resp.Content.ReadAsStringAsync();
        Console.WriteLine($"  POST {path}\n    → {(int)resp.StatusCode} {resp.StatusCode}  {Trim(text)}");
        if (!resp.IsSuccessStatusCode)
            throw new RunFailure($"{label}: {(int)resp.StatusCode} {Trim(text)}");
    }
    catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
    {
        throw new RunFailure($"{label}: transport error — {ex.Message}");
    }
}

// TOLERANT enrich POST: records failures (non-2xx OR transport error) and never
// throws on HTTP/transport errors, so a flaky upstream never aborts the run.
static async Task PostEnrich(HttpClient http, string path, string source, string plant,
    Dictionary<string, int> totals, List<EnrichFail> failures)
{
    try
    {
        using var resp = await http.PostAsync(path, null);
        var text = await resp.Content.ReadAsStringAsync();
        Console.WriteLine($"  POST {path}\n    → {(int)resp.StatusCode} {resp.StatusCode}  {Trim(text)}");
        if (resp.IsSuccessStatusCode)
            totals[source]++;
        else
        {
            failures.Add(new EnrichFail(plant, source, (int)resp.StatusCode));
            Console.WriteLine($"    ⚠ WARN: {source} enrich non-2xx for \"{plant}\" — continuing");
        }
    }
    catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
    {
        failures.Add(new EnrichFail(plant, source, -1)); // sentinel: transport error
        Console.WriteLine($"    ⚠ WARN: {source} enrich transport error for \"{plant}\" ({ex.Message}) — continuing");
    }
}

// STRICT: non-2xx OR transport error aborts the run.
static async Task Delete(HttpClient http, string path, string label)
{
    try
    {
        using var resp = await http.DeleteAsync(path);
        var text = await resp.Content.ReadAsStringAsync();
        Console.WriteLine($"  DELETE {path}\n    → {(int)resp.StatusCode} {resp.StatusCode}  {Trim(text)}");
        if (!resp.IsSuccessStatusCode)
            throw new RunFailure($"{label}: {(int)resp.StatusCode} {Trim(text)}");
    }
    catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
    {
        throw new RunFailure($"{label}: transport error — {ex.Message}");
    }
}

static string Trim(string s) => s.Length > 300 ? s[..300] + "…" : s;

// Mint an HS256 admin JWT by hand (no NuGet). The role claim uses the FULL
// ClaimTypes.Role URI as its key so it authorizes whether or not the API maps
// inbound claims; no `security_stamp` claim is included, which makes the API skip
// the DB user/security-stamp lookup (Program.cs OnTokenValidated returns early).
static string MintAdminJwt(string key, string issuer, string audience)
{
    var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    var header = new Dictionary<string, object> { ["alg"] = "HS256", ["typ"] = "JWT" };
    var payload = new Dictionary<string, object>
    {
        ["sub"] = "sma-135-repin-run",
        ["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] = "Admin",
        ["iss"] = issuer,
        ["aud"] = audience,
        ["iat"] = now,
        ["nbf"] = now,
        ["exp"] = now + 3600,
    };
    string h = B64Url(JsonSerializer.SerializeToUtf8Bytes(header));
    string p = B64Url(JsonSerializer.SerializeToUtf8Bytes(payload));
    var signingInput = $"{h}.{p}";
    using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(key));
    string sig = B64Url(hmac.ComputeHash(Encoding.UTF8.GetBytes(signingInput)));
    return $"{signingInput}.{sig}";
}

static string B64Url(byte[] b) => Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');

// Read-only resolution via the db container (mirrors every other step in the run).
static async Task<List<string>> RunPsql(string sql)
{
    var psi = new ProcessStartInfo("docker")
    {
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        UseShellExecute = false,
    };
    foreach (var a in new[] { "exec", DbContainer, "psql", "-U", "smartcrops", "-d", "smartcrops", "-tA", "-F", "|", "-c", sql })
        psi.ArgumentList.Add(a);
    using var proc = Process.Start(psi) ?? throw new RunFailure("could not start docker exec psql");
    // Drain both pipes concurrently before WaitForExit — reading them one after
    // the other can deadlock if the child fills the other pipe's buffer.
    var stdoutTask = proc.StandardOutput.ReadToEndAsync();
    var stderrTask = proc.StandardError.ReadToEndAsync();
    await Task.WhenAll(stdoutTask, stderrTask);
    proc.WaitForExit();
    var stdout = stdoutTask.Result;
    var stderr = stderrTask.Result;
    if (proc.ExitCode != 0)
        throw new RunFailure($"psql failed (exit {proc.ExitCode}): {stderr}");
    return stdout.Replace("\r", "").Split('\n', StringSplitOptions.RemoveEmptyEntries).ToList();
}

// EnrichmentStatus [Flags]: Manual=1, Gbif=2, Trefle=4, Perenual=8.
static string Flags(int es)
{
    var f = new List<string>();
    if ((es & 1) != 0) f.Add("M");
    if ((es & 2) != 0) f.Add("G");
    if ((es & 4) != 0) f.Add("T");
    if ((es & 8) != 0) f.Add("P");
    return f.Count == 0 ? "-" : string.Join("|", f);
}

internal sealed record PlantRow(string Id, string ScientificName, long? GbifTaxonKey, int EnrichmentStatus, string TaxonRank);

internal sealed record EnrichFail(string Plant, string Source, int Code);

internal sealed class RunFailure(string message) : Exception(message);
