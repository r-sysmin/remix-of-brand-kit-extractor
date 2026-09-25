import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Brand DNA" },
      { name: "description", content: "Choose a new password for your Brand DNA account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Recovery links arrive with type=recovery in the URL hash; the supabase
    // client exchanges it for a session automatically.
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setReady(true);
    } else {
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") setReady(true);
      });
      return () => sub.subscription.unsubscribe();
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      navigate({ to: "/", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "'Libre Baskerville', Georgia, serif",
      }}
    >
      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 40 }}>
        Choose a new password.
      </h1>
      {!ready ? (
        <p style={{ fontStyle: "italic", color: "rgba(10,10,10,0.65)" }}>
          This reset link is invalid or has expired.{" "}
          <Link to="/auth">Request a new one</Link>.
        </p>
      ) : (
        <form
          onSubmit={submit}
          style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 360 }}
        >
          <input
            type="password"
            required
            minLength={6}
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            style={{ padding: "10px 12px", border: "1px solid rgba(10,10,10,0.30)", background: "transparent", fontSize: 15 }}
          />
          {error && <p style={{ color: "#8B1A1A", fontSize: 13, margin: 0 }}>{error}</p>}
          <button
            type="submit"
            disabled={busy}
            style={{
              padding: 12,
              background: "#0A0A0A",
              color: "#F4EFE6",
              border: "none",
              fontFamily: "'Courier Prime', monospace",
              fontSize: 11,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {busy ? "Saving…" : "Save new password"}
          </button>
        </form>
      )}
    </div>
  );
}
