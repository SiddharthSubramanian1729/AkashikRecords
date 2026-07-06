-- Add is_public column to annotations table
ALTER TABLE public.annotations ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

-- Add allotted_annotations column to rooms table
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS allotted_annotations JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Update annotations policies
DROP POLICY IF EXISTS "manage own annotations" ON public.annotations;

CREATE POLICY "insert own annotations" ON public.annotations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update own annotations" ON public.annotations
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete own annotations" ON public.annotations
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "select own or public annotations" ON public.annotations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_public = TRUE);
