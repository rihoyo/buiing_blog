import { escapeHTML as esc, safeImage } from "./helpers.js";
export const defaultTerminalText =
  '~/workspace\n❯ git add .\n❯ git commit -m "keep learning"\n✓ one step forward_';
export const coverDesigns = [
  { id: "code", name: "코드", text: "✳" },
  { id: "layers", name: "레이어" },
  { id: "orb", name: "구체" },
  { id: "terminal", name: "터미널" },
  { id: "type", name: "타이포", text: "HELLO.\nWORLD." },
  { id: "gradient", name: "그라데이션", text: "NEW IDEAS" },
  { id: "blueprint", name: "설계도", text: "BUILD / 01" },
  { id: "grid", name: "모듈", text: "MAKE IT SIMPLE" },
  { id: "window", name: "브라우저", text: "localhost:3000" },
  { id: "quote", name: "인용문", text: "Stay curious." },
  { id: "circuit", name: "회로", text: "CONNECT" },
  { id: "waves", name: "파동", text: "KEEP FLOWING" },
];
const star =
  '<span class="asterisk"><svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="9"><path d="M60 5v110M5 60h110M21 21l78 78M21 99l78-78"/></svg></span>';
export function renderCover(post = {}) {
  const type = coverDesigns.some((d) => d.id === post.art) ? post.art : "code";
  const image = safeImage(post.coverImage);
  if (image)
    return `<div class="art cover-image"><img src="${esc(image)}" alt="${esc(post.coverAlt || post.title || "")}"></div>`;
  const label =
    post.artLabel ??
    ({
      layers: "BUILD BETTER SYSTEMS",
      orb: "A LITTLE DEEPER",
      terminal: "LESS FRICTION. MORE FLOW.",
      code: "IDEAS INTO CODE.",
    }[type] ||
      "BUIING / CREATIVE NOTES");
  let center;
  if (type === "layers") center = '<div class="tiles"></div>';
  else if (type === "orb") center = '<div class="orb"></div>';
  else if (type === "terminal") {
    const lines = String(post.artTerminalText ?? defaultTerminalText)
      .slice(0, 1000)
      .split("\n");
    center = `<div class="terminal" style="--terminal-lines:${Math.max(4, lines.length)};--terminal-chars:${Math.max(35, ...lines.map((l) => l.length))}">${lines.map((line, i) => (i === 0 || i === lines.length - 1 ? `<span>${esc(line)}</span>` : esc(line))).join("\n")}</div>`;
  } else if (type !== "code") {
    const text = post.artText ?? coverDesigns.find((d) => d.id === type).text;
    center = `<div class="cover-decoration deco-${type}" aria-hidden="true"></div><div class="cover-center center-${type}">${esc(text)}</div>`;
  } else {
    const custom = typeof post.artCodeText === "string";
    center = `<div class="brackets ${custom ? "custom-brackets" : ""}"><span>{</span>${
      custom
        ? `<span class="code-cover-text" style="--cover-chars:${Math.max(
            1,
            ...post.artCodeText
              .slice(0, 80)
              .split("\n")
              .map((l) => l.length),
          )}">${esc(post.artCodeText.slice(0, 80))}</span>`
        : star
    }<span>}</span></div>`;
  }
  return `<div class="art ${type === "layers" ? "light" : ""} design-${type}" aria-hidden="true"><div class="art-grid"></div><span class="art-label">${esc(label)}</span>${center}<span class="art-index">${esc(post.artCaption ?? "BUIING — FIELD NOTES / " + (type === "layers" ? "002" : type === "orb" ? "003" : "001"))}</span></div>`;
}
