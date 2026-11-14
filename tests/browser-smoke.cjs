const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app/src/main/assets/index.html','utf8');
const bridge=String.raw`<script>
window.Native={load:()=> '[]',save:s=>{window.lastSaved=s;return true;},accent:()=> '#FF5252',setAccent:()=>{},formatMode:()=> 'both',setFormatMode:v=>{window.testMode=v},toolColor:k=>k==='marker'?'#FFEB3B':'#FFFFFF',setToolColor:(k,v)=>{window.testToolColor=v},checkUpdate:()=>{},cloudLinked:()=>'',spell:()=>{},exitApp:()=>{},pickImage:()=>{},openLink:()=>{}};
</script>`;
const checks=String.raw`<script>
(async()=>{
 const result=document.createElement('pre');result.id='smokeResult';document.body.append(result);
 const tick=()=>new Promise(r=>setTimeout(r,120));
 const errors=[];window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
 const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
 function place(node,start,end){editor.focus();const r=document.createRange();r.setStart(node,start);r.setEnd(node,end);const s=getSelection();s.removeAllRanges();s.addRange(r);capture();}
 try{
  $('newNote').click();editor.innerHTML='<div>Тест редактора</div>';const text=editor.firstChild.firstChild;place(text,0,4);$('formatToggle').click();$('fontSize').click();
  assert($('choiceDialog').open,'Size dialog missing');assert($('choiceTitle').textContent==='Размер текста','Size title');
  $('choiceList').children[4].click();await tick();assert(/font|font-size/i.test(editor.innerHTML),'Size not applied');
  place(editor,editor.childNodes.length,editor.childNodes.length);
  document.querySelector('[data-group="insert"]').click();document.querySelector('[data-extra="table"]').click();
  assert($('tableDialog').open,'Table modal missing');$('tableRows').value='2';$('tableCols').value='3';$('tableRows').dispatchEvent(new Event('input'));$('tableApply').click();await tick();
  const table=editor.querySelector('table');assert(table&&table.rows.length===2&&table.rows[0].cells.length===3,'Table insertion failed: '+editor.innerHTML.slice(0,700));
  const cell=table.rows[1].cells[1];place(cell,0,0);cell.dispatchEvent(new MouseEvent('click',{bubbles:true}));assert(!$('tableTools').hidden,'Table context missing');
  $('tableDelete').click();assert($('confirmDialog').open,'Delete confirmation missing');$('confirmCancel').click();await tick();assert(editor.contains(table),'Cancel deleted table');
  place(cell,0,0);assert(activeTable===table,'Table lost after cancel');$('tableDelete').click();assert($('confirmDialog').open,'Second delete confirmation missing');$('confirmApply').click();await tick();assert(!editor.querySelector('table'),'Table delete failed: '+errors.join('; ')+' / '+$('saveStatus').textContent+' / '+$('toast').textContent);assert(editor.textContent.includes('Тест редактора'),'Nearby text lost');
  saveCurrent();assert(!JSON.parse(window.lastSaved).find(n=>n.id===current.id).html.includes('<table>'),'Deleted table persisted');
  place(editor,editor.childNodes.length,editor.childNodes.length);document.querySelector('[data-extra="table"]').click();$('tableCancel').click();await tick();assert(!editor.querySelector('table'),'Cancelled table inserted');
  let p=dialog('Адрес','https://','url');$('dialogCancel').click();assert(await p===null,'Invalid URL cancel failed');
  editor.innerHTML='<div>ABC DEF</div>';savedRange=null;typingStyles={};place(editor.firstChild.firstChild,0,3);document.querySelector('[data-group="text"]').click();
  const color=document.querySelector('[data-act="color"]'),mark=document.querySelector('[data-extra="mark"]'),mono=document.querySelector('[data-act="mono"]');
  color.click();assert($('colorDialog').open,'Color dialog missing');$('colorHex').value='#FF0000';$('colorApply').click();await tick();
  let a=editor.querySelector('span');assert(a&&a.textContent==='ABC'&&rgbHex(getComputedStyle(a).color)==='#FF0000','Text color not applied: '+editor.innerHTML);assert(color.style.getPropertyValue('--tool-color')==='#FF0000'&&color.classList.contains('active'),'Color indicator failed');
  place(a.firstChild,0,3);mark.click();$('colorHex').value='#00FF00';$('colorApply').click();await tick();
  let highlighted=[...editor.querySelectorAll('span')].find(s=>rgbHex(getComputedStyle(s).backgroundColor)==='#00FF00');assert(highlighted&&highlighted.textContent==='ABC','Marker failed: '+editor.innerHTML);assert(mark.classList.contains('active')&&mark.style.getPropertyValue('--tool-color')==='#00FF00','Marker indicator failed');
  const t=highlighted.firstChild;place(t,1,2);mark.click();$('colorClear').click();await tick();const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);let node,found=[];while(node=walker.nextNode())if(['A','B','C'].includes(node.data))found.push([node.data,styleAt(node).marker]);assert(found.some(v=>v[0]==='A'&&v[1]==='#00FF00')&&found.some(v=>v[0]==='B'&&!v[1])&&found.some(v=>v[0]==='C'&&v[1]==='#00FF00'),'Partial marker clear failed: '+editor.innerHTML+' '+JSON.stringify(found));assert(!mark.classList.contains('active'),'Marker active after clear');
  let target;const tw=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);while(node=tw.nextNode())if(node.data==='B'){target=node;break;}place(target,0,1);mono.click();await tick();assert(mono.classList.contains('active'),'Mono not active');mono.click();await tick();assert(!mono.classList.contains('active'),'Mono not disabled');
  setFormatMode('icons');assert($('toolbar').dataset.mode==='icons'&&window.testMode==='icons','Icons mode');setFormatMode('text');assert($('toolbar').dataset.mode==='text','Text mode');setFormatMode('both');assert($('toolbar').dataset.mode==='both','Both mode');
  saveCurrent();const saved=JSON.parse(window.lastSaved).find(n=>n.id===current.id).html;assert(saved.includes('background-color')&&saved.includes('color:'),'Colors not persisted');
  result.dataset.result='pass';result.textContent='Editor browser smoke tests passed';
 }catch(e){result.dataset.result='fail';result.textContent=String(e&&e.stack||e)+' / '+errors.join('; ');}
})();
</script>`;
// The editor's HTML export includes a literal </body> inside its JS.
// Inject at the actual document boundary, never inside the application script.
const bodyEnd=source.lastIndexOf('</body>');
if(bodyEnd<0)throw Error('Document body closing tag missing');
const doc=source.slice(0,bodyEnd)+checks+source.slice(bodyEnd);
const output=doc.replace('<script>',()=>bridge+'<script>');
const scripts=[...output.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if(scripts.length!==3)throw Error('Expected bridge, app, and test scripts; got '+scripts.length);
for(const script of scripts)new vm.Script(script[1]);
fs.writeFileSync(process.argv[2],output);
