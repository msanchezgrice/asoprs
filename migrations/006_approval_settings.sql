CREATE TABLE IF NOT EXISTS admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users read settings" ON admin_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Service role manages settings" ON admin_settings FOR ALL USING (true) WITH CHECK (true);

-- Seed default approval settings
INSERT INTO admin_settings (key, value) VALUES (
  'approval_config',
  '{
    "mode": "dry_run",
    "risk_threshold": 30,
    "auto_merge_enabled": false,
    "require_tests_pass": true,
    "require_new_tests": true,
    "max_files_changed": 10,
    "max_lines_changed": 500,
    "blocked_paths": ["src/app/api/auth/", "migrations/"],
    "model": "claude-opus-4-6",
    "notify_on_approve": true,
    "notify_on_escalate": true
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;
