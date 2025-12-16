-- Streamer state table for continuous tournament coordination
CREATE TABLE IF NOT EXISTS streamer_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Singleton row
  is_running BOOLEAN DEFAULT FALSE,
  current_session_id TEXT,
  games_this_session INTEGER DEFAULT 0,
  session_started_at TIMESTAMPTZ,
  last_game_at TIMESTAMPTZ,
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure only one row exists
INSERT INTO streamer_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE streamer_state ENABLE ROW LEVEL SECURITY;

-- Policies for streamer state
CREATE POLICY "Allow public read" ON streamer_state FOR SELECT USING (true);
CREATE POLICY "Allow all writes" ON streamer_state FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates" ON streamer_state FOR UPDATE USING (true);
CREATE POLICY "Allow service role full access" ON streamer_state FOR ALL USING (auth.role() = 'service_role');

-- Create game_live_status table for real-time game status
CREATE TABLE IF NOT EXISTS game_live_status (
  game_id UUID PRIMARY KEY,
  model_a_id TEXT NOT NULL,
  model_a_name TEXT NOT NULL,
  model_b_id TEXT NOT NULL,
  model_b_name TEXT NOT NULL,
  current_round INTEGER DEFAULT 0,
  score_a INTEGER DEFAULT 0,
  score_b INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  retry_count_a INTEGER DEFAULT 0,
  retry_count_b INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for game_live_status
ALTER TABLE game_live_status ENABLE ROW LEVEL SECURITY;

-- Policies for game_live_status
CREATE POLICY "Allow public read" ON game_live_status FOR SELECT USING (true);
CREATE POLICY "Allow public write" ON game_live_status FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON game_live_status FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON game_live_status FOR DELETE USING (true);

