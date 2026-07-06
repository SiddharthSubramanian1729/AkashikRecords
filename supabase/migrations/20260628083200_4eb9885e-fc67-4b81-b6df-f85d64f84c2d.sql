
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TYPE public.book_source AS ENUM ('upload','gutenberg','openlibrary','libby');
CREATE TYPE public.room_mode AS ENUM ('solo','duo','party');
CREATE TYPE public.room_status AS ENUM ('active','paused','ended');
CREATE TYPE public.participant_role AS ENUM ('admin','participant','observer');
CREATE TYPE public.relationship_status AS ENUM ('pending','accepted','blocked');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  pronouns TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by all authed" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ============ AUTO PROFILE ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_handle TEXT;
  final_handle TEXT;
  i INT := 0;
BEGIN
  base_handle := lower(regexp_replace(coalesce(NEW.raw_user_meta_data->>'handle', split_part(NEW.email,'@',1), 'reader'), '[^a-z0-9]', '', 'g'));
  IF base_handle = '' THEN base_handle := 'reader'; END IF;
  final_handle := base_handle;
  WHILE EXISTS(SELECT 1 FROM public.profiles WHERE handle = final_handle) LOOP
    i := i + 1;
    final_handle := base_handle || i::text;
  END LOOP;
  INSERT INTO public.profiles (id, handle, display_name)
  VALUES (NEW.id, final_handle, coalesce(NEW.raw_user_meta_data->>'display_name', final_handle));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ updated_at helper ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ RELATIONSHIPS (buddies) ============
CREATE TABLE public.relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Buddy',
  status public.relationship_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requester_id <> addressee_id),
  UNIQUE(requester_id, addressee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.relationships TO authenticated;
GRANT ALL ON public.relationships TO service_role;
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "see own relationships" ON public.relationships FOR SELECT TO authenticated USING (auth.uid() IN (requester_id, addressee_id));
CREATE POLICY "create relationship as requester" ON public.relationships FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "update if involved" ON public.relationships FOR UPDATE TO authenticated USING (auth.uid() IN (requester_id, addressee_id)) WITH CHECK (auth.uid() IN (requester_id, addressee_id));
CREATE POLICY "delete if involved" ON public.relationships FOR DELETE TO authenticated USING (auth.uid() IN (requester_id, addressee_id));
CREATE TRIGGER relationships_updated_at BEFORE UPDATE ON public.relationships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ BOOKS ============
CREATE TABLE public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source public.book_source NOT NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  author TEXT,
  cover_url TEXT,
  file_path TEXT,
  external_url TEXT,
  total_pages INT,
  language TEXT,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO authenticated;
GRANT ALL ON public.books TO service_role;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or public books" ON public.books FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert own books" ON public.books FOR INSERT TO authenticated WITH CHECK (added_by = auth.uid());
CREATE POLICY "update own books" ON public.books FOR UPDATE TO authenticated USING (added_by = auth.uid());
CREATE POLICY "delete own books" ON public.books FOR DELETE TO authenticated USING (added_by = auth.uid());

-- ============ LIBRARY ENTRIES ============
CREATE TABLE public.library_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, book_id)
);
GRANT SELECT, INSERT, DELETE ON public.library_entries TO authenticated;
GRANT ALL ON public.library_entries TO service_role;
ALTER TABLE public.library_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manage own library" ON public.library_entries FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ ROOMS ============
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode public.room_mode NOT NULL DEFAULT 'solo',
  break_policy JSONB NOT NULL DEFAULT '{"type":"none"}'::jsonb,
  current_page INT NOT NULL DEFAULT 1,
  status public.room_status NOT NULL DEFAULT 'active',
  name TEXT,
  allotted_annotations JSONB NOT NULL DEFAULT '[]'::jsonb,
  allotted_flippers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER rooms_updated_at BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ROOM PARTICIPANTS ============
