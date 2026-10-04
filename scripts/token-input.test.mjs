import test from 'node:test';
import assert from 'node:assert/strict';
import {splitItems} from '../assets/token-input.js';
test('Comma/newline item parsing trims, deduplicates, keeps code-like text inert and preserves first spelling',()=>{assert.deepEqual(splitItems('React, CSS， React\nCSS, Security'),['React','CSS','Security']);assert.deepEqual(splitItems('Bad, BAD\nbad',true),['Bad']);assert.deepEqual(splitItems(' ,\n '),[]);assert.deepEqual(splitItems("<script>bad</script>, ';DROP TABLE entries;--"),['<script>bad</script>',"';DROP TABLE entries;--"])});
