# Project architecture

- Brand kits retain a browser ownership key for anonymous use and gain `user_id` ownership when signed in, so legacy access remains while kits follow an account.
- Account-aware kit lists wait for auth restoration and re-fetch when the signed-in identity changes, preventing empty libraries during session hydration.