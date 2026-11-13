const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const html = fs.readFileSync('app/src/main/assets/index.html','utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function extract(start,end){const a=js.indexOf(start),b=js.indexOf(end,a);assert.ok(a>=0&&b>a);return js.slice(a,b);}
test('editor script parses; DOM IDs are unique and referenced IDs exist',()=>{
  new vm.Script(js);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const m of js.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(m[1]),'Missing DOM ID: '+m[1]);
});
test('format choice buttons are app-owned, equal-sized tiles',()=>{
  for(const [id,label] of [['fontSize','Размер'],['heading','Стиль']]){
    assert.match(html,new RegExp('<button type="button" id="'+id+'" class="formatTool choiceTool" aria-label="'+label+'"'));
  }
  assert.doesNotMatch(html,/<select\b|<input[^>]*type="color"/);
  assert.doesNotMatch(js,/(?:^|[^\w])confirm\(/);
  assert.match(html,/\.formatGroup>\.formatTool,\.toolbar \.formatGroup>button\[data-extra\]\.formatTool,\.formatGroup>\.formatSelect\{[^}]*height:var\(--tool-height\)/);
  assert.match(html,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});
test('all formatting commands remain available',()=>{
  for(const cmd of ['undo','redo','bold','italic','underline','strikeThrough','justifyLeft','justifyCenter','justifyRight','insertUnorderedList','insertOrderedList','removeFormat'])assert.match(html,new RegExp('data-cmd="'+cmd+'"'));
  for(const action of ['mono','color','link','code','check','image'])assert.match(html,new RegExp('data-act="'+action+'"'));
  for(const action of ['mark','table','quote','hr'])assert.match(html,new RegExp('data-extra="'+action+'"'));
});
function modalHarness(){
 const els={dialog:{showModal(){this.open=true;},close(v){this.returnValue=v;this.open=false;this.onclose();}},dialogInput:{focus(){this.focused=true;}},dialogError:{},dialogForm:{},dialogTitle:{},dialogCancel:{}};
 const ctx=vm.createContext({$:id=>els[id],URL});
 const dialog=vm.runInContext(extract('function dialog(','function showChoice(')+'\ndialog',ctx);
 return {els,dialog};
}
test('cancel invalid URL, no validation or hanging promise',async()=>{
 const {els,dialog}=modalHarness();const p=dialog('Адрес','https://','url');
 els.dialogCancel.onclick();assert.equal(await p,null);assert.equal(els.dialog.open,false);
});
test('invalid apply stays open, valid URL closes, next dialog resets errors',async()=>{
 const {els,dialog}=modalHarness();const p=dialog('Адрес','https://','url');
 els.dialogForm.onsubmit({preventDefault(){}});assert.equal(els.dialog.open,true);assert.ok(els.dialogError.textContent);
 els.dialogInput.value='https://example.com';els.dialogInput.oninput();assert.equal(els.dialogError.textContent,'');
 els.dialogForm.onsubmit({preventDefault(){}});assert.equal(await p,'https://example.com');assert.equal(els.dialog.open,false);
 const next=dialog('Размер','3','number');assert.equal(els.dialogError.textContent,'');els.dialogCancel.onclick();assert.equal(await next,null);
});
test('system insets handled by root and consumed',()=>{
 const java=fs.readFileSync('app/src/main/java/com/infend/aionotes/MainActivity.java','utf8');
 for(const fragment of ['WindowCompat.setDecorFitsSystemWindows(getWindow(), false)','ViewCompat.setOnApplyWindowInsetsListener(root','WindowInsetsCompat.Type.systemBars()','WindowInsetsCompat.Type.displayCutout()','WindowInsetsCompat.Type.ime()','WindowInsetsCompat.CONSUMED','setContentView(root)'])assert.ok(java.includes(fragment),fragment);
});
test('alignment survives sanitizer allowlist',()=>assert.ok(js.includes("if(name==='align'")&&js.includes("'left','center','right','justify'")));

test('table dimensions strictly validated; header optional; exactly one parameter modal',()=>{
 const ctx=vm.createContext({});
 vm.runInContext(extract('function tableDimensions(','function tableParameters('),ctx);
 for(const [r,c] of [[0,2],[2,0],[21,2],[2,9],[1.5,2],['',2],['abc',2]])assert.equal(ctx.tableDimensions(r,c),null);
 assert.equal(ctx.tableDimensions(20,8).rows,20);
 assert.equal(ctx.tableDimensions(20,8).cols,8);
 const withHeader=ctx.tableMarkup(3,4,true);
 assert.equal((withHeader.match(/<tr>/g)||[]).length,3);
 assert.equal((withHeader.match(/<th>/g)||[]).length,4);
 assert.equal((withHeader.match(/<td>/g)||[]).length,8);
 assert.equal((ctx.tableMarkup(2,2,false).match(/<td>/g)||[]).length,4);
 assert.match(js,/const p=await tableParameters\(\);if\(p\)cmd/);
 assert.doesNotMatch(js,/await dialog\('Количество (строк|столбцов)/);
});
test('table deletion is explicit, scoped and saves after removal',()=>{
 assert.match(html,/id="tableDelete"/);
 assert.match(js,/askConfirm\('Удалить таблицу\?'/);
 assert.match(js,/if\(!table\|\|!editor.contains\(table\)\)return false/);
 assert.match(js,/range.selectNode\(table\)/);
 assert.match(js,/table.remove\(\)/);
 assert.match(js,/capture\(\);dirty\(\);saveCurrent\(\);return true/);
});
test('modal focus does not overwrite saved editor selection; save failure remains visible',()=>{
 assert.match(js,/function capture\(\)\{if\(document.querySelector\('dialog\[open\]'\)\)return/);
 assert.match(js,/if\(saveFailed\)persist\(\)/);
 assert.match(js,/current.id===pendingImageNote/);
});
