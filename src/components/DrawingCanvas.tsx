import React, { useRef, useState, useEffect } from "react";
import { StickyNote, Trash2, Check, X, FileText } from "lucide-react";

interface Stroke {
  tool: "pen" | "highlighter" | "pencil" | "marker";
  color: string;
  width: number;
  points: { x: number; y: number }[];
}

interface StickyNoteItem {
  id: string;
  x: number;
  y: number;
  text: string;
}

interface DrawingCanvasProps {
  page: number;
  activeTool: "pointer" | "pen" | "highlighter" | "pencil" | "marker" | "eraser" | "note";
  brushColor: string;
  brushWidth: number;
  drawings: Stroke[];
  notes: StickyNoteItem[];
  onChange: (drawings: Stroke[], notes: StickyNoteItem[]) => void;
  isCompleted: boolean;
  
  // Collaborative public markings
  readOnlyDrawings?: Stroke[];
  readOnlyNotes?: (StickyNoteItem & { authorId: string })[];
  participants?: any[];
}

const getCursorStyle = (tool: string, color: string): string => {
  let svg = "";
  let hotspot = "0 24";

  // Escape color hash for SVG (replace '#' with '%23')
  const escapedColor = color.replace("#", "%23");

  switch (tool) {
    case "pen":
      // Tilted Pen pointing to bottom-left (hotspot 3 21)
      svg = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='${escapedColor}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M12 20h9'/><path d='M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'/></svg>`;
      hotspot = "3 21";
      break;
    case "pencil":
      // Tilted Pencil pointing to bottom-left
      svg = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='${escapedColor}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'/><path d='m15 5 4 4'/></svg>`;
      hotspot = "2 22";
      break;
    case "marker":
      // Tilted Marker / Paintbrush pointing to bottom-left
      svg = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='${escapedColor}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 22H9l-3-3v-3l12-12a2.83 2.83 0 1 1 4 4L12 22Z'/><path d='M16 8l4 4'/><path d='m5.5 14.5-2.5 1 1-2.5'/></svg>`;
      hotspot = "3 19";
      break;
    case "highlighter":
      // Tilted Highlighter pointing to bottom-left
      svg = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='${escapedColor}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m9 11-6 6v3h3l6-6'/><path d='m9 11 4-4 3 3-4 4z'/><path d='m13 7 3-3a2.5 2.5 0 0 1 3.5 0l1 1a2.5 2.5 0 0 1 0 3.5l-3 3'/></svg>`;
      hotspot = "3 20";
      break;
    case "eraser":
      // Eraser shape, hotspot at center-left
      svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23e11d48' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21Z'/><path d='M22 21H7'/><path d='m5 11 9 9'/></svg>`;
      hotspot = "8 16";
      break;
    case "note":
      // Sticky Note, hotspot at center
      svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23d97706' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M16 3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z'/><path d='M16 3v5h5'/><path d='m16 8 5-5'/></svg>`;
      hotspot = "10 10";
      break;
    default:
      return "crosshair";
  }

  return `url("data:image/svg+xml;utf8,${svg}") ${hotspot}, crosshair`;
};

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  page,
  activeTool,
  brushColor,
  brushWidth,
  drawings,
  notes,
  onChange,
  isCompleted,
  readOnlyDrawings,
  readOnlyNotes,
  participants,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);

  // Logical coordinate system: 420 x 580
  const LOGICAL_WIDTH = 420;
  const LOGICAL_HEIGHT = 580;

  // Redraw canvas drawings when drawings array or component dimensions change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Draw read-only drawings from other users first
    if (readOnlyDrawings) {
      readOnlyDrawings.forEach((stroke) => {
        if (stroke.points.length < 2) return;

        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (stroke.tool === "highlighter") {
          ctx.globalAlpha = 0.4;
        } else {
          ctx.globalAlpha = 1.0;
        }

        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      });
    }

    // Draw saved drawings belonging to current user
    drawings.forEach((stroke) => {
      if (stroke.points.length < 2) return;

      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (stroke.tool === "highlighter") {
        ctx.globalAlpha = 0.4;
      } else {
        ctx.globalAlpha = 1.0;
      }

      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    });

    // Reset alpha
    ctx.globalAlpha = 1.0;
  }, [drawings, readOnlyDrawings]);

  // Convert screen coordinates to logical coordinates
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    
    let clientX = 0;
    let clientY = 0;

    if ("touches" in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scaleX = LOGICAL_WIDTH / rect.width;
    const scaleY = LOGICAL_HEIGHT / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (activeTool === "pointer" || isCompleted) return;

    // Prevent page flipping when using drawing tools
    e.stopPropagation();

    // Prevent scrolling/swiping on touch devices when drawing
    if (e.cancelable) e.preventDefault();

    const coords = getCoordinates(e);
    if (!coords) return;

    if (activeTool === "note") {
      // Place sticky note pin
      const newNote: StickyNoteItem = {
        id: Math.random().toString(36).substring(2, 9),
        x: coords.x,
        y: coords.y,
        text: "",
      };
      const updatedNotes = [...notes, newNote];
      onChange(drawings, updatedNotes);
      setEditingNoteId(newNote.id);
      setNoteText("");
      return;
    }

    setIsDrawing(true);
    setCurrentPoints([coords]);

    // If eraser tool, remove strokes intersected by coords
    if (activeTool === "eraser") {
      eraseStrokes(coords.x, coords.y);
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || activeTool === "pointer" || isCompleted) return;
    
    // Prevent page flipping when using drawing tools
    e.stopPropagation();
    
    if (e.cancelable) e.preventDefault();

    const coords = getCoordinates(e);
    if (!coords) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (activeTool === "eraser") {
      eraseStrokes(coords.x, coords.y);
      return;
    }

    // Real-time canvas preview
    ctx.beginPath();
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (activeTool === "highlighter") {
      ctx.globalAlpha = 0.4;
    } else {
      ctx.globalAlpha = 1.0;
    }

    const lastPoint = currentPoints[currentPoints.length - 1];
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();

    ctx.globalAlpha = 1.0;

    setCurrentPoints((prev) => [...prev, coords]);
  };

  const endDrawing = (e?: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (e) e.stopPropagation();

    if (activeTool === "pointer" || activeTool === "eraser" || activeTool === "note" || isCompleted) return;

    if (currentPoints.length >= 2) {
      const newStroke: Stroke = {
        tool: activeTool === "highlighter" ? "highlighter" : activeTool === "pencil" ? "pencil" : activeTool === "marker" ? "marker" : "pen",
        color: brushColor,
        width: brushWidth,
        points: currentPoints,
      };
      onChange([...drawings, newStroke], notes);
    }

    setCurrentPoints([]);
  };

  const eraseStrokes = (x: number, y: number) => {
    // Helper to check if point is close to a line segment
    const distToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
      const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
      if (l2 === 0) return (px - x1) ** 2 + (py - y1) ** 2;
      let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
      t = Math.max(0, Math.min(1, t));
      return (px - (x1 + t * (x2 - x1))) ** 2 + (py - (y1 + t * (y2 - y1))) ** 2;
    };

    // Erase threshold
    const thresholdSq = 144; // 12px radius squared

    const newDrawings = drawings.filter((stroke) => {
      for (let i = 0; i < stroke.points.length - 1; i++) {
        const dSq = distToSegment(x, y, stroke.points[i].x, stroke.points[i].y, stroke.points[i+1].x, stroke.points[i+1].y);
        if (dSq < thresholdSq) return false; // Erase entire stroke
      }
      return true;
    });

    if (newDrawings.length !== drawings.length) {
      onChange(newDrawings, notes);
    }
  };

  const handleNoteTextChange = (text: string) => {
    setNoteText(text);
    if (!editingNoteId) return;
    const updatedNotes = notes.map((n) =>
      n.id === editingNoteId ? { ...n, text } : n
    );
    onChange(drawings, updatedNotes);
  };

  const closeNoteEditor = () => {
    // Clean up empty notes
    const cleanedNotes = notes.filter((n) => n.text.trim() !== "");
    onChange(drawings, cleanedNotes);
    setEditingNoteId(null);
  };

  const handleDeleteNote = (id: string) => {
    const updatedNotes = notes.filter((n) => n.id !== id);
    onChange(drawings, updatedNotes);
    setEditingNoteId(null);
  };

  return (
    <div 
      ref={containerRef}
      style={{
        cursor: activeTool !== "pointer" ? getCursorStyle(activeTool, brushColor) : undefined
      }}
      className={`absolute inset-0 z-10 w-full h-full select-none ${
        activeTool === "pointer" ? "pointer-events-none" : "pointer-events-auto"
      }`}
    >
      <canvas
        ref={canvasRef}
        width={LOGICAL_WIDTH}
        height={LOGICAL_HEIGHT}
        className="w-full h-full absolute inset-0"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={(e) => endDrawing(e)}
        onMouseLeave={(e) => endDrawing(e)}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={(e) => endDrawing(e)}
      />

      {/* Sticky Note Pins Overlay */}
      {notes.map((note) => {
        const posX = `${(note.x / LOGICAL_WIDTH) * 100}%`;
        const posY = `${(note.y / LOGICAL_HEIGHT) * 100}%`;
        
        return (
          <div
            key={note.id}
            className="absolute z-20 pointer-events-auto"
            style={{ left: posX, top: posY, transform: "translate(-50%, -50%)" }}
          >
            <button
              onClick={() => {
                if (isCompleted) return;
                setEditingNoteId(note.id);
                setNoteText(note.text);
              }}
              onMouseEnter={() => setHoveredNoteId(note.id)}
              onMouseLeave={() => setHoveredNoteId(null)}
              className="size-6 bg-amber-500 hover:bg-amber-600 text-stone-900 flex items-center justify-center rounded-full shadow-lg border border-amber-600 hover:scale-110 transition-transform cursor-pointer"
            >
              <StickyNote className="size-3.5 fill-current" />
            </button>

            {/* Hover tooltip for quick note reading */}
            {hoveredNoteId === note.id && editingNoteId !== note.id && (
              <div className="absolute left-8 top-0 w-48 bg-amber-50/95 dark:bg-stone-900/95 backdrop-blur-sm border border-amber-200/50 dark:border-stone-700 p-2.5 shadow-xl text-[11px] text-stone-800 dark:text-stone-200 font-serif leading-relaxed tactical-chamfer rounded-sm max-h-32 overflow-auto pointer-events-none">
                {note.text}
              </div>
            )}
          </div>
        );
      })}

      {/* Read-Only Sticky Note Pins Overlay */}
      {readOnlyNotes && readOnlyNotes.map((note) => {
        const posX = `${(note.x / LOGICAL_WIDTH) * 100}%`;
        const posY = `${(note.y / LOGICAL_HEIGHT) * 100}%`;
        const authorProfile = participants?.find(p => p.user_id === note.authorId);
        const authorName = authorProfile?.profiles?.display_name || "reader";
        
        return (
          <div
            key={note.id}
            className="absolute z-20 pointer-events-auto"
            style={{ left: posX, top: posY, transform: "translate(-50%, -50%)" }}
          >
            <button
              onMouseEnter={() => setHoveredNoteId(note.id)}
              onMouseLeave={() => setHoveredNoteId(null)}
              className="size-6 bg-slate-500 hover:bg-slate-600 text-white flex items-center justify-center rounded-full shadow-lg border border-slate-600 hover:scale-110 transition-transform cursor-pointer"
            >
              <StickyNote className="size-3.5 fill-current" />
            </button>

            {/* Hover tooltip for quick note reading */}
            {hoveredNoteId === note.id && (
              <div className="absolute left-8 top-0 w-48 bg-slate-100/95 dark:bg-stone-900/95 backdrop-blur-sm border border-slate-300/50 dark:border-stone-700 p-2.5 shadow-xl text-[11px] text-stone-800 dark:text-stone-200 font-serif leading-relaxed tactical-chamfer rounded-sm max-h-32 overflow-auto pointer-events-none z-50">
                <div className="hud-label text-[8px] text-slate-500 dark:text-slate-400 mb-1">// {authorName}'s note</div>
                {note.text}
              </div>
            )}
          </div>
        );
      })}

      {/* Note Edit Modal Overlay */}
      {editingNoteId && (
        <div 
          className="absolute inset-0 z-30 bg-black/35 backdrop-blur-[1px] flex items-center justify-center p-4 pointer-events-auto"
          onClick={closeNoteEditor}
        >
          <div 
            className="bg-[#fbf5e6] dark:bg-stone-900 border border-amber-900/30 p-4 tactical-chamfer shadow-tactical max-w-xs w-full text-stone-900 dark:text-stone-100"
            onClick={e => e.stopPropagation()}
          >
            <div className="hud-label text-[10px] text-primary mb-1 flex items-center gap-1">
              <FileText className="size-3" /> // write note
            </div>
            <textarea
              value={noteText}
              onChange={(e) => handleNoteTextChange(e.target.value)}
              placeholder="Record your observation..."
              rows={4}
              maxLength={200}
              className="w-full text-xs p-2 bg-[#f4ebd0] dark:bg-stone-850 border border-amber-900/20 outline-none focus:border-primary font-serif resize-none text-stone-950 dark:text-stone-100 placeholder:text-stone-500"
              autoFocus
            />
            <div className="flex justify-between items-center mt-3">
              <button
                onClick={() => handleDeleteNote(editingNoteId)}
                className="p-1.5 text-stone-500 hover:text-red-500 hover:bg-red-500/10 rounded transition tactical-chamfer text-xs"
                title="Delete note"
              >
                <Trash2 className="size-3.5" />
              </button>
              <button
                onClick={closeNoteEditor}
                className="px-3 py-1 bg-primary text-primary-foreground font-display text-[9px] uppercase tracking-wider hover:bg-primary-glow transition tactical-chamfer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
