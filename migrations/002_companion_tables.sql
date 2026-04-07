-- Companion sessions
CREATE TABLE IF NOT EXISTS companion_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  recap_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Companion turns (transcript)
CREATE TABLE IF NOT EXISTS companion_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES companion_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'model', 'system')),
  transcript TEXT NOT NULL,
  prompt_kind TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL
);

-- Companion events (screenshots, actions, frustrations)
CREATE TABLE IF NOT EXISTS companion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES companion_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  screenshot_url TEXT,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

-- PM briefs
CREATE TABLE IF NOT EXISTS pm_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  summary_json JSONB NOT NULL,
  action_items JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shipped changes
CREATE TABLE IF NOT EXISTS shipped_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pm_brief_id UUID REFERENCES pm_briefs(id),
  title TEXT NOT NULL,
  description TEXT,
  origin_type TEXT NOT NULL CHECK (origin_type IN ('request', 'bug', 'pattern', 'annoyance')),
  origin_trace JSONB,
  feature_context JSONB,
  shipped_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'reverted'))
);

-- Change feedback
CREATE TABLE IF NOT EXISTS change_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_id UUID REFERENCES shipped_changes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  rating TEXT NOT NULL CHECK (rating IN ('better', 'same', 'worse')),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE companion_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE companion_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE companion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipped_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own sessions" ON companion_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own turns" ON companion_turns FOR ALL USING (
  session_id IN (SELECT id FROM companion_sessions WHERE user_id = auth.uid())
);
CREATE POLICY "Users see own events" ON companion_events FOR ALL USING (
  session_id IN (SELECT id FROM companion_sessions WHERE user_id = auth.uid())
);
CREATE POLICY "Authenticated users read briefs" ON pm_briefs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users read changes" ON shipped_changes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can submit change feedback" ON change_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own change feedback" ON change_feedback FOR SELECT USING (auth.uid() = user_id);
