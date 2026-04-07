-- Migration: Add personalized brief support to pm_briefs
-- Adds user_id and brief_type columns to support per-user briefs alongside global briefs.
-- delivery_strategy is stored in action_items JSONB (no schema change needed).

ALTER TABLE pm_briefs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brief_type TEXT DEFAULT 'global' CHECK (brief_type IN ('global', 'user'));

-- Index for efficient per-user brief lookups
CREATE INDEX IF NOT EXISTS idx_pm_briefs_user_id ON pm_briefs(user_id);
CREATE INDEX IF NOT EXISTS idx_pm_briefs_brief_type ON pm_briefs(brief_type);

-- RLS: users can see global briefs + their own user briefs
-- Drop existing policies if any, then recreate
DO $$
BEGIN
  -- Allow all authenticated users to see global briefs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pm_briefs_global_read' AND tablename = 'pm_briefs') THEN
    CREATE POLICY pm_briefs_global_read ON pm_briefs
      FOR SELECT
      USING (brief_type = 'global');
  END IF;

  -- Allow users to see their own user briefs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pm_briefs_user_read' AND tablename = 'pm_briefs') THEN
    CREATE POLICY pm_briefs_user_read ON pm_briefs
      FOR SELECT
      USING (brief_type = 'user' AND user_id = auth.uid());
  END IF;
END
$$;
