import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SearchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: SearchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — Brand DNA" },
      {
        name: "description",
        content:
          "Sign in to Brand DNA to extract brand kits and keep your colors, fonts, logos and voice private to your account.",
      },
      { property: "og:title", content: "Sign in — Brand DNA" },
      {
        property: "og:description",
        content: "Sign in to Brand DNA to create and manage your private brand kits.",
      },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function safePath(next: string | undefined): string {
  if (!next) return "/library";
  if (!next.startsWith("/") || next.startsWith("//")) return "/library";
  return next;
}

function AuthPage() {
  const { next } = Route.useSearch();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: safePath(next), replace: true });
    }
  }, [loading, user, next, navigate]);

  async function withGoogle() {
    setError(null);
    setBusy(true);
    try {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("branddna.after_auth", safePath(next));
      }
      await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/auth",
      });
    } catch (e) {
      setError((e as Error).message || "Could not start Google sign-in.");
    } finally {
      setBusy(false);
    }
  }

  async function withEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/auth" },
        });
        if (err) throw err;
        setNotice("Check your inbox to confirm your email address, then sign in.");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
    } catch (err) {
      setError((err as Error).message || "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Brand DNA
        </Link>
        <h1 className="mt-6 font-display text-3xl">
          {mode === "signin" ? "Sign in" : "Create an account"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your brand kits stay private to your account.
        </p>

        <Button onClick={withGoogle} disabled={busy} className="mt-8 w-full" variant="outline">
          Continue with Google
        </Button>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={withEmail} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        {notice && <p className="mt-4 text-sm text-muted-foreground">{notice}</p>}

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setNotice(null);
          }}
          className="mt-6 text-sm text-muted-foreground underline hover:text-foreground"
        >
          {mode === "signin"
            ? "No account yet? Create one"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
