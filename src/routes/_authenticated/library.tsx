import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({ meta: [{ title: "Library — Akashik Records" }] }),
  component: LibraryPage,
});

function LibraryPage() {
  const [books, setBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await (supabase as any)
      .from("library_entries")
      .select("id, added_at, status, books(id, title, author, cover_url, total_pages, source, file_path, external_url)")
      .eq("user_id", user.id)
      .eq("status", "reading")
      .order("added_at", { ascending: false });
    setBooks(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) { toast.error("PDF only for now"); return; }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("book-files").upload(path, file);
      if (upErr) throw upErr;

      // Get page count via pdfjs
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
      const arrayBuf = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuf }).promise;
      const totalPages = pdf.numPages;

      const title = file.name.replace(/\.pdf$/i, "");
      const { data: book, error: bErr } = await supabase.from("books").insert({
        source: "upload", title, file_path: path, total_pages: totalPages, added_by: user.id,
      }).select().single();
      if (bErr) throw bErr;

      await supabase.from("library_entries").insert({ user_id: user.id, book_id: book.id });
      toast.success("Added to library");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const remove = async (entryId: string, bookId: string, filePath?: string) => {
    if (!confirm("Permanently delete this book and all its associated rooms, bookmarks, chat history, and records?")) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { data: book } = await supabase.from("books").select("added_by").eq("id", bookId).maybeSingle();

      if (book && book.added_by === user.id) {
        // Explicitly purge memories since database uses ON DELETE SET NULL for memories
        await supabase.from("memories").delete().eq("book_id", bookId);

        // Delete the book record itself (triggers database cascade for rooms, chat, bookmarks, signals, etc.)
        const { error: bErr } = await supabase.from("books").delete().eq("id", bookId);
        if (bErr) throw bErr;

        if (filePath) {
          await supabase.storage.from("book-files").remove([filePath]);
        }
      } else {
        // For shared books, just delete this library entry
        const { error: delErr } = await supabase.from("library_entries").delete().eq("id", entryId);
        if (delErr) throw delErr;
      }

      toast.success("Book and all associated records deleted");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to remove book");
    }
  };

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="hud-label text-primary">// vault</div>
            <h1 className="font-display text-4xl uppercase">Library</h1>
            <p className="text-muted-foreground font-serif italic">Your personal archive of texts.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/discover" className="panel-elevated px-4 py-2 text-xs font-display uppercase tracking-widest hover:bg-accent tactical-chamfer">Discover</Link>
            <button onClick={() => fileInput.current?.click()} disabled={uploading} className="bg-primary text-primary-foreground px-4 py-2 text-xs font-display uppercase tracking-widest hover:bg-primary-glow disabled:opacity-50 tactical-chamfer flex items-center gap-2 scanline-hover">
              <Upload className="size-3" /> {uploading ? "Uploading..." : "Upload PDF"}
            </button>
            <input ref={fileInput} type="file" accept="application/pdf" onChange={upload} className="hidden" />
          </div>
        </div>

        {loading ? (
          <div className="panel p-12 text-center text-muted-foreground">Loading...</div>
        ) : books.length === 0 ? (
          <div className="panel p-12 text-center tactical-chamfer">
            <BookOpen className="size-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground font-serif italic mb-6">The library is empty. Upload a PDF or discover a book.</p>
            <div className="flex justify-center gap-2">
              <button onClick={() => fileInput.current?.click()} className="bg-primary text-primary-foreground px-6 py-2 text-xs font-display uppercase tracking-widest tactical-chamfer">Upload PDF</button>
              <Link to="/discover" className="panel-elevated px-6 py-2 text-xs font-display uppercase tracking-widest tactical-chamfer">Discover</Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {books.map(e => e.books && (
              <div key={e.id} className="panel tactical-chamfer hover:shadow-tactical transition group relative">
                <Link to="/book/$bookId" params={{ bookId: e.books.id }} className="block">
                  {e.books.cover_url ? (
                    <img src={e.books.cover_url} alt={e.books.title} className="w-full aspect-[2/3] object-cover" />
                  ) : (
                    <div className="w-full aspect-[2/3] bg-accent flex items-center justify-center">
                      <BookOpen className="size-12 text-muted-foreground" />
                    </div>
                  )}
                  <div className="p-3">
                    <div className="font-display text-sm uppercase line-clamp-2">{e.books.title}</div>
                    <div className="text-xs text-muted-foreground font-serif italic line-clamp-1">{e.books.author ?? "—"}</div>
                    <div className="hud-label mt-1 text-[10px]">{e.books.source} • {e.books.total_pages ?? "?"}p</div>
                  </div>
                </Link>
                <button onClick={() => remove(e.id, e.books.id, e.books.file_path)} className="absolute top-2 right-2 p-1.5 bg-destructive/90 text-destructive-foreground hover:bg-destructive tactical-chamfer transition rounded-sm shadow-md md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100" title="Delete book">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
