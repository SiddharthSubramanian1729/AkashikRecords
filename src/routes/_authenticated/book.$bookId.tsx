import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Users, User as UserIcon, Radio, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/book/$bookId")({
  head: () => ({ meta: [{ title: "Book — Akashik Records" }] }),
  component: BookPage,
});

function BookPage() {
  const { bookId } = Route.useParams();
  const nav = useNavigate();
  const [book, setBook] = useState<any>(null);
  const [buddies, setBuddies] = useState<any[]>([]);
  const [mode, setMode] = useState<"solo" | "duo" | "party">("solo");
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [breakType, setBreakType] = useState<"none" | "auto" | "manual">("none");
  const [breakEvery, setBreakEvery] = useState(10);
  const [breakMin, setBreakMin] = useState(5);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: b } = await supabase.from("books").select("*").eq("id", bookId).maybeSingle();
      setBook(b);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: rels } = await supabase
        .from("relationships")
        .select("id, label, requester_id, addressee_id, requester:profiles!relationships_requester_id_fkey(id, display_name, handle, avatar_url), addressee:profiles!relationships_addressee_id_fkey(id, display_name, handle, avatar_url)")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`).eq("status", "accepted");
      const list = (rels ?? []).map((r: any) => ({
        ...(r.requester_id === user.id ? r.addressee : r.requester),
        label: r.label,
      }));
      setBuddies(list);
    })();
  }, [bookId]);

  const toggleInvite = (id: string) => {
    setInvited(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const start = async () => {
    if (!book) return;
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const break_policy = breakType === "none" ? { type: "none" } : breakType === "auto" ? { type: "auto", every_pages: breakEvery, minutes: breakMin } : { type: "manual" };
      
      const { data: bm } = await supabase
        .from("bookmarks")
        .select("page")
        .eq("user_id", user.id)
        .eq("book_id", bookId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const startPage = bm ? bm.page : 1;

      const { data: room, error } = await supabase.from("rooms").insert({
        book_id: bookId, admin_user_id: user.id, mode, break_policy, current_page: startPage, status: "active",
        name: book.title,
      }).select().single();
      if (error) throw error;
      await supabase.from("room_participants").insert({ room_id: room.id, user_id: user.id, role: "admin" });
      if (mode !== "solo") {
        for (const buddyId of invited) {
          await supabase.from("room_participants").insert({ room_id: room.id, user_id: buddyId, role: "participant" });
          await supabase.from("notifications").insert({
            user_id: buddyId, kind: "room_invite",
            payload: { room_id: room.id, book_title: book.title, from: user.id },
          });
        }
      }
      nav({ to: "/room/$roomId", params: { roomId: room.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start room");
      setCreating(false);
    }
  };

  if (!book) return <AppShell><div className="p-8 text-muted-foreground">Loading...</div></AppShell>;

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto p-8">
        <Link to="/library" className="hud-label hover:text-primary">← back to library</Link>
        <div className="grid md:grid-cols-[260px_1fr] gap-8 mt-4">
          <div>
            {book.cover_url ? (
              <img src={book.cover_url} alt={book.title} className="w-full panel" />
            ) : (
              <div className="w-full aspect-[2/3] panel flex items-center justify-center"><BookOpen className="size-20 text-muted-foreground" /></div>
            )}
          </div>
          <div>
            <div className="hud-label text-primary">// {book.source}</div>
            <h1 className="font-display text-4xl uppercase">{book.title}</h1>
            <p className="text-muted-foreground font-serif italic text-lg">{book.author ?? "Unknown author"}</p>
            <div className="hud-label mt-2">{book.total_pages ?? "?"} pages</div>

            {!book.file_path && !book.external_url && (
              <div className="panel-elevated p-3 mt-4 text-xs text-muted-foreground tactical-chamfer">
                ⚠ No readable file attached. This is metadata only. Upload the PDF via Library to read.
              </div>
            )}

            <div className="panel p-6 tactical-chamfer mt-6">
              <div className="hud-label text-primary mb-4">// configure room</div>
              <div className="space-y-5">
                <div>
                  <label className="hud-label block mb-2">mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { v: "solo", icon: UserIcon, label: "Solo" },
                      { v: "duo", icon: Users, label: "Duo" },
                      { v: "party", icon: Radio, label: "Party" },
                    ] as const).map(m => (
                      <button key={m.v} onClick={() => setMode(m.v)} className={`p-3 text-xs font-display uppercase tracking-widest tactical-chamfer flex flex-col items-center gap-1 ${mode === m.v ? "bg-primary text-primary-foreground" : "panel-elevated hover:bg-accent"}`}>
                        <m.icon className="size-4" /> {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {mode !== "solo" && (
                  <div>
                    <label className="hud-label block mb-2">invite buddies</label>
                    {buddies.length === 0 ? (
                      <div className="text-xs text-muted-foreground font-serif italic">No buddies yet. <Link to="/buddies" className="text-primary">Add one →</Link></div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {buddies.map(b => (
                          <button key={b.id} onClick={() => toggleInvite(b.id)} className={`px-3 py-1.5 text-xs tactical-chamfer ${invited.has(b.id) ? "bg-primary text-primary-foreground" : "panel-elevated hover:bg-accent"}`}>
                            {b.display_name} <span className="opacity-60">· {b.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="hud-label block mb-2">break policy</label>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {(["none","auto","manual"] as const).map(t => (
                      <button key={t} onClick={() => setBreakType(t)} className={`p-2 text-xs font-display uppercase tracking-widest tactical-chamfer ${breakType === t ? "bg-primary text-primary-foreground" : "panel-elevated hover:bg-accent"}`}>{t}</button>
                    ))}
                  </div>
                  {breakType === "auto" && (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs">Every <input type="number" min={1} value={breakEvery} onChange={e => setBreakEvery(+e.target.value)} className="w-16 bg-input border border-border px-2 py-1 tactical-chamfer" /> pages</label>
                      <label className="text-xs">For <input type="number" min={1} value={breakMin} onChange={e => setBreakMin(+e.target.value)} className="w-16 bg-input border border-border px-2 py-1 tactical-chamfer" /> min</label>
                    </div>
                  )}
                </div>

                <button onClick={start} disabled={creating || (!book.file_path && !book.external_url)} className="w-full bg-primary text-primary-foreground px-6 py-3 font-display uppercase tracking-widest hover:bg-primary-glow disabled:opacity-50 tactical-chamfer scanline-hover flex items-center justify-center gap-2">
                  {creating ? "Opening..." : "Begin reading"} <ArrowRight className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
