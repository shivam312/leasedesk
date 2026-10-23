// The app's address for links in emails (password reset).
//
// Only APP_URL is trusted. Without it, the request's own Host is used, and only
// when it is this machine (local work and the e2e build). x-forwarded-host and
// x-forwarded-proto are never read: a client can set them, and a reset email
// must not point at a host the requester picked.

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

export function emailLinkOrigin({
  appUrl,
  host,
}: {
  appUrl: string | undefined;
  host: string | null;
}): string | null {
  const configured = appUrl?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (host && LOOPBACK.test(host)) return `http://${host}`;
  return null;
}
