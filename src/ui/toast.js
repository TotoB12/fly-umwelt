export function toast(message, kind='info', timeout=3000) {
  const region=document.getElementById('toastRegion');
  if(!region)return;
  while(region.children.length>=2)region.firstElementChild?.remove();
  const node=document.createElement('div');
  node.className=`toast ${kind==='error'?'error':''}`;
  node.setAttribute('role',kind==='error'?'alert':'status');
  node.textContent=message;
  region.append(node);
  const timer=setTimeout(()=>node.remove(),Math.max(900,timeout));
  node.addEventListener('click',()=>{clearTimeout(timer);node.remove();},{once:true});
}
