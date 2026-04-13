-- Add Haiku-specific token columns to api_usage.
-- Existing claude_input_tokens / claude_output_tokens remain Sonnet-only.
ALTER TABLE public.api_usage
  ADD COLUMN IF NOT EXISTS haiku_input_tokens  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS haiku_output_tokens INTEGER NOT NULL DEFAULT 0;

-- Update increment_usage to accept per-model token params (all default 0 for backward compat).
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id UUID,
  p_date DATE,
  p_input INTEGER DEFAULT 0,
  p_output INTEGER DEFAULT 0,
  p_tavily INTEGER DEFAULT 0,
  p_web_messages INTEGER DEFAULT 0,
  p_haiku_input INTEGER DEFAULT 0,
  p_haiku_output INTEGER DEFAULT 0
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.api_usage
    (user_id, date, claude_input_tokens, claude_output_tokens, tavily_searches, web_messages, haiku_input_tokens, haiku_output_tokens, updated_at)
  VALUES
    (p_user_id, p_date, p_input, p_output, p_tavily, p_web_messages, p_haiku_input, p_haiku_output, now())
  ON CONFLICT (user_id, date) DO UPDATE SET
    claude_input_tokens  = api_usage.claude_input_tokens  + EXCLUDED.claude_input_tokens,
    claude_output_tokens = api_usage.claude_output_tokens + EXCLUDED.claude_output_tokens,
    tavily_searches      = api_usage.tavily_searches      + EXCLUDED.tavily_searches,
    web_messages         = api_usage.web_messages         + EXCLUDED.web_messages,
    haiku_input_tokens   = api_usage.haiku_input_tokens   + EXCLUDED.haiku_input_tokens,
    haiku_output_tokens  = api_usage.haiku_output_tokens  + EXCLUDED.haiku_output_tokens,
    updated_at           = now();
END;
$$;
