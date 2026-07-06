import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import HTMLFlipBookImport from "react-pageflip";
const HTMLFlipBook = HTMLFlipBookImport as unknown as React.ForwardRefExoticComponent<any>;
import { 
  Loader2, ZoomIn, ZoomOut, Maximize2, MousePointer, Pencil, Highlighter, 
  Eraser, StickyNote, Trash2, Palette, Info, ChevronLeft, ChevronRight, Paintbrush, PenTool 
} from "lucide-react";
import { fetchExternalBookText } from "@/lib/catalog";
import { supabase } from "@/integrations/supabase/client";
import { DrawingCanvas } from "./DrawingCanvas";

interface BookReaderProps {
  fileUrl: string;
  page: number;
  bookId: string;
  canFlip: boolean; // true only for admin force-flip OR after all-done in solo
  onPageChange?: (page: number) => void;
  onTotalPagesChange?: (totalPages: number) => void;
  onFinished?: () => void;
  isCompleted?: boolean;

  // Annotation states passed from parent HUD
  activeTool: "pointer" | "pen" | "highlighter" | "pencil" | "marker" | "eraser" | "note";
  brushColor: string;
  brushWidth: number;
  onSaveStatusChange?: (status: "idle" | "saving" | "saved" | "error") => void;

  // Collaborative settings
  isAnnotationsPublic?: boolean;
  allottedUsers?: string[];
  participants?: any[];
}

export interface BookReaderHandle {
  flipForward: () => void;
  flipBackward: () => void;
  clearCurrentPageAnnotations: () => void;
}

interface PageContent {
  type: "image" | "text";
  src?: string;
  content?: string;
  loading?: boolean;
}

interface PdfPageProps {
  pdfDoc: any;
  pageIndex: number;
  active: boolean;
}

function PdfPage({ pdfDoc, pageIndex, active }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    if (!pdfDoc) return;
    
    let cancelled = false;
    
    const renderPage = async () => {
      if (!active) {
        setLoading(true);
        // Clear canvas to free memory
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
        return;
      }
      
      try {
        setLoading(true);
        const page = await pdfDoc.getPage(pageIndex);
        if (cancelled) return;
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        
        // Scale for crisp, sharp rendering
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        const renderContext = {
          canvasContext: ctx,
          viewport: viewport
        };
        
        // Cancel any pending render task for this canvas
        if (renderTaskRef.current) {
          try { renderTaskRef.current.cancel(); } catch(e) {}
        }
        
        const task = page.render(renderContext);
        renderTaskRef.current = task;
        
        await task.promise;
        if (cancelled) return;
        
        setLoading(false);
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException") {
          console.error(`Error rendering page ${pageIndex}:`, err);
        }
      }
    };
    
    renderPage();
    
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // Ignore cancel exceptions
        }
      }
    };
  }, [pdfDoc, pageIndex, active]);

  return (
    <div className="w-full h-full bg-[#fbf0d9] flex items-center justify-center relative overflow-hidden">
      <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
      {loading && active && (
        <div className="absolute inset-0 bg-[#fbf0d9]/60 flex items-center justify-center z-10">
          <Loader2 className="size-8 animate-spin text-primary/60" />
        </div>
      )}
    </div>
  );
}

function cleanAndFormatText(rawText: string): string {
  const blocks = rawText.split(/\r?\n\r?\n/);
  const cleanedBlocks = blocks.map(block => {
    return block
      .replace(/\r?\n/g, " ")      // Merge single line breaks in the same paragraph
      .replace(/\s+/g, " ")        // Collapse whitespace
      .trim();
  });
  return cleanedBlocks.filter(block => block.length > 0).join("\n\n");
}

function isHeading(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 50) return false;

  // Patterns for headers:
  // 1. Chapter, Adventure, Act, Scene, Part, Contents, Index, Epilogue, Prologue
  const keywordMatch = /^(chapter|adventure|act|scene|part|contents|index|prologue|epilogue|introduction)(\s+[ivxldc0-9]+)?/i.test(t);
  if (keywordMatch) return true;

  // 2. Short Roman numerals on their own line (e.g. "I", "II", "III", "IV", "V")
  const romanMatch = /^[ivxldc]{1,5}\.?$/i.test(t);
  if (romanMatch) return true;

  // 3. Short numbers on their own line (e.g. "1.", "2.")
  const numberMatch = /^[0-9]+\.?$/i.test(t);
  if (numberMatch) return true;

  // 4. Short all-caps title (e.g. "A SCANDAL IN BOHEMIA")
  const allCapsMatch = /^[A-Z0-9\s\-\.\,\?\!\'\":]{3,40}$/.test(t);
  if (allCapsMatch) return true;

  return false;
}

