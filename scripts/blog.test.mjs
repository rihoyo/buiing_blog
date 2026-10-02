import test from 'node:test';
import assert from 'node:assert/strict';
import {youtubeId,safeImage,escapeHTML} from '../assets/helpers.js';
test('YouTube watch, share, shorts and embed URLs',()=>{for(const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10','https://youtu.be/dQw4w9WgXcQ?si=abc','https://youtube.com/shorts/dQw4w9WgXcQ','https://www.youtube.com/embed/dQw4w9WgXcQ'])assert.equal(youtubeId(u),'dQw4w9WgXcQ')});
test('Rejects spoofed hosts, malformed IDs and scripts',()=>{for(const u of ['https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ','javascript:alert(1)','not-a-url','https://youtube.com/watch?v=short','https://example.com/dQw4w9WgXcQ'])assert.equal(youtubeId(u),null)});
test('Only supported images are rendered, HTML is escaped',()=>{assert.equal(safeImage('javascript:alert(1)'),'');assert.equal(safeImage('data:image/svg+xml;base64,abc'),'');assert.equal(safeImage('data:image/gif;base64,abc'),'data:image/gif;base64,abc');assert.equal(escapeHTML('<script>"&'), '&lt;script&gt;&quot;&amp;')});
test('Author text preserves code and headings',async()=>{const {parseText}=await import('../assets/helpers.js');assert.deepEqual(parseText('## 제목\n\n설명\n다음 줄\n\n```js\nconst n = 1;\n```').map(b=>b.type),['heading','paragraph','code']);assert.equal(parseText('```\n<p>hi</p>')[0].text,'<p>hi</p>')});
