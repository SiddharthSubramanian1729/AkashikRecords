import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Enter — Akashik Records" }, { name: "description", content: "Sign in to your Akasha." }] }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/akasha" });
    });
  }, [nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin, data: { display_name: displayName || email.split("@")[0] } },
        });
        if (error) throw error;
        toast.success("Welcome to the archive");
        nav({ to: "/akasha" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav({ to: "/akasha" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/akasha`,
        },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 mb-8 justify-center">
          <div className="size-7 bg-primary tactical-chamfer flex items-center justify-center">
            <BookOpen className="size-4 text-primary-foreground" />
          </div>
          <span className="font-display tracking-widest text-sm">AKASHIK<span className="text-primary">.</span>RECORDS</span>
        </Link>

        <div className="panel p-8 tactical-chamfer corner-brackets">
          <div className="hud-label text-primary mb-2">// {mode === "signin" ? "authenticate" : "register operator"}</div>
          <h1 className="font-display text-2xl uppercase mb-6">{mode === "signin" ? "Enter the archive" : "Forge your callsign"}</h1>

          <button onClick={google} disabled={loading} className="w-full mb-4 panel-elevated px-4 py-3 text-sm font-display uppercase tracking-widest hover:bg-accent disabled:opacity-50 tactical-chamfer flex items-center justify-center gap-2">
            <svg className="size-4" viewBox="0 0 24 24"><path fill="currentColor" d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-border" />
            <span className="hud-label text-xs">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <div>
                <label className="hud-label block mb-1">callsign</label>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} className="w-full bg-input border border-border px-3 py-2 text-sm focus:border-primary outline-none tactical-chamfer" placeholder="The Reader" />
              </div>
            )}
            <div>
              <label className="hud-label block mb-1">email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-input border border-border px-3 py-2 text-sm focus:border-primary outline-none tactical-chamfer" placeholder="you@archive.io" />
            </div>
            <div>
              <label className="hud-label block mb-1">passphrase</label>
              <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-input border border-border px-3 py-2 text-sm focus:border-primary outline-none tactical-chamfer" placeholder="••••••••" />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground px-4 py-3 font-display uppercase tracking-widest text-sm hover:bg-primary-glow disabled:opacity-50 tactical-chamfer scanline-hover mt-2">
              {loading ? "..." : mode === "signin" ? "Authenticate" : "Forge"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="hud-label text-muted-foreground hover:text-primary">
              {mode === "signin" ? "No account? → Forge a callsign" : "Have an account? → Authenticate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
