const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app/src/main/assets/index.html','utf8');
const bridge=String.raw`<script>
window.Native={load:()=> '[]',save:s=>{window.lastSaved=s;return true;},accent:()=> '#FF5252',setAccent:()=>{},checkUpdate:()=>{},cloudLinked:()=>'',spell:()=>{},exitApp:()=>{},pickImage:()=>{},openLink:()=>{}};
</script>`;
const checks=String.raw`<script>
(async()=>{
 const result=document.createElement('pre');result.id='smokeResult';document.body.append(result);
 const tick=()=>new Promise(r=>setTimeout(r,80));
 const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
 function place(node,start,end){editor.focus();const r=document.createRange();r.setStart(node,start);r.setEnd(node,end);const s=getSelection();s.removeAllRanges();s.addRange(r);capture();}
 try{
  $('newNote').click();editor.innerHTML='<div>Тест редактора</div>';const text=editor.firstChild.firstChild;place(text,0,4);$('formatToggle').click();$('fontSize').click();
  assert($('choiceDialog').open,'Size dialog missing');assert($('choiceTitle').textContent==='Размер текста','Size title');
  $('choiceList').children[4].click();await tick();assert(/font|font-size/i.test(editor.innerHTML),'Size not applied');
  place(editor,editor.childNodes.length,editor.childNodes.length);
  document.querySelector('[data-group="insert"]').click();document.querySelector('[data-extra="table"]').click();
  assert($('tableDialog').open,'Table modal missing');$('tableRows').value='2';$('tableCols').value='3';$('tableRows').dispatchEvent(new Event('input'));$('tableApply').click();await tick();
  const table=editor.querySelector('table');assert(table&&table.rows.length===2&&table.rows[0].cells.length===3,'Table insertion failed');
  const cell=table.rows[1].cells[1];place(cell,0,0);cell.dispatchEvent(new MouseEvent('click',{bubbles:true}));assert(!$('tableTools').hidden,'Table context missing');
  $('tableDelete').click();assert($('confirmDialog').open,'Delete confirmation missing');$('confirmCancel').click();await tick();assert(editor.contains(table),'Cancel deleted table');
  place(cell,0,0);$('tableDelete').click();$('confirmApply').click();await tick();assert(!editor.querySelector('table'),'Table delete failed');assert(editor.textContent.includes('Тест редактора'),'Nearby text lost');
  saveCurrent();assert(!JSON.parse(window.lastSaved).find(n=>n.id===current.id).html.includes('<table>'),'Deleted table persisted');
  let p=dialog('Адрес','https://','url');$('dialogCancel').click();assert(await p===null,'Invalid URL cancel failed');
  result.dataset.result='pass';result.textContent='Editor browser smoke tests passed';
 }catch(e){result.dataset.result='fail';result.textContent=String(e&&e.stack||e);}
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
