import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookReader, type BookReaderHandle } from "@/components/BookReader";
import { toast } from "sonner";
import {
  ArrowLeft, Mic, MicOff, Video, VideoOff, Check, ChevronsRight, Bookmark, Sparkles,
  Coffee, X, Send, Users as UsersIcon, BookOpen,
  MousePointer, Pencil, Highlighter, Eraser, StickyNote, Trash2, Palette, Paintbrush, PenTool
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/room/$roomId")({
  head: () => ({ meta: [{ title: "Reading Room — Akashik Records" }] }),
  component: RoomPage,
});

const CALLIGRAPHY_PROMPTS = [
  "Congratulations! You have successfully finished the book. Your Akasha record is sealed and your mind expanded.",
  "Deep wisdom achieved! You've leveled up your Akasha database. Keep going, the archives await!",
  "Chronicle Completed! You have absorbed the secrets of this text. Your intellect grows, reader.",
  "Vault Seal Broken! You have read this text from cover to cover. Your journey through the Akashik Records continues!"
];

function RoomPage() {
  const { roomId } = Route.useParams();
  const nav = useNavigate();
  const readerRef = useRef<BookReaderHandle>(null);

  const [me, setMe] = useState<any>(null);
  const [room, setRoom] = useState<any>(null);
  const [book, setBook] = useState<any>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [chat, setChat] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [onBreak, setOnBreak] = useState<{ until: number } | null>(null);
  const [pageStartTs, setPageStartTs] = useState(Date.now());
  const [pacePerPage, setPacePerPage] = useState<Record<string, number>>({}); // userId -> avg secs
  const [currentPage, setCurrentPage] = useState(1);
  const [showBookmarkSuccess, setShowBookmarkSuccess] = useState<number | null>(null);
  const [showFinishedScroll, setShowFinishedScroll] = useState(false);
  const [randomPrompt, setRandomPrompt] = useState("");

  // Lifted Scribble Annotation States
  const [activeTool, setActiveTool] = useState<"pointer" | "pen" | "highlighter" | "pencil" | "marker" | "eraser" | "note">("pointer");
  const [brushColor, setBrushColor] = useState("#c29953");
  const [brushWidth, setBrushWidth] = useState(4);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [shareMarkings, setShareMarkings] = useState(false);
  const [allottedAnnotations, setAllottedAnnotations] = useState<string[]>([]);
  const [allottedFlippers, setAllottedFlippers] = useState<string[]>([]);
  const [chatClearedAt, setChatClearedAt] = useState<string | null>(null);

  const currentPageRef = useRef(currentPage);
  const chatClearedAtRef = useRef<string | null>(null);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    chatClearedAtRef.current = chatClearedAt;
  }, [chatClearedAt]);

  useEffect(() => {
    if (room?.allotted_annotations) {
      setAllottedAnnotations(Array.isArray(room.allotted_annotations) ? room.allotted_annotations : []);
    }
  }, [room?.allotted_annotations]);

  useEffect(() => {
    if (room?.allotted_flippers) {
      setAllottedFlippers(Array.isArray(room.allotted_flippers) ? room.allotted_flippers : []);
    }
  }, [room?.allotted_flippers]);

  useEffect(() => {
    if (!me || !room) return;
    (supabase as any).from("annotations")
      .select("is_public")
      .eq("user_id", me.id)
      .eq("book_id", room.book_id)
      .eq("is_public", true)
      .limit(1)
      .then(({ data }: any) => {
        if (data && data.length > 0) {
          setShareMarkings(true);
        }
      });
  }, [me?.id, room?.book_id]);

  const toggleShareMarkings = async () => {
    const newVal = !shareMarkings;
    setShareMarkings(newVal);
    toast.success(newVal ? "Markings are now public in this room!" : "Markings are now private.");
    if (me && room) {
      await (supabase as any).from("annotations")
        .update({ is_public: newVal })
        .eq("user_id", me.id)
        .eq("book_id", room.book_id);
    }
  };

  const toggleAllotUser = async (userId: string) => {
    if (!isAdmin || !room) return;
    const current = [...allottedAnnotations];
    const idx = current.indexOf(userId);
    if (idx > -1) {
      current.splice(idx, 1);
    } else {
      current.push(userId);
    }
    setAllottedAnnotations(current);
    await (supabase as any).from("rooms")
      .update({ allotted_annotations: current })
      .eq("id", roomId);
  };

  const toggleAllotFlipper = async (userId: string) => {
    if (!isAdmin || !room) return;
    const current = [...allottedFlippers];
    const idx = current.indexOf(userId);
    if (idx > -1) {
      current.splice(idx, 1);
    } else {
      current.push(userId);
    }
    setAllottedFlippers(current);
    await (supabase as any).from("rooms")
      .update({ allotted_flippers: current })
      .eq("id", roomId);
  };

  const clearChatForMe = async () => {
    if (!me || !room) return;
    const nowStr = new Date().toISOString();
    setChatClearedAt(nowStr);
    
    const { error } = await (supabase as any).from("room_participants")
      .update({ cleared_at: nowStr })
      .eq("room_id", roomId)
      .eq("user_id", me.id);
      
    if (error) {
      console.error("Error clearing chat for user:", error);
      toast.error("Failed to clear chat locally");
    } else {
      toast.success("Chat history cleared locally");
    }
  };

  const clearChatForEveryone = async () => {
    if (!isAdmin || !room) return;
    if (!confirm("Are you sure you want to clear the entire chat history for everyone in this room?")) return;
    
    const { error } = await supabase.from("chat_messages")
      .delete()
      .eq("room_id", roomId);
      
    if (error) {
      console.error("Error deleting all chat messages:", error);
      toast.error("Failed to clear chat database");
    } else {
      toast.success("Chat history cleared for everyone");
      loadChat();
    }
  };

  const STANDARD_PRESETS = [
    { name: "Gold", value: "#c29953" },
    { name: "Crimson", value: "#962d2d" },
    { name: "Teal", value: "#148f77" },
    { name: "Cobalt", value: "#2471a3" },
    { name: "Obsidian", value: "#2c3e50" }
  ];

  const NEON_PRESETS = [
    { name: "Neon Yellow", value: "#ffff00" },
    { name: "Neon Green", value: "#39ff14" },
    { name: "Neon Pink", value: "#ff1493" },
    { name: "Neon Blue", value: "#00ffff" },
    { name: "Neon Orange", value: "#ff5e00" }
  ];

  const colorPresets = activeTool === "highlighter" ? NEON_PRESETS : STANDARD_PRESETS;

  // Adjust default brush widths when tool changes
  useEffect(() => {
    if (activeTool === "highlighter") {
      setBrushWidth(22);
      setBrushColor("#ffff00");
    } else if (activeTool === "marker") {
      setBrushWidth(8);
      setBrushColor("#c29953");
    } else if (activeTool === "pen") {
      setBrushWidth(4);
      setBrushColor("#c29953");
    } else if (activeTool === "pencil") {
      setBrushWidth(1.5);
      setBrushColor("#c29953");
    }
  }, [activeTool]);
  
  const pcsRef = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<any>(null);
  const isTeleportingRef = useRef(false);

  const getOrCreatePC = (peerId: string, channel: any) => {
    if (pcsRef.current[peerId]) return pcsRef.current[peerId];
    console.log(`[WebRTC] Creating RTCPeerConnection for peer ${peerId}`);
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pcsRef.current[peerId] = pc;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate && me) {
        channel.send({
          type: "broadcast",
          event: "signal",
          payload: { to: peerId, from: me.id, candidate: e.candidate },
        });
      }
    };

    pc.ontrack = (e) => {
      console.log(`[WebRTC] Got remote track from peer ${peerId}`);
      let el = document.getElementById(`audio-${peerId}`) as HTMLAudioElement;
      if (!el) {
        el = document.createElement("audio");
        el.id = `audio-${peerId}`;
        el.autoplay = true;
        document.body.appendChild(el);
      }
      el.srcObject = e.streams[0];
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
        pc.close();
        delete pcsRef.current[peerId];
        const el = document.getElementById(`audio-${peerId}`);
        if (el) el.remove();
      }
    };

    return pc;
  };

  const connectToPeer = async (peerId: string, channel: any) => {
    if (!me) return;
    console.log(`[WebRTC] Initiating connection to peer ${peerId}`);
    const pc = getOrCreatePC(peerId, channel);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await channel.send({
        type: "broadcast",
        event: "signal",
        payload: { to: peerId, from: me.id, offer },
      });
    } catch (e) {
      console.error(`[WebRTC] Error initiating WebRTC offer to ${peerId}:`, e);
    }
  };

  const isAdmin = me && room && room.admin_user_id === me.id;
  const activeParticipants = participants.filter(p => p.role !== "observer" && !p.left_at);
  const currentSignals = signals.filter(s => s.page === currentPage);
  const iSignaled = !!currentSignals.find(s => s.user_id === me?.id);
  const allDone = activeParticipants.length > 0 && currentSignals.length >= activeParticipants.length;

  // Load room + book
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMe(user);

      const { data: r } = await supabase.from("rooms").select("*").eq("id", roomId).maybeSingle();
      if (!r) { toast.error("Room not found"); nav({ to: "/akasha" }); return; }
      setRoom(r);
      setCurrentPage(r.current_page);

      const { data: b } = await supabase.from("books").select("*").eq("id", r.book_id).maybeSingle();
      setBook(b);

      const { data: bm } = await supabase
        .from("bookmarks")
        .select("page")
        .eq("user_id", user.id)
        .eq("book_id", r.book_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let initialPage = r.current_page;
      if (bm) {
        initialPage = bm.page;
        if (r.current_page !== bm.page && (r.admin_user_id === user.id || r.mode === "solo")) {
          // Sync database room current_page immediately so other peers are aligned
          (supabase as any).from("rooms").update({ current_page: bm.page }).eq("id", roomId).then(() => {});
        }
      }
      setRoom(r);
      setCurrentPage(initialPage);

      if (b?.file_path) {
        const { data: signed } = await supabase.storage.from("book-files").createSignedUrl(b.file_path, 3600);
        if (signed?.signedUrl) setFileUrl(signed.signedUrl);
      } else if (b?.external_url) {
        setFileUrl(b.external_url);
      }

      // Ensure I'm a participant
      const { data: existing } = await (supabase as any).from("room_participants").select("*").eq("room_id", roomId).eq("user_id", user.id).maybeSingle();
      if (!existing) {
        await (supabase as any).from("room_participants").insert({ room_id: roomId, user_id: user.id, role: "participant" });
        setChatClearedAt(null);
      } else {
        if (existing.left_at) {
          await (supabase as any).from("room_participants").update({ left_at: null }).eq("id", existing.id);
        }
        setChatClearedAt((existing as any).cleared_at);
      }

      loadParticipants();
      loadSignals(r.current_page);
    })();
  }, [roomId]);

  const loadParticipants = async () => {
    const { data } = await (supabase as any).from("room_participants")
      .select("*, profiles(id, display_name, handle, avatar_url)")
      .eq("room_id", roomId);
    setParticipants(data ?? []);
  };
  const loadSignals = async (_page: number) => {
    const { data } = await supabase.from("page_signals").select("*").eq("room_id", roomId);
    setSignals(data ?? []);
  };
  const loadChat = async () => {
    let query = supabase.from("chat_messages")
      .select("*, profiles(display_name, handle)")
      .eq("room_id", roomId);
      
    if (chatClearedAtRef.current) {
      query = query.gt("created_at", chatClearedAtRef.current);
    }
    
    const { data } = await query.order("created_at");
    setChat(data ?? []);
  };

  useEffect(() => {
    if (roomId && me) {
      loadChat();
    }
  }, [roomId, chatClearedAt, me?.id]);

  // Realtime
  useEffect(() => {
    if (!roomId) return;
    const ch = supabase.channel(`room:${roomId}`)
      .on("postgres_changes", { 
        event: "*", 
        schema: "public", 
        table: "rooms", 
        filter: `id=eq.${roomId}` 
      }, (p: any) => {
        if (p.new) {
          setRoom((prev: any) => ({ ...prev, ...p.new }));
          if (p.new.current_page !== currentPageRef.current) {
            setPageStartTs(Date.now());
            setCurrentPage(p.new.current_page);
          }
        }
      })
      .on("postgres_changes", { 
        event: "*", 
        schema: "public", 
        table: "page_signals", 
        filter: `room_id=eq.${roomId}` 
      }, () => {
        loadSignals(currentPageRef.current);
      })
      .on("postgres_changes", { 
        event: "*", 
        schema: "public", 
        table: "chat_messages", 
        filter: `room_id=eq.${roomId}` 
      }, () => {
        loadChat();
      })
      .on("postgres_changes", { 
        event: "*", 
        schema: "public", 
        table: "room_participants", 
        filter: `room_id=eq.${roomId}` 
      }, () => {
        loadParticipants();
      })
      .on("broadcast", { event: "break" }, ({ payload }: any) => {
        if (payload.action === "start") setOnBreak({ until: Date.now() + payload.minutes * 60_000 });
        else setOnBreak(null);
      })
      .on("broadcast", { event: "signal" }, async ({ payload }: any) => {
        if (!payload || !me || payload.to !== me.id) return;
        const peerId = payload.from;
        const pc = getOrCreatePC(peerId, ch);

        if (payload.offer) {
          console.log(`[WebRTC] Received offer from ${peerId}`);
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await ch.send({
              type: "broadcast",
              event: "signal",
              payload: { to: peerId, from: me.id, answer },
            });
          } catch (e) {
            console.error(`[WebRTC] Error handling offer from ${peerId}:`, e);
          }
        } else if (payload.answer) {
          console.log(`[WebRTC] Received answer from ${peerId}`);
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
          } catch (e) {
            console.error(`[WebRTC] Error handling answer from ${peerId}:`, e);
          }
        } else if (payload.candidate) {
          console.log(`[WebRTC] Received candidate from ${peerId}`);
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch (e) {
            console.error(`[WebRTC] Error adding ICE candidate from ${peerId}:`, e);
          }
        }
      })
      .subscribe();

    channelRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      Object.values(pcsRef.current).forEach(pc => pc.close());
      pcsRef.current = {};
    };
  }, [roomId, currentPage, me?.id]);

  const prevPageRef = useRef<number | null>(null);
  const pageStartTsRef = useRef<number>(Date.now());

  // Record reading session for page when it changes
  useEffect(() => {
    if (!me || !room || !currentPage) return;
    
    const prevPage = prevPageRef.current;
    const startTime = pageStartTsRef.current;
    
    // Update refs to track current page
    prevPageRef.current = currentPage;
    pageStartTsRef.current = Date.now();

    if (prevPage !== null && prevPage !== currentPage) {
      const secs = Math.round((Date.now() - startTime) / 1000);
      if (secs >= 3) { // Spent at least 3 seconds (filters out rapid teleporting/flipping)
        supabase.from("reading_sessions").insert({
          room_id: roomId, book_id: room.book_id, user_id: me.id, page: prevPage, seconds_on_page: secs,
        }).then(({ error }) => {
          if (error) console.error("Error saving reading session:", error);
        });
      }
    }
  }, [currentPage, me?.id, room?.book_id, roomId]);

  // Record final page reading session on unmount
  useEffect(() => {
    return () => {
      if (!me || !room || prevPageRef.current === null) return;
      const secs = Math.round((Date.now() - pageStartTsRef.current) / 1000);
      if (secs >= 3) {
        supabase.from("reading_sessions").insert({
          room_id: roomId, book_id: room.book_id, user_id: me.id, page: prevPageRef.current, seconds_on_page: secs,
        }).then(() => {});
      }
    };
  }, [me?.id, room?.book_id, roomId]);

  // Automatically mark book as completed when reaching the final page
  useEffect(() => {
    if (!me || !room || !book?.total_pages || !currentPage) return;
    
    if (currentPage >= book.total_pages - 1) {
      (async () => {
        try {
          const { data: existingEntry } = await (supabase as any).from("library_entries")
            .select("id, status")
            .eq("user_id", me.id)
            .eq("book_id", room.book_id)
            .maybeSingle();

          if (existingEntry) {
            if ((existingEntry as any).status !== "completed") {
              await (supabase as any).from("library_entries")
                .update({ status: "completed" })
                .eq("id", existingEntry.id);
            }
          } else {
            await (supabase as any).from("library_entries")
              .insert({ user_id: me.id, book_id: room.book_id, status: "completed" });
          }
          console.log("Book marked as completed automatically (reached end page)");
        } catch (err) {
          console.error("Error auto-completing book:", err);
        }
      })();
    }
  }, [currentPage, book?.total_pages, me?.id, room?.book_id]);

  // Debounce page sync to database for solo/admin
  useEffect(() => {
    if (!room || (!isAdmin && room.mode !== "solo")) return;
    if (currentPage === room.current_page) return;

    const t = setTimeout(async () => {
      const { error } = await supabase.from("rooms").update({ current_page: currentPage }).eq("id", roomId);
      if (error) console.error("Error updating room page in DB:", error);
    }, 1000);

    return () => clearTimeout(t);
  }, [currentPage, room?.current_page, roomId, isAdmin]);

  // Select random calligraphy prompt on finished
  useEffect(() => {
    if (showFinishedScroll) {
      const idx = Math.floor(Math.random() * CALLIGRAPHY_PROMPTS.length);
      setRandomPrompt(CALLIGRAPHY_PROMPTS[idx]);
    }
  }, [showFinishedScroll]);

  const signalDone = async () => {
    if (!me || !room) return;
    try {
      const secs = Math.round((Date.now() - pageStartTs) / 1000);
      
      const { error: sessionError } = await supabase.from("reading_sessions").insert({
        room_id: roomId, book_id: room.book_id, user_id: me.id, page: currentPage, seconds_on_page: secs,
      });
      if (sessionError) console.error("Session progress record failed:", sessionError);

      setPacePerPage(prev => ({ ...prev, [me.id]: secs }));

      if (iSignaled) {
        const { error: delError } = await supabase.from("page_signals").delete().eq("room_id", roomId).eq("user_id", me.id).eq("page", currentPage);
        if (delError) throw delError;
        toast.info("Unsignaled done status");
      } else {
        const { error: insError } = await supabase.from("page_signals").insert({ room_id: roomId, user_id: me.id, page: currentPage });
        if (insError) throw insError;
        toast.success("Page complete signaled!");
      }
      await loadSignals(currentPage);
    } catch (err: any) {
      console.error("Signal done error:", err);
      toast.error(`Failed to toggle done status: ${err.message}`);
    }
  };

  const flipPage = async (force = false) => {
    const { error } = await supabase.rpc("flip_page", { _room: roomId, _force: force });
    if (error) toast.error(error.message);
  };

  // Auto-flip when all done (in any mode)
  useEffect(() => {
    if (allDone && currentSignals.length > 0) {
      const t = setTimeout(() => flipPage(false).catch(() => {}), 600);
      return () => clearTimeout(t);
    }
  }, [allDone, currentSignals.length]);

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !me) return;
    const body = chatInput.trim();
    setChatInput("");

    // Optimistic local update
    const tempId = crypto.randomUUID();
    const tempMsg = {
      id: tempId,
      room_id: roomId,
      user_id: me.id,
      body,
      created_at: new Date().toISOString(),
      profiles: {
        display_name: me.user_metadata?.display_name || me.email || "reader",
        handle: me.user_metadata?.handle || "reader",
      }
    };
    setChat(prev => [...prev, tempMsg]);

    const { error } = await supabase.from("chat_messages").insert({ room_id: roomId, user_id: me.id, body });
    if (error) {
      toast.error(`Message failed: ${error.message}`);
      setChat(prev => prev.filter(m => m.id !== tempId));
    } else {
      loadChat();
    }
  };

  const dropBookmark = async () => {
    const note = prompt("Bookmark note (optional):") ?? "";
    if (note === null) return;
    try {
      // Enforce exactly one bookmark per book: delete previous bookmark before inserting new
      await supabase.from("bookmarks").delete().eq("user_id", me.id).eq("book_id", room.book_id);
      await supabase.from("bookmarks").insert({ user_id: me.id, book_id: room.book_id, page: currentPage, note });
      
      // Instantly sync database current_page to ensure bookmark position survives sudden closes
      if (room.mode === "solo" || isAdmin) {
        await supabase.from("rooms").update({ current_page: currentPage }).eq("id", roomId);
      }
      toast.success(`Bookmarked page ${currentPage}`);
      setShowBookmarkSuccess(currentPage);
    } catch (err: any) {
      toast.error(`Bookmark failed: ${err.message}`);
    }
  };

  const archiveSession = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && room) {
        // Check if library entry exists
        const { data: existingEntry } = await (supabase as any).from("library_entries")
          .select("id")
          .eq("user_id", user.id)
          .eq("book_id", room.book_id)
          .maybeSingle();

        if (existingEntry) {
          // Update status to completed
          await (supabase as any).from("library_entries")
            .update({ status: "completed" })
            .eq("id", existingEntry.id);
        } else {
          // Insert new library entry as completed
          await (supabase as any).from("library_entries")
            .insert({ user_id: user.id, book_id: room.book_id, status: "completed" });
        }
        
        // Purge/leave active room so it goes off the dashboard
        if (isAdmin) {
          await supabase.from("rooms").delete().eq("id", roomId);
        } else {
          await supabase.from("room_participants").delete().eq("room_id", roomId).eq("user_id", user.id);
        }
      }
      toast.success("Chronicle archived to Wisdom Vault!");
      nav({ to: "/wisdom" });
    } catch (err: any) {
      console.error("Error archiving session:", err);
      nav({ to: "/wisdom" });
    }
  };

  const teleportToPage = (targetPage: number) => {
    if (targetPage === currentPage || !book?.total_pages) return;
    
    // Prevent manual flip updates from conflicting with the teleport interval
    isTeleportingRef.current = true;
    
    const distance = Math.abs(targetPage - currentPage);
    const isForward = targetPage > currentPage;
    
    // Choose step size and delay based on distance to simulate physical book flipping
    let step = 2;
    let delay = 180;
    if (distance > 100) {
      step = 20;
      delay = 80;
    } else if (distance > 30) {
      step = 8;
      delay = 120;
    }

    let current = currentPage;
    
    const interval = setInterval(() => {
      if (isForward) {
        current = Math.min(targetPage, current + step);
      } else {
        current = Math.max(targetPage, current - step);
      }
      
      setCurrentPage(current);
      
      if (current === targetPage) {
        clearInterval(interval);
        // Completed teleportation, restore pageflip event handling
        isTeleportingRef.current = false;

        const allowedToFlip = allottedFlippers.includes(me?.id);
        const canTurn = room?.mode === "solo" || isAdmin || allowedToFlip;
        if (canTurn) {
          supabase.from("rooms")
            .update({ current_page: targetPage })
            .eq("id", roomId)
            .then(({ error }) => {
              if (error) console.error("Error writing teleported page position:", error);
            });
        }
      }
    }, delay);
  };

  const saveMemory = async () => {
    if (!isAdmin) return;
    const title = prompt("Memory title:", `${book?.title} · ${new Date().toLocaleDateString()}`);
    if (!title) return;
    const minSig = signals.reduce((a, s) => Math.min(a, s.page), currentPage);
    const participantsArr = participants.filter(p => !p.left_at).map(p => p.user_id);
    const chatSnap = chat.map(c => ({ user_id: c.user_id, name: c.profiles?.display_name ?? "reader", body: c.body, created_at: c.created_at }));
    const firstChat = chat[0]?.created_at ? new Date(chat[0].created_at).getTime() : Date.now();
    const duration = Math.round((Date.now() - firstChat) / 1000);
    const { error } = await supabase.from("memories").insert({
      room_id: roomId, book_id: room.book_id, saved_by: me.id, title,
      page_start: minSig, page_end: currentPage, duration_seconds: duration,
      participants: participantsArr, chat_snapshot: chatSnap,
    });
    if (error) toast.error(error.message); else toast.success("Memory sealed.");
  };

  const triggerBreak = async () => {
    const mins = +(prompt("Break minutes:", "5") ?? "5");
    if (!mins) return;
    const ch = supabase.channel(`room:${roomId}`);
    await ch.send({ type: "broadcast", event: "break", payload: { action: "start", minutes: mins } });
    setOnBreak({ until: Date.now() + mins * 60_000 });
  };

  const endBreak = async () => {
    const ch = supabase.channel(`room:${roomId}`);
    await ch.send({ type: "broadcast", event: "break", payload: { action: "end" } });
    setOnBreak(null);
  };

  const toggleMic = async () => {
    if (!me || !room) return;
    const activeMembers = participants.filter(p => !p.left_at && p.user_id !== me.id);
    const ch = channelRef.current || supabase.channel(`room:${roomId}`);
    
    if (!micOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true } 
        });
        localStreamRef.current = stream;
        setMicOn(true);
        toast.success("Mic active — P2P Voice Link Established!");
        
        // Connect to all active participants in room
        for (const p of activeMembers) {
          await connectToPeer(p.user_id, ch);
        }
      } catch (err) { 
        toast.error("Mic permission denied or unavailable"); 
      }
    } else {
      setMicOn(false);
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      Object.entries(pcsRef.current).forEach(([peerId, pc]) => {
        pc.close();
        delete pcsRef.current[peerId];
        const el = document.getElementById(`audio-${peerId}`);
        if (el) el.remove();
      });
      toast.info("Mic muted");
    }
  };
  const toggleCam = async () => {
    if (!camOn) {
      try { await navigator.mediaDevices.getUserMedia({ video: true }); setCamOn(true); }
      catch { toast.error("Camera permission denied"); }
    } else setCamOn(false);
  };

  if (!room || !book) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading room...</div>;
  }

  const progressPct = book.total_pages ? Math.round((currentPage / book.total_pages) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* TOP HUD */}
      <header className="panel-elevated border-b border-border px-4 py-2 flex items-center gap-4 tactical-chamfer">
        <Link to="/akasha" className="hud-label flex items-center gap-1 hover:text-primary"><ArrowLeft className="size-3" /> exit</Link>
        <div className="h-6 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <div className="hud-label text-primary">{room.mode} · live</div>
        </div>
        <div className="h-6 w-px bg-border" />
        <div className="flex-1 min-w-0">
          <div className="font-display uppercase text-sm truncate">{book.title}</div>
          <div className="hud-label text-[10px] truncate">{book.author}</div>
        </div>

        {/* Horizontal Scribble Toolbar */}
        <div className="flex items-center gap-2.5 bg-accent/10 px-2.5 py-1 border border-border/50 tactical-chamfer">
          <span className="hud-label text-[8px] text-primary font-bold mr-1 select-none tracking-widest uppercase">// scribble</span>
          
          {/* Tool Selectors */}
          <div className="flex items-center gap-1">
            {[
              { id: "pointer", label: "Read", icon: MousePointer },
              { id: "pen", label: "Pen", icon: PenTool },
              { id: "pencil", label: "Pencil", icon: Pencil },
              { id: "marker", label: "Marker", icon: Paintbrush },
              { id: "highlighter", label: "Highlighter", icon: Highlighter },
              { id: "eraser", label: "Eraser", icon: Eraser },
              { id: "note", label: "Sticky", icon: StickyNote },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTool(t.id as any)}
                className={`p-1 flex items-center justify-center gap-1 border rounded transition-all cursor-pointer ${
                  activeTool === t.id
                    ? "bg-primary text-primary-foreground border-primary shadow-tactical"
                    : "bg-accent/20 border-border/40 hover:bg-accent/40 text-stone-500 hover:text-stone-850 dark:hover:text-stone-100"
                }`}
                title={t.label}
              >
                <t.icon className="size-3" />
                <span className="text-[7px] font-display uppercase tracking-tighter hidden xl:inline">{t.label}</span>
              </button>
            ))}
          </div>

          {/* Color / Brush Options (only shown for drawing tools) */}
          {activeTool !== "pointer" && activeTool !== "eraser" && (
            <div className="flex items-center gap-2.5 border-l border-border/40 pl-2.5 animate-fadeIn">
              {/* Presets */}
              <div className="flex items-center gap-0.5">
                {colorPresets.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setBrushColor(c.value)}
                    className="size-3.5 rounded-full border border-black/10 transition-transform hover:scale-115 cursor-pointer relative"
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  >
                    {brushColor === c.value && (
                      <span className="absolute inset-0 flex items-center justify-center text-[7px] text-white font-bold font-sans">✓</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Hex Picker Box */}
              <div className="flex items-center gap-1 bg-accent/35 border border-border px-1.5 py-0.5 rounded-sm">
                <input
                  type="color"
                  value={brushColor}
                  onChange={(e) => setBrushColor(e.target.value)}
                  className="size-4 cursor-pointer border-0 bg-transparent rounded-sm"
                  title="Choose hex color"
                />
                <input
                  type="text"
                  value={brushColor}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.startsWith("#") && val.length <= 7) {
                      setBrushColor(val);
                    }
                  }}
                  className="w-12 bg-transparent text-[8px] font-mono uppercase text-center font-bold text-stone-850 dark:text-stone-250 outline-none border-0"
                />
              </div>

              {/* Size Slider */}
              <div className="flex items-center gap-1.5 border-l border-border/30 pl-2.5">
                <span className="text-[7px] font-mono text-muted-foreground">{brushWidth}px</span>
                <input
                  type="range"
                  min={activeTool === "highlighter" ? 10 : 1}
                  max={activeTool === "highlighter" ? 50 : 15}
                  step={0.5}
                  value={brushWidth}
                  onChange={(e) => setBrushWidth(parseFloat(e.target.value))}
                  className="w-16 h-1 bg-accent rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
            </div>
          )}

          {/* Wipe Page action */}
          {activeTool !== "pointer" && (
            <button
              onClick={() => readerRef.current?.clearCurrentPageAnnotations?.()}
              className="ml-1 flex items-center gap-1 px-1.5 py-0.5 border border-red-500/30 text-red-500 hover:bg-red-500/10 hover:border-red-500/50 rounded transition-colors text-[8px] font-display uppercase tracking-widest tactical-chamfer cursor-pointer animate-fadeIn"
              title="Wipe page drawings"
            >
              <Trash2 className="size-2.5" /> Wipe Page
            </button>
          )}

          {/* Share markings visibility toggle */}
          {room && room.mode !== "solo" && (
            <label className="ml-auto flex items-center gap-1.5 cursor-pointer text-[8px] font-display uppercase tracking-widest text-stone-500 hover:text-stone-850 dark:hover:text-stone-100 select-none border-l border-border/30 pl-2.5">
              <input
                type="checkbox"
                checked={shareMarkings}
                onChange={toggleShareMarkings}
                className="size-3 accent-primary cursor-pointer"
              />
              Share Markings
            </label>
          )}

          {/* Save Status */}
          <div className="border-l border-border/30 pl-2 flex items-center gap-1 min-w-[32px] text-right">
            {saveStatus === "saving" && <span className="text-amber-500 animate-pulse text-[7px] font-sans font-bold uppercase">saving</span>}
            {saveStatus === "saved" && <span className="text-emerald-500 text-[7px] font-sans font-bold uppercase">saved</span>}
            {saveStatus === "error" && <span className="text-amber-600 text-[7px] font-sans font-bold uppercase">offline</span>}
            {saveStatus === "idle" && <span className="text-stone-400 dark:text-stone-600 text-[7px] font-sans uppercase">idle</span>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-accent/20 px-2 py-1 border border-border/50 tactical-chamfer">
            <span className="hud-label text-[10px] text-muted-foreground">teleport</span>
            <input 
              type="number" 
              min={1} 
              max={book.total_pages ?? 9999}
              placeholder="Go..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = parseInt((e.target as HTMLInputElement).value);
                  if (val > 0 && val <= (book.total_pages ?? 9999)) {
                    teleportToPage(val);
                    (e.target as HTMLInputElement).value = "";
                  }
                }
              }}
              className="w-12 bg-transparent text-center border-b border-primary/50 text-xs font-display focus:outline-none focus:border-primary text-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <div className="text-right">
            <div className="hud-label text-[10px]">page</div>
            <div className="font-display text-lg">{currentPage} / {book.total_pages ?? "?"}</div>
          </div>
          <div className="w-40">
            <div className="h-1 bg-accent overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="hud-label text-[10px] text-right mt-0.5">{progressPct}%</div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* LEFT — participants */}
        <aside className="w-52 panel-elevated border-r border-border p-3 flex flex-col gap-2">
          <div className="hud-label flex items-center gap-1"><UsersIcon className="size-3" /> readers</div>
          {participants.filter(p => !p.left_at).map(p => {
            const done = currentSignals.find(s => s.user_id === p.user_id);
            const pace = pacePerPage[p.user_id];
            return (
              <div key={p.id} className={`panel p-2 tactical-chamfer ${done ? "border-primary shadow-tactical" : ""}`}>
                <div className="flex items-center gap-2">
                  <div className={`size-8 ${p.role === "admin" ? "bg-primary/30 border border-primary" : "bg-accent border border-border"} tactical-chamfer flex items-center justify-center text-xs font-display`}>
                    {p.profiles?.display_name?.[0] ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-display truncate">{p.profiles?.display_name}</div>
                    <div className="hud-label text-[9px]">{p.role}{done ? " · done" : ""}{pace ? ` · ${pace}s` : ""}</div>
                    {/* Admin toggle to allot public markings & flip control */}
                    {isAdmin && p.user_id !== me?.id ? (
                      <div className="flex flex-col gap-1 mt-1.5 border-t border-border/20 pt-1">
                        <label className="flex items-center gap-1.5 cursor-pointer select-none text-[8px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
                          <input
                            type="checkbox"
                            checked={allottedAnnotations.includes(p.user_id)}
                            onChange={() => toggleAllotUser(p.user_id)}
                            className="size-2.5 accent-primary cursor-pointer"
                          />
                          Show Markings
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer select-none text-[8px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
                          <input
                            type="checkbox"
                            checked={allottedFlippers.includes(p.user_id)}
                            onChange={() => toggleAllotFlipper(p.user_id)}
                            className="size-2.5 accent-primary cursor-pointer"
                          />
                          Allow Flip
                        </label>
                      </div>
                    ) : (
                      p.user_id !== me?.id && (
                        <div className="flex flex-col gap-1 mt-1">
                          {allottedAnnotations.includes(p.user_id) && (
                            <div className="text-[7px] font-sans font-bold uppercase text-primary select-none">
                              Markings Visible
                            </div>
                          )}
                          {allottedFlippers.includes(p.user_id) && (
                            <div className="text-[7px] font-sans font-bold uppercase text-emerald-500 select-none">
                              Flip Control Active
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="mt-auto pt-2 border-t border-border">
            <div className="hud-label mb-2">// comms</div>
            <div className="flex gap-1">
              <button onClick={toggleMic} className={`flex-1 p-2 tactical-chamfer ${micOn ? "bg-primary text-primary-foreground" : "panel hover:bg-accent"}`} title={micOn ? "Mute" : "Unmute"}>
                {micOn ? <Mic className="size-3 mx-auto" /> : <MicOff className="size-3 mx-auto" />}
              </button>
              <button onClick={toggleCam} className={`flex-1 p-2 tactical-chamfer ${camOn ? "bg-primary text-primary-foreground" : "panel hover:bg-accent"}`} title={camOn ? "Cam off" : "Cam on"}>
                {camOn ? <Video className="size-3 mx-auto" /> : <VideoOff className="size-3 mx-auto" />}
              </button>
            </div>
            <div className="hud-label text-[9px] text-center mt-2 text-muted-foreground">A/V relays via LiveKit (config keys to enable)</div>
          </div>
        </aside>

        {/* CENTER — reader */}
        <section className="flex-1 flex flex-col relative">
          <link href="https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap" rel="stylesheet" />
          <style>{`
            @keyframes bookmarkDrop {
              0% { transform: translateY(-100%); }
              70% { transform: translateY(0); }
              85% { transform: translateY(-5px); }
              100% { transform: translateY(0); }
            }
            .animate-bookmark-drop {
              animation: bookmarkDrop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            }
            .clip-ribbon {
              clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 75%, 0 100%);
            }
            @keyframes scrollOpen {
              0% { height: 0px; opacity: 0; }
              100% { height: 320px; opacity: 1; }
            }
            .animate-scroll-open {
              animation: scrollOpen 1.0s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .font-calligraphy {
              font-family: 'Great Vibes', cursive;
            }
          `}</style>

          {/* Bookmark Ribbon Animation */}
          {showBookmarkSuccess !== null && (
            <div className="absolute top-0 right-16 w-8 h-32 bg-red-600 shadow-lg origin-top animate-bookmark-drop z-50 flex flex-col items-center justify-end pb-4 text-[10px] font-display text-white uppercase tracking-wider font-semibold">
              <div className="absolute bottom-0 left-0 right-0 h-4 bg-red-600 clip-ribbon" />
              <span className="rotate-90 origin-center translate-y-[-10px] text-amber-300 font-bold">P{showBookmarkSuccess}</span>
            </div>
          )}

          {/* Exit Prompt Modal Overlay */}
          {showBookmarkSuccess !== null && (
            <div className="absolute inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center z-40 animate-fade-in">
              <div className="panel p-6 max-w-sm w-full tactical-chamfer text-center shadow-tactical border border-primary/20 bg-background">
                <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 text-primary">
                  <Bookmark className="size-6 text-primary animate-bounce" />
                </div>
                <h3 className="font-display text-lg uppercase tracking-wider mb-1">Bookmark Anchored</h3>
                <p className="text-sm text-muted-foreground font-serif italic mb-6">
                  Page {showBookmarkSuccess} has been sealed. Would you like to close this book now?
                </p>
                <div className="flex gap-2 justify-center">
                  <button 
                    onClick={() => nav({ to: "/akasha" })} 
                    className="bg-primary text-primary-foreground px-5 py-2 text-xs font-display uppercase tracking-widest hover:bg-primary-glow tactical-chamfer"
                  >
                    Close Book
                  </button>
                  <button 
                    onClick={() => setShowBookmarkSuccess(null)} 
                    className="panel-elevated px-5 py-2 text-xs font-display uppercase tracking-widest hover:bg-accent tactical-chamfer"
                  >
                    Keep Reading
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Calligraphy Scroll Modal Overlay */}
          {showFinishedScroll && (
            <div className="absolute inset-0 bg-background/90 backdrop-blur-md flex items-center justify-center z-50 animate-fade-in">
              <div className="relative w-[500px] flex flex-col items-center">
                {/* Top Wooden Spindle */}
                <div className="w-[540px] h-6 bg-amber-900 rounded-full shadow-md border-b border-amber-950 flex items-center justify-between px-6 z-10">
                  <div className="w-4 h-4 rounded-full bg-amber-600 border border-amber-800" />
                  <div className="w-4 h-4 rounded-full bg-amber-600 border border-amber-800" />
                </div>

                {/* Parchment Body */}
                <div className="w-[500px] bg-[#f2e6cf] border-x-4 border-amber-800/30 shadow-2xl overflow-hidden flex flex-col justify-between p-12 text-stone-900 animate-scroll-open relative">
                  <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-900 to-transparent" />
                  
                  <div className="text-center my-auto flex flex-col gap-4 relative z-10">
                    <div className="text-md text-amber-800 font-serif tracking-widest uppercase mb-1">// archives sealed //</div>
                    <p className="font-calligraphy text-4xl leading-normal text-stone-850 px-4">
                      {randomPrompt}
                    </p>
                  </div>

                  <div className="text-center mt-6 relative z-10">
                    <button 
                      onClick={archiveSession}
                      className="bg-amber-900 text-[#f2e6cf] px-6 py-2.5 font-display text-xs uppercase tracking-widest hover:bg-amber-800 tactical-chamfer shadow-md"
                    >
                      Archive Session
                    </button>
                  </div>
                </div>

                {/* Bottom Wooden Spindle */}
                <div className="w-[540px] h-6 bg-amber-900 rounded-full shadow-md border-t border-amber-950 flex items-center justify-between px-6 z-10">
                  <div className="w-4 h-4 rounded-full bg-amber-600 border border-amber-800" />
                  <div className="w-4 h-4 rounded-full bg-amber-600 border border-amber-800" />
                </div>
              </div>
            </div>
          )}

          {fileUrl ? (
            <BookReader 
              ref={readerRef} 
              fileUrl={fileUrl} 
              page={currentPage} 
              bookId={room.book_id}
              isCompleted={false}
              canFlip={(room.mode === "solo" || isAdmin || allottedFlippers.includes(me?.id)) && activeTool === "pointer"}
              activeTool={activeTool}
              brushColor={brushColor}
              brushWidth={brushWidth}
              onSaveStatusChange={(status) => setSaveStatus(status)}
              isAnnotationsPublic={shareMarkings}
              allottedUsers={allottedAnnotations}
              participants={participants}
              onPageChange={async (newPage) => {
                if (isTeleportingRef.current) return; // Ignore updates during teleport
                const allowedToFlip = allottedFlippers.includes(me?.id);
                if (room.mode === "solo" || isAdmin || allowedToFlip) {
                  setCurrentPage(newPage);
                  await supabase.from("rooms").update({ current_page: newPage }).eq("id", roomId);
                }
              }}
              onFinished={() => {
                setShowFinishedScroll(true);
              }}
              onTotalPagesChange={(total) => {
                if (book && book.total_pages !== total) {
                  setBook((prev: any) => prev ? { ...prev, total_pages: total } : null);
                  if (isAdmin) {
                    supabase.from("books").update({ total_pages: total }).eq("id", book.id)
                      .then(({ error }) => {
                        if (error) console.error("Error saving total page count:", error);
                      });
                  }
                }
              }}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="panel p-8 text-center tactical-chamfer max-w-md">
                <BookOpen className="size-12 mx-auto text-muted-foreground mb-3" />
                <div className="hud-label text-destructive mb-2">// no file</div>
                <p className="text-sm text-muted-foreground">This book has no readable PDF attached. Upload a PDF for this title in the library.</p>
              </div>
            </div>
          )}

          {/* BOTTOM ACTION BAR */}
          <div className="panel-elevated border-t border-border p-3 flex items-center justify-center gap-2 tactical-chamfer">
            <button onClick={signalDone} className={`px-5 py-2 font-display uppercase tracking-widest text-xs tactical-chamfer flex items-center gap-2 ${iSignaled ? "bg-primary text-primary-foreground" : "panel hover:bg-accent"}`}>
              <Check className="size-3" /> {iSignaled ? "Done ✓" : "I'm done"}
              <span className="hud-label">{currentSignals.length}/{activeParticipants.length}</span>
            </button>
            <button onClick={dropBookmark} className="panel px-4 py-2 text-xs font-display uppercase tracking-widest hover:bg-accent tactical-chamfer flex items-center gap-1"><Bookmark className="size-3" /> Mark</button>
            {isAdmin && (
              <>
                <button onClick={() => flipPage(true)} className="bg-primary/80 text-primary-foreground px-4 py-2 text-xs font-display uppercase tracking-widest hover:bg-primary tactical-chamfer flex items-center gap-1"><ChevronsRight className="size-3" /> Force flip</button>
                <button onClick={triggerBreak} className="panel px-4 py-2 text-xs font-display uppercase tracking-widest hover:bg-accent tactical-chamfer flex items-center gap-1"><Coffee className="size-3" /> Break</button>
                <button onClick={saveMemory} className="bg-gold text-gold-foreground px-4 py-2 text-xs font-display uppercase tracking-widest hover:opacity-90 tactical-chamfer flex items-center gap-1"><Sparkles className="size-3" /> Seal memory</button>
              </>
            )}
          </div>
        </section>

        {/* RIGHT — chat */}
        <aside className="w-72 panel-elevated border-l border-border flex flex-col">
          <div className="p-2.5 border-b border-border flex items-center justify-between">
            <div className="hud-label text-xs">// chat</div>
            <div className="flex items-center gap-1">
              <button 
                onClick={clearChatForMe}
                className="text-[8px] font-display uppercase tracking-widest text-stone-500 hover:text-stone-850 dark:hover:text-stone-100 hover:bg-accent/40 border border-border/40 px-1.5 py-0.5 rounded transition cursor-pointer select-none"
                title="Hide all past chat messages for you"
              >
                Clear for Me
              </button>
              {isAdmin && (
                <button 
                  onClick={clearChatForEveryone}
                  className="text-[8px] font-display uppercase tracking-widest text-red-500 hover:text-red-650 hover:bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 rounded transition cursor-pointer select-none"
                  title="Delete entire chat history for everyone (Admin only)"
                >
                  Clear for All
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {chat.length === 0 && <div className="text-xs text-muted-foreground font-serif italic">Quiet. Be the first to speak.</div>}
            {chat.map(m => (
              <div key={m.id} className="text-sm">
                <div className="hud-label text-[10px] text-primary">{m.profiles?.display_name ?? "reader"} <span className="text-muted-foreground">· {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
                <div className="font-serif">{m.body}</div>
              </div>
            ))}
          </div>
          <form onSubmit={sendChat} className="p-2 border-t border-border flex gap-1">
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Speak..." className="flex-1 bg-input border border-border px-2 py-1.5 text-sm focus:border-primary outline-none tactical-chamfer" />
            <button className="bg-primary text-primary-foreground px-3 tactical-chamfer hover:bg-primary-glow"><Send className="size-3" /></button>
          </form>
        </aside>
      </div>

      {/* BREAK OVERLAY */}
      {onBreak && (
        <div className="fixed inset-0 bg-background/95 backdrop-blur-xl z-50 flex items-center justify-center">
          <div className="text-center max-w-md">
            <Coffee className="size-16 mx-auto text-gold mb-6" />
            <div className="hud-label text-gold mb-2">// touch grass</div>
            <h2 className="font-display text-5xl uppercase mb-4">Look away</h2>
            <p className="text-muted-foreground font-serif italic mb-6">Rest your eyes. The text will wait.</p>
            <BreakTimer until={onBreak.until} onDone={() => setOnBreak(null)} />
            {isAdmin && (
              <button onClick={endBreak} className="mt-6 panel-elevated px-4 py-2 text-xs font-display uppercase tracking-widest hover:bg-accent tactical-chamfer">End break</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BreakTimer({ until, onDone }: { until: number; onDone: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const remaining = Math.max(0, until - now);
  useEffect(() => { if (remaining === 0) onDone(); }, [remaining, onDone]);
  const m = Math.floor(remaining / 60_000);
  const s = Math.floor((remaining % 60_000) / 1000);
  return <div className="font-display text-7xl text-primary">{m}:{s.toString().padStart(2, "0")}</div>;
}
