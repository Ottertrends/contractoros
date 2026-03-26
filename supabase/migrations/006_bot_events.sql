-- Bot event log for in-app diagnostics
-- Stores the last N webhook events per user so developers can debug
-- without needing Vercel log access.

CREATE TABLE IF NOT EXISTS bot_events (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  event_type   text        NOT NULL, -- 'received' | 'skipped' | 'bootstrap' | 'replied' | 'error'
  result       text,                 -- skip reason or reply summary
  jid          text,                 -- remoteJid (may be partial for privacy)
  summary      text                  -- first 200 chars of message or error
);

CREATE INDEX bot_events_user_time ON bot_events (user_id, created_at DESC);

-- RLS: users can only read their own events
ALTER TABLE bot_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own bot events"
  ON bot_events FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert (webhook runs as service role)
CREATE POLICY "Service role insert bot events"
  ON bot_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role delete bot events"
  ON bot_events FOR DELETE
  USING (true);