CREATE TABLE public.room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.participant_role NOT NULL DEFAULT 'participant',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  UNIQUE(room_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_participants TO authenticated;
GRANT ALL ON public.room_participants TO service_role;
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;

-- helper: is user a participant
CREATE OR REPLACE FUNCTION public.is_room_member(_room UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.room_participants WHERE room_id = _room AND user_id = _user AND left_at IS NULL)
$$;

CREATE OR REPLACE FUNCTION public.is_room_admin(_room UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.rooms WHERE id = _room AND admin_user_id = _user)
$$;

-- rooms policies
CREATE POLICY "rooms visible to members or admin" ON public.rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "create rooms as admin" ON public.rooms FOR INSERT TO authenticated WITH CHECK (admin_user_id = auth.uid());
CREATE POLICY "admin updates room" ON public.rooms FOR UPDATE TO authenticated USING (admin_user_id = auth.uid()) WITH CHECK (admin_user_id = auth.uid());
CREATE POLICY "admin deletes room" ON public.rooms FOR DELETE TO authenticated USING (admin_user_id = auth.uid());

-- participants policies
CREATE POLICY "see participants of own rooms" ON public.room_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "join room" ON public.room_participants FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.is_room_admin(room_id, auth.uid()));
CREATE POLICY "update own participation or admin" ON public.room_participants FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_room_admin(room_id, auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_room_admin(room_id, auth.uid()));
CREATE POLICY "leave room or admin removes" ON public.room_participants FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_room_admin(room_id, auth.uid()));

-- ============ PAGE SIGNALS ============
CREATE TABLE public.page_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page INT NOT NULL,
  signaled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id, page)
);
GRANT SELECT, INSERT, DELETE ON public.page_signals TO authenticated;
GRANT ALL ON public.page_signals TO service_role;
ALTER TABLE public.page_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members see signals" ON public.page_signals FOR SELECT TO authenticated USING (true);
CREATE POLICY "members signal own" ON public.page_signals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_room_member(room_id, auth.uid()));
CREATE POLICY "members remove own signal" ON public.page_signals FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============ READING SESSIONS (pace tracking) ============
CREATE TABLE public.reading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page INT NOT NULL,
  seconds_on_page INT NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.reading_sessions TO authenticated;
GRANT ALL ON public.reading_sessions TO service_role;
ALTER TABLE public.reading_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "see own sessions" ON public.reading_sessions FOR SELECT TO authenticated USING (user_id = auth.uid() OR (room_id IS NOT NULL AND (public.is_room_member(room_id, auth.uid()) OR public.is_room_admin(room_id, auth.uid()))));
CREATE POLICY "insert own sessions" ON public.reading_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============ BOOKMARKS ============
CREATE TABLE public.bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  page INT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookmarks TO authenticated;
GRANT ALL ON public.bookmarks TO service_role;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manage own bookmarks" ON public.bookmarks FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ CHAT MESSAGES ============
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read chat" ON public.chat_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "members write chat" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND (public.is_room_member(room_id, auth.uid()) OR public.is_room_admin(room_id, auth.uid())));
CREATE POLICY "delete own chat" ON public.chat_messages FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============ MEMORIES ============
CREATE TABLE public.memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE SET NULL,
  saved_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT,
  page_start INT,
  page_end INT,
  duration_seconds INT,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  chat_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.memories TO authenticated;
GRANT ALL ON public.memories TO service_role;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants see memory" ON public.memories FOR SELECT TO authenticated USING (saved_by = auth.uid() OR participants @> to_jsonb(auth.uid()::text));
CREATE POLICY "save memory if admin" ON public.memories FOR INSERT TO authenticated WITH CHECK (saved_by = auth.uid());
CREATE POLICY "delete own memory" ON public.memories FOR DELETE TO authenticated USING (saved_by = auth.uid());

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "see own notif" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "update own notif" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "insert notif if from self or admin" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "delete own notif" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============ FLIP PAGE RPC ============
CREATE OR REPLACE FUNCTION public.flip_page(_room UUID, _force BOOLEAN DEFAULT FALSE)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  active_count INT;
  done_count INT;
  new_page INT;
BEGIN
  SELECT * INTO r FROM public.rooms WHERE id = _room FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'room not found'; END IF;
  IF NOT (public.is_room_member(_room, auth.uid()) OR r.admin_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not a member';
  END IF;
  IF _force THEN
    IF r.admin_user_id <> auth.uid() THEN RAISE EXCEPTION 'only admin can force flip'; END IF;
  ELSE
    SELECT count(*) INTO active_count FROM public.room_participants WHERE room_id = _room AND left_at IS NULL AND role <> 'observer';
    SELECT count(DISTINCT user_id) INTO done_count FROM public.page_signals WHERE room_id = _room AND page = r.current_page;
    IF done_count < active_count THEN RAISE EXCEPTION 'not everyone is done yet'; END IF;
  END IF;
  new_page := r.current_page + 1;
  UPDATE public.rooms SET current_page = new_page, updated_at = now() WHERE id = _room;
  DELETE FROM public.page_signals WHERE room_id = _room AND page < new_page;
  RETURN new_page;
END;
$$;

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.page_signals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
