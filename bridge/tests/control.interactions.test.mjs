import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const CONTROL_JS = await readFile(new URL("../control.js", import.meta.url), "utf8");
const CONTROL_HTML = await readFile(new URL("../control.html", import.meta.url), "utf8");
const POPUP_JS = await readFile(new URL("../popup.js", import.meta.url), "utf8");
const POPUP_HTML = await readFile(new URL("../popup.html", import.meta.url), "utf8");
const flush = async (n = 35) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

class Element {
  constructor(id = "") { this.id=id;this.value="";this.textContent="";this.disabled=false;this.children=[];this.options=[];this.listeners={};this.scrollHeight=0;this.scrollTop=0;this.onclick=null;this.onchange=null; }
  add(option) { this.options.push(option);if(this.value==="")this.value=String(option.value); }
  replaceChildren(...children) { this.children=[...children];this.options=[];this.value=""; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); }
  addEventListener(type,callback) { (this.listeners[type] ||= []).push(callback); }
  dispatch(type) { if(type==="click"&&typeof this.onclick==="function")this.onclick({type,target:this});if(type==="change"&&typeof this.onchange==="function")this.onchange({type,target:this});for(const cb of this.listeners[type]||[])cb({type,target:this}); }
}
class TestOption { constructor(text,value){this.text=text;this.value=String(value);} }
function makeSession(id,name){return{id,name,brainTabId:11,workerTabId:22,status:"IDLE",paused:false,stopRequested:false,running:false,iteration:0,maxIterations:10,brainTimeoutMs:60000,workerTimeoutMs:600000,minTurnDelayMs:0,lastForwarded:"",activeRole:null,activeJobId:null,log:[]};}

async function makeControlHarness(options={}) {
  const ids=["session","sessionName","brain","worker","seed","iterations","brainTimeout","workerTimeout","minTurnDelay","status","log","start","deleteSession","newSession","refresh","pause","resume","stop","reset"];
  const elements=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
  const diagnostics=[],errors=[],messages=[],timers=new Map();
  let pollCallback=null,timerSerial=0,hangResolver=null,nextId=3;
  const tabs=[{id:11,title:"CEREBRO",url:"https://chatgpt.com/",windowId:1},{id:22,title:"OBRERO",url:"https://chatgpt.com/c/worker",windowId:1}];
  const data={version:5,activeSessionId:"s1",sessions:[makeSession("s1","Sesión 1"),makeSession("s2","Sesión 2")]};
  const failNext=new Set(options.failNext||[]),hangTypes=new Set(options.hangTypes||[]);
  const snapshot=()=>structuredClone(data),getSession=id=>data.sessions.find(s=>s.id===id);
  const chrome={runtime:{sendMessage(message){
    messages.push(structuredClone(message));
    if(failNext.has(message.type)){failNext.delete(message.type);return Promise.reject(new Error("Could not establish connection. Receiving end does not exist."));}
    if(hangTypes.has(message.type))return new Promise(resolve=>{hangResolver=resolve;});
    if(message.type==="LIST_CHATGPT_TABS"||message.type==="GET_STATE")return Promise.resolve({ok:true,tabs:structuredClone(tabs),state:snapshot()});
    if(message.type==="SELECT_SESSION"){if(!getSession(message.sessionId))return Promise.resolve({ok:false,error:"Sesión no encontrada"});data.activeSessionId=message.sessionId;return Promise.resolve({ok:true,state:snapshot()});}
    if(message.type==="CREATE_SESSION"){const id="s"+nextId++;data.sessions.push(makeSession(id,message.name||id));data.activeSessionId=id;return Promise.resolve({ok:true,state:snapshot()});}
    if(message.type==="DELETE_SESSION"){if(data.sessions.length<=1)return Promise.resolve({ok:false,error:"Debe existir al menos una sesión"});data.sessions=data.sessions.filter(s=>s.id!==message.sessionId);if(!getSession(data.activeSessionId))data.activeSessionId=data.sessions[0].id;return Promise.resolve({ok:true,state:snapshot()});}
    if(message.type==="SAVE_SESSION"){const s=getSession(message.sessionId);if(!s)return Promise.resolve({ok:false,error:"Sesión no encontrada"});Object.assign(s,{name:message.name,brainTabId:message.brainTabId,workerTabId:message.workerTabId,maxIterations:message.maxIterations,brainTimeoutMs:message.brainTimeoutMs,workerTimeoutMs:message.workerTimeoutMs,minTurnDelayMs:message.minTurnDelayMs});return Promise.resolve({ok:true,state:snapshot()});}
    if(message.type==="START_LOOP"){const s=getSession(message.sessionId);if(!s||s.running)return Promise.resolve({ok:false,error:"Esta sesión ya está activa"});Object.assign(s,{running:true,status:"RUNNING — "+s.name,activeRole:"CEREBRO",activeJobId:"synthetic-job"});return Promise.resolve({ok:true,state:snapshot()});}
    if(message.type==="PAUSE"){const s=getSession(message.sessionId);if(s)Object.assign(s,{paused:true,status:"PAUSED — esperando el turno"});return Promise.resolve({ok:true,state:snapshot()});}
    if(message.type==="RESUME"){const s=getSession(message.sessionId);if(s)Object.assign(s,{paused:false,status:"RUNNING — reanudada"});return Promise.resolve({ok:true,state:snapshot()});}
    if(message.type==="STOP"){const s=getSession(message.sessionId);if(s)Object.assign(s,{running:false,paused:false,activeRole:null,activeJobId:null,status:"STOPPED"});return Promise.resolve({ok:true,state:snapshot()});}
    if(message.type==="RESET_SESSION"){const s=getSession(message.sessionId);if(s&&!s.running)Object.assign(s,{paused:false,iteration:0,activeRole:null,activeJobId:null,log:[],status:"IDLE"});return Promise.resolve({ok:true,state:snapshot()});}
    return Promise.resolve({ok:false,error:"Tipo de mensaje de prueba desconocido"});
  }}};
  const document={activeElement:null,getElementById(id){if(options.missingId===id)return null;return elements[id] ||= new Element(id);},createElement(){return new Element();}};
  const consoleMock={info(...args){diagnostics.push(args);},error(...args){errors.push(args);},warn(){},log(){}};
  const context=vm.createContext({
    chrome,document,Option:TestOption,console:consoleMock,Promise,structuredClone,Date,Math,
    prompt:()=>options.promptValue??"Sesión de prueba",confirm:()=>options.confirmValue??true,
    setInterval(callback){pollCallback=callback;return 1;},clearInterval(){},
    setTimeout(callback,delay){const id=++timerSerial;timers.set(id,{callback,delay});return id;},
    clearTimeout(id){timers.delete(id);}
  });
  let initError=null;
  try{vm.runInContext(CONTROL_JS,context,{filename:"bridge/control.js"});}catch(error){initError=error;}
  await flush();
  return {
    elements,diagnostics,errors,messages,context,initError,state:data,tabs,timers,
    async poll(){if(pollCallback)await pollCallback();await flush();},
    async press(id){const el=elements[id];assert.ok(el,"unknown button "+id);assert.equal(typeof el.onclick,"function","button "+id+" has no click handler");el.dispatch("click");await flush();},
    fireTimeouts(){for(const [id,timer] of [...timers]){timers.delete(id);timer.callback();}},
    releaseHang(result={ok:true,state:snapshot()}){hangResolver?.(result);},
    async waitFor(predicate,attempts=80){for(let i=0;i<attempts;i++){if(predicate())return true;await Promise.resolve();}return predicate();}
  };
}
function diagRows(args){return args.filter(row=>row[0]==="[BRIDGE_UI_ACTION]").map(row=>JSON.parse(row[1]));}

