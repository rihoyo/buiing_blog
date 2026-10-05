import { youtubeId } from "./helpers.js";
export function safeLink(value) {
  try {
    const u = new URL(String(value).trim());
    return ["http:", "https:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : "";
  } catch {
    return "";
  }
}
export function linkDetails(value) {
  const url = safeLink(value);
  if (!url) return null;
  const u = new URL(url),
    youtube = youtubeId(url);
  if (youtube)
    return {
      url: "https://www.youtube.com/watch?v=" + youtube,
      host: "youtube.com",
      title: "YouTube 동영상",
      thumbnail: "https://i.ytimg.com/vi/" + youtube + "/hqdefault.jpg",
      embed: "https://www.youtube-nocookie.com/embed/" + youtube,
    };
  const path = u.pathname.toLowerCase();
  const media = /\.(mp4|webm|ogv|ogg)$/.test(path)
    ? "video"
    : /\.(png|jpe?g|webp|gif|avif|svg)$/.test(path)
      ? "image"
      : null;
  let embed = url;
  if (
    ["vimeo.com", "www.vimeo.com"].includes(u.hostname) &&
    /^\/\d+$/.test(u.pathname)
  )
    embed = "https://player.vimeo.com/video" + u.pathname;
  if (
    u.hostname === "open.spotify.com" &&
    /^\/(track|album|playlist|episode|show)\/[\w]+/.test(u.pathname)
  )
    embed = "https://open.spotify.com/embed" + u.pathname;
  // No server-side URL fetching: this avoids turning bookmark previews into an SSRF proxy.
  return {
    url,
    host: u.hostname.replace(/^www\./, ""),
    title: u.hostname.replace(/^www\./, ""),
    thumbnail: "",
    embed,
    media,
  };
}
