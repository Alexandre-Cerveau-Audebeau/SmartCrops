using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace SmartCrops.Api.Tests.Integration;

/// <summary>
/// An <see cref="ILoggerProvider"/> that keeps every entry it is handed, so a
/// test can assert that an endpoint SAID something — the one thing a response
/// body cannot show (round 7, S06).
/// </summary>
public sealed class CapturingLoggerProvider : ILoggerProvider
{
    public sealed record Entry(string Category, LogLevel Level, string Message);

    public ConcurrentQueue<Entry> Entries { get; } = new();

    public ILogger CreateLogger(string categoryName) => new Capturing(categoryName, Entries);

    public void Dispose() { }

    private sealed class Capturing(string category, ConcurrentQueue<Entry> entries) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            entries.Enqueue(new Entry(category, logLevel, formatter(state, exception)));
    }
}
