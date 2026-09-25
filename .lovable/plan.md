# Bring back sign-in

## What you'll get
- A sign-in page with email/password and "Continue with Google".
- Your kits follow your account — open them from any browser or device once signed in.
- Your existing kits are not lost: the first time you sign in on a browser that already has kits, they're linked to your account automatically.
- A "Sign out" option in the header; the header shows whether you're signed in.

## How it works
1. **Sign-in page** (`/auth`): email + password (sign in / create account / forgot password with a reset-password page) and a Google button.
2. **Ownership**: kits and design docs get a `user_id` again. Server checks accept either your signed-in account OR the existing browser key, so nothing that works today breaks.
3. **Claiming**: when you sign in, any kit in this browser that isn't linked to an account yet is linked to yours. Kits made on other browsers can still be opened there with their browser key, or claimed by opening them while signed in.
4. **Sign out**: clears your session and cached data, returns to the sign-in page.

## Privacy notes
- Share links stay public as they are today.
- Unclaimed legacy kits remain openable by first-opener until signed-in claim, same as now.

## Technical details
- Enable email auth (tool) + Google provider via `configure_social_auth` (Google sign-in goes through the Lovable broker).
- Migration: add `user_id uuid references auth.users` to `brand_kits` and `design_doc_versions` (+ index); keep `owner_token_hash`. RLS: owner policy on `user_id = auth.uid()`; grants unchanged.
- `assertKitOwner`/`assertDesignOwnerHash`: pass when session user matches `user_id`, else fall back to token hash; legacy null-owner rows claim to the signed-in user when present.
- New `claimMyKits` server fn (requireSupabaseAuth): links rows matching the browser's owner_token_hash (or null owner) to `user_id`.
- Restore `/auth` route + `/reset-password` route, `AuthProvider`/session context in `__root.tsx` with single `onAuthStateChange` subscriber (SIGNED_IN/SIGNED_OUT/USER_UPDATED only), header sign-in/sign-out affordance driven by session.
- `src/start.ts`: append `attachSupabaseAuth` functionMiddleware so server fns receive the bearer token.
- Kit page: when signed in, calls omit ownerToken requirement (server accepts session); keep token path for signed-out browsers.
- No profiles table — no profile data needed.

## Verification
- Playwright: sign up/sign in, open an existing kit (claims it), sign out, confirm kit page locked, sign in on fresh context, kit opens.
