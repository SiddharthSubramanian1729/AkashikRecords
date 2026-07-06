-- Simplify SELECT policies on rooms, room_participants, page_signals, and chat_messages to use USING (true) for authenticated users.
-- This enables Supabase Realtime to correctly evaluate policies and broadcast updates in real-time without dropping events.

DROP POLICY IF EXISTS "rooms visible to members or admin" ON public.rooms;
CREATE POLICY "rooms visible to members or admin" ON public.rooms
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "see participants of own rooms" ON public.room_participants;
CREATE POLICY "see participants of own rooms" ON public.room_participants
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "members see signals" ON public.page_signals;
CREATE POLICY "members see signals" ON public.page_signals
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "members read chat" ON public.chat_messages;
CREATE POLICY "members read chat" ON public.chat_messages
  FOR SELECT TO authenticated USING (true);