function paginateText(text: string, maxLinesPerPage = 18, maxCharsPerLine = 48): string[] {
  const paragraphs = text.split("\n\n");
  const pages: string[] = [];
  let currentPageLines: string[] = [];
  
  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (trimmedPara === "") continue;
    
    if (isHeading(trimmedPara)) {
      if (currentPageLines.length > 0) {
        while (currentPageLines.length > 0 && currentPageLines[currentPageLines.length - 1] === "") {
          currentPageLines.pop();
        }
        if (currentPageLines.length > 0) {
          pages.push(currentPageLines.join("\n"));
        }
        currentPageLines = [];
      }
      
      const leadingSpaces = Math.max(0, Math.floor((maxCharsPerLine - trimmedPara.length) / 2));
      const centeredLine = " ".repeat(leadingSpaces) + trimmedPara;
      
      currentPageLines.push(""); // margin top
      currentPageLines.push(centeredLine);
      currentPageLines.push(""); // margin bottom
      continue;
    }
    
    const words = trimmedPara.split(/\s+/);
    let currentLine = "    "; // 4-space indent at paragraph start
    let isFirstLineOfParagraph = true;
    
    for (const word of words) {
      const spaceNeeded = isFirstLineOfParagraph ? 0 : 1;
      if (currentLine.length + word.length + spaceNeeded <= maxCharsPerLine) {
        currentLine = isFirstLineOfParagraph ? `${currentLine}${word}` : `${currentLine} ${word}`;
        isFirstLineOfParagraph = false;
      } else {
        currentPageLines.push(currentLine);
        currentLine = word;
        isFirstLineOfParagraph = false;
        
        if (currentPageLines.length >= maxLinesPerPage) {
          pages.push(currentPageLines.join("\n"));
          currentPageLines = [];
        }
      }
    }
    
    if (currentLine) {
      currentPageLines.push(currentLine);
      if (currentPageLines.length >= maxLinesPerPage) {
        pages.push(currentPageLines.join("\n"));
        currentPageLines = [];
      }
    }
    
    // Add spacer line between paragraphs if page isn't full
    if (currentPageLines.length > 0 && currentPageLines.length < maxLinesPerPage) {
      currentPageLines.push("");
    }
  }
  
  if (currentPageLines.length > 0) {
    if (currentPageLines[currentPageLines.length - 1] === "") {
      currentPageLines.pop();
    }
    if (currentPageLines.length > 0) {
      pages.push(currentPageLines.join("\n"));
    }
  }
  
  return pages;
}

