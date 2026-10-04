import test from 'node:test';
import assert from 'node:assert/strict';
import {renderBlock} from '../assets/post-content.js';
import {coverDesigns,renderCover} from '../assets/post-cover.js';
import {moveBlock} from '../assets/block-order.js';
import {safeLink,linkDetails} from '../assets/links.js';
test('Generic links support all modes with safe URLs and sandboxed embed fallback links',()=>{
 for(const mode of ['url','mention','bookmark','embed']){const html=renderBlock({type:'link',url:'https://example.com/path?q=1&x=2',mode,title:'<script>x</script>',description:'<img onerror=x>',thumbnail:'https://example.com/image.png'});assert.ok(html.includes('example.com'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img onerror'));assert.equal(html.includes('<iframe'),mode==='embed');if(mode==='embed'){assert.ok(html.includes('sandbox="allow-scripts allow-forms allow-presentation"'));assert.ok(html.includes('원본 열기'))}}
 for(const url of ['javascript:alert(1)','data:text/html,bad','https://a:b@example.com','broken']){assert.equal(safeLink(url),'');assert.equal(renderBlock({type:'link',url,mode:'embed'}),'')}
 assert.equal(linkDetails('https://vimeo.com/12345').embed,'https://player.vimeo.com/video/12345');assert.ok(linkDetails('https://youtu.be/dQw4w9WgXcQ').thumbnail.includes('i.ytimg.com'));
});
test('Markdown supports formatting, lists, tables and fences while refusing executable markup',()=>{
 const html=renderBlock({type:'markdown',text:'# Heading\n\n**bold** *em* ~~gone~~ `code`\n\n- one\n- two\n\n> quote\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n![x](data:image/svg+xml;base64,bad)'});
 for(const tag of ['<h1>','<strong>','<em>','<s>','<ul>','<blockquote>','<table>','<pre>'])assert.ok(html.includes(tag),tag);
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('href="javascript:'));assert.ok(!html.includes('src="data:image/svg+xml'));
 assert.ok(renderBlock({type:'paragraph',text:'**bold**'}).includes('<strong>'));
});
test('Twelve distinct cover designs share rendering and image URLs preserve transparency',()=>{
 assert.equal(coverDesigns.length,12);assert.equal(new Set(coverDesigns.map(d=>d.id)).size,12);assert.equal(new Set(coverDesigns.map(d=>renderCover({art:d.id}))).size,12);
 for(const art of coverDesigns.map(d=>d.id)){const html=renderCover({art,artText:'<script>x</script>'});assert.ok(!html.includes('<script>'))}
 const html=renderCover({coverImage:'https://example.com/image.webp',coverAlt:'透明'});assert.ok(html.includes('cover-image'));assert.ok(html.includes('image.webp'));
});
test('Block drop gaps preserve full block data and correctly handle moves in both directions',()=>{
 const blocks=[{type:'code',text:'one'},{type:'markdown',text:'two'},{type:'link',url:'https://example.com',mode:'bookmark'}],original=structuredClone(blocks);
 assert.equal(moveBlock(blocks,0,3),true);assert.deepEqual(blocks,[original[1],original[2],original[0]]);
 assert.equal(moveBlock(blocks,2,0),true);assert.deepEqual(blocks,original);
 for(const pair of [[0,0],[0,1],[-1,2],[3,0],[0,4]]){assert.equal(moveBlock(blocks,...pair),false);assert.deepEqual(blocks,original)}
});
