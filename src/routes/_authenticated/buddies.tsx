import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserPlus, Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/buddies")({
  head: () => ({ meta: [{ title: "Buddies — Akashik Records" }] }),
  component: BuddiesPage,
});

const LABEL_PRESETS = ["Partner", "Coven", "Study Mate", "Friend", "Mentor", "Book Club"];

function BuddiesPage() {
  const [me, setMe] = useState<any>(null);
  const [relationships, setRelationships] = useState<any[]>([]);
  const [handle, setHandle] = useState("");
  const [label, setLabel] = useState("Buddy");

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setMe(user);
    const { data } = await supabase
      .from("relationships")
      .select("id, label, status, requester_id, addressee_id, requester:profiles!relationships_requester_id_fkey(id, display_name, handle, avatar_url), addressee:profiles!relationships_addressee_id_fkey(id, display_name, handle, avatar_url)")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    setRelationships(data ?? []);
  };

  useEffect(() => { load(); }, []);

  const sendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    const cleaned = handle.replace(/^@/, "").trim();
    const { data: p } = await supabase.from("profiles").select("id").eq("handle", cleaned).maybeSingle();
    if (!p) { toast.error("No reader with that callsign"); return; }
    if (p.id === me.id) { toast.error("Can't add yourself"); return; }
    const { error } = await supabase.from("relationships").insert({ requester_id: me.id, addressee_id: p.id, label, status: "pending" });
    if (error) { toast.error(error.message); return; }
    toast.success("Buddy request sent");
    setHandle("");
    load();
  };

  const accept = async (id: string) => {
    await supabase.from("relationships").update({ status: "accepted" }).eq("id", id);
    load();
  };
  const decline = async (id: string) => {
    await supabase.from("relationships").delete().eq("id", id);
    load();
  };
  const updateLabel = async (id: string, newLabel: string) => {
    await supabase.from("relationships").update({ label: newLabel }).eq("id", id);
    load();
  };

  if (!me) return <AppShell><div className="p-8">Loading...</div></AppShell>;

  const incoming = relationships.filter(r => r.status === "pending" && r.addressee_id === me.id);
  const outgoing = relationships.filter(r => r.status === "pending" && r.requester_id === me.id);
  const accepted = relationships.filter(r => r.status === "accepted");

  const otherOf = (r: any) => (r.requester_id === me.id ? r.addressee : r.requester);

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto p-8">
        <div className="hud-label text-primary mb-2">// circle</div>
        <h1 className="font-display text-4xl uppercase mb-1">Buddies</h1>
        <p className="text-muted-foreground font-serif italic mb-6">Your reading circle and their relationship tags.</p>

        <form onSubmit={sendRequest} className="panel p-4 tactical-chamfer mb-8 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="hud-label block mb-1">callsign</label>
            <input value={handle} onChange={e => setHandle(e.target.value)} placeholder="@handle" className="w-full bg-input border border-border px-3 py-2 focus:border-primary outline-none tactical-chamfer" />
          </div>
          <div>
            <label className="hud-label block mb-1">label</label>
            <select value={label} onChange={e => setLabel(e.target.value)} className="bg-input border border-border px-3 py-2 focus:border-primary outline-none tactical-chamfer">
              {LABEL_PRESETS.map(l => <option key={l}>{l}</option>)}
              <option>Buddy</option>
            </select>
          </div>
          <button className="bg-primary text-primary-foreground px-4 py-2 text-xs font-display uppercase tracking-widest hover:bg-primary-glow tactical-chamfer flex items-center gap-1"><UserPlus className="size-3" /> Send</button>
        </form>

        {incoming.length > 0 && (
          <div className="mb-8">
            <h2 className="font-display uppercase mb-3"><span className="text-primary">// incoming</span> requests</h2>
            <div className="space-y-2">
              {incoming.map(r => {
                const o = otherOf(r);
                return (
                  <div key={r.id} className="panel p-3 tactical-chamfer flex items-center gap-3">
                    <div className="size-10 bg-primary/20 border border-primary tactical-chamfer flex items-center justify-center font-display">{o.display_name?.[0]}</div>
                    <div className="flex-1">
                      <div className="font-display uppercase">{o.display_name}</div>
                      <div className="hud-label text-xs">@{o.handle} · wants to be your {r.label}</div>
                    </div>
                    <button onClick={() => accept(r.id)} className="bg-primary text-primary-foreground p-2 tactical-chamfer hover:bg-primary-glow"><Check className="size-4" /></button>
                    <button onClick={() => decline(r.id)} className="panel-elevated p-2 tactical-chamfer hover:bg-accent"><X className="size-4" /></button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <h2 className="font-display uppercase mb-3"><span className="text-primary">// circle</span></h2>
        {accepted.length === 0 ? (
          <div className="panel p-8 text-center text-muted-foreground font-serif italic tactical-chamfer">No buddies yet.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {accepted.map(r => {
              const o = otherOf(r);
              return (
                <div key={r.id} className="panel p-4 tactical-chamfer corner-brackets flex items-center gap-3">
                  <div className="size-12 bg-primary/20 border border-primary tactical-chamfer flex items-center justify-center font-display text-lg">{o.display_name?.[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display uppercase truncate">{o.display_name}</div>
                    <div className="hud-label text-xs truncate">@{o.handle}</div>
                    <select value={r.label} onChange={e => updateLabel(r.id, e.target.value)} className="mt-1 bg-input border border-border px-2 py-1 text-xs tactical-chamfer">
                      {LABEL_PRESETS.map(l => <option key={l}>{l}</option>)}
                      <option>Buddy</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {outgoing.length > 0 && (
          <div className="mt-8">
            <h2 className="font-display uppercase mb-3"><span className="text-muted-foreground">// sent</span></h2>
            <div className="space-y-2">
              {outgoing.map(r => {
                const o = otherOf(r);
                return (
                  <div key={r.id} className="panel p-3 tactical-chamfer flex items-center gap-3 opacity-70">
                    <div className="size-8 bg-accent border border-border tactical-chamfer flex items-center justify-center font-display text-sm">{o.display_name?.[0]}</div>
                    <div className="flex-1 text-sm">@{o.handle} <span className="hud-label">· pending</span></div>
                    <button onClick={() => decline(r.id)} className="hud-label hover:text-destructive">cancel</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
