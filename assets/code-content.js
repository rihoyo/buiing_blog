import hljs from "highlight.js/lib/core";
import xml from "highlight.js/lib/languages/xml";
import bash from "highlight.js/lib/languages/bash";
import python from "highlight.js/lib/languages/python";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import sql from "highlight.js/lib/languages/sql";
import yaml from "highlight.js/lib/languages/yaml";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import { escapeHTML as esc } from "./helpers.js";
for (const [name, grammar] of Object.entries({
  html: xml,
  bash,
  python,
  javascript,
  typescript,
  css,
  json,
  sql,
  yaml,
  java,
  cpp,
  go,
  rust,
}))
  hljs.registerLanguage(name, grammar);
export const codeLanguages = [
  ["auto", "자동 감지"],
  ["plaintext", "일반 텍스트"],
  ["html", "HTML"],
  ["bash", "Bash / Shell"],
  ["python", "Python"],
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["css", "CSS"],
  ["json", "JSON"],
  ["sql", "SQL"],
  ["yaml", "YAML"],
  ["java", "Java"],
  ["cpp", "C / C++"],
  ["go", "Go"],
  ["rust", "Rust"],
];
export function codeLanguage(value) {
  const name = String(value || "auto").toLowerCase();
  const alias = {
    text: "plaintext",
    plain: "plaintext",
    txt: "plaintext",
    xml: "html",
    sh: "bash",
    shell: "bash",
    py: "python",
    js: "javascript",
    ts: "typescript",
    yml: "yaml",
    c: "cpp",
    "c++": "cpp",
  };
  const language = alias[name] || name;
  return codeLanguages.some(([id]) => id === language) ? language : "plaintext";
}
export function highlightCode(text, language) {
  const value = String(text || "");
  const lang = codeLanguage(language);
  return lang === "plaintext"
    ? esc(value)
    : lang === "auto"
      ? hljs.highlightAuto(value).value
      : hljs.highlight(value, { language: lang, ignoreIllegals: true }).value;
}
export function renderCodeBlock(text, language) {
  const lang = codeLanguage(language);
  return `<div class="code-block" data-language="${lang}"><div class="code-block-header"><select data-code-language aria-label="코드 언어">${codeLanguages.map(([id, label]) => `<option value="${id}" ${id === lang ? "selected" : ""}>${esc(label)}</option>`).join("")}</select><button type="button" data-code-copy aria-label="코드 복사" title="코드 복사">⧉</button><button type="button" data-code-wrap aria-label="줄바꿈 전환" aria-pressed="false" title="줄바꿈 전환">↵</button><span data-copy-status role="status"></span></div><pre><code class="hljs language-${lang}">${highlightCode(text, lang)}</code></pre></div>`;
}
export function mountCodeTools(root) {
  root.querySelectorAll(".code-block").forEach((block) => {
    const code = block.querySelector("pre code"),
      select = block.querySelector("[data-code-language]");
    select.onchange = () => {
      block.dataset.language = select.value;
      code.innerHTML = highlightCode(code.textContent, select.value);
    };
    block.querySelector("[data-code-copy]").onclick = async () => {
      const status = block.querySelector("[data-copy-status]");
      try {
        await navigator.clipboard.writeText(code.textContent);
        status.textContent = "복사됨";
      } catch {
        status.textContent = "복사 실패";
      }
      setTimeout(() => (status.textContent = ""), 2000);
    };
    block.querySelector("[data-code-wrap]").onclick = (e) => {
      const on = block.classList.toggle("code-wrap");
      e.currentTarget.setAttribute("aria-pressed", String(on));
    };
  });
}