export const BookReader = forwardRef<BookReaderHandle, BookReaderProps>(function BookReader(
  { 
    fileUrl, 
    page, 
    bookId, 
    onPageChange, 
    onTotalPagesChange, 
    onFinished, 
    canFlip, 
    isCompleted,
    activeTool,
    brushColor,
    brushWidth,
    onSaveStatusChange,
    isAnnotationsPublic,
    allottedUsers,
    participants,
  }, 
  ref
) {
  const [pages, setPages] = useState<PageContent[]>([]);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const flipRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [fitToPage, setFitToPage] = useState(true);

  // Annotations state: maps [user_id][pageNumber] to drawing/notes payload
  const [annotations, setAnnotations] = useState<Record<string, Record<number, { drawings: any[]; notes: any[] }>>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [saveStatus, setSaveStatusState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveQueueRef = useRef<Record<number, NodeJS.Timeout>>({});
  const isProgrammaticRef = useRef(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setCurrentUserId(data.user.id);
      }
    });
  }, []);

  const setSaveStatus = (status: "idle" | "saving" | "saved" | "error") => {
    setSaveStatusState(status);
    onSaveStatusChange?.(status);
  };


  const pageRefs = useRef<HTMLDivElement[]>([]);

  // Shield react-pageflip from receiving mouse/touch events while scribbling
  useEffect(() => {
    if (activeTool === "pointer") return;

    const stopPropagation = (e: Event) => {
      e.stopPropagation();
    };

    const elements = pageRefs.current;
    elements.forEach(el => {
      if (!el) return;
      el.addEventListener("mousedown", stopPropagation);
      el.addEventListener("mousemove", stopPropagation);
      el.addEventListener("mouseup", stopPropagation);
      el.addEventListener("touchstart", stopPropagation, { passive: true });
      el.addEventListener("touchmove", stopPropagation, { passive: true });
      el.addEventListener("touchend", stopPropagation);
      el.addEventListener("pointerdown", stopPropagation);
      el.addEventListener("pointermove", stopPropagation);
      el.addEventListener("pointerup", stopPropagation);
      el.addEventListener("click", stopPropagation);
    });

    return () => {
      elements.forEach(el => {
        if (!el) return;
        el.removeEventListener("mousedown", stopPropagation);
        el.removeEventListener("mousemove", stopPropagation);
        el.removeEventListener("mouseup", stopPropagation);
        el.removeEventListener("touchstart", stopPropagation);
        el.removeEventListener("touchmove", stopPropagation);
        el.removeEventListener("touchend", stopPropagation);
        el.removeEventListener("pointerdown", stopPropagation);
        el.removeEventListener("pointermove", stopPropagation);
        el.removeEventListener("pointerup", stopPropagation);
        el.removeEventListener("click", stopPropagation);
      });
    };
  }, [activeTool, pages]);

  // Fetch annotations on mount or when bookId changes, and subscribe to changes
  useEffect(() => {
    if (!bookId) return;
    
    const loadAnnotations = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("annotations")
          .select("user_id, page, drawings, notes, is_public")
          .eq("book_id", bookId);
        
        if (error) {
          console.error("Error loading annotations:", error);
          return;
        }

        const map: Record<string, Record<number, { drawings: any[]; notes: any[] }>> = {};
        data?.forEach((row: any) => {
          const uid = row.user_id;
          if (!map[uid]) {
            map[uid] = {};
          }
          map[uid][row.page] = {
            drawings: Array.isArray(row.drawings) ? row.drawings : [],
            notes: Array.isArray(row.notes) ? row.notes : [],
          };
        });
        setAnnotations(map);
      } catch (err) {
        console.error("Error loading annotations:", err);
      }
    };

    loadAnnotations();

    // Subscribe to realtime updates for this book's annotations
    const channel = supabase.channel(`annotations:${bookId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "annotations",
        filter: `book_id=eq.${bookId}`
      }, () => {
        loadAnnotations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bookId]);

  // Clear timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(saveQueueRef.current).forEach(clearTimeout);
    };
  }, []);

  const handleAnnotationChange = (pageNumber: number, drawings: any[], notes: any[]) => {
    if (!currentUserId) return;

    // 1. Update local state
    setAnnotations(prev => {
      const userMap = prev[currentUserId] || {};
      return {
        ...prev,
        [currentUserId]: {
          ...userMap,
          [pageNumber]: { drawings, notes }
        }
      };
    });

    // 2. Debounce database save
    if (saveQueueRef.current[pageNumber]) {
      clearTimeout(saveQueueRef.current[pageNumber]);
    }

    setSaveStatus("saving");

    saveQueueRef.current[pageNumber] = setTimeout(async () => {
      try {
        const { error } = await (supabase as any)
          .from("annotations")
          .upsert({
            user_id: currentUserId,
            book_id: bookId,
            page: pageNumber,
            drawings,
            notes,
            is_public: !!isAnnotationsPublic,
            updated_at: new Date().toISOString()
          }, { onConflict: "user_id,book_id,page" });

        if (error) {
          console.error("Error saving annotations:", error);
          setSaveStatus("error");
        } else {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        }
      } catch (err) {
        console.error("Error upserting annotations:", err);
        setSaveStatus("error");
      }
    }, 1200);
  };

  const clearPageAnnotations = (pageNumber: number) => {
    if (!confirm("Clear all drawings, highlights, and notes on this page?")) return;
    handleAnnotationChange(pageNumber, [], []);
  };

  // Resize handler
  useEffect(() => {
    if (!fitToPage || !containerRef.current || pages.length === 0) return;
    const handleResize = () => {
      const container = containerRef.current;
      if (!container) return;
      const availWidth = container.clientWidth - 48;
      const availHeight = container.clientHeight - 48;
      const bookWidth = 840; // 420 * 2 (dual page layout width)
      const bookHeight = 580; // height of a single page
      
      const scaleX = availWidth / bookWidth;
      const scaleY = availHeight / bookHeight;
      const newScale = Math.min(scaleX, scaleY);
      setZoom(Math.max(0.4, Math.min(2.0, newScale)));
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    const t = setTimeout(handleResize, 150);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(t);
    };
  }, [fitToPage, pages.length]);

  // Page reporter
  useEffect(() => {
    if (pages.length > 0 && onTotalPagesChange) {
      onTotalPagesChange(pages.length);
    }
  }, [pages.length, onTotalPagesChange]);

  // Load Book metadata (PDF page count or full text)
  useEffect(() => {
    let cancelled = false;
    if (!fileUrl) return;

    (async () => {
      setLoading(true);
      setError(null);
      setPdfDoc(null);
      setPages([]);
      
      try {
        const isPdf = fileUrl.toLowerCase().includes(".pdf") || fileUrl.includes("book-files") || fileUrl.startsWith("blob:") || fileUrl.startsWith("data:application/pdf");
        
        if (isPdf) {
          const pdfjs = await import("pdfjs-dist");
          pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
          const pdf = await pdfjs.getDocument({ url: fileUrl, withCredentials: false }).promise;
          
          if (cancelled) return;
          setPdfDoc(pdf);

          // Populate empty placeholders for all pages
          const placeholders = Array.from({ length: pdf.numPages }, () => ({
            type: "image" as const,
            src: "",
            loading: false
          }));
          setPages(placeholders);
          setLoading(false);
        } else {
          // Plain text pagination via Server Function proxy to bypass CORS
          let text = await fetchExternalBookText({ data: fileUrl });
          if (cancelled) return;
          
          // Basic cleanups for HTML/metadata if any
          if (text.includes("<!DOCTYPE html>") || text.includes("<html")) {
            text = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
          }
          
          const formattedText = cleanAndFormatText(text);
          const paginated = paginateText(formattedText, 18, 48);
          const list = paginated.map(content => ({ type: "text" as const, content }));
          setPages(list);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Failed to load book content");
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [fileUrl]);

  // Sync to controlled page
  useEffect(() => {
    if (!flipRef.current?.pageFlip || pages.length === 0) return;
    const flipper = flipRef.current.pageFlip();
    if (!flipper) return;
    const cur = flipper.getCurrentPageIndex();
    const target = Math.max(0, Math.min(pages.length - 1, page - 1));
    if (cur !== target) {
      isProgrammaticRef.current = true;
      flipper.flip(target);
      const t = setTimeout(() => {
        isProgrammaticRef.current = false;
      }, 800);
      return () => clearTimeout(t);
    }
  }, [page, pages.length]);

  useImperativeHandle(ref, () => ({
    flipForward: () => flipRef.current?.pageFlip?.()?.flipNext(),
    flipBackward: () => flipRef.current?.pageFlip?.()?.flipPrev(),
    clearCurrentPageAnnotations: () => clearPageAnnotations(page),
  }));

  if (loading && pages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="size-12 animate-spin text-primary mx-auto mb-3" />
          <div className="hud-label">// loading book content...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="panel p-6 tactical-chamfer text-center">
          <div className="hud-label text-destructive mb-2">// read error</div>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 w-full h-full flex items-center justify-center overflow-auto relative p-6 bg-accent/20">
      {/* Floating Zoom HUD */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1 bg-background/80 backdrop-blur border border-border p-1.5 tactical-chamfer shadow-tactical">
        <button onClick={() => { setFitToPage(false); setZoom(z => Math.max(0.4, z - 0.1)); }} className="p-1 hover:bg-accent hover:text-primary transition tactical-chamfer text-xs" title="Zoom Out">
          <ZoomOut className="size-3.5" />
        </button>
        <span className="hud-label text-[10px] px-2 min-w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => { setFitToPage(false); setZoom(z => Math.min(3.0, z + 0.1)); }} className="p-1 hover:bg-accent hover:text-primary transition tactical-chamfer text-xs" title="Zoom In">
          <ZoomIn className="size-3.5" />
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        <button onClick={() => { setFitToPage(!fitToPage); if(!fitToPage) setZoom(1); }} className={`px-2 py-0.5 text-[9px] font-display uppercase tracking-widest transition tactical-chamfer flex items-center gap-1 ${fitToPage ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
          <Maximize2 className="size-2.5" /> {fitToPage ? "Auto-Fit" : "Free"}
        </button>
      </div>

      {/* Scaled viewport container */}
      <div className="transition-transform duration-100 ease-out origin-center" style={{ transform: `scale(${zoom})`, minWidth: 840, minHeight: 580 }}>
        <div className="relative" style={{ filter: canFlip ? undefined : "saturate(1)" }}>
          {pages.length > 0 ? (
            <HTMLFlipBook
              key={`${activeTool === "pointer" ? "flippable" : "locked"}-${canFlip ? "allowed" : "blocked"}`}
              ref={flipRef}
              width={420}
              height={580}
              size="stretch"
              minWidth={300}
              maxWidth={600}
              minHeight={400}
              maxHeight={800}
              showCover={false}
              mobileScrollSupport={false}
              flippingTime={650}
              drawShadow
              useMouseEvents={canFlip && activeTool === "pointer"}
              onFlip={(e: any) => {
                if (isProgrammaticRef.current) return;
                onPageChange?.(e.data + 1);
              }}
              className=""
              style={{}}
              startPage={Math.max(0, page - 1)}
              usePortrait
              startZIndex={0}
              autoSize
              maxShadowOpacity={0.4}
              clickEventForward
              swipeDistance={0}
              showPageCorners={canFlip && activeTool === "pointer"}
              disableFlipByClick={!canFlip || activeTool !== "pointer"}
            >
              {pages.map((p, i) => {
                const isLast = i === pages.length - 1;
                const pageNum = i + 1;
                
                // Get own page annotations
                const myPageData = currentUserId && annotations[currentUserId]?.[pageNum]
                  ? annotations[currentUserId][pageNum]
                  : { drawings: [], notes: [] };

                // Gather drawings and notes from other allotted users
                const readOnlyDrawings: any[] = [];
                const readOnlyNotes: any[] = [];

                if (allottedUsers && allottedUsers.length > 0) {
                  allottedUsers.forEach(uid => {
                    if (uid !== currentUserId && annotations[uid]?.[pageNum]) {
                      const peerData = annotations[uid][pageNum];
                      if (peerData.drawings) {
                        readOnlyDrawings.push(...peerData.drawings);
                      }
                      if (peerData.notes) {
                        peerData.notes.forEach((n: any) => {
                          readOnlyNotes.push({ ...n, authorId: uid });
                        });
                      }
                    }
                  });
                }

                return (
                  <div 
                    key={i} 
                    ref={el => { if (el) pageRefs.current[i] = el; }}
                    className="paper overflow-hidden select-none relative"
                    onClick={() => { if (isLast && activeTool === "pointer") onFinished?.(); }}
                  >
                    {p.type === "image" ? (
                      <div className="w-full h-full relative cursor-pointer">
                        <PdfPage pdfDoc={pdfDoc} pageIndex={pageNum} active={Math.abs(i - (page - 1)) <= 3} />
                        <DrawingCanvas
                          page={pageNum}
                          activeTool={activeTool}
                          brushColor={brushColor}
                          brushWidth={brushWidth}
                          drawings={myPageData.drawings}
                          notes={myPageData.notes}
                          onChange={(drawings, notes) => handleAnnotationChange(pageNum, drawings, notes)}
                          isCompleted={!!isCompleted}
                          readOnlyDrawings={readOnlyDrawings}
                          readOnlyNotes={readOnlyNotes}
                          participants={participants}
                        />
                        {isLast && (
                          <div className="absolute bottom-4 right-4 bg-amber-900/90 text-[#fbf0d9] px-2 py-1 text-[9px] tracking-wider animate-pulse uppercase font-semibold rounded z-20 pointer-events-none">// Click Page to Seal //</div>
                        )}
                      </div>
                    ) : (
                      <div className="w-full h-full p-10 flex flex-col justify-between bg-[#fbf0d9] text-stone-900 border border-stone-200 shadow-md font-serif text-left relative cursor-pointer">
                        <div className="leading-relaxed text-[15px] whitespace-pre-wrap flex-1 overflow-hidden antialiased">
                          {p.content}
                        </div>
                        <DrawingCanvas
                          page={pageNum}
                          activeTool={activeTool}
                          brushColor={brushColor}
                          brushWidth={brushWidth}
                          drawings={myPageData.drawings}
                          notes={myPageData.notes}
                          onChange={(drawings, notes) => handleAnnotationChange(pageNum, drawings, notes)}
                          isCompleted={!!isCompleted}
                          readOnlyDrawings={readOnlyDrawings}
                          readOnlyNotes={readOnlyNotes}
                          participants={participants}
                        />
                        <div className="text-center text-xs text-stone-500 mt-4 border-t border-stone-200/50 pt-2 tracking-widest font-sans font-semibold uppercase">
                          Page {pageNum}
                        </div>
                        {isLast && (
                          <div className="absolute bottom-4 right-4 text-[9px] text-amber-700 tracking-wider animate-pulse uppercase font-semibold pointer-events-none">// Click Page to Seal //</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </HTMLFlipBook>
          ) : (
            <div className="flex-1 w-[840px] h-[580px] bg-accent/20 border border-border flex items-center justify-center tactical-chamfer">
              <span className="hud-label text-stone-500">// compiling book scroll pages... //</span>
            </div>
          )}
          {!canFlip && (
            <div className="absolute -bottom-8 left-0 right-0 text-center hud-label text-primary">
              // locked · waiting on readers
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
