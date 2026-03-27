-- Agent memory: one row per user, stores a freeform text block that the AI
-- accumulates over time to remember contractor preferences and working style.
CREATE TABLE IF NOT EXISTS agent_memory (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_text text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own agent memory"
  ON agent_memory FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
