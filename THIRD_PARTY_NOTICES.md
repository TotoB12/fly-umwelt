# Third-party notices

## FlyWire / FAFB data

The ready manifest references public data objects packaged by `snedea/flybrain` at pinned commit:

```text
9191824d17871b7851645782d53d23f213ddb938
```

Those objects are derived from FlyWire FAFB v783. The runtime verifies their pinned Git blob hashes. Fly Umwelt does not reuse the reference project’s simulation or behavior source code.

Reference repository: `https://github.com/snedea/flybrain` (MIT-licensed code repository).

Primary dataset paper: Dorkenwald et al., *Nature* 634, 124–138 (2024), DOI `10.1038/s41586-024-07558-y`.

Review current FlyWire/Codex data terms and citation guidance before redistributing vendored data.

## BANC data

The optional BANC builder downloads public v888 compiled tables from the Lee Lab Google Cloud Storage bucket documented by the project and publication.

Primary paper: Court et al., *Nature* (2026), DOI `10.1038/s41586-026-10735-w`.

Static archive: Harvard Dataverse DOI `10.7910/DVN/7WTH1N`.

## Neural model parameters

Global LIF values are based on Shiu et al., *Nature* (2024), DOI `10.1038/s41586-024-07763-9`.

## Source-code provenance

No third-party runtime source code is bundled. The application, neural engine, workers, editor, parser, data builders, tests, and documentation in this ZIP were implemented independently. The loader supports a compact binary layout documented by the reference repository so its pinned public data can be used as a ready source.
