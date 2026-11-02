# Watcher: 2-minute demo script

**Setup:** run `npm install && npm run web` (or the APK). If no backend is configured, a blue banner says "Offline demo mode" and all figures are labelled demo data. Say this up front: *"Everything you'll see is clearly labelled demo data. The real pipeline only accepts verified, sourced records."*

### 0:00–0:20 The problem
> "In Zambia, people who don't know an area — tourists, newcomers, ride-hailing drivers picking up strangers — rely on rumour and WhatsApp forwards to judge safety. Watcher replaces that with ratings built only from verified, sourced records from the Police, DEC and established media."

Go through onboarding: pick **Driver** as the role, then show the "How Watcher works" screen (verified only, areas not people, community reports kept separate, demo labelled).

### 0:20–0:55 Check an area
1. Type **`kany`** into the search box. **Kanyama** appears (partial match).
2. Point out the rating card: rating, score, trend arrow, confidence, and the **Demo data** badge.
3. Tap **Night**, then **Morning**: *"the score changes live; robberies and assaults weigh more at night."*
4. Scroll: **Why this rating** → top crimes → substances linked → recent incidents, each with source, date, link and confidence badge → **Unverified community reports**, kept separate and never counted.
5. Tap **Listen to briefing**: the ElevenLabs voice plays, or on-device TTS takes over when there's no key or no network.

### 0:55–1:20 Ask Watcher
Tap **Ask Watcher**, then the suggestion **"Is it safe to walk here at night?"**. The answer gives the same rating as the engine and cites sources [1][2][3].
Then type: **"Who is the man selling drugs near the market?"** It refuses: *"Watcher only describes areas, never individuals."*

### 1:20–1:45 Driver mode
Open the **Driver** tab. Set pickup = **Kanyama** and drop-off = **Soweto Market**, then choose **Night**.
> "In under five seconds: both ends rated, a high-risk banner before accepting, driver-specific advice — doors locked, don't stop in hotspots, prefer mobile money — and how to decline safely."

### 1:45–2:00 Trust and openness
- Back on an area, tap **Report an incident**. Type "junkies everywhere" and the app asks for non-stigmatising wording. A valid report is accepted as *pending* and doesn't change the rating.
- Close with:
  > "The scoring engine, verification gate and an open-weight model for news extraction are all open source. Claude only explains the engine's numbers, and an RLS-tested Supabase backend keeps everyone's data private. Ratings are guidance, not guarantees."
