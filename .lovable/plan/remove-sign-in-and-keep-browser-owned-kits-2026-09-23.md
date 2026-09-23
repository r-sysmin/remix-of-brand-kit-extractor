# Remove sign-in and keep browser-owned kits

## What will change

1. **Remove account gates**
   - Move the Library, kit workspace, Brand Builder, Start Here, and design pages out of the signed-in-only section.
   - Remove the sign-in page, account provider, session redirects, and sign-in prompts.

2. **Preserve private-by-link ownership**
   - Restore a random browser ownership key for each visitor.
   - Store a one-way hash of that key with each kit; never store or return the usable key.
   - Require the matching key for opening, editing, duplicating, deleting, sharing, uploading, extracting, generating copy, creating logo variants, and using Brand Builder.
   - List only kits created in that browser, including older browser keys already retained locally.

3. **Keep public sharing separate**
   - Shared links remain readable only through their dedicated share address.
   - A share link will not grant editing rights.

4. **Handle features that previously belonged to an account**
   - Keep design-history snapshots browser-owned using the same hashed key.
   - Agent integrations will remain authenticated because browser storage cannot securely identify an external agent; removing their authentication would expose private kits.

5. **Update storage permissions and verify**
   - Update the database schema and access rules for anonymous browser ownership.
   - Confirm creation, extraction, reopening, editing, library listing, Brand Builder, and sharing work without signing in.
   - Verify the app on mobile and desktop and check the latest build status.

## Important limitation

Kits will belong to the browser that created them. Clearing site data or switching devices will lose access unless the kit was shared first; there is no account recovery after sign-in is removed.
