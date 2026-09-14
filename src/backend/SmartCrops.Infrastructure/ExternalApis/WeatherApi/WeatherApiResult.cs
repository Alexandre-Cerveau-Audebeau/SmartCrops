using System.Diagnostics.CodeAnalysis;

namespace SmartCrops.Infrastructure.ExternalApis.WeatherApi;

/// <summary>
/// Why a WeatherAPI.com call produced no value (SMA-336 PR 3a/5). The Trefle
/// and Perenual clients answer « null on failure »; this client cannot, because
/// the product reacts to these failures in THREE different ways — an invitation,
/// a degraded answer with the last known data, a neutral message — and a null
/// carries none of that.
/// </summary>
public enum WeatherApiFailureKind
{
    /// <summary>Provider code 1006: nothing matches the query. Not an error — an empty answer.</summary>
    NoLocation,

    /// <summary>
    /// Provider codes 2007 and 2009: the provider refused the call for a reason
    /// on the account's side. The last known data, when any, is the answer.
    /// </summary>
    Refused,

    /// <summary>
    /// Provider codes 1002, 2006 and 2008: the credential itself is missing,
    /// invalid or disabled on the provider's side. An operator problem, logged
    /// at error level; the user sees a neutral message.
    /// </summary>
    Misconfigured,

    /// <summary>
    /// Network failure, timeout, 5xx, malformed or non-JSON body, or any
    /// provider code this client does not map. Transient by assumption.
    /// </summary>
    Transport,

    /// <summary>
    /// No key is configured: the call was NOT made. The boot is allowed without
    /// a key (SMA-377); the weather is not.
    /// </summary>
    MissingKey,
}

/// <summary>One failed call: its kind, and the provider's own code and HTTP status when there were any.</summary>
/// <param name="Kind">The classification the caller branches on.</param>
/// <param name="ProviderCode">The provider's <c>error.code</c>, when the body carried one.</param>
/// <param name="HttpStatus">The HTTP status, when a response was received at all.</param>
public sealed record WeatherApiFailure(WeatherApiFailureKind Kind, int? ProviderCode, int? HttpStatus);

/// <summary>
/// The outcome of one WeatherAPI.com call: exactly one of <see cref="Value"/>
/// and <see cref="Failure"/> is set.
/// </summary>
public readonly record struct WeatherApiResult<T> where T : class
{
    private WeatherApiResult(T? value, WeatherApiFailure? failure)
    {
        Value = value;
        Failure = failure;
    }

    /// <summary>The parsed response, on success.</summary>
    public T? Value { get; }

    /// <summary>What went wrong, on failure.</summary>
    public WeatherApiFailure? Failure { get; }

    /// <summary>True when the call produced a value.</summary>
    [MemberNotNullWhen(true, nameof(Value))]
    [MemberNotNullWhen(false, nameof(Failure))]
    public bool IsSuccess => Value is not null;

    public static WeatherApiResult<T> Success(T value) => new(value, null);

    public static WeatherApiResult<T> Failed(
        WeatherApiFailureKind kind,
        int? providerCode = null,
        int? httpStatus = null)
        => new(null, new WeatherApiFailure(kind, providerCode, httpStatus));
}
