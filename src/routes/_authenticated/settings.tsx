import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Akashik Records" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      setProfile(data);
    })();
  }, []);

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: profile.display_name, bio: profile.bio, pronouns: profile.pronouns,
    }).eq("id", profile.id);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Profile updated");
  };

  if (!profile) return <AppShell><div className="p-8">Loading...</div></AppShell>;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto p-8">
        <div className="hud-label text-primary mb-2">// configure</div>
        <h1 className="font-display text-4xl uppercase mb-6">Settings</h1>
        <div className="panel p-6 tactical-chamfer space-y-4">
          <div>
            <label className="hud-label block mb-1">callsign</label>
            <input value={profile.handle} disabled className="w-full bg-input border border-border px-3 py-2 opacity-60 tactical-chamfer" />
          </div>
          <div>
            <label className="hud-label block mb-1">display name</label>
            <input value={profile.display_name ?? ""} onChange={e => setProfile({ ...profile, display_name: e.target.value })} className="w-full bg-input border border-border px-3 py-2 focus:border-primary outline-none tactical-chamfer" />
          </div>
          <div>
            <label className="hud-label block mb-1">pronouns</label>
            <input value={profile.pronouns ?? ""} onChange={e => setProfile({ ...profile, pronouns: e.target.value })} className="w-full bg-input border border-border px-3 py-2 focus:border-primary outline-none tactical-chamfer" />
          </div>
          <div>
            <label className="hud-label block mb-1">bio</label>
            <textarea rows={4} value={profile.bio ?? ""} onChange={e => setProfile({ ...profile, bio: e.target.value })} className="w-full bg-input border border-border px-3 py-2 focus:border-primary outline-none tactical-chamfer font-serif" />
          </div>
          <button onClick={save} disabled={saving} className="bg-primary text-primary-foreground px-6 py-2 font-display uppercase text-xs tracking-widest hover:bg-primary-glow disabled:opacity-50 tactical-chamfer scanline-hover">{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </AppShell>
  );
}
