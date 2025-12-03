# Models Dilemma - Troubleshooting Guide

## Current Issue
**Symptom**: Trigger.dev tasks run successfully (visible in Trigger.dev dashboard), but the UI shows no live matches or completed games.

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Trigger.dev   │────▶│    Supabase     │◀────│   Frontend UI   │
│  (runs games)   │     │  (game_rounds)  │     │  (displays)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │  Writes rounds        │  Realtime +           │
        │  via service key      │  Polling reads        │
        └───────────────────────┴───────────────────────┘
```

### Data Flow
1. **Trigger.dev** runs game logic, calls AI models via AI Gateway
2. **Each round** is saved to `game_rounds` table immediately
3. **Frontend** polls every 1s for live matches + subscribes to Supabase Realtime
4. **Live matches** = games with rounds but no `is_final_round=true` yet
5. **Completed games** = games with `is_final_round=true`

## Steps Taken to Debug

### 1. Consolidated to Single Table
**Problem**: Had confusing dual-table setup (`matches`+`rounds` for live, `game_rounds` for completed)

**Solution**: Simplified to single `game_rounds` table for everything
- Trigger writes each round immediately to `game_rounds`
- Frontend reads live + completed from same table
- Files changed: `src/trigger/run-tournament.ts`, `components/game-feed.tsx`

### 2. Fixed AI Gateway Integration
**Problem**: Trigger was using OpenRouter instead of Vercel AI Gateway

**Solution**: Updated to use `@ai-sdk/gateway`
```typescript
import { gateway } from "@ai-sdk/gateway";
// ...
generateText({ model: gateway(modelId), prompt, temperature: 0 })
```
- Requires `AI_GATEWAY_API_KEY` env var in Trigger.dev

### 3. Removed Vercel API Dependency
**Problem**: Original design called Vercel `/api/run-match` endpoint from Trigger, causing timeouts

**Solution**: Moved all game logic into Trigger.dev task
- AI calls happen directly in Trigger
- Supabase writes happen directly in Trigger
- No network calls to Vercel needed

### 4. Environment Variables in Trigger.dev
Required env vars for Trigger.dev production:
- `AI_GATEWAY_API_KEY` - Vercel AI Gateway key
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (bypasses RLS)

### 5. RLS Policies
**Problem**: Trigger uses service role (bypasses RLS), but frontend uses anon key

**Potential Issue**: If `game_rounds` table has RLS enabled but no public SELECT policy, frontend can't read data.

**Check/Fix**:
```sql
-- Check RLS status
SELECT relname, relrowsecurity 
FROM pg_class 
WHERE relname = 'game_rounds';

-- Add public read policy if needed
CREATE POLICY "Allow public read" ON game_rounds
FOR SELECT USING (true);
```

### 6. Supabase Realtime
**Requirement**: Realtime must be enabled on `game_rounds` table for instant updates

**Check**: Supabase Dashboard → Database → Replication → Ensure `game_rounds` is in the publication

**Fallback**: Frontend also polls every 1 second as backup

## Debugging Steps

### Check Trigger.dev Logs
1. Go to Trigger.dev dashboard
2. Click on a completed run
3. Look for log messages like:
   - `Round X complete` with actionA, actionB, scoreA, scoreB
   - `Game X failed` with error details

### Check Browser Console
With debug logging enabled, you should see:
```
[fetchLiveMatches] Query result: { roundCount: X, error: null }
[fetchLiveMatches] Games found: Y
[fetchLiveMatches] Game abc123: 5 rounds, final: false
[fetchLiveMatches] Live games: 1
[Realtime] New round: game_id, final: false
```

### Check Supabase Data
```sql
-- See recent rounds
SELECT game_id, round_number, is_final_round, game_timestamp 
FROM game_rounds 
ORDER BY game_timestamp DESC 
LIMIT 20;

-- Count by game
SELECT game_id, COUNT(*), MAX(is_final_round::int) as completed
FROM game_rounds 
WHERE game_timestamp > NOW() - INTERVAL '1 hour'
GROUP BY game_id;
```

## Likely Root Causes (if still not working)

### 1. RLS Blocking Frontend Reads
- Trigger writes succeed (uses service role)
- Frontend reads fail silently (uses anon key, blocked by RLS)
- **Fix**: Add SELECT policy for anon/public role

### 2. Supabase Realtime Not Enabled
- Polling works but with 1s delay
- Realtime events never fire
- **Fix**: Enable replication on `game_rounds` table

### 3. Wrong Supabase Project
- Trigger writes to different database than frontend reads
- **Fix**: Verify `SUPABASE_URL` matches in both Trigger.dev and Vercel env vars

### 4. AI Gateway Key Issues
- Trigger runs but AI calls fail silently
- Rounds saved with "error" decisions
- **Fix**: Verify `AI_GATEWAY_API_KEY` is correct in Trigger.dev

## Quick Verification

Run this in Supabase SQL Editor after triggering a test:
```sql
SELECT * FROM game_rounds 
ORDER BY created_at DESC 
LIMIT 5;
```

If rows appear → Trigger is writing correctly, issue is frontend reads
If no rows → Trigger isn't writing, check Trigger logs and env vars

