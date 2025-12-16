-- Enable RLS on tables
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;

-- Matches policies
CREATE POLICY "Allow anonymous read access" ON matches FOR SELECT USING (true);
CREATE POLICY "Allow service role full access" ON matches FOR ALL USING (auth.role() = 'service_role');

-- Rounds policies  
CREATE POLICY "Allow anonymous read access" ON rounds FOR SELECT USING (true);
CREATE POLICY "Allow service role full access" ON rounds FOR ALL USING (auth.role() = 'service_role');

-- Game rounds policies (may already exist, use IF NOT EXISTS pattern)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anonymous read access' AND tablename = 'game_rounds') THEN
    CREATE POLICY "Allow anonymous read access" ON game_rounds FOR SELECT USING (true);
  END IF;
END $$;

