import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Users, Sparkles, Bookmark, Clock, Zap, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/akasha")({
  head: () => ({ meta: [{ title: "Akasha — Your Terminal" }] }),
  component: AkashaPage,
});

interface Stats {
  booksReading: number;
  pagesRead: number;
  avgPace: number;
  buddies: number;
  memories: number;
  bookmarks: number;
}

function AkashaPage() {
  const [stats, setStats] = useState<Stats>({ booksReading: 0, pagesRead: 0, avgPace: 0, buddies: 0, memories: 0, bookmarks: 0 });
  const [currentRooms, setCurrentRooms] = useState<any[]>([]);
  const [recentMemories, setRecentMemories] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);

  const loadDashboard = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: p }, { data: rooms }, { data: sessions }, { data: rels }, { data: mems }, { count: memsCount }, { data: bms }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("room_participants").select("room_id, rooms(id, name, current_page, status, mode, admin_user_id, books(id, title, author, cover_url, total_pages))").eq("user_id", user.id).is("left_at", null),
      supabase.from("reading_sessions").select("page, seconds_on_page").eq("user_id", user.id),
      supabase.from("relationships").select("status").or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
      supabase.from("memories").select("id, title, created_at, book_id, books(title)").order("created_at", { ascending: false }).limit(4),
      supabase.from("memories").select("id", { count: "exact", head: true }),
      supabase.from("bookmarks").select("id").eq("user_id", user.id),
    ]);
    setProfile(p);
    
    // Only display top 6 active rooms on the dashboard list
    const activeRooms = (rooms ?? []).filter((r: any) => r.rooms?.status === "active");
    setCurrentRooms(activeRooms.slice(0, 6));
    
    setRecentMemories(mems ?? []);
    const totalPages = sessions?.length ?? 0;
    const totalSec = sessions?.reduce((a, s) => a + (s.seconds_on_page ?? 0), 0) ?? 0;
    const acceptedBuddies = (rels ?? []).filter((r: any) => r.status === "accepted").length;

    setStats({
      booksReading: new Set(activeRooms.map((r: any) => r.rooms?.books?.id).filter(Boolean)).size,
      pagesRead: totalPages,
      avgPace: totalPages ? Math.round(totalSec / totalPages) : 0,
      buddies: acceptedBuddies,
      memories: memsCount ?? 0,
      bookmarks: bms?.length ?? 0,
    });
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const deleteRoom = async (e: React.MouseEvent, roomId: string, isAdmin: boolean) => {
    e.preventDefault();
    e.stopPropagation();

    if (isAdmin) {
      if (!confirm("Permanently delete this reading room session? This will wipe all chat logs, page signals, and reading statistics recorded in this room.")) return;
      try {
        await supabase.from("memories").delete().eq("room_id", roomId);
        const { error } = await supabase.from("rooms").delete().eq("id", roomId);
        if (error) throw error;
        toast.success("Reading session and all history deleted");
        loadDashboard();
      } catch (err: any) {
        toast.error(`Delete failed: ${err.message}`);
      }
    } else {
      if (!confirm("Leave this reading room and remove it from your terminal?")) return;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { error } = await supabase.from("room_participants").delete().eq("room_id", roomId).eq("user_id", user.id);
          if (error) throw error;
          toast.success("Left reading room");
          loadDashboard();
        }
      } catch (err: any) {
        toast.error(`Failed to leave: ${err.message}`);
      }
    }
  };

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto p-8">
        <div className="hud-label text-primary mb-2">// terminal // akasha</div>
        <h1 className="font-display text-4xl uppercase mb-1">{profile ? `Welcome back, ${profile.display_name}` : "Akasha"}</h1>
        <p className="text-muted-foreground font-serif italic">Your records, your buddies, your memories.</p>

        {/* STATS GRID */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-8">
          {[
            { label: "READING", value: stats.booksReading, icon: BookOpen },
            { label: "PAGES", value: stats.pagesRead, icon: Zap },
            { label: "AVG PACE", value: `${stats.avgPace}s`, icon: Clock },
            { label: "BUDDIES", value: stats.buddies, icon: Users },
            { label: "MEMORIES", value: stats.memories, icon: Sparkles },
            { label: "BOOKMARKS", value: stats.bookmarks, icon: Bookmark },
          ].map(s => (
            <div key={s.label} className="panel p-4 tactical-chamfer">
              <s.icon className="size-4 text-primary mb-2" />
              <div className="hud-label text-xs">{s.label}</div>
              <div className="font-display text-2xl">{s.value}</div>
            </div>
          ))}
        </div>

        {/* CURRENT READING */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="hud-label text-primary">// currently reading</div>
              <h2 className="font-display text-2xl uppercase">Open rooms</h2>
            </div>
            <Link to="/library" className="hud-label text-primary hover:text-primary-glow">+ open a book →</Link>
          </div>
          {currentRooms.length === 0 ? (
            <div className="panel p-12 text-center tactical-chamfer">
              <p className="text-muted-foreground font-serif italic mb-4">No active reading rooms.</p>
              <Link to="/library" className="inline-block bg-primary text-primary-foreground px-6 py-2 font-display uppercase text-xs tracking-widest hover:bg-primary-glow tactical-chamfer">Open the library</Link>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {currentRooms.map((r: any) => {
                const book = r.rooms?.books;
                const pct = book?.total_pages ? Math.round((r.rooms.current_page / book.total_pages) * 100) : 0;
                const isAdmin = r.rooms?.admin_user_id === profile?.id;
                return (
                  <div key={r.room_id} className="relative group">
                    <Link to="/room/$roomId" params={{ roomId: r.room_id }} className="panel p-4 tactical-chamfer hover:shadow-tactical transition flex gap-4 w-full text-left">
                      {book?.cover_url ? (
                        <img src={book.cover_url} alt={book.title} className="w-16 h-24 object-cover border border-border" />
                      ) : (
                        <div className="w-16 h-24 bg-accent border border-border flex items-center justify-center"><BookOpen className="size-6 text-muted-foreground" /></div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="hud-label text-primary">{r.rooms.mode}</div>
                        <div className="font-display uppercase truncate">{book?.title}</div>
                        <div className="text-xs text-muted-foreground font-serif italic mb-2">{book?.author}</div>
                        <div className="h-1 bg-accent overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="hud-label mt-1 text-[10px]">P{r.rooms.current_page} / {book?.total_pages ?? "?"} • {pct}%</div>
                      </div>
                    </Link>
                    <button 
                      onClick={(e) => deleteRoom(e, r.room_id, isAdmin)} 
                      className="absolute top-2 right-2 p-1.5 bg-destructive/90 text-destructive-foreground hover:bg-destructive tactical-chamfer transition rounded-sm shadow-md md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 z-10"
                      title={isAdmin ? "Delete reading room & progress" : "Leave reading room"}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* MEMORIES */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="hud-label text-gold">// archive</div>
              <h2 className="font-display text-2xl uppercase">Recent memories</h2>
            </div>
            <Link to="/memories" className="hud-label text-gold hover:text-gold/80">view all →</Link>
          </div>
          {recentMemories.length === 0 ? (
            <div className="panel p-8 text-center tactical-chamfer text-muted-foreground font-serif italic">No memories yet. Save your first session to seal one.</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {recentMemories.map((m: any) => (
                <Link key={m.id} to="/memories" className="panel p-4 tactical-chamfer hover:shadow-tactical transition">
                  <Sparkles className="size-4 text-gold mb-1" />
                  <div className="font-display uppercase">{m.title}</div>
                  <div className="text-xs text-muted-foreground">{m.books?.title} • {new Date(m.created_at).toLocaleDateString()}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
