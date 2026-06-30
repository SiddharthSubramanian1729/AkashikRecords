import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Users, BookOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/memories")({
  head: () => ({ meta: [{ title: "Memories — Akashik Records" }] }),
  component: MemoriesPage,
});

function MemoriesPage() {
  const [memories, setMemories] = useState<any[]>([]);
  const [open, setOpen] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("memories").select("*, books(title, author, cover_url)").order("created_at", { ascending: false });
      setMemories(data ?? []);
    })();
  }, []);

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto p-8">
        <div className="hud-label text-gold mb-2">// archive</div>
        <h1 className="font-display text-4xl uppercase">Memories</h1>
        <p className="text-muted-foreground font-serif italic mb-8">Sessions sealed into the record.</p>

        {memories.length === 0 ? (
          <div className="panel p-12 text-center tactical-chamfer">
            <Sparkles className="size-12 mx-auto text-gold mb-4" />
            <p className="text-muted-foreground font-serif italic">No memories yet. Finish a reading session and seal it.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {memories.map(m => (
              <button key={m.id} onClick={() => setOpen(m)} className="panel p-5 tactical-chamfer text-left hover:shadow-tactical transition">
                <Sparkles className="size-4 text-gold mb-2" />
                <div className="font-display text-lg uppercase">{m.title}</div>
                <div className="text-xs text-muted-foreground font-serif italic mb-2">{m.books?.title} · {m.books?.author}</div>
                <div className="flex gap-3 hud-label">
                  <span><BookOpen className="size-3 inline" /> P{m.page_start ?? "?"}-{m.page_end ?? "?"}</span>
                  <span><Users className="size-3 inline" /> {Array.isArray(m.participants) ? m.participants.length : 0}</span>
                  <span>{Math.round((m.duration_seconds ?? 0)/60)}m</span>
                </div>
                <div className="hud-label text-[10px] mt-2 text-muted-foreground">{new Date(m.created_at).toLocaleString()}</div>
              </button>
            ))}
          </div>
        )}

        {open && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setOpen(null)}>
            <div className="panel-elevated max-w-2xl w-full max-h-[80vh] overflow-auto p-8 tactical-chamfer" onClick={e => e.stopPropagation()}>
              <Sparkles className="size-6 text-gold mb-2" />
              <div className="hud-label text-gold">// memory</div>
              <h2 className="font-display text-3xl uppercase">{open.title}</h2>
              <div className="text-sm text-muted-foreground font-serif italic mb-4">{open.books?.title}</div>
              <div className="grid grid-cols-3 gap-2 mb-6 text-xs">
                <div className="panel p-2 tactical-chamfer"><div className="hud-label">PAGES</div><div className="font-display">{open.page_start}-{open.page_end}</div></div>
                <div className="panel p-2 tactical-chamfer"><div className="hud-label">DURATION</div><div className="font-display">{Math.round((open.duration_seconds ?? 0)/60)}m</div></div>
                <div className="panel p-2 tactical-chamfer"><div className="hud-label">READERS</div><div className="font-display">{Array.isArray(open.participants) ? open.participants.length : 0}</div></div>
              </div>
              <div className="hud-label mb-2">// transcript</div>
              <div className="space-y-2 max-h-[40vh] overflow-auto panel p-3 tactical-chamfer">
                {Array.isArray(open.chat_snapshot) && open.chat_snapshot.length > 0 ? open.chat_snapshot.map((c: any, i: number) => (
                  <div key={i} className="text-sm">
                    <span className="hud-label text-primary">{c.name ?? "reader"}</span>
                    <span className="text-muted-foreground"> · {new Date(c.created_at).toLocaleTimeString()}</span>
                    <div className="font-serif">{c.body}</div>
                  </div>
                )) : <div className="text-muted-foreground italic text-sm">No chat recorded.</div>}
              </div>
              <button onClick={() => setOpen(null)} className="mt-4 panel-elevated px-4 py-2 text-xs font-display uppercase tracking-widest tactical-chamfer">Close</button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
