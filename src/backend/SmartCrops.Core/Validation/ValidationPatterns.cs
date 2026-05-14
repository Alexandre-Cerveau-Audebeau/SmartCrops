namespace SmartCrops.Core.Validation;

/// <summary>
/// Shared validation regex patterns used across the SmartCrops domain.
///
/// Patterns live in <c>SmartCrops.Core</c> rather than Infrastructure because
/// they encode business rules (what shapes of data are accepted), not
/// persistence concerns. Application-layer validators (e.g. FluentValidation
/// rules) can consume the same constants without taking a dependency on
/// Infrastructure.
/// </summary>
public static class ValidationPatterns
{
    /// <summary>
    /// Simplified BCP 47 language tag pattern, lowercase form.
    ///
    /// Matches the canonical lowercase normalization applied by the
    /// <c>ToLowerInvariant</c> value converter on
    /// <c>PlantCommonName.LanguageCode</c> (introduced in PR #36).
    /// Per BCP 47 RFC 5646 §2.1.1, language tag comparison is
    /// case-insensitive, so storing <c>"fr-fr"</c> is semantically
    /// equivalent to <c>"fr-FR"</c>.
    ///
    /// <para>
    /// See <c>docs/adr/0002-simplified-bcp47-subset.md</c> for the formal
    /// architectural decision record covering scope, rationale, consequences,
    /// and triggers for revisiting this decision.
    /// </para>
    ///
    /// <para>Structure (all subtags lowercase):</para>
    /// <list type="bullet">
    ///   <item><c>[a-z]{2,3}</c> — language subtag, mandatory
    ///   (ISO 639-1 like <c>"en"</c>, <c>"fr"</c>, or ISO 639-3 like
    ///   <c>"fra"</c>, <c>"yue"</c>).</item>
    ///   <item><c>(-[a-z]{4})?</c> — optional script subtag
    ///   (e.g. <c>"-hant"</c>, <c>"-latn"</c>).</item>
    ///   <item><c>(-([a-z]{2}|[0-9]{3}))?</c> — optional region subtag,
    ///   either 2 lowercase letters (<c>"-us"</c>, <c>"-fr"</c>) or
    ///   3 digits (<c>"-419"</c> for Latin America/Caribbean).</item>
    /// </list>
    ///
    /// <para><b>Not supported by design</b> (deliberate scope limitation):</para>
    /// <list type="bullet">
    ///   <item>Variant subtags (e.g. <c>"en-gb-oed"</c>, <c>"de-1996"</c>).</item>
    ///   <item>Extension subtags (e.g. <c>"de-de-u-co-phonebk"</c>).</item>
    ///   <item>Private-use subtags (e.g. <c>"zh-cn-x-custom"</c>).</item>
    ///   <item>Grandfathered tags (e.g. <c>"i-klingon"</c>).</item>
    /// </list>
    ///
    /// <para>These exclusions are intentional: the plant common names domain
    /// does not need anything beyond <c>language[-script][-region]</c>. If a
    /// future use case requires fuller BCP 47 support, this constant should
    /// be widened (rather than introducing a parallel pattern), and the
    /// downstream CHECK constraints regenerated.</para>
    ///
    /// <para><b>Note on EF Core migration immutability</b>: the existing
    /// migration <c>20260514122816_AddBcp47CheckOnPlantCommonNameLanguageCode</c>
    /// embeds the regex as a literal string for snapshot reproducibility. That
    /// is intentional — modifying a past migration would break the migration
    /// history. Use this constant only for new configurations and for
    /// application-layer validators.</para>
    /// </summary>
    public const string Bcp47LanguageCodeLowercase =
        "^[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|[0-9]{3}))?$";
}
