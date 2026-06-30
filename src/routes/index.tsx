import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Users, Sparkles, ArrowRight, Radio } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Akashik Records — Read together. Remember forever." },
      { name: "description", content: "A tactical reading sanctuary. Solo, duo, or party — real page flips, live voice, and saved Memories." },
      { property: "og:title", content: "Akashik Records" },
      { property: "og:description", content: "Read together. Remember forever." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      {/* NAV */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/60 border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="size-7 bg-primary tactical-chamfer flex items-center justify-center">
              <BookOpen className="size-4 text-primary-foreground" />
            </div>
            <span className="font-display tracking-widest text-sm">AKASHIK<span className="text-primary">.</span>RECORDS</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/auth" className="hud-label hover:text-foreground transition px-3 py-2">Enter</Link>
            <Link to="/auth" className="bg-primary text-primary-foreground px-4 py-2 text-xs font-display uppercase tracking-widest hover:bg-primary-glow tactical-chamfer scanline-hover">Begin →</Link>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 pt-24 pb-32 relative">
          <div className="hud-label text-primary mb-6 flex items-center gap-2">
            <span className="live-dot" /> AKASHIK // v1.0 // initiated
          </div>
          <h1 className="font-display text-6xl md:text-8xl uppercase leading-[0.95] tracking-tight">
            Read together.<br/>
            <span className="gold-shimmer">Remember forever.</span>
          </h1>
          <p className="mt-8 max-w-xl text-lg text-muted-foreground font-serif italic">
            A sanctuary for shared reading. Open a book, summon your buddies, and turn every page in unison — every session etched into your Akasha as a Memory.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/auth" className="group bg-primary text-primary-foreground px-6 py-3 font-display uppercase tracking-widest text-sm hover:bg-primary-glow tactical-chamfer scanline-hover flex items-center gap-2">
              Enter the archive <ArrowRight className="size-4 group-hover:translate-x-1 transition" />
            </Link>
            <a href="#how" className="px-6 py-3 border border-border font-display uppercase tracking-widest text-sm hover:bg-accent tactical-chamfer">How it works</a>
          </div>
        </div>
        <div className="absolute -right-40 top-20 size-[500px] rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 bottom-0 size-[400px] rounded-full bg-secondary/10 blur-3xl pointer-events-none" />
      </section>

      {/* PILLARS */}
      <section id="how" className="max-w-6xl mx-auto px-6 py-24">
        <div className="hud-label text-primary mb-3">// three ways to read</div>
        <h2 className="font-display text-4xl uppercase mb-12">Pick your formation</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: BookOpen, tag: "SOLO", title: "The Sanctuary", desc: "Just you and the page. Realistic flips, your own pace tracking, bookmarks for the next session." },
            { icon: Users, tag: "DUO", title: "The Pact", desc: "Read with your partner. Page only advances when both of you tap done. Set a relationship label, share Memories." },
            { icon: Radio, tag: "PARTY", title: "The Coven", desc: "A circle of readers. Voice + video + chat stays open. The admin governs the cadence. Save the whole night as a Memory." },
          ].map((p, i) => (
            <div key={p.tag} className="panel p-6 tactical-chamfer corner-brackets group hover:shadow-tactical transition">
              <div className="flex items-start justify-between mb-6">
                <p.icon className="size-7 text-primary" />
                <div className="hud-label">0{i+1} // {p.tag}</div>
              </div>
              <h3 className="font-display text-2xl uppercase mb-2">{p.title}</h3>
              <p className="text-sm text-muted-foreground font-serif">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SOURCES */}
      <section className="max-w-6xl mx-auto px-6 py-24 border-t border-border">
        <div className="hud-label text-primary mb-3">// sources</div>
        <h2 className="font-display text-4xl uppercase mb-3">Bring any book</h2>
        <p className="text-muted-foreground max-w-2xl font-serif italic mb-12">Upload your own PDFs or pull from the open canon. Every text — public domain or personal — renders as a real book.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {["PROJECT GUTENBERG","OPEN LIBRARY","LIBBY / OVERDRIVE","YOUR PDFs"].map(s => (
            <div key={s} className="panel p-5 text-center tactical-chamfer">
              <div className="font-display text-xs tracking-widest text-muted-foreground">{s}</div>
            </div>
          ))}
        </div>
      </section>

      {/* MEMORIES */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="panel-elevated p-12 tactical-chamfer relative overflow-hidden">
          <div className="absolute inset-0 bg-[var(--gradient-gold)] opacity-[0.04] pointer-events-none" />
          <Sparkles className="size-8 text-gold mb-6" />
          <div className="hud-label text-gold mb-3">// memories</div>
          <h2 className="font-display text-4xl uppercase mb-4">Every session becomes a record</h2>
          <p className="text-muted-foreground max-w-2xl font-serif text-lg">When a reading session ends, the admin can seal it as a Memory — chat, participants, pages read, the whole night — etched into every reader's Akasha. The archive remembers.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border mt-12">
        <div className="max-w-6xl mx-auto px-6 py-8 flex justify-between items-center text-xs hud-label">
          <span>AKASHIK.RECORDS // 2026</span>
          <Link to="/auth" className="text-primary hover:text-primary-glow">enter →</Link>
        </div>
      </footer>
    </div>
  );
}
