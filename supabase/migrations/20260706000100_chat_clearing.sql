-- Add cleared_at to room_participants to support personal chat clearing
ALTER TABLE public.room_participants ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ DEFAULT NULL;

-- Allow room admins to delete any chat message in their room
CREATE POLICY "admin delete any chat" ON public.chat_messages
  FOR DELETE TO authenticated
  USING (public.is_room_admin(room_id, auth.uid()));
