// Server-only SSRF guard — blocks private IP ranges, loopback, link-local,
// and non-http(s) schemes. Use before any server-side fetch of a
// client-supplied or client-influenced URL.
//
// IMPORTANT: private-range checks only apply to literal IP hostnames. Domain
// names such as fda.gov, fd.nl or 10.be are legitimate public hosts and must
// never be blocked by numeric/hex prefix heuristics.

function isIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function isPrivateIpv4(host: string): boolean {
  const [a, b] = host.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1" || h === "::") return true;
  // Unique-local fc00::/7 and link-local fe80::/10 — only for real IPv6 literals.
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true;
  // IPv4-mapped (::ffff:127.0.0.1)
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped && isPrivateIpv4(mapped[1])) return true;
  // URL parsers normalize IPv4-mapped addresses to hex (::ffff:c0a8:101).
  const mappedHex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const ipv4 = `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    if (isPrivateIpv4(ipv4)) return true;
  }
  return false;
}

export function isBlockedSourceUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return true;
    const host = u.hostname.toLowerCase();
    if (!host) return true;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
    if (host.endsWith(".internal") || host.endsWith(".home.arpa")) return true;
    if (isIpv4(host)) return isPrivateIpv4(host);
    // Bracketed or colon-bearing hostnames are IPv6 literals.
    if (host.includes(":")) return isPrivateIpv6(host);
    // Anything else is a domain name — allow.
    return false;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// DNS-level checks (anti DNS-rebinding)
//
// The literal-hostname checks above cannot catch a public domain that resolves
// to a private/internal address (cloud metadata, localhost, internal services).
// The Worker runtime has no `dns` module, so resolve over DNS-over-HTTPS and
// re-check every returned address before connecting.
// ---------------------------------------------------------------------------

const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";
const DNS_TIMEOUT_MS = 4000;
const dnsCache = new Map<string, { blocked: boolean; at: number }>();
const DNS_CACHE_TTL_MS = 60_000;

async function resolveHost(host: string, type: "A" | "AAAA"): Promise<string[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DNS_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${DOH_ENDPOINT}?name=${encodeURIComponent(host)}&type=${type}`,
      { headers: { Accept: "application/dns-json" }, signal: ctrl.signal },
    );
    if (!res.ok) throw new Error(`DoH ${res.status}`);
    const json = (await res.json()) as { Answer?: Array<{ type: number; data: string }> };
    const wanted = type === "A" ? 1 : 28;
    return (json.Answer ?? []).filter((a) => a.type === wanted).map((a) => a.data);
  } finally {
    clearTimeout(t);
  }
}

/** True when the hostname resolves (partly or wholly) to a private/reserved IP. */
export async function resolvesToPrivateAddress(host: string): Promise<boolean> {
  const key = host.toLowerCase();
  const hit = dnsCache.get(key);
  if (hit && Date.now() - hit.at < DNS_CACHE_TTL_MS) return hit.blocked;

  let blocked = false;
  try {
    const [a, aaaa] = await Promise.all([
      resolveHost(key, "A").catch(() => [] as string[]),
      resolveHost(key, "AAAA").catch(() => [] as string[]),
    ]);
    if (a.length === 0 && aaaa.length === 0) {
      // Could not resolve — fail closed rather than fetch blind.
      blocked = true;
    } else {
      blocked =
        a.some((ip) => isIpv4(ip) && isPrivateIpv4(ip)) ||
        aaaa.some((ip) => isPrivateIpv6(ip));
    }
  } catch {
    blocked = true;
  }
  dnsCache.set(key, { blocked, at: Date.now() });
  return blocked;
}

/** Full check: literal-host rules plus DNS resolution of the hostname. */
export async function isBlockedSourceUrlDeep(url: string): Promise<boolean> {
  if (isBlockedSourceUrl(url)) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (isIpv4(host) || host.includes(":")) return false; // literal IP already vetted
    return await resolvesToPrivateAddress(host);
  } catch {
    return true;
  }
}

/**
 * fetch() replacement for client-supplied URLs: validates the target (including
 * DNS) and re-validates every redirect hop instead of letting fetch follow them
 * blindly.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  maxHops = 5,
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= maxHops; hop++) {
    if (await isBlockedSourceUrlDeep(current)) {
      throw new Error("URL is not allowed");
    }
    const res = await fetch(current, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

