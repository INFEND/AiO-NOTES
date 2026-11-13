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
test('selectors use internal placeholder labels and have equal-size tile styling',()=>{
  for(const [id,label] of [['fontSize','Размер'],['heading','Стиль']]){
    assert.match(html,new RegExp('<label class="formatSelect"><select id="'+id+'"[^>]*><option value="">'+label+'</option>'));
  }
  assert.doesNotMatch(html,/<label class="formatSelect">[^<]+/);
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
 const dialog=vm.runInContext(extract('function dialog(','function esc(')+'\ndialog',ctx);
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
