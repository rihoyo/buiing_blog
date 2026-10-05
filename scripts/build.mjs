import { mkdir, cp, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { build } from "esbuild";
import { metadata, renderHome, renderArticle } from "./seo.mjs";
import { escapeHTML as esc } from "../assets/helpers.js";
const site = JSON.parse(await readFile("site.config.json", "utf8"));
site.url = process.env.SITE_URL || site.url;
const origin = new URL(site.url);
if (origin.protocol !== "https:") throw new Error("SITE_URL must use HTTPS");
if (!site.url.endsWith("/")) site.url += "/";
const base = new URL(site.url).pathname;
const config = {
  loginMethods: site.loginMethods || ["google"],
  supabaseUrl: process.env.SUPABASE_URL || site.supabaseUrl,
  supabasePublishableKey:
    process.env.SUPABASE_PUBLISHABLE_KEY || site.supabasePublishableKey,
};
if (config.supabasePublishableKey.startsWith("sb_secret_"))
  throw new Error("Use a publishable key, never a secret key");
if (config.supabasePublishableKey.split(".").length === 3) {
  const claims = JSON.parse(
    Buffer.from(
      config.supabasePublishableKey.split(".")[1],
      "base64url",
    ).toString(),
  );
  if (claims.role !== "anon")
    throw new Error("Only the anon JWT may be published");
}
if (config.supabaseUrl && new URL(config.supabaseUrl).protocol !== "https:")
  throw new Error("Supabase URL must use HTTPS");
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const f of ["style.css", "assets", "counter-sw.js"])
  await cp(f, `dist/${f}`, { recursive: true });
await build({
  entryPoints: ["app.js"],
  bundle: true,
  format: "esm",
  outdir: "dist",
  splitting: true,
  chunkNames: "assets/chunks/[name]-[hash]",
  minify: true,
});
const posts = [],
  withdrawn = [];
for (const f of (await readdir("posts"))
  .filter((f) => f.endsWith(".json"))
  .sort()) {
  const p = JSON.parse(await readFile(`posts/${f}`, "utf8"));
  if (p.visibility === "withdrawn") {
    if (!/^[a-zA-Z0-9_-]+$/.test(p.id)) throw Error("Invalid withdrawn id");
    withdrawn.push(p.id);
    continue;
  }
  if (p.visibility === "private")
    throw new Error("Private content must never be stored in posts/: " + f);
  if (
    !/^[a-zA-Z0-9_-]+$/.test(p.id) ||
    !p.title ||
    !Array.isArray(p.blocks) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(p.date)
  )
    throw new Error(`Invalid post: ${f}`);
  if (posts.some((x) => x.id === p.id))
    throw new Error(`Duplicate id: ${p.id}`);
  posts.push({ ...p, sourceFile: f });
}
posts.sort((a, b) => b.date.localeCompare(a.date));
await writeFile("dist/posts.json", JSON.stringify(posts));
await writeFile("dist/config.json", JSON.stringify(config));
await writeFile("dist/.nojekyll", "");
const template = (await readFile("index.html", "utf8"))
  .replace(/<title>.*?<\/title>/, "")
  .replace(/<meta name="description"[^>]*>/, "");
async function page(path, title, description, body, opts = {}) {
  const html = template
    .replace(
      "<head>",
      `<head><base href="${esc(base)}">${metadata({ title, description, url: new URL(path, site.url).href, site, ...opts })}`,
    )
    .replace('<main id="main"></main>', `<main id="main">${body}</main>`);
  await mkdir(`dist/${path}`, { recursive: true });
  await writeFile(`dist/${path}index.html`, html);
}
await page(
  "",
  `${site.title} — 배우고, 기록하고, 나누다.`,
  site.description,
  renderHome(posts),
);
for (const id of withdrawn)
  await page(
    `posts/${id}/`,
    "비공개 글 — BUIING",
    "작성자 인증이 필요합니다.",
    `<section class="article" data-withdrawn-id="${esc(id)}"><h1>비공개 글</h1><a href="private-post/?id=${encodeURIComponent(id)}">작성자 계정으로 보기</a></section>`,
    { noindex: true },
  );
for (const p of posts)
  await page(
    `posts/${p.id}/`,
    `${p.title} — ${site.title}`,
    p.excerpt,
    renderArticle(p),
    { article: p },
  );
await page(
  "about/",
  "소개 — BUIING",
  "배움을 기록하고 지식을 나누는 개발자 븨잉입니다.",
  '<section class="about"><h1>Stay curious.<br>Keep it simple.</h1><p>귀찮은 일을 줄이기 위해 코드를 쓰고, 다시 헤매지 않기 위해 배운 것을 기록합니다.</p></section>',
);
await page(
  "community/",
  "커뮤니티 — BUIING",
  "질문과 배움을 나누는 개발자 커뮤니티.",
  '<section class="article"><h1>Community.</h1><p>질문과 배움을 나눠보세요. 게시판을 이용하려면 JavaScript를 활성화해 주세요.</p></section>',
);
await page(
  "write/",
  "글쓰기 — BUIING",
  "운영자 전용 블로그 글쓰기.",
  '<section class="write-page"><h1>운영자 인증이 필요합니다.</h1></section>',
  { noindex: true },
);
await page(
  "private-post/",
  "비공개 글 — BUIING",
  "작성자 본인만 읽는 비공개 글.",
  '<section class="article"><h1>작성자 인증이 필요합니다.</h1></section>',
  { noindex: true },
);
await page(
  "admin/",
  "관리자 — BUIING",
  "블로그 관리자 페이지",
  '<section class="article"><h1>관리자</h1><p>관리자 인증이 필요합니다.</p></section>',
  { noindex: true },
);
await writeFile(
  "dist/404.html",
  template
    .replace(
      "<head>",
      `<head><base href="${esc(base)}"><meta name="robots" content="noindex"><title>페이지를 찾을 수 없습니다 — BUIING</title>`,
    )
    .replace(
      '<main id="main"></main>',
      '<main id="main"><section class="article"><h1>페이지를 찾을 수 없습니다.</h1><a href="./">홈으로 돌아가기</a></section></main>',
    ),
);
const paths = [
  "",
  "about/",
  "community/",
  ...posts.map((p) => `posts/${p.id}/`),
];
await writeFile(
  "dist/sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${esc(new URL(path, site.url).href)}</loc></url>`).join("")}</urlset>`,
);
await writeFile(
  "dist/robots.txt",
  `User-agent: *\nAllow: /\nDisallow: ${base}admin/\nDisallow: ${base}write/\nDisallow: ${base}private-post/\nSitemap: ${site.url}sitemap.xml\n`,
);
for (const [pkg, name] of [
  ["manrope", "manrope"],
  ["noto-sans-kr", "noto"],
]) {
  const src = `node_modules/@fontsource-variable/${pkg}`;
  await mkdir(`dist/assets/fonts/${name}`, { recursive: true });
  for (const file of ["index.css", "files", "LICENSE"])
    await cp(`${src}/${file}`, `dist/assets/fonts/${name}/${file}`, {
      recursive: true,
    });
}
console.log(`Built ${posts.length} indexed HTML articles at ${site.url}`);
