# Changelog

## 04DEC25 10:25AM
- Removed truncation from reasoning streams (increased from 500/1000 to 4000 chars)
- Added fallback keyword parsing for models that don't use code blocks
- Fixed modal reasoning persistence (previous answer stays visible until new one streams in)
- Removed confusing "Processing..." status indicators (only show retries/errors now)
- Optimized Supabase realtime queries (removed redundant 1s polling, added debouncing)
- Fixed "Waiting for first move..." showing on subsequent rounds
- Included reasoning data in live match feed for immediate display when opening modals




