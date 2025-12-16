# Changelog

## 16DEC25 12:00PM - Performance Improvements
- Added database indexes for faster stats and ranking queries
- Optimized RLS policies for improved query performance
- Replaced stats polling with Supabase Realtime subscriptions (instant updates, zero polling overhead)
- Configured connection pooling for better resource management

## 04DEC25 10:25AM
- Removed truncation from reasoning streams (increased from 500/1000 to 4000 chars)
- Added fallback keyword parsing for models that don't use code blocks
- Fixed modal reasoning persistence (previous answer stays visible until new one streams in)
- Removed confusing "Processing..." status indicators (only show retries/errors now)
- Optimized Supabase realtime queries (removed redundant 1s polling, added debouncing)
- Fixed "Waiting for first move..." showing on subsequent rounds
- Included reasoning data in live match feed for immediate display when opening modals
