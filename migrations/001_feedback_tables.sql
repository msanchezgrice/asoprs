-- Feedback entries (annoyance inbox)
CREATE TABLE IF NOT EXISTS feedback_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  screen TEXT NOT NULL,
  tag TEXT NOT NULL,
  free_text TEXT,
  context_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User memory profiles
CREATE TABLE IF NOT EXISTS user_memory_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id),
  exam_date DATE,
  weak_topics TEXT[] DEFAULT '{}',
  preferred_session_length_min INT DEFAULT 30,
  preferred_packet_size INT DEFAULT 20,
  last_pain_points TEXT[] DEFAULT '{}',
  format_usage_stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE feedback_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memory_profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can insert own feedback" ON feedback_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own feedback" ON feedback_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all feedback" ON feedback_entries FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_memory_profiles WHERE user_id = auth.uid() AND format_usage_stats->>'role' = 'admin')
);
CREATE POLICY "Users can manage own profile" ON user_memory_profiles FOR ALL USING (auth.uid() = user_id);
