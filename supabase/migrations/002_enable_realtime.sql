-- Enable realtime for Phase 2 (dashboard live updates + messages stream)
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Deduplicate WhatsApp webhook deliveries per user + provider message id
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_user_whatsapp_message_id
  ON public.messages (user_id, whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;
