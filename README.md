# Training Pal

AI-driven training companion for run, swim, bike, and triathlon (including 70.3).

Static SPA + Supabase Auth, Postgres, and Edge Functions. Live site: [health.paulinevandenheede.com](https://health.paulinevandenheede.com).

## Local

```bash
node server.js
```

Copy `config.example.js` to `config.js` if you need a different Supabase project. `config.js` only holds the public URL + anon/publishable key.

## Edge functions

| Function | Role |
|----------|------|
| `garmin-sync` | Personal API key → activities, gear, wellness, metrics |
| `strava-sync` | OAuth connect/sync (invite passcode gated) |
| `strava-webhook` | Activity push + deauth |
| `coach` | Plan review, progress report, week feedback, week adaptations (Cursor Agents API) |

Deploy from `supabase/functions/<name>/index.ts` (full source only — never truncated stubs).

## Notes

- Garmin Personal API and Strava passcode keep this a small private group product.
- Coach uses wellness/recovery to warn when load looks too heavy; it prefers easing paces over gutting race-reachable volume.
- Missed-week / mid-week rescue / niggle adaptations are proposed as pending changes the athlete accepts — not silent plan rewrites.
