import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookReader, type BookReaderHandle } from "@/components/BookReader";
import { toast } from "sonner";
import {
  ArrowLeft, Mic, MicOff, Video, VideoOff, Check, ChevronsRight, Bookmark, Sparkles,
  Coffee, X, Send, Users as UsersIcon, BookOpen
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/room/$roomId")({
  head: () => ({ meta: [{ title: "Reading Room — Akashik Records" }] }),
  component: RoomPage,
});

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
  const [latestBookmark, setLatestBookmark] = useState<number | null>(null);
  
  const pcsRef = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<any>(null);

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
  const currentSignals = signals.filter(s => s.page === room?.current_page);
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
      if (bm && bm.page !== r.current_page) {
        setLatestBookmark(bm.page);
      }

      if (b?.file_path) {
        const { data: signed } = await supabase.storage.from("book-files").createSignedUrl(b.file_path, 3600);
        if (signed?.signedUrl) setFileUrl(signed.signedUrl);
      } else if (b?.external_url) {
        setFileUrl(b.external_url);
      }

      // Ensure I'm a participant
      const { data: existing } = await supabase.from("room_participants").select("*").eq("room_id", roomId).eq("user_id", user.id).maybeSingle();
      if (!existing) {
        await supabase.from("room_participants").insert({ room_id: roomId, user_id: user.id, role: "participant" });
      } else if (existing.left_at) {
        await supabase.from("room_participants").update({ left_at: null }).eq("id", existing.id);
      }

      loadParticipants();
      loadSignals(r.current_page);
      loadChat();
    })();
  }, [roomId]);

  const loadParticipants = async () => {
    const { data } = await supabase.from("room_participants")
      .select("*, profiles(id, display_name, handle, avatar_url)")
      .eq("room_id", roomId);
    setParticipants(data ?? []);
  };
  const loadSignals = async (_page: number) => {
    const { data } = await supabase.from("page_signals").select("*").eq("room_id", roomId);
    setSignals(data ?? []);
  };
  const loadChat = async () => {
    const { data } = await supabase.from("chat_messages")
      .select("*, profiles(display_name, handle)").eq("room_id", roomId).order("created_at");
    setChat(data ?? []);
  };

  // Realtime
  useEffect(() => {
    if (!roomId) return;
    const ch = supabase.channel(`room:${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, (p: any) => {
        if (p.new && p.new.id === roomId) {
          setRoom((prev: any) => ({ ...prev, ...p.new }));
          if (p.new.current_page !== room?.current_page) setPageStartTs(Date.now());
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "page_signals" }, (p: any) => {
        if ((p.new && p.new.room_id === roomId) || (p.old && p.old.room_id === roomId)) {
          loadSignals(room?.current_page ?? 1);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, (p: any) => {
        if (p.new && p.new.room_id === roomId) {
          loadChat();
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_participants" }, (p: any) => {
        if ((p.new && p.new.room_id === roomId) || (p.old && p.old.room_id === roomId)) {
          loadParticipants();
        }
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
  }, [roomId, room?.current_page, me?.id]);

  // Track pace
  useEffect(() => { setPageStartTs(Date.now()); }, [room?.current_page]);

  const signalDone = async () => {
    if (!me || !room) return;
    const secs = Math.round((Date.now() - pageStartTs) / 1000);
    await supabase.from("reading_sessions").insert({
      room_id: roomId, book_id: room.book_id, user_id: me.id, page: room.current_page, seconds_on_page: secs,
    });
    setPacePerPage(prev => ({ ...prev, [me.id]: secs }));
    if (iSignaled) {
      await supabase.from("page_signals").delete().eq("room_id", roomId).eq("user_id", me.id).eq("page", room.current_page);
    } else {
      await supabase.from("page_signals").insert({ room_id: roomId, user_id: me.id, page: room.current_page });
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
    await supabase.from("bookmarks").insert({ user_id: me.id, book_id: room.book_id, page: room.current_page, note });
    toast.success(`Bookmarked page ${room.current_page}`);
  };

  const saveMemory = async () => {
    if (!isAdmin) return;
    const title = prompt("Memory title:", `${book?.title} · ${new Date().toLocaleDateString()}`);
    if (!title) return;
    const minSig = signals.reduce((a, s) => Math.min(a, s.page), room.current_page);
    const participantsArr = participants.filter(p => !p.left_at).map(p => p.user_id);
    const chatSnap = chat.map(c => ({ user_id: c.user_id, name: c.profiles?.display_name ?? "reader", body: c.body, created_at: c.created_at }));
    const firstChat = chat[0]?.created_at ? new Date(chat[0].created_at).getTime() : Date.now();
    const duration = Math.round((Date.now() - firstChat) / 1000);
    const { error } = await supabase.from("memories").insert({
      room_id: roomId, book_id: room.book_id, saved_by: me.id, title,
      page_start: minSig, page_end: room.current_page, duration_seconds: duration,
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

  const progressPct = book.total_pages ? Math.round((room.current_page / book.total_pages) * 100) : 0;

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
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="hud-label text-[10px]">page</div>
            <div className="font-display text-lg">{room.current_page} / {book.total_pages ?? "?"}</div>
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
          {latestBookmark && room && (room.admin_user_id === me?.id || room.mode === 'solo') && (
            <div className="absolute top-4 left-4 z-20 flex items-center gap-3 bg-primary text-primary-foreground px-4 py-2.5 tactical-chamfer shadow-tactical text-xs border border-primary-glow animate-pulse">
              <Bookmark className="size-4 animate-bounce" />
              <span>Resume from your bookmark at page {latestBookmark}?</span>
              <button 
                onClick={async () => {
                  const { error } = await supabase.from("rooms").update({ current_page: latestBookmark }).eq("id", roomId);
                  if (error) {
                    toast.error(error.message);
                  } else {
                    setLatestBookmark(null);
                    toast.success(`Resumed from page ${latestBookmark}`);
                  }
                }}
                className="bg-primary-foreground text-primary px-3 py-1 font-display uppercase tracking-widest text-[10px] hover:bg-opacity-95 transition tactical-chamfer"
              >
                Jump
              </button>
              <button onClick={() => setLatestBookmark(null)} className="p-1 hover:bg-primary-glow/30 tactical-chamfer">
                <X className="size-3.5" />
              </button>
            </div>
          )}
          {fileUrl ? (
            <BookReader 
              ref={readerRef} 
              fileUrl={fileUrl} 
              page={room.current_page} 
              canFlip={isAdmin && room.mode === "solo"}
              onTotalPagesChange={(total) => {
                if (book && book.total_pages !== total) {
                  setBook(prev => prev ? { ...prev, total_pages: total } : null);
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
          <div className="p-3 border-b border-border"><div className="hud-label">// chat</div></div>
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
