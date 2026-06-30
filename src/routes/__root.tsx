import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center panel p-8 tactical-chamfer">
        <div className="hud-label text-primary">404 // signal lost</div>
        <h1 className="mt-3 text-3xl font-display">Page not found in the archive</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This record does not exist or has been sealed.
        </p>
        <Link to="/" className="mt-6 inline-flex items-center justify-center rounded-sm bg-primary px-4 py-2 text-sm font-display uppercase tracking-widest text-primary-foreground hover:bg-primary-glow transition tactical-chamfer">
          Return to entrance
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center panel p-8 tactical-chamfer">
        <div className="hud-label text-destructive">system error</div>
        <h1 className="mt-3 text-2xl font-display">A page in the record tore</h1>
        <p className="mt-2 text-sm text-muted-foreground">Try the page again or return home.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="rounded-sm bg-primary px-4 py-2 text-sm font-display uppercase tracking-widest text-primary-foreground hover:bg-primary-glow tactical-chamfer">Retry</button>
          <a href="/" className="rounded-sm border border-border bg-surface px-4 py-2 text-sm font-display uppercase tracking-widest hover:bg-accent">Home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Akashik Records — Read together. Remember forever." },
      { name: "description", content: "Akashik Records is a tactical reading sanctuary for solo, duo, and party reading. Real page flips, live rooms, saved memories." },
      { name: "author", content: "Akashik Records" },
      { property: "og:title", content: "Akashik Records" },
      { property: "og:description", content: "Read together. Remember forever." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@400;500;600&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster theme="dark" position="top-right" toastOptions={{ style: { background: "var(--surface-elevated)", border: "1px solid var(--border)", color: "var(--foreground)" } }} />
    </QueryClientProvider>
  );
}
