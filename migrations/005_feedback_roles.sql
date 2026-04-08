-- Add role and feedback_type columns to feedback_entries
ALTER TABLE feedback_entries ADD COLUMN IF NOT EXISTS feedback_type TEXT DEFAULT 'user' CHECK (feedback_type IN ('user', 'builder'));
ALTER TABLE feedback_entries ADD COLUMN IF NOT EXISTS user_role TEXT DEFAULT 'user';
ALTER TABLE feedback_entries ADD COLUMN IF NOT EXISTS page_category TEXT;

-- Builder roles table for tier-based access
CREATE TABLE IF NOT EXISTS builder_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id),
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'builder', 'tester', 'user')),
  can_modify JSONB DEFAULT '["*"]',  -- array of page categories this role can propose changes to
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE builder_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own role" ON builder_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages roles" ON builder_roles FOR ALL USING (true) WITH CHECK (true);

-- Seed admin role for msanchezgrice
-- (This needs to be run after the user exists in auth.users)
-- INSERT INTO builder_roles (user_id, role, can_modify)
--   SELECT id, 'admin', '["*"]'::jsonb FROM auth.users WHERE email = 'msanchezgrice@gmail.com'
--   ON CONFLICT (user_id) DO UPDATE SET role = 'admin', can_modify = '["*"]'::jsonb;

-- Add feedback_type to companion_turns and companion_events
ALTER TABLE companion_turns ADD COLUMN IF NOT EXISTS feedback_type TEXT DEFAULT 'user';
ALTER TABLE companion_events ADD COLUMN IF NOT EXISTS feedback_type TEXT DEFAULT 'user';
