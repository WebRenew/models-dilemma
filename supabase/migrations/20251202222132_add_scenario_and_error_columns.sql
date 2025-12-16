-- Add scenario column for cloaked game variants
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS scenario TEXT DEFAULT 'classic';

-- Add index for scenario filtering
CREATE INDEX IF NOT EXISTS idx_game_rounds_scenario ON game_rounds(scenario);

-- Add error tracking columns
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS error_count_a INTEGER DEFAULT 0;
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS error_count_b INTEGER DEFAULT 0;

