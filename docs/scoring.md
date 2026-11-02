# Risk scoring engine

The engine lives in [`packages/scoring/src/scoring.ts`](../packages/scoring/src/scoring.ts), with its constants in [`config.ts`](../packages/scoring/src/config.ts). It is pure TypeScript, unit-tested, and shared by the app and the Edge Functions.

## Formula

For an area and a time band:

```
eligible = verified incidents, occurred in the last 24 months, from a registered source
raw      = Σ severity_weight × recency_decay × confidence_weight × source_credibility × band_weight
score    = round(100 × (1 − e^(−raw / baseline[area_type])))
```

| Term | Value |
|---|---|
| `severity_weight` | 1→0.5, 2→1, 3→2, 4→3.5, 5→5 |
| `recency_decay` | `0.5^(age_months / 6)`, so the weight halves every 6 months. Records older than 24 months are dropped |
| `confidence_weight` | high 1.0, medium 0.7, low 0.4 |
| `source_credibility` | from `sources.credibility_weight` (official 1.0 … weak 0.4) |
| `band_weight` | 1.0 if the incident happened in the selected band, otherwise 0.35. Multiplied by a category factor: robbery ×1.4 at night and ×1.2 in the evening; assault ×1.35 at night; sexual offences ×1.4 at night; burglary ×1.3 at night; vehicle crime ×1.2 at night; theft ×1.1 in the afternoon |
| `baseline` | residential 9, mixed 11, commercial 14, transport 14. Busy hubs have more people, so the same count means a lower per-person risk |

The saturating curve keeps a handful of serious incidents from pinning every busy area at 100. When `raw` equals the baseline, the score is 63.

## Ratings

| Rating | Score |
|---|---|
| Low | 0–33 |
| Moderate | 34–66 |
| High | 67–100 |
| Not enough data | fewer than 4 eligible incidents. No score is shown |

## Time bands (Africa/Lusaka, UTC+2, no DST)

| Band | Local time |
|---|---|
| morning | 05:00–12:00 |
| afternoon | 12:00–17:00 |
| evening | 17:00–21:00 |
| night | 21:00–05:00 |

"Now" uses the current band in Lusaka time.

## Breakdown

Every score comes with a breakdown the UI uses to explain it:

- **Counts:** incident count, weighted total, and the top categories and substances with their counts and shares.
- **Trend:** the last 3 months against the previous 3, labelled `up` at a ratio of ≥ 1.25, `down` at ≤ 0.8, otherwise `stable`. A trend needs at least 3 incidents.
- **Freshness and confidence:** the latest publish date, days since then, and the overall confidence (the average across incidents).
- **Demo data:** a `usesDemoData` flag and the demo share.

The headline rating used for saved-place alerts is the **worst band**, which keeps the alerts conservative.
