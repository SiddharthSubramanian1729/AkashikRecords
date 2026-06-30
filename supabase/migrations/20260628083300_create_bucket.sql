-- Create the 'book-files' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-files', 'book-files', true)
ON CONFLICT (id) DO NOTHING;

-- Create policies for storage.objects if RLS is enabled
CREATE POLICY "Allow public select from book-files" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'book-files');

CREATE POLICY "Allow authenticated insert to book-files" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'book-files');

CREATE POLICY "Allow owner delete from book-files" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'book-files' AND owner = auth.uid());
