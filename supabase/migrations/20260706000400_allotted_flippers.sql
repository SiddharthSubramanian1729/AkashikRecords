-- Add allotted_flippers column to rooms table to track users given page turning permissions
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS allotted_flippers JSONB NOT NULL DEFAULT '[]'::jsonb;
