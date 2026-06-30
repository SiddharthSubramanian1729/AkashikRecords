import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import HTMLFlipBookImport from "react-pageflip";
const HTMLFlipBook = HTMLFlipBookImport as unknown as React.ForwardRefExoticComponent<any>;
import { Loader2, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { fetchExternalBookText } from "@/lib/catalog";

interface BookReaderProps {
  fileUrl: string;
  page: number;
  onPageChange?: (page: number) => void;
  onTotalPagesChange?: (totalPages: number) => void;
  canFlip: boolean; // true only for admin force-flip OR after all-done in solo
}

export interface BookReaderHandle {
  flipForward: () => void;
  flipBackward: () => void;
}

interface PageContent {
  type: "image" | "text";
  src?: string;
  content?: string;
  loading?: boolean;
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
  { fileUrl, page, onPageChange, onTotalPagesChange, canFlip }, ref
) {
  const [pages, setPages] = useState<PageContent[]>([]);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const flipRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [fitToPage, setFitToPage] = useState(true);

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

  // Lazy load adjacent PDF page canvases
  useEffect(() => {
    if (!pdfDoc || pages.length === 0) return;

    let cancelled = false;
    const loadAdjacent = async () => {
      const currentIndex = page - 1;
      const start = Math.max(0, currentIndex - 4);
      const end = Math.min(pages.length - 1, currentIndex + 4);

      for (let i = start; i <= end; i++) {
        const item = pages[i];
        if (item && item.type === "image" && !item.src && !item.loading) {
          // Set loading tag
          setPages(prev => {
            const copy = [...prev];
            if (copy[i]) copy[i] = { ...copy[i], loading: true };
            return copy;
          });

          try {
            console.log(`[PDF Lazy Load] Loading page ${i + 1}`);
            const p = await pdfDoc.getPage(i + 1);
            const viewport = p.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d")!;
            await p.render({ canvasContext: ctx, viewport, canvas }).promise;
            const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

            if (cancelled) return;
            setPages(prev => {
              const copy = [...prev];
              if (copy[i]) copy[i] = { ...copy[i], src: dataUrl, loading: false };
              return copy;
            });
          } catch (e) {
            console.error(`Failed to load page ${i + 1}:`, e);
            if (cancelled) return;
            setPages(prev => {
              const copy = [...prev];
              if (copy[i]) copy[i] = { ...copy[i], loading: false };
              return copy;
            });
          }
        }
      }
    };

    loadAdjacent();
    return () => { cancelled = true; };
  }, [pdfDoc, page, pages.length]);

  // Sync to controlled page
  useEffect(() => {
    if (!flipRef.current?.pageFlip || pages.length === 0) return;
    const flipper = flipRef.current.pageFlip();
    if (!flipper) return;
    const cur = flipper.getCurrentPageIndex();
    const target = Math.max(0, Math.min(pages.length - 1, page - 1));
    if (cur !== target) flipper.flip(target);
  }, [page, pages.length]);

  useImperativeHandle(ref, () => ({
    flipForward: () => flipRef.current?.pageFlip?.()?.flipNext(),
    flipBackward: () => flipRef.current?.pageFlip?.()?.flipPrev(),
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
          <HTMLFlipBook
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
            useMouseEvents={canFlip}
            onFlip={(e: any) => onPageChange?.(e.data + 1)}
            className=""
            style={{}}
            startPage={0}
            usePortrait
            startZIndex={0}
            autoSize
            maxShadowOpacity={0.4}
            clickEventForward
            swipeDistance={0}
            showPageCorners={canFlip}
            disableFlipByClick={!canFlip}
          >
            {pages.map((p, i) => {
              return (
                <div key={i} className="paper overflow-hidden select-none">
                  {p.type === "image" ? (
                    p.src ? (
                      <img src={p.src} alt={`page ${i+1}`} className="w-full h-full object-contain" draggable={false} />
                    ) : (
                      <div className="w-full h-full bg-[#fbf0d9] flex items-center justify-center">
                        <Loader2 className="size-8 animate-spin text-primary/40" />
                      </div>
                    )
                  ) : (
                    <div className="w-full h-full p-10 flex flex-col justify-between bg-[#fbf0d9] text-stone-900 border border-stone-200 shadow-md font-serif text-left">
                      <div className="leading-relaxed text-[15px] whitespace-pre-wrap flex-1 overflow-hidden antialiased">
                        {p.content}
                      </div>
                      <div className="text-center text-xs text-stone-500 mt-4 border-t border-stone-200/50 pt-2 tracking-widest font-sans font-semibold uppercase">
                        Page {i + 1}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </HTMLFlipBook>
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
