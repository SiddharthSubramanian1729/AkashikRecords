// Public catalog search: Project Gutenberg (gutendex) + Open Library + Libby/OverDrive metadata.
// Using TanStack Start Server Functions to execute requests on the server, bypassing CORS.
import { createServerFn } from "@tanstack/react-start";

export interface CatalogBook {
  source: "gutenberg" | "openlibrary" | "libby";
  external_id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  external_url: string | null;
  language: string | null;
}

export const searchGutenberg = createServerFn({ method: "GET" })
  .handler(async ({ data }: { data: any }) => {
    const q = data as string;
    if (!q.trim()) return [];
    try {
      const r = await fetch(`https://gutendex.com/books?search=${encodeURIComponent(q)}`);
      if (!r.ok) return [];
      const d = await r.json();
      return (d.results ?? []).slice(0, 20).map((b: any) => {
        const formats = b.formats ?? {};
        const url =
          formats["text/plain; charset=utf-8"] ||
          formats["text/plain"] ||
          formats["text/html"] ||
          formats["application/pdf"] ||
          formats["application/epub+zip"] ||
          null;
        return {
          source: "gutenberg" as const,
          external_id: String(b.id),
          title: b.title,
          author: b.authors?.[0]?.name ?? null,
          cover_url: formats["image/jpeg"] ?? null,
          external_url: url,
          language: b.languages?.[0] ?? "en",
        };
      });
    } catch (e) {
      console.error("Gutenberg search error:", e);
      return [];
    }
  });

export const searchOpenLibrary = createServerFn({ method: "GET" })
  .handler(async ({ data }: { data: any }) => {
    const q = data as string;
    if (!q.trim()) return [];
    try {
      const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=20`);
      if (!r.ok) return [];
      const d = await r.json();
      return (d.docs ?? []).map((b: any) => ({
        source: "openlibrary" as const,
        external_id: b.key,
        title: b.title,
        author: b.author_name?.[0] ?? null,
        cover_url: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` : null,
        external_url: b.ia && b.ia[0] ? `https://archive.org/download/${b.ia[0]}/${b.ia[0]}_djvu.txt` : null,
        language: b.language?.[0] ?? null,
      }));
    } catch (e) {
      console.error("OpenLibrary search error:", e);
      return [];
    }
  });

export const searchLibby = createServerFn({ method: "GET" })
  .handler(async ({ data }: { data: any }) => {
    const q = data as string;
    // Libby has no public reader API. Fetch OpenLibrary results marked as Libby.
    try {
      const fallback = await searchOpenLibrary({ data: q });
      return fallback.slice(0, 10).map((b: any) => ({ ...b, source: "libby" as const, external_url: null }));
    } catch (e) {
      console.error("Libby search error:", e);
      return [];
    }
  });

export const fetchExternalBookText = createServerFn({ method: "GET" })
  .handler(async ({ data }: { data: any }) => {
    const url = data as string;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch external book: ${res.statusText}`);
      return await res.text();
    } catch (e) {
      console.error("Error downloading external book text:", e);
      throw e;
    }
  });
