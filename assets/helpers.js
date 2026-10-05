export const escapeHTML = (s = "") =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function youtubeId(value) {
  try {
    const u = new URL(value);
    if (!["https:", "http:"].includes(u.protocol)) return null;
    let id;
    if (["youtu.be", "www.youtu.be"].includes(u.hostname))
      id = u.pathname.slice(1);
    else if (
      ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(u.hostname)
    )
      id =
        u.searchParams.get("v") ||
        u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
    return /^[\w-]{11}$/.test(id || "") ? id : null;
  } catch {
    return null;
  }
}
export function safeImage(src) {
  return /^(data:image\/(png|jpeg|gif|webp);base64,|https:\/\/)/.test(src || "")
    ? src
    : "";
}
export function parseText(text) {
  const blocks = [];
  let paragraph = [],
    code = null;
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) {
      if (code !== null) {
        blocks.push({ type: "code", text: code.join("\n") });
        code = null;
      } else {
        flush();
        code = [];
      }
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }
    if (/^##\s/.test(line)) {
      flush();
      blocks.push({ type: "heading", text: line.replace(/^##\s+/, "") });
    } else if (!line.trim()) {
      flush();
    } else paragraph.push(line);
  }
  flush();
  if (code !== null) blocks.push({ type: "code", text: code.join("\n") });
  return blocks;
}
