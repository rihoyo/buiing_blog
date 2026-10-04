import {renderCodeBlock} from './code-content.js';
import {linkDetails,safeLink} from './links.js';
import {renderMarkdown} from './markdown.js';
import {escapeHTML as esc,safeImage,youtubeId} from './helpers.js';
export function renderBlock(b){
 if(b.type==='table')return `<div class="table-scroll"><table class="post-table">${(b.rows||[]).map((row,i)=>`<${b.header&&i===0?'thead':'tbody'}><tr>${row.map(cell=>`<${b.header&&i===0?'th':'td'}>${esc(cell)}</${b.header&&i===0?'th':'td'}>`).join('')}</tr></${b.header&&i===0?'thead':'tbody'}>`).join('')}</table></div>`;
 if(b.type==='heading')return `<h2>${esc(b.text)}</h2>`;
 if(b.type==='code')return renderCodeBlock(b.text,b.language);
 if(b.type==='image')return safeImage(b.src)?`<figure class="image-figure"><div class="media-image-frame"><img src="${esc(safeImage(b.src))}" alt="${esc(b.alt||'')}" loading="lazy"></div>${b.alt?`<figcaption>${esc(b.alt)}</figcaption>`:''}</figure>`:'';
 if(b.type==='link'){
  const info=linkDetails(b.url);if(!info)return '';
  const title=b.title||info.title,host=info.host,url=esc(info.url),image=safeImage(b.thumbnail||info.thumbnail);
  if(b.mode==='url')return `<p><a class="video-url link-url" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></p>`;
  if(b.mode==='mention')return `<p><a class="video-mention link-mention" href="${url}" target="_blank" rel="noopener noreferrer">↗ ${esc(title)}</a></p>`;
  if(b.mode==='bookmark')return `<a class="video-bookmark link-bookmark" href="${url}" target="_blank" rel="noopener noreferrer">${image?`<img src="${esc(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<span class="link-placeholder" aria-hidden="true">↗</span>'}<span><strong>${esc(title)}</strong>${b.description?`<span class="bookmark-description">${esc(b.description)}</span>`:''}<small>${esc(host)} ↗</small></span></a>`;
  if(info.media==='video')return `<div class="link-embed media-video"><video controls playsinline preload="metadata" src="${url}" ${image?`poster="${esc(image)}"`:''} aria-label="${esc(title)}"><a href="${url}">${esc(title)} · 동영상 열기</a></video><p><a href="${url}" target="_blank" rel="noopener noreferrer">${esc(title)} · 원본 열기 ↗</a></p></div>`;
  if(info.media==='image')return `<figure class="image-figure link-image"><a class="media-image-frame" href="${url}" target="_blank" rel="noopener noreferrer"><img src="${url}" alt="${esc(title)}" loading="lazy"></a><figcaption>${esc(title)}</figcaption></figure>`;
  return `<div class="link-embed"><iframe src="${esc(info.embed)}" title="${esc(title)}" loading="lazy" sandbox="allow-scripts allow-forms allow-presentation" allow="fullscreen; picture-in-picture" allowfullscreen referrerpolicy="no-referrer"></iframe><p><a href="${url}" target="_blank" rel="noopener noreferrer">${esc(title)} · 원본 열기 ↗</a><small>사이트에서 임베드를 차단하면 원본 링크로 열어 주세요.</small></p></div>`;
 }
 if(b.type==='youtube'){
  const id=youtubeId(b.url);if(!id)return '';
  const url=`https://www.youtube.com/watch?v=${id}`,title=b.title||'YouTube 동영상';
  if(b.mode==='url')return `<p><a class="video-url" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></p>`;
  if(b.mode==='mention')return `<p><a class="video-mention" href="${url}" target="_blank" rel="noopener noreferrer">▶ @YouTube · ${esc(title)}</a></p>`;
  if(b.mode==='bookmark')return `<a class="video-bookmark" href="${url}" target="_blank" rel="noopener noreferrer"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy"><span><strong>${esc(title)}</strong><small>youtube.com ↗</small></span></a>`;
  return `<iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${esc(title)}" loading="lazy" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
 }
 return renderMarkdown(b.text);
}
