-- Drop the restrictive books select policy
DROP POLICY IF EXISTS "read own or public books" ON public.books;

-- Allow any authenticated user to view book metadata (CORS file download remains secured by storage RLS)
CREATE POLICY "read own or public books" ON public.books
  FOR SELECT TO authenticated
  USING (true);
