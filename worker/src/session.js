// Signed session cookie. Value is base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, SESSION_SECRET)).
// The payload carries { login, name, role, exp } and nothing the browser could use to change its role:
// every request re-verifies the signature, and ADMIN_GITHUB_USERS is checked again at write time.
export const COOKIE = "kl_session";

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));

async function key(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function sign(payload, secret) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body));
  return body + "." + b64u(sig);
}

export async function verify(token, secret) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  let ok = false;
  try { ok = await crypto.subtle.verify("HMAC", await key(secret), unb64u(sig), enc.encode(body)); } catch (e) { ok = false; }
  if (!ok) return null;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(unb64u(body))); } catch (e) { return null; }
  if (!payload || typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
  return payload;
}

export function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

// The site and the Worker are on different origins, so the session cookie must be SameSite=None and Secure.
// The short OAuth state cookie is scoped to /auth and Lax (GitHub redirects back top-level, so Lax is enough).
export function setCookie(name, value, maxAgeSeconds, { path = "/", sameSite = "None" } = {}) {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=${sameSite}`;
}
export function clearCookie(name, opts) {
  return setCookie(name, "", 0, opts);
}

export function randomToken(bytes = 24) {
  return b64u(crypto.getRandomValues(new Uint8Array(bytes)));
}
