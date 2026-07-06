import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Search, BookOpen, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { searchGutenberg, searchOpenLibrary, searchLibby, type CatalogBook } from "@/lib/catalog";

export const Route = createFileRoute("/_authenticated/discover")({
  head: () => ({ meta: [{ title: "Discover — Akashik Records" }] }),
  component: DiscoverPage,
});

const GUTENBERG_SUGGESTIONS: CatalogBook[] = [
  {
    source: "gutenberg",
    external_id: "1342",
    title: "Pride and Prejudice",
    author: "Jane Austen",
    cover_url: "https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg",
    external_url: "https://www.gutenberg.org/files/1342/1342-0.txt",
    language: "en"
  },
  {
    source: "gutenberg",
    external_id: "84",
    title: "Frankenstein; Or, The Modern Prometheus",
    author: "Mary Wollstonecraft Shelley",
    cover_url: "https://www.gutenberg.org/cache/epub/84/pg84.cover.medium.jpg",
    external_url: "https://www.gutenberg.org/files/84/84-0.txt",
    language: "en"
  },
  {
    source: "gutenberg",
    external_id: "11",
    title: "Alice's Adventures in Wonderland",
    author: "Lewis Carroll",
    cover_url: "https://www.gutenberg.org/cache/epub/11/pg11.cover.medium.jpg",
    external_url: "https://www.gutenberg.org/files/11/11-0.txt",
    language: "en"
  },
  {
    source: "gutenberg",
    external_id: "64317",
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    cover_url: "https://www.gutenberg.org/cache/epub/64317/pg64317.cover.medium.jpg",
    external_url: "https://www.gutenberg.org/cache/epub/64317/pg64317.txt",
    language: "en"
  },
  {
    source: "gutenberg",
    external_id: "5200",
    title: "Metamorphosis",
    author: "Franz Kafka",
    cover_url: "https://www.gutenberg.org/cache/epub/5200/pg5200.cover.medium.jpg",
    external_url: "https://www.gutenberg.org/files/5200/5200-0.txt",
    language: "en"
  }
];

const OPENLIBRARY_SUGGESTIONS: CatalogBook[] = [
  {
    source: "openlibrary",
    external_id: "/works/OL102749W",
    title: "Moby Dick",
    author: "Herman Melville",
    cover_url: "https://covers.openlibrary.org/b/id/12547191-M.jpg",
    external_url: "https://archive.org/download/mobydickorwhale01melv/mobydickorwhale01melv_djvu.txt",
    language: "en"
  },
  {
    source: "openlibrary",
    external_id: "/works/OL85892W",
    title: "Dracula",
    author: "Bram Stoker",
    cover_url: "https://covers.openlibrary.org/b/id/10526019-M.jpg",
    external_url: "https://archive.org/download/dracula00stokuoft/dracula00stokuoft_djvu.txt",
    language: "en"
  },
  {
    source: "openlibrary",
    external_id: "/works/OL362243W",
    title: "Romeo and Juliet",
    author: "William Shakespeare",
    cover_url: "https://covers.openlibrary.org/b/id/10543594-M.jpg",
    external_url: "https://archive.org/download/romeojuliet00shak/romeojuliet00shak_djvu.txt",
    language: "en"
  },
  {
    source: "openlibrary",
    external_id: "/works/OL262426W",
    title: "The Adventures of Sherlock Holmes",
    author: "Arthur Conan Doyle",
    cover_url: "https://covers.openlibrary.org/b/id/10544521-M.jpg",
    external_url: "https://archive.org/download/adventuressherl00doylgoog/adventuressherl00doylgoog_djvu.txt",
    language: "en"
  }
];

const LIBBY_SUGGESTIONS: CatalogBook[] = [
  {
    source: "libby",
    external_id: "OL_libby_1",
    title: "The Hobbit",
    author: "J.R.R. Tolkien",
    cover_url: "https://covers.openlibrary.org/b/id/8406786-M.jpg",
    external_url: null,
    language: "en"
  },
  {
    source: "libby",
    external_id: "OL_libby_2",
    title: "180 Seconds",
    author: "Jessica Park",
    cover_url: "https://covers.openlibrary.org/b/id/8282313-M.jpg",
    external_url: null,
    language: "en"
  }
];

