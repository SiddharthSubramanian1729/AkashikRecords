-- Add status column to library entries to support completed shelf
ALTER TABLE public.library_entries ADD COLUMN status TEXT NOT NULL DEFAULT 'reading';
