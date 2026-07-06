-- Grant UPDATE privilege on library_entries to authenticated users so they can complete/reopen books
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_entries TO authenticated;

-- Drop the unique constraint on memories(room_id) to allow saving multiple memories per reading session room
ALTER TABLE public.memories DROP CONSTRAINT IF EXISTS memories_room_id_key;

-- Add memories details columns to align with frontend model
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS page_start INT;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS page_end INT;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS duration_seconds INT;
