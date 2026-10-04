import {escapeHTML as esc,safeImage} from './helpers.js';
export const defaultTerminalText='~/workspace\n❯ git add .\n❯ git commit -m "keep learning"\n✓ one step forward_';
const star='<span class="asterisk"><svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="9"><path d="M60 5v110M5 60h110M21 21l78 78M21 99l78-78"/></svg></span>';
export function renderCover(post={}){
 const type=['code','layers','orb','terminal'].includes(post.art)?post.art:'code';
 const image=safeImage(post.coverImage);
 if(image)return `<div class="art cover-image"><img src="${esc(image)}" alt="${esc(post.coverAlt||post.title||'')}"></div>`;
 const label=post.artLabel??({layers:'BUILD BETTER SYSTEMS',orb:'A LITTLE DEEPER',terminal:'LESS FRICTION. MORE FLOW.',code:'IDEAS INTO CODE.'}[type]);
 let center;
 if(type==='layers')center='<div class="tiles"></div>';
 else if(type==='orb')center='<div class="orb"></div>';
 else if(type==='terminal'){
  const lines=String(post.artTerminalText??defaultTerminalText).slice(0,1000).split('\n');
  center=`<div class="terminal" style="--terminal-lines:${Math.max(4,lines.length)};--terminal-chars:${Math.max(35,...lines.map(l=>l.length))}">${lines.map((line,i)=>i===0||i===lines.length-1?`<span>${esc(line)}</span>`:esc(line)).join('\n')}</div>`;
 }else{
  const custom=typeof post.artCodeText==='string';
  center=`<div class="brackets ${custom?'custom-brackets':''}"><span>{</span>${custom?`<span class="code-cover-text" style="--cover-chars:${Math.max(1,...post.artCodeText.slice(0,80).split('\n').map(l=>l.length))}">${esc(post.artCodeText.slice(0,80))}</span>`:star}<span>}</span></div>`;
 }
 return `<div class="art ${type==='layers'?'light':''}" aria-hidden="true"><div class="art-grid"></div><span class="art-label">${esc(label)}</span>${center}<span class="art-index">${esc(post.artCaption??('BUIING — FIELD NOTES / '+(type==='layers'?'002':type==='orb'?'003':'001')))}</span></div>`;
}
