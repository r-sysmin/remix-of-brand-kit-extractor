import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogIn, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";

// Session-aware sign in / sign out affordance for page headers.
export function AuthButton() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (loading) return null;

  if (!user) {
    return (
      <Link to="/auth">
        <LogIn aria-hidden /> Sign in
      </Link>
    );
  }

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <button type="button" onClick={handleSignOut} className="auth-signout">
      <LogOut aria-hidden /> Sign out
    </button>
  );
}
