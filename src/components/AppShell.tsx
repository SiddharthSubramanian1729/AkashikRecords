import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, Library, Compass, Users, Sparkles, User as UserIcon, LogOut, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Profile { id: string; handle: string; display_name: string; avatar_url: string | null }

export function AppShell({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const path = useRouterState({ select: s => s.location.pathname });
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase.from("profiles").select("id, handle, display_name, avatar_url").eq("id", data.user.id).maybeSingle();
      if (p) setProfile(p);
    });
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  };

  const navItems = [
    { to: "/akasha", label: "Akasha", icon: Sparkles },
    { to: "/library", label: "Library", icon: Library },
    { to: "/discover", label: "Discover", icon: Compass },
    { to: "/buddies", label: "Buddies", icon: Users },
    { to: "/memories", label: "Memories", icon: BookOpen },
  ] as const;

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 border-r border-border bg-surface/40 backdrop-blur p-4 flex flex-col fixed inset-y-0 left-0">
        <Link to="/akasha" className="flex items-center gap-2 mb-8 px-2">
          <div className="size-7 bg-primary tactical-chamfer flex items-center justify-center">
            <BookOpen className="size-4 text-primary-foreground" />
          </div>
          <span className="font-display tracking-widest text-xs">AKASHIK<span className="text-primary">.</span>RECORDS</span>
        </Link>

        <nav className="flex-1 space-y-1">
          {navItems.map(item => {
            const active = path.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to} className={`flex items-center gap-3 px-3 py-2 text-sm font-display uppercase tracking-widest transition tactical-chamfer ${active ? "bg-primary/15 text-primary border-l-2 border-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}>
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {profile && (
          <div className="border-t border-border pt-4 mt-4">
            <Link to="/profile/$handle" params={{ handle: profile.handle }} className="flex items-center gap-2 px-2 py-2 hover:bg-accent rounded-sm">
              <div className="size-8 bg-primary/20 border border-primary tactical-chamfer flex items-center justify-center text-xs font-display">
                {profile.display_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-display truncate">{profile.display_name}</div>
                <div className="text-[10px] hud-label truncate">@{profile.handle}</div>
              </div>
            </Link>
            <div className="flex gap-1 mt-2">
              <Link to="/settings" className="flex-1 px-2 py-1.5 text-[10px] hud-label hover:bg-accent text-center"><Settings className="size-3 inline" /></Link>
              <button onClick={signOut} className="flex-1 px-2 py-1.5 text-[10px] hud-label hover:bg-accent"><LogOut className="size-3 inline" /></button>
            </div>
          </div>
        )}
      </aside>
      <main className="flex-1 ml-60 min-h-screen">{children}</main>
    </div>
  );
}
