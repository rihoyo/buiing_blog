import test from 'node:test';
import assert from 'node:assert/strict';
import {metadata,renderArticle,renderHome} from './seo.mjs';
const p={id:'example',title:'Title <&>',excerpt:'Test description',category:'Development',date:'2026-10-02',blocks:[{type:'paragraph',text:'Visible without JavaScript'},{type:'code',text:'<script>alert(1)</script>'}]};
test('Article has crawlable text, safe HTML and links without client JS',()=>{const html=renderArticle(p);assert.match(html,/Visible without JavaScript/);assert.match(html.replace(/<span[^>]*>|<\/span>/g,''),/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(renderHome([p]),/href="posts\/example\/"/)});
test('Canonical, social metadata and structured data are escaped',()=>{const html=metadata({title:p.title,description:p.excerpt,url:'https://example.com/posts/example/',article:{...p,title:'</script><script>bad</script>'},site:{title:'Test',url:'https://example.com/'}});assert.match(html,/rel="canonical"/);assert.match(html,/og:title/);assert.match(html,/BlogPosting/);assert.doesNotMatch(html,/<script>bad/);assert.match(html,/\\u003c\/script>/)});
