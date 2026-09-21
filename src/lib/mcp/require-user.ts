import { ToolError, type AuthContext } from "@lovable.dev/mcp-js";

// Every tool in this server acts on a specific user's private brand kits, so a
// verified signed-in caller is required. Authorization is per-user, never based
// on the token audience alone.
export function requireUserId(auth: AuthContext): string {
  const userId = auth.isAuthenticated() ? auth.getUserId() : undefined;
  if (!userId) {
    throw new ToolError("Sign in to this app to use its brand kit tools.");
  }
  return userId;
}
