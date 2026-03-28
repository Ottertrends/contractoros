-- Subscription fields on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_ended_at TIMESTAMPTZ;

-- API usage tracking table
CREATE TABLE IF NOT EXISTS public.api_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  claude_input_tokens INT NOT NULL DEFAULT 0,
  claude_output_tokens INT NOT NULL DEFAULT 0,
  tavily_searches INT NOT NULL DEFAULT 0,
  web_messages INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;
-- No RLS policies — only service role can read/write

-- Atomic increment RPC
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id UUID,
  p_date DATE,
  p_input INT DEFAULT 0,
  p_output INT DEFAULT 0,
  p_tavily INT DEFAULT 0,
  p_web_messages INT DEFAULT 0
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.api_usage(user_id, date, claude_input_tokens, claude_output_tokens, tavily_searches, web_messages)
  VALUES (p_user_id, p_date, p_input, p_output, p_tavily, p_web_messages)
  ON CONFLICT (user_id, date) DO UPDATE SET
    claude_input_tokens = api_usage.claude_input_tokens + EXCLUDED.claude_input_tokens,
    claude_output_tokens = api_usage.claude_output_tokens + EXCLUDED.claude_output_tokens,
    tavily_searches = api_usage.tavily_searches + EXCLUDED.tavily_searches,
    web_messages = api_usage.web_messages + EXCLUDED.web_messages,
    updated_at = now();
END;
$$;
