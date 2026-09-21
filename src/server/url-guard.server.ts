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
