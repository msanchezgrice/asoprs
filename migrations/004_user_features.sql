CREATE TABLE IF NOT EXISTS user_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  feature_key TEXT NOT NULL,
  feature_module TEXT NOT NULL,
  delivery_strategy TEXT NOT NULL CHECK (delivery_strategy IN ('isolated_module', 'global_fix', 'config_change', 'content_weight')),
  enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  shipped_change_id UUID REFERENCES shipped_changes(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'graduated', 'deprecated', 'killed')),
  mount_point TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, feature_key)
);

ALTER TABLE user_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own features" ON user_features FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages features" ON user_features FOR ALL USING (true) WITH CHECK (true);