function DiscoverPage() {
  const [q, setQ] = useState("");
  const [source, setSource] = useState<"gutenberg" | "openlibrary" | "libby">("gutenberg");
  const [results, setResults] = useState<CatalogBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  // Sync suggestion bookshelf when no query exists
  useEffect(() => {
    if (!q.trim()) {
      const suggestions =
        source === "gutenberg"
          ? GUTENBERG_SUGGESTIONS
          : source === "openlibrary"
          ? OPENLIBRARY_SUGGESTIONS
          : LIBBY_SUGGESTIONS;
      setResults(suggestions);
    }
  }, [source, q]);

  const run = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    try {
      const fn = source === "gutenberg" ? searchGutenberg : source === "openlibrary" ? searchOpenLibrary : searchLibby;
      setResults((await fn({ data: q })) as CatalogBook[]);
    } catch { toast.error("Search failed"); }
    finally { setLoading(false); }
  };

  const add = async (b: CatalogBook) => {
    setAdding(b.external_id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      
      const { data: existing } = await supabase.from("books").select("id").eq("source", b.source).eq("external_id", b.external_id).eq("added_by", user.id).maybeSingle();
      let bookId = existing?.id;
      if (!bookId) {
        const { data: created, error } = await supabase.from("books").insert({
          source: b.source, external_id: b.external_id, title: b.title, author: b.author,
          cover_url: b.cover_url, external_url: b.external_url, language: b.language, added_by: user.id,
        }).select("id").single();
        if (error) throw error;
        bookId = created.id;
      }
      const { error: lErr } = await supabase.from("library_entries").insert({ user_id: user.id, book_id: bookId });
      if (lErr && !lErr.message.includes("duplicate")) throw lErr;
      toast.success(`Added: ${b.title}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add");
    } finally { setAdding(null); }
  };

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto p-8">
        <div className="hud-label text-primary mb-2">
          {!q.trim() ? "// recommended shelf" : "// hunt results"}
        </div>
        <h1 className="font-display text-4xl uppercase mb-1">Find a text</h1>
        <p className="text-muted-foreground font-serif italic mb-6">Search the open canon. Pull texts into your library.</p>

        <form onSubmit={run} className="panel p-4 tactical-chamfer mb-6">
          <div className="flex gap-2 mb-3">
            {(["gutenberg","openlibrary","libby"] as const).map(s => (
              <button type="button" key={s} onClick={() => setSource(s)} className={`px-3 py-1.5 text-xs font-display uppercase tracking-widest tactical-chamfer ${source === s ? "bg-primary text-primary-foreground" : "panel-elevated hover:bg-accent"}`}>{s}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search title, author..." className="flex-1 bg-input border border-border px-4 py-2 focus:border-primary outline-none tactical-chamfer" />
            <button type="submit" disabled={loading} className="bg-primary text-primary-foreground px-6 font-display uppercase text-xs tracking-widest hover:bg-primary-glow disabled:opacity-50 tactical-chamfer flex items-center gap-2">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Hunt
            </button>
          </div>
        </form>

        {source === "libby" && results.length > 0 && (
          <div className="panel-elevated p-3 mb-4 tactical-chamfer text-xs text-muted-foreground font-serif italic">
            Libby/OverDrive has no public reader API. These are metadata-only results — upload your own PDF for the chosen title to read together.
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-fade-in">
          {results.map(b => (
            <div key={`${b.source}-${b.external_id}`} className="panel tactical-chamfer relative hover:shadow-tactical transition">
              {b.cover_url ? (
                <img src={b.cover_url} alt={b.title} className="w-full aspect-[2/3] object-cover" />
              ) : (
                <div className="w-full aspect-[2/3] bg-accent flex items-center justify-center"><BookOpen className="size-12 text-muted-foreground" /></div>
              )}
              <div className="p-3">
                <div className="font-display text-sm uppercase line-clamp-2">{b.title}</div>
                <div className="text-xs text-muted-foreground font-serif italic line-clamp-1">{b.author ?? "—"}</div>
                <button onClick={() => add(b)} disabled={adding === b.external_id} className="mt-2 w-full bg-primary text-primary-foreground py-1.5 text-[10px] font-display uppercase tracking-widest hover:bg-primary-glow disabled:opacity-50 tactical-chamfer flex items-center justify-center gap-1">
                  <Plus className="size-3" /> {adding === b.external_id ? "Adding..." : "Add"}
                </button>
              </div>
            </div>
          ))}
        </div>
        {!loading && results.length === 0 && q && (
          <div className="panel p-12 text-center text-muted-foreground font-serif italic">No results.</div>
        )}
      </div>
    </AppShell>
  );
}
