import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Award, BookOpen, RotateCcw, Trophy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/wisdom")({
  head: () => ({ meta: [{ title: "Wisdom Vault — Akashik Records" }] }),
  component: WisdomPage,
});

function WisdomPage() {
  const [completedEntries, setCompletedEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalMemories, setTotalMemories] = useState(0);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch completed library entries
    const { data: entries } = await (supabase as any)
      .from("library_entries")
      .select("id, added_at, books(id, title, author, cover_url, total_pages, source)")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("added_at", { ascending: false });
    
    setCompletedEntries(entries ?? []);

    // Fetch total memories sealed/visible to user (rely on RLS)
    const { count } = await supabase
      .from("memories")
      .select("id", { count: "exact", head: true });
    
    setTotalMemories(count ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const studyAgain = async (entryId: string) => {
    try {
      const { error } = await (supabase as any)
        .from("library_entries")
        .update({ status: "reading" })
        .eq("id", entryId);
      if (error) throw error;
      toast.success("Returned book to active library shelf!");
      load();
    } catch (err: any) {
      toast.error(`Failed to reopen book: ${err.message}`);
    }
  };

  // Stats calculations
  const booksCount = completedEntries.length;
  const totalPages = completedEntries.reduce((sum, e) => sum + (e.books?.total_pages ?? 0), 0);
  
  // Custom wisdom levels
  let wisdomLevel = "Novice Scribe";
  let wisdomDesc = "You have taken your first steps into the infinite library of Akasha.";
  if (booksCount >= 10) {
    wisdomLevel = "Grand Librarian";
    wisdomDesc = "You hold mastery over vast sectors of the Akashik archives.";
  } else if (booksCount >= 5) {
    wisdomLevel = "Chronicle Archivist";
    wisdomDesc = "Your intellect has absorbed high volumes of sacred text.";
  } else if (booksCount >= 2) {
    wisdomLevel = "Scribe Scholar";
    wisdomDesc = "A serious student of letters, sealing knowledge into your memory vault.";
  } else if (booksCount >= 1) {
    wisdomLevel = "Initiated Scribe";
    wisdomDesc = "You have successfully sealed your first text into the vault.";
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto p-8">
        <div className="mb-8">
          <div className="hud-label text-primary">// archives / wisdom</div>
          <h1 className="font-display text-4xl uppercase">Wisdom Vault</h1>
          <p className="text-muted-foreground font-serif italic">Your permanent record of finished chronicles and sealed achievements.</p>
        </div>

        {/* Level Banner */}
        <div className="panel p-6 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent border border-primary/20 rounded-md mb-8 flex flex-col md:flex-row items-center gap-6 tactical-chamfer">
          <div className="size-16 rounded-full bg-primary/15 border-2 border-primary/30 flex items-center justify-center text-primary shadow-tactical animate-pulse">
            <Trophy className="size-8" />
          </div>
          <div className="flex-1 text-center md:text-left">
            <div className="hud-label text-[10px] text-primary">AKASHA RANK</div>
            <div className="font-display text-2xl uppercase tracking-wider text-primary-glow">{wisdomLevel}</div>
            <div className="text-sm text-muted-foreground font-serif italic mt-0.5">{wisdomDesc}</div>
          </div>
          <div className="flex gap-4">
            <div className="panel-elevated px-4 py-2 text-center min-w-24">
              <div className="text-xs text-muted-foreground font-display">BOOKS</div>
              <div className="text-xl font-display font-semibold">{booksCount}</div>
            </div>
            <div className="panel-elevated px-4 py-2 text-center min-w-28">
              <div className="text-xs text-muted-foreground font-display">PAGES SEALED</div>
              <div className="text-xl font-display font-semibold">{totalPages}</div>
            </div>
            <div className="panel-elevated px-4 py-2 text-center min-w-28">
              <div className="text-xs text-muted-foreground font-display">MEMORIES SEALED</div>
              <div className="text-xl font-display font-semibold">{totalMemories}</div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="panel p-12 text-center text-muted-foreground">Loading...</div>
        ) : completedEntries.length === 0 ? (
          <div className="panel p-16 text-center tactical-chamfer border border-dashed border-border flex flex-col items-center bg-background">
            <Award className="size-16 text-muted-foreground/30 mb-4" />
            <h3 className="font-display text-lg uppercase tracking-wider mb-2">No Sealed Chronicles Yet</h3>
            <p className="text-sm text-muted-foreground font-serif italic max-w-sm mb-6">
              Finish reading a book and seal its active session to archive it here inside your Wisdom Vault.
            </p>
            <Link to="/library" className="bg-primary text-primary-foreground px-6 py-2.5 text-xs font-display uppercase tracking-widest hover:bg-primary-glow tactical-chamfer">
              Go to Library
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {completedEntries.map(e => e.books && (
              <div key={e.id} className="panel tactical-chamfer border border-primary/20 shadow-tactical bg-[#fbf8f2]/5 dark:bg-[#121110] relative flex group overflow-hidden bg-background">
                {/* Gold seal watermark decoration */}
                <div className="absolute top-2 right-2 size-8 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center text-[10px] text-amber-500 font-display font-bold shadow-sm pointer-events-none uppercase">
                  ✓
                </div>

                {e.books.cover_url ? (
                  <img src={e.books.cover_url} alt={e.books.title} className="w-24 object-cover border-r border-border" />
                ) : (
                  <div className="w-24 bg-accent flex items-center justify-center border-r border-border">
                    <BookOpen className="size-8 text-muted-foreground" />
                  </div>
                )}

                <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
                  <div>
                    <div className="font-display text-sm uppercase tracking-wide truncate" title={e.books.title}>
                      {e.books.title}
                    </div>
                    <div className="text-xs text-muted-foreground font-serif italic truncate mt-0.5">
                      {e.books.author ?? "Unknown author"}
                    </div>
                    <div className="hud-label text-[10px] text-primary mt-2">
                      {e.books.total_pages ?? "?"} Pages Sealed
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/30 pt-3 mt-4">
                    <span className="text-[9px] text-muted-foreground font-sans uppercase">
                      Sealed {new Date(e.added_at).toLocaleDateString()}
                    </span>
                    <button 
                      onClick={() => studyAgain(e.id)} 
                      className="text-[10px] text-primary hover:text-primary-glow flex items-center gap-1 font-display uppercase tracking-wider"
                      title="Move back to active reading Library"
                    >
                      <RotateCcw className="size-3" /> Study Again
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
