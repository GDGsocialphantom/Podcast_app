// GitHub REST calls the Worker makes with GITHUB_TOKEN (fine-grained token: Contents and Actions, read and write,
// on this one repo). Files are read through the Contents API and written with the Git Data API so that several
// files (a logo and data/shows.js, say) land in one commit.
const API = "https://api.github.com";

function headers(env, extra = {}) {
  return { "Authorization": "Bearer " + env.GITHUB_TOKEN, "Accept": "application/vnd.github+json", "User-Agent": "keystone-listens-worker", "X-GitHub-Api-Version": "2022-11-28", ...extra };
}
async function gh(env, method, path, body) {
  const r = await fetch(API + path, { method, headers: headers(env, body ? { "Content-Type": "application/json" } : {}), body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
  if (!r.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${r.status}${json && json.message ? " " + json.message : ""}`);
  return json;
}

const utf8 = { encode: s => new TextEncoder().encode(s), decode: b => new TextDecoder().decode(b) };
const b64 = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s.replace(/\n/g, "")), c => c.charCodeAt(0));

// Text of a file on the branch (null when it does not exist).
export async function readFile(env, path) {
  try {
    const j = await gh(env, "GET", `/repos/${env.REPO}/contents/${path}?ref=${env.BRANCH}`);
    if (!j || j.type !== "file") return null;
    return utf8.decode(unb64(j.content));
  } catch (e) {
    if (/HTTP 404/.test(e.message)) return null;
    throw e;
  }
}

// Commit several files at once. files: [{ path, text }] or [{ path, base64 }]. Returns { sha, url }.
export async function commitFiles(env, files, message) {
  const ref = await gh(env, "GET", `/repos/${env.REPO}/git/ref/heads/${env.BRANCH}`);
  const headSha = ref.object.sha;
  const head = await gh(env, "GET", `/repos/${env.REPO}/git/commits/${headSha}`);
  const tree = [];
  for (const f of files) {
    const blob = f.base64 != null
      ? await gh(env, "POST", `/repos/${env.REPO}/git/blobs`, { content: f.base64, encoding: "base64" })
      : await gh(env, "POST", `/repos/${env.REPO}/git/blobs`, { content: b64(utf8.encode(f.text)), encoding: "base64" });
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const newTree = await gh(env, "POST", `/repos/${env.REPO}/git/trees`, { base_tree: head.tree.sha, tree });
  const commit = await gh(env, "POST", `/repos/${env.REPO}/git/commits`, { message, tree: newTree.sha, parents: [headSha] });
  await gh(env, "PATCH", `/repos/${env.REPO}/git/refs/heads/${env.BRANCH}`, { sha: commit.sha, force: false });
  return { sha: commit.sha, url: `https://github.com/${env.REPO}/commit/${commit.sha}` };
}

// Start a workflow by file name on the branch. inputs: optional object.
export async function dispatchWorkflow(env, file, inputs = {}) {
  await gh(env, "POST", `/repos/${env.REPO}/actions/workflows/${file}/dispatches`, { ref: env.BRANCH, inputs });
  return { url: `https://github.com/${env.REPO}/actions/workflows/${file}` };
}
