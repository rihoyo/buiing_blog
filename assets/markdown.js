import MarkdownIt from 'markdown-it';
const markdown=new MarkdownIt({html:false,linkify:true,breaks:true});
const originalLink=markdown.renderer.rules.link_open||((tokens,idx,options,env,self)=>self.renderToken(tokens,idx,options));
markdown.renderer.rules.link_open=(tokens,idx,options,env,self)=>{tokens[idx].attrSet('rel','noopener noreferrer');return originalLink(tokens,idx,options,env,self)};
export const renderMarkdown=text=>markdown.render(String(text||''));
