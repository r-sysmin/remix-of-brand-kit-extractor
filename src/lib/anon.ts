// Anonymous kit ownership token stored in localStorage.
// Lets a non-logged-in user keep working with their kit across reloads.
const KEY = "branddna.anon_token";

export function getAnonToken(): string {
  if (typeof window === "undefined") return "";
  let t = localStorage.getItem(KEY);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(KEY, t);
  }
  return t;
}
