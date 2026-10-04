// A drop gap is the position before the original block at that index.
export function moveBlock(blocks,from,gap){
 if(!Number.isInteger(from)||!Number.isInteger(gap)||from<0||from>=blocks.length||gap<0||gap>blocks.length||gap===from||gap===from+1)return false;
 const [block]=blocks.splice(from,1);blocks.splice(gap>from?gap-1:gap,0,block);return true;
}
