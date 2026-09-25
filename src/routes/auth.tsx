import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Brand DNA" },
      { name: "description", content: "Sign in to keep your brand kits on every device." },
      { property: "og:title", content: "Sign in — Brand DNA" },
      { property: "og:description", content: "Sign in to keep your brand kits on every device." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/", replace: true });
  }, [loading, user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (err) throw err;
        setMessage("Check your email to confirm your account, then sign in.");
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (err) throw err;
        setMessage("Check your email for a password reset link.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) setError(result.error.message);
  };

  return (
    <>
      <style>{css}</style>
      <div className="auth-page">
        <nav className="auth-nav">
          <Link to="/" className="auth-brand">Brand Kit</Link>
        </nav>
        <main className="auth-main">
          <h1 className="auth-title">
            {mode === "signin" && "Welcome back."}
            {mode === "signup" && "Create your account."}
            {mode === "forgot" && "Reset your password."}
          </h1>
          <p className="auth-lede">
            Your brand kits follow your account — open them on any device.
          </p>

          <button type="button" className="auth-google" onClick={signInWithGoogle}>
            Continue with Google
          </button>

          <div className="auth-divider"><span>or with email</span></div>

          <form onSubmit={submit} className="auth-form">
            <label>
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            {mode !== "forgot" && (
              <label>
                Password
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </label>
            )}
            {error && <p className="auth-error">{error}</p>}
            {message && <p className="auth-message">{message}</p>}
            <button type="submit" className="auth-submit" disabled={busy}>
              {busy
                ? "One moment…"
                : mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Send reset link"}
            </button>
          </form>

          <div className="auth-switch">
            {mode === "signin" && (
              <>
                <button type="button" onClick={() => setMode("signup")}>New here? Create an account</button>
                <button type="button" onClick={() => setMode("forgot")}>Forgot password?</button>
              </>
            )}
            {mode !== "signin" && (
              <button type="button" onClick={() => setMode("signin")}>Back to sign in</button>
            )}
          </div>
        </main>
      </div>
    </>
  );
}

const css = `
  .auth-page {
    min-height: 100vh;
    background: var(--washi, #F4EFE6);
    color: var(--sumi, #0A0A0A);
    font-family: 'Libre Baskerville', Georgia, serif;
    display: flex;
    flex-direction: column;
  }
  .auth-nav {
    padding: 22px 40px;
    border-bottom: 1px solid rgba(10,10,10,0.20);
  }
  .auth-brand {
    font-family: 'Courier Prime', monospace;
    font-size: 11px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: inherit;
    text-decoration: none;
  }
  .auth-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px 96px;
    max-width: 420px;
    margin: 0 auto;
    width: 100%;
  }
  .auth-title {
    font-family: 'Cormorant Garamond', serif;
    font-weight: 300;
    font-size: clamp(36px, 6vw, 52px);
    margin: 0 0 12px;
    text-align: center;
  }
  .auth-lede {
    font-style: italic;
    font-size: 14px;
    color: rgba(10,10,10,0.65);
    margin: 0 0 32px;
    text-align: center;
  }
  .auth-google {
    width: 100%;
    padding: 12px;
    background: transparent;
    color: inherit;
    border: 1px solid rgba(10,10,10,0.35);
    font-family: 'Courier Prime', monospace;
    font-size: 11px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    cursor: pointer;
    transition: border-color 150ms ease, color 150ms ease;
  }
  .auth-google:hover { border-color: #8B1A1A; color: #8B1A1A; }
  .auth-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    margin: 24px 0;
    font-family: 'Courier Prime', monospace;
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(10,10,10,0.45);
  }
  .auth-divider::before, .auth-divider::after {
    content: "";
    flex: 1;
    border-top: 1px solid rgba(10,10,10,0.20);
  }
  .auth-form {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .auth-form label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-family: 'Courier Prime', monospace;
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }
  .auth-form input {
    font-family: 'Libre Baskerville', serif;
    font-size: 15px;
    padding: 10px 12px;
    border: 1px solid rgba(10,10,10,0.30);
    background: transparent;
    color: inherit;
  }
  .auth-form input:focus { outline: 1px solid #0A0A0A; }
  .auth-submit {
    margin-top: 8px;
    padding: 12px;
    background: #0A0A0A;
    color: #F4EFE6;
    border: none;
    font-family: 'Courier Prime', monospace;
    font-size: 11px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .auth-submit:disabled { opacity: 0.5; cursor: default; }
  .auth-error { color: #8B1A1A; font-size: 13px; margin: 0; }
  .auth-message { color: #1a5c1a; font-size: 13px; margin: 0; }
  .auth-switch {
    margin-top: 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }
  .auth-switch button {
    background: none;
    border: none;
    cursor: pointer;
    font-family: 'Courier Prime', monospace;
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(10,10,10,0.6);
    text-decoration: underline;
  }
  .auth-switch button:hover { color: #8B1A1A; }
`;
