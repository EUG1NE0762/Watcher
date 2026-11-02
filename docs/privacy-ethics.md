# Privacy and ethics

## Principles

1. **Areas, not people.** Watcher describes places and situations. It never identifies, photographs or profiles individuals, including suspects, victims and people struggling with addiction.
2. **Verified or nothing.** Ratings come only from records with a traceable credible source. Untraceable records are rejected. When data is thin, the app says "Not enough data" instead of guessing.
3. **Non-stigmatising language.** The app says "substance abuse" and "people who use drugs", never slurs. Support and rehabilitation resources sit beside every warning.
4. **Honest about demo data.** Demo records are fictional, attributed to a fictional source, flagged `is_demo`, and badged everywhere they're used.
5. **Guidance, not guarantees.** The disclaimer appears on rating screens, in briefings and in assistant answers.

## How the code enforces this

| Risk | Safeguard |
|---|---|
| Names in ingested news | The extraction prompt forbids names and identifying details. Only the model's one-sentence summary and the URL are stored, never the article text |
| Assistant speculating about people | Questions like "who is…", "name of…" or "where does … live" are refused before any model call. The system prompt forbids it as a second layer |
| Assistant inventing a different rating | The engine's rating is passed in, and any answer that states a different rating is replaced with the data-only summary |
| Community reports naming people | Notes with phone numbers, emails, links, profanity or stigmatising labels are rejected (client and server). There are no photo uploads. Moderators see report content without user IDs |
| Report spam and abuse | Server-side limit of 5 reports per user per hour, plus per-isolate limits on the assistant (20/hour) and briefings (30/hour) |
| Location tracking | Location is resolved to an area on the device. Coordinates are sent only when the user turns on "attach my location" for a report, and the public report view never exposes them |
| Data access | RLS on every table: users see only their own saved places, history and reports. Incidents, scores and sources are read-only to clients. Only the service role (Edge Functions) writes them. All of this is covered by `supabase/tests/rls.test.ts` |
| Account data | Accounts are anonymous (no email or phone). "Delete my account and data" calls `delete_my_account()`, which cascades to every user-owned table |
| Secrets | API keys exist only as Edge Function secrets. `scripts/check-secrets.mjs`, which runs in `npm test`, fails on committed keys or app code that references server-only secret names |
| Logs | Functions log event names and counts only, never user IDs, notes or coordinates |

## Known limitations

- **Demo ratings name real neighbourhoods.** They are arbitrary and must be replaced with real verified records before any public release, so the app doesn't reinforce stereotypes about those communities.
- **Crime records reflect reporting as well as crime.** Areas with more policing or media attention can look worse. Treat ratings as one input among others.
- **Translations need review.** The Nyanja and Bemba strings are drafts and need review by native speakers.
- **Emergency numbers need confirming.** Published sources conflict on some of them (see `app/src/config/resources.json`). Confirm them locally before launch.
