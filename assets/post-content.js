import {escapeHTML as esc,safeImage,youtubeId} from './helpers.js';
export function renderBlock(b){
 if(b.type==='heading')return `<h2>${esc(b.text)}</h2>`;
 if(b.type==='code')return `<pre><code>${esc(b.text)}</code></pre>`;
 if(b.type==='image')return safeImage(b.src)?`<figure><img src="${esc(safeImage(b.src))}" alt="${esc(b.alt||'')}" loading="lazy">${b.alt?`<figcaption>${esc(b.alt)}</figcaption>`:''}</figure>`:'';
 if(b.type==='youtube'){
  const id=youtubeId(b.url);if(!id)return '';
  const url=`https://www.youtube.com/watch?v=${id}`,title=b.title||'YouTube 동영상';
  if(b.mode==='url')return `<p><a class="video-url" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></p>`;
  if(b.mode==='mention')return `<p><a class="video-mention" href="${url}" target="_blank" rel="noopener noreferrer">▶ @YouTube · ${esc(title)}</a></p>`;
  if(b.mode==='bookmark')return `<a class="video-bookmark" href="${url}" target="_blank" rel="noopener noreferrer"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy"><span><strong>${esc(title)}</strong><small>youtube.com ↗</small></span></a>`;
  return `<iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${esc(title)}" loading="lazy" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
 }
 return `<p>${esc(b.text||'')}</p>`;
}