test("inventario de botones: IDs únicos, tipo seguro y listener declarado para panel y popup",()=>{
  const controlButtons=[...CONTROL_HTML.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  const popupButtons=[...POPUP_HTML.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  const ids=controlButtons.map(m=>m[1].match(/\bid="([^"]+)"/)?.[1]);
  assert.equal(ids.length,8);assert.equal(new Set(ids).size,ids.length);assert.ok(ids.every(Boolean));
  for(const match of controlButtons)assert.match(match[1],/\btype="button"/);
  assert.equal((CONTROL_HTML.match(/<script\s+src="control\.js"><\/script>/g)||[]).length,1);
  assert.equal(popupButtons.length,1);
  assert.equal((POPUP_HTML.match(/<script\s+src="popup\.js"><\/script>/g)||[]).length,1);
  assert.match(CONTROL_JS,/getElementById\("newSession"\)\.onclick=/);
  assert.match(CONTROL_JS,/deleteButton\.onclick=/);
  assert.match(CONTROL_JS,/getElementById\("refresh"\)\.onclick=/);
  assert.match(CONTROL_JS,/startButton\.onclick=/);
  for(const id of ["pause","resume","stop","reset"])assert.ok(CONTROL_JS.includes('["'+id+'"'),"missing mapping "+id);
  assert.match(POPUP_JS,/refresh\.addEventListener\("click"/);
});

test("cada botón del panel dispara una sola operación del contrato",async()=>{
  const cases=[
    {id:"newSession",action:"create_session",types:["CREATE_SESSION"]},
    {id:"deleteSession",action:"delete_session",types:["DELETE_SESSION"]},
    {id:"refresh",action:"refresh_tabs",types:["LIST_CHATGPT_TABS"]},
    {id:"start",action:"start_loop",types:["SAVE_SESSION","START_LOOP"],seed:"synthetic seed"},
    {id:"pause",action:"pause",types:["PAUSE"]},
    {id:"resume",action:"resume",types:["RESUME"]},
    {id:"stop",action:"stop",types:["STOP"]},
    {id:"reset",action:"reset_session",types:["RESET_SESSION"]}
  ];
  for(const item of cases){
    const h=await makeControlHarness({promptValue:"Nueva"});
    assert.equal(h.initError,null);
    const before=h.messages.length;
    if(item.seed)h.elements.seed.value=item.seed;
    await h.press(item.id);
    assert.ok(await h.waitFor(()=>diagRows(h.diagnostics).some(d=>d.action===item.action&&d.phase==="action_completed"),100),item.id+" did not complete");
    const calls=h.messages.slice(before).map(m=>m.type);
    for(const type of item.types)assert.equal(calls.filter(x=>x===type).length,1,item.id+" must send "+type+" once");
    assert.equal(diagRows(h.diagnostics).filter(d=>d.action===item.action&&d.phase==="listener_invoked").length,1);
    assert.equal(diagRows(h.diagnostics).filter(d=>d.action===item.action&&d.phase==="action_completed").length,1);
    assert.ok(!JSON.stringify(diagRows(h.diagnostics)).includes(item.seed||"__no_seed__"));
  }
});

test("cambiar de sesión funciona y una inicialización incompleta informa el ID que falta",async()=>{
  const h=await makeControlHarness();
  h.elements.session.value="s2";h.elements.session.dispatch("change");await flush();
  assert.equal(h.messages.filter(m=>m.type==="SELECT_SESSION").length,1);
  assert.equal(h.state.activeSessionId,"s2");
  const broken=await makeControlHarness({missingId:"stop"});
  assert.ok(broken.initError);assert.match(broken.initError.message,/faltan controles.*stop/);
  assert.match(broken.elements.status.textContent,/no pudo inicializar el panel/);
  assert.ok(broken.errors.some(row=>row[0]==="[BRIDGE_UI_INIT]"));
});

test("un error de comunicación queda visible durante el polling y se limpia tras una acción correcta",async()=>{
  const h=await makeControlHarness({failNext:["STOP"]});
  await h.press("stop");
  assert.match(h.elements.status.textContent,/ERROR — Detener/);
  const errorVisible=h.elements.status.textContent;
  await h.poll();
  assert.equal(h.elements.status.textContent,errorVisible,"state polling must not overwrite a command error");
  assert.ok(diagRows(h.diagnostics).some(d=>d.action==="stop"&&d.phase==="message_transport_failed"));
  await h.press("refresh");
  assert.ok(!/^ERROR/.test(h.elements.status.textContent),"a successful explicit action clears the old error");
  assert.equal(h.elements.refresh.disabled,false);
});

test("el timeout de una operación es visible, no reintenta y recupera los controles",async()=>{
  const h=await makeControlHarness({hangTypes:["PAUSE"]});
  await h.press("pause");
  assert.equal(h.elements.pause.disabled,true);
  assert.equal(h.messages.filter(m=>m.type==="PAUSE").length,1);
  h.fireTimeouts();await flush();
  assert.match(h.elements.status.textContent,/no respondió en 10 segundos/i);
  assert.equal(h.elements.pause.disabled,false);
  assert.equal(h.messages.filter(m=>m.type==="PAUSE").length,1);
});

test("un segundo clic mientras la acción está pendiente no duplica la creación",async()=>{
  const h=await makeControlHarness({hangTypes:["CREATE_SESSION"],promptValue:"Solo una vez"});
  await h.press("newSession");h.elements.newSession.dispatch("click");await flush();
  assert.equal(h.messages.filter(m=>m.type==="CREATE_SESSION").length,1);
  h.fireTimeouts();await flush();
  assert.equal(h.messages.filter(m=>m.type==="CREATE_SESSION").length,1);
  assert.ok(!JSON.stringify(diagRows(h.diagnostics)).includes("Solo una vez"));
});

test("el popup informa errores y vuelve a habilitar su botón tras el rechazo",async()=>{
  const elements={status:new Element("status"),tabs:new Element("tabs"),refresh:new Element("refresh")};
  const messages=[],diagnostics=[];let failNext=false;
  const chrome={runtime:{sendMessage(message){
    messages.push(structuredClone(message));
    if(failNext){failNext=false;return Promise.reject(new Error("Could not establish connection. Receiving end does not exist."));}
    return Promise.resolve({ok:true,tabs:[{id:11,title:"CEREBRO"},{id:22,title:"OBRERO"}]});
  }}};
  const context=vm.createContext({chrome,document:{getElementById(id){return elements[id]||null;},createElement(){return new Element();}},console:{info(...x){diagnostics.push(x);},error(){}},Promise,setTimeout,clearTimeout,structuredClone});
  vm.runInContext(POPUP_JS,context,{filename:"bridge/popup.js"});await flush();
  assert.match(elements.status.textContent,/Pestañas ChatGPT detectadas: 2/);
  const before=messages.length;failNext=true;elements.refresh.dispatch("click");await flush();
  assert.equal(messages.length-before,1);
  assert.match(elements.status.textContent,/ERROR — No hay comunicación/);
  assert.equal(elements.refresh.disabled,false);
  elements.refresh.dispatch("click");await flush();
  assert.match(elements.status.textContent,/Pestañas ChatGPT detectadas: 2/);
  assert.equal(elements.refresh.disabled,false);
  assert.ok(diagnostics.some(row=>row[0]==="[BRIDGE_UI_ACTION]"&&JSON.parse(row[1]).phase==="action_failed"));
});
