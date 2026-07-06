import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserPlus, Check, X, Users, UserMinus, Clock, Compass, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/buddies")({
  head: () => ({ meta: [{ title: "Buddies — Akashik Records" }] }),
  component: BuddiesPage,
});

const LABEL_PRESETS = ["Partner", "Coven", "Study Mate", "Friend", "Mentor", "Book Club"];

function BuddiesPage() {
  const [me, setMe] = useState<any>(null);
  const [relationships, setRelationships] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"circle" | "requests" | "find">("circle");
  
  // Search state
  const [searchHandle, setSearchHandle] = useState("");
  const [requestLabel, setRequestLabel] = useState("Buddy");

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setMe(user);

    // 1. Fetch relationships (involving me)
    const { data: rels } = await supabase
      .from("relationships")
      .select("id, label, status, requester_id, addressee_id, requester:profiles!relationships_requester_id_fkey(id, display_name, handle, avatar_url), addressee:profiles!relationships_addressee_id_fkey(id, display_name, handle, avatar_url)")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    setRelationships(rels ?? []);

    // 2. Fetch other readers in the registry
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url")
      .neq("id", user.id)
      .limit(50);
    setProfiles(profs ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const sendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchHandle.trim()) return;
    const cleaned = searchHandle.replace(/^@/, "").trim();
    
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("handle", cleaned)
      .maybeSingle();

    if (!targetProfile) {
      toast.error("No reader with that callsign found");
      return;
    }

    if (targetProfile.id === me.id) {
      toast.error("You cannot add yourself as a buddy");
      return;
    }

    const { error } = await supabase
      .from("relationships")
      .insert({ 
        requester_id: me.id, 
        addressee_id: targetProfile.id, 
        label: requestLabel, 
        status: "pending" 
      });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Buddy request sent");
      setSearchHandle("");
      load();
    }
  };

  const acceptRequest = async (id: string) => {
    const { error } = await supabase
      .from("relationships")
      .update({ status: "accepted" })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Request accepted!");
      load();
    }
  };

  const removeRelationship = async (id: string) => {
    const { error } = await supabase
      .from("relationships")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Buddy relationship removed");
      load();
    }
  };

  const updateLabel = async (id: string, newLabel: string) => {
    const { error } = await supabase
      .from("relationships")
      .update({ label: newLabel })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Label updated");
      load();
    }
  };

  const getProfileRelation = (profileId: string) => {
    const rel = relationships.find(
      r => (r.requester_id === me.id && r.addressee_id === profileId) || 
           (r.requester_id === profileId && r.addressee_id === me.id)
    );
    if (!rel) return { type: "none", id: null };
    if (rel.status === "accepted") return { type: "buddies", id: rel.id };
    if (rel.status === "pending") {
      return { 
        type: rel.requester_id === me.id ? "sent" : "incoming", 
        id: rel.id 
      };
    }
    return { type: "none", id: null };
  };

  if (!me) {
    return (
      <AppShell>
        <div className="p-8 text-center text-sm font-mono tracking-widest text-muted-foreground animate-pulse">// initializing terminal</div>
      </AppShell>
    );
  }

  const incoming = relationships.filter(r => r.status === "pending" && r.addressee_id === me.id);
  const outgoing = relationships.filter(r => r.status === "pending" && r.requester_id === me.id);
  const accepted = relationships.filter(r => r.status === "accepted");

  const otherOf = (r: any) => (r.requester_id === me.id ? r.addressee : r.requester);

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto p-8">
        <div className="hud-label text-primary mb-2">// circle</div>
        <h1 className="font-display text-4xl uppercase mb-1">Buddies</h1>
        <p className="text-muted-foreground font-serif italic mb-6">Manage your reading circle, pending requests, and buddy profiles.</p>

        {/* Tab Selection Row */}
        <div className="flex items-center gap-1 border-b border-border/60 pb-3 mb-6">
          {[
            { id: "circle", label: "My Circle", count: accepted.length, icon: Users },
            { id: "requests", label: "Requests", count: incoming.length + outgoing.length, icon: Clock },
            { id: "find", label: "Find Readers", count: null, icon: Compass },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 text-xs font-display uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1.5 border tactical-chamfer ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground border-primary shadow-tactical"
                  : "bg-accent/20 border-border/40 hover:bg-accent/40 text-stone-500 hover:text-stone-850 dark:hover:text-stone-100"
              }`}
            >
              <tab.icon className="size-3.5" />
              <span>{tab.label}</span>
              {tab.count !== null && tab.count > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-primary-foreground text-primary text-[8px] font-sans font-bold rounded-full">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* TAB 1: ACTIVE CIRCLE */}
        {activeTab === "circle" && (
          <div>
            {accepted.length === 0 ? (
              <div className="panel p-12 text-center text-muted-foreground font-serif italic tactical-chamfer">
                No active buddies yet. Go to Find Readers to build your reading circle.
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {accepted.map(r => {
                  const o = otherOf(r);
                  return (
                    <div key={r.id} className="panel p-4 tactical-chamfer border border-primary/10 shadow-tactical flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="size-12 bg-primary/20 border border-primary tactical-chamfer flex items-center justify-center font-display text-lg text-primary select-none">
                          {o.display_name?.[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-display uppercase truncate text-sm text-foreground">{o.display_name}</div>
                          <div className="hud-label text-[10px] text-muted-foreground">@{o.handle}</div>
                          <select 
                            value={r.label} 
                            onChange={e => updateLabel(r.id, e.target.value)} 
                            className="mt-1.5 bg-input border border-border/80 px-2 py-0.5 text-[9px] font-sans uppercase tracking-wider text-muted-foreground outline-none focus:border-primary tactical-chamfer"
                          >
                            {LABEL_PRESETS.map(l => <option key={l}>{l}</option>)}
                            <option>Buddy</option>
                          </select>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => removeRelationship(r.id)} 
                        className="text-stone-500 hover:text-red-500 p-2 border border-border/30 hover:border-red-500/30 hover:bg-red-500/5 rounded transition-all cursor-pointer"
                        title="Remove Buddy"
                      >
                        <UserMinus className="size-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: REQUESTS (INCOMING & OUTGOING SENT) */}
        {activeTab === "requests" && (
          <div className="space-y-8 animate-fadeIn">
            {/* Incoming Requests */}
            <div>
              <h2 className="font-display uppercase text-sm mb-3 tracking-wider">// Incoming Requests ({incoming.length})</h2>
              {incoming.length === 0 ? (
                <div className="panel p-6 text-center text-muted-foreground font-serif italic text-xs tactical-chamfer">
                  No incoming requests at the moment.
                </div>
              ) : (
                <div className="space-y-2">
                  {incoming.map(r => {
                    const o = otherOf(r);
                    return (
                      <div key={r.id} className="panel p-3.5 tactical-chamfer flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="size-10 bg-primary/20 border border-primary tactical-chamfer flex items-center justify-center font-display text-primary font-bold">
                            {o.display_name?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="font-display uppercase text-sm text-foreground">{o.display_name}</div>
                            <div className="hud-label text-[10px] text-muted-foreground">@{o.handle} · wants to be your <span className="text-primary font-semibold">{r.label}</span></div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button 
                            onClick={() => acceptRequest(r.id)} 
                            className="bg-primary text-primary-foreground p-2 hover:bg-primary-glow tactical-chamfer cursor-pointer flex items-center justify-center"
                            title="Accept request"
                          >
                            <Check className="size-3.5" />
                          </button>
                          <button 
                            onClick={() => removeRelationship(r.id)} 
                            className="panel-elevated p-2 hover:bg-red-500/10 hover:border-red-500/30 text-stone-500 hover:text-red-500 border border-border/40 tactical-chamfer cursor-pointer flex items-center justify-center"
                            title="Decline request"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sent Pending Requests */}
            <div>
              <h2 className="font-display uppercase text-sm mb-3 tracking-wider">// Sent Requests ({outgoing.length})</h2>
              {outgoing.length === 0 ? (
                <div className="panel p-6 text-center text-muted-foreground font-serif italic text-xs tactical-chamfer">
                  No pending sent requests.
                </div>
              ) : (
                <div className="space-y-2">
                  {outgoing.map(r => {
                    const o = otherOf(r);
                    return (
                      <div key={r.id} className="panel p-3.5 tactical-chamfer flex items-center justify-between gap-3 opacity-90">
                        <div className="flex items-center gap-3">
                          <div className="size-9 bg-accent border border-border tactical-chamfer flex items-center justify-center font-display text-muted-foreground text-sm">
                            {o.display_name?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="text-xs font-display uppercase text-muted-foreground">@{o.handle}</div>
                            <div className="hud-label text-[8px] text-stone-400">pending response · tag: {r.label}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {/* Dev Test acceptance bypass */}
                          <button 
                            onClick={() => acceptRequest(r.id)} 
                            className="text-[9px] font-sans font-bold uppercase tracking-wider text-primary border border-primary/20 hover:border-primary px-2 py-1 rounded transition cursor-pointer select-none"
                            title="Shortcut: accept this request immediately on their behalf"
                          >
                            Accept (Dev Test)
                          </button>
                          <button 
                            onClick={() => removeRelationship(r.id)} 
                            className="text-[9px] font-display uppercase tracking-widest text-red-500 border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/5 px-2 py-1 rounded transition cursor-pointer select-none"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: FIND READERS & SEND REQUEST */}
        {activeTab === "find" && (
          <div className="space-y-6 animate-fadeIn">
            {/* Search Input Box */}
            <form onSubmit={sendRequest} className="panel p-4 bg-accent/5 border border-border/50 tactical-chamfer flex flex-wrap gap-2.5 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="hud-label block mb-1">callsign search</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground"><Search className="size-3.5" /></span>
                  <input 
                    value={searchHandle} 
                    onChange={e => setSearchHandle(e.target.value)} 
                    placeholder="@handle" 
                    className="w-full bg-input border border-border pl-8 pr-3 py-2 text-sm focus:border-primary outline-none tactical-chamfer" 
                  />
                </div>
              </div>
              <div>
                <label className="hud-label block mb-1">tag label</label>
                <select 
                  value={requestLabel} 
                  onChange={e => setRequestLabel(e.target.value)} 
                  className="bg-input border border-border px-3 py-2 text-sm focus:border-primary outline-none tactical-chamfer"
                >
                  {LABEL_PRESETS.map(l => <option key={l}>{l}</option>)}
                  <option>Buddy</option>
                </select>
              </div>
              <button className="bg-primary text-primary-foreground px-4 py-2 text-xs font-display uppercase tracking-widest hover:bg-primary-glow tactical-chamfer flex items-center gap-1.5 cursor-pointer">
                <UserPlus className="size-3.5" /> Send Request
              </button>
            </form>

            {/* Active Profiles Registry List */}
            <div>
              <h2 className="font-display uppercase text-sm mb-3 tracking-wider">// Active Readers Registry</h2>
              {profiles.length === 0 ? (
                <div className="panel p-8 text-center text-muted-foreground font-serif italic tactical-chamfer text-sm">
                  No other readers found in the records.
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-3">
                  {profiles.map(p => {
                    const statusInfo = getProfileRelation(p.id);
                    
                    return (
                      <div key={p.id} className="panel p-3.5 border border-border/40 hover:border-border/80 transition-all flex items-center justify-between gap-3 tactical-chamfer">
                        <div className="flex items-center gap-3">
                          <div className="size-9 bg-accent border border-border tactical-chamfer flex items-center justify-center font-display text-sm font-bold text-stone-500">
                            {p.display_name?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="font-display uppercase text-xs text-foreground">{p.display_name}</div>
                            <div className="hud-label text-[9px] text-muted-foreground">@{p.handle}</div>
                          </div>
                        </div>

                        {/* Action buttons matching current status */}
                        {statusInfo.type === "none" && (
                          <button
                            onClick={() => sendRequestByProfileId(p.id)}
                            className="bg-primary text-primary-foreground px-2.5 py-1 text-[9px] font-display uppercase tracking-wider hover:bg-primary-glow tactical-chamfer cursor-pointer"
                          >
                            Add Buddy
                          </button>
                        )}

                        {statusInfo.type === "sent" && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => acceptRequest(statusInfo.id!)}
                              className="text-[9px] font-sans font-bold uppercase tracking-wider text-primary border border-primary/20 hover:border-primary px-2 py-0.5 rounded transition cursor-pointer select-none"
                              title="Shortcut: accept this request immediately"
                            >
                              Accept (Test)
                            </button>
                            <button
                              onClick={() => removeRelationship(statusInfo.id!)}
                              className="text-[9px] font-display uppercase tracking-widest text-red-500 hover:text-red-650 hover:bg-red-500/5 px-2 py-0.5 rounded transition cursor-pointer select-none"
                            >
                              Cancel
                            </button>
                          </div>
                        )}

                        {statusInfo.type === "incoming" && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => acceptRequest(statusInfo.id!)}
                              className="bg-primary text-primary-foreground p-1.5 hover:bg-primary-glow tactical-chamfer cursor-pointer"
                              title="Accept Buddy Request"
                            >
                              <Check className="size-3" />
                            </button>
                            <button
                              onClick={() => removeRelationship(statusInfo.id!)}
                              className="panel-elevated p-1.5 hover:bg-red-500/10 hover:border-red-500/30 text-stone-500 hover:text-red-500 border border-border/40 tactical-chamfer cursor-pointer"
                              title="Decline request"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        )}

                        {statusInfo.type === "buddies" && (
                          <button
                            onClick={() => removeRelationship(statusInfo.id!)}
                            className="text-stone-500 hover:text-red-500 hover:bg-red-500/5 border border-border hover:border-red-500/20 px-2.5 py-1 text-[9px] font-display uppercase tracking-wider rounded transition cursor-pointer flex items-center gap-1"
                          >
                            <UserMinus className="size-3" /> Remove
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );

  // Quick action function to add buddy from lists directly
  async function sendRequestByProfileId(profileId: string) {
    const { error } = await supabase
      .from("relationships")
      .insert({ 
        requester_id: me.id, 
        addressee_id: profileId, 
        label: "Buddy", 
        status: "pending" 
      });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Buddy request sent!");
      load();
    }
  }
}
