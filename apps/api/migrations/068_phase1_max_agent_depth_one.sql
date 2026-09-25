-- Phase 1: agents attach under platform only (no nested agents).
-- Align platform max_agent_depth with DEFAULT_MAX_AGENT_DEPTH = 1.

UPDATE org_accounts
   SET max_agent_depth = 1,
       updated_at = now()
 WHERE type = 'platform'
   AND (max_agent_depth IS NULL OR max_agent_depth > 1);
