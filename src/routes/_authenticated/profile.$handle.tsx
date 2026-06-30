import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/profile/$handle")({
  head: () => ({ meta: [{ title: "Profile — Akashik Records" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { handle } = Route.useParams();
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({ pages: 0, sessions: 0 });

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from("profiles").select("*").eq("handle", handle).maybeSingle();
      setProfile(p);
      if (p) {
        const { data: rs } = await supabase.from("reading_sessions").select("id, seconds_on_page").eq("user_id", p.id);
        setStats({ pages: rs?.length ?? 0, sessions: new Set((rs ?? []).map((s: any) => s.id)).size });
      }
    })();
  }, [handle]);

  if (!profile) return <AppShell><div className="p-8">Loading...</div></AppShell>;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto p-8">
        <div className="panel p-8 tactical-chamfer corner-brackets">
          <div className="flex items-center gap-6">
            <div className="size-24 bg-primary/20 border-2 border-primary tactical-chamfer flex items-center justify-center font-display text-4xl">{profile.display_name?.[0]}</div>
            <div>
              <div className="hud-label text-primary">// agent</div>
              <h1 className="font-display text-3xl uppercase">{profile.display_name}</h1>
              <div className="hud-label">@{profile.handle} {profile.pronouns && `· ${profile.pronouns}`}</div>
            </div>
          </div>
          {profile.bio && <p className="mt-6 font-serif italic text-muted-foreground">{profile.bio}</p>}

          <div className="grid grid-cols-2 gap-3 mt-6">
            <div className="panel-elevated p-3 tactical-chamfer">
              <div className="hud-label text-xs">PAGES READ</div>
              <div className="font-display text-2xl">{stats.pages}</div>
            </div>
            <div className="panel-elevated p-3 tactical-chamfer">
              <div className="hud-label text-xs">SESSIONS</div>
              <div className="font-display text-2xl">{stats.sessions}</div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
