-- 029: Add helper function to cap dashboard message history per user

CREATE OR REPLACE FUNCTION trim_user_messages(p_user_id UUID, p_keep INTEGER DEFAULT 50)
RETURNS void AS $$
BEGIN
  DELETE FROM messages
  WHERE user_id = p_user_id
    AND id NOT IN (
      SELECT id FROM messages
      WHERE user_id = p_user_id
      ORDER BY created_at DESC
      LIMIT p_keep
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
