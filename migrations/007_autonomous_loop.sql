-- Update default approval config with autonomous loop settings
UPDATE admin_settings SET value = value || '{
  "auto_approve_proposals": true,
  "auto_trigger_build": true,
  "auto_run_approval_agent": true,
  "max_improvements_per_day": 10,
  "auto_approve_max_confidence": "high",
  "auto_approve_delivery_strategies": ["global_fix", "config_change", "content_weight", "isolated_module"]
}'::jsonb
WHERE key = 'approval_config';
