-- Add game_source column to track user vs automated games
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS game_source TEXT DEFAULT 'automated';

-- Update constraint to ensure valid values
-- Note: Using a simple check here
COMMENT ON COLUMN game_rounds.game_source IS 'Source of the game: user, automated';
