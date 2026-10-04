import {renderCodeBlock} from './code-content.js';
import MarkdownIt from 'markdown-it';
const markdown=new MarkdownIt({html:false,linkify:true,breaks:true});
markdown.renderer.rules.fence=(tokens,index)=>renderCodeBlock(tokens[index].content,tokens[index].info.trim().split(/\s+/)[0]);
markdown.renderer.rules.code_block=(tokens,index)=>renderCodeBlock(tokens[index].content,'plaintext');
const originalLink=markdown.renderer.rules.link_open||((tokens,idx,options,env,self)=>self.renderToken(tokens,idx,options));
markdown.renderer.rules.link_open=(tokens,idx,options,env,self)=>{tokens[idx].attrSet('rel','noopener noreferrer');return originalLink(tokens,idx,options,env,self)};
export const renderMarkdown=text=>markdown.render(String(text||''));
