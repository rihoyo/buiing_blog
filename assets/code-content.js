import hljs from 'highlight.js/lib/core';
import xml from 'highlight.js/lib/languages/xml';
import bash from 'highlight.js/lib/languages/bash';
import python from 'highlight.js/lib/languages/python';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import {escapeHTML as esc} from './helpers.js';
for(const [name,grammar] of Object.entries({html:xml,bash,python,javascript,typescript,css,json,sql,yaml,java,cpp,go,rust}))hljs.registerLanguage(name,grammar);
export const codeLanguages=[['plaintext','일반 텍스트'],['html','HTML'],['bash','Bash / Shell'],['python','Python'],['javascript','JavaScript'],['typescript','TypeScript'],['css','CSS'],['json','JSON'],['sql','SQL'],['yaml','YAML'],['java','Java'],['cpp','C / C++'],['go','Go'],['rust','Rust']];
export function codeLanguage(value){const name=String(value||'plaintext').toLowerCase();const alias={text:'plaintext',plain:'plaintext',txt:'plaintext',xml:'html',sh:'bash',shell:'bash',py:'python',js:'javascript',ts:'typescript',yml:'yaml',c:'cpp','c++':'cpp'};const language=alias[name]||name;return codeLanguages.some(([id])=>id===language)?language:'plaintext'}
export function highlightCode(text,language){const value=String(text||'');const lang=codeLanguage(language);return lang==='plaintext'?esc(value):hljs.highlight(value,{language:lang,ignoreIllegals:true}).value}
export function renderCodeBlock(text,language){const lang=codeLanguage(language),label=codeLanguages.find(([id])=>id===lang)[1];return `<div class="code-block" data-language="${lang}"><div class="code-block-header"><span>${esc(label)}</span><span>CODE</span></div><pre><code class="hljs language-${lang}">${highlightCode(text,lang)}</code></pre></div>`}
