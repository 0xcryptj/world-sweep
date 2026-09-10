/**
 * SSRF guard for outbound fetches driven by (partially) untrusted URLs.
 *
 * Blocks non-http(s) schemes, embedded credentials, and hosts that are IP
 * literals in private / loopback / link-local ranges or obvious internal
 * hostnames (localhost, *.internal, cloud metadata IPs). This does not defend
 * against DNS rebinding (a public hostname resolving to a private IP) — for
 * that you'd need to resolve + pin the IP before connecting — but it stops the
 * common "fetch http://169.254.169.254/…" and "fetch http://localhost/…"
 * abuse of an image/logo proxy.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
]);

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) {
    return false;
  }

  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [a, b] = octets;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 100 && b >= 64 && b <= 127) // 100.64.0.0/10 CGNAT
  );
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  return (
    normalized === '::1' || // loopback
    normalized === '::' ||
    normalized.startsWith('fc') || // unique local fc00::/7
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80') || // link-local
    normalized.startsWith('::ffff:') // IPv4-mapped
  );
}

export function isSafePublicHttpUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }

  // Embedded credentials (user:pass@host) are a classic SSRF/phishing vector.
  if (url.username || url.password) {
    return false;
  }

  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return false;
  }

  // Block internal TLDs commonly used for private services.
  if (
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local')
  ) {
    return false;
  }

  if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
    return false;
  }

  return true;
}
