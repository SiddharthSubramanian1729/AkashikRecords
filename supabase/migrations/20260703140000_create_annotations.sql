-- Create annotations table to persist user drawings, highlights, underlines, and sticky notes per page
CREATE TABLE public.annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  page INT NOT NULL,
  drawings JSONB NOT NULL DEFAULT '[]'::jsonb, -- JSON array of stroke data: { tool, color, width, points: [] }
  notes JSONB NOT NULL DEFAULT '[]'::jsonb,    -- JSON array of notes: { id, x, y, text }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, book_id, page)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.annotations TO authenticated;
GRANT ALL ON public.annotations TO service_role;
ALTER TABLE public.annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manage own annotations" ON public.annotations 
  FOR ALL TO authenticated 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);
