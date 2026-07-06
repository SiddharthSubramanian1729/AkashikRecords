-- Fix relationships foreign keys to point directly to public.profiles(id)
ALTER TABLE public.relationships DROP CONSTRAINT IF EXISTS relationships_requester_id_fkey;
ALTER TABLE public.relationships DROP CONSTRAINT IF EXISTS relationships_addressee_id_fkey;

ALTER TABLE public.relationships 
  ADD CONSTRAINT relationships_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.relationships 
  ADD CONSTRAINT relationships_addressee_id_fkey FOREIGN KEY (addressee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
