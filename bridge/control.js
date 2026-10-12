const sessionSelect=document.getElementById("session"),sessionName=document.getElementById("sessionName"),brain=document.getElementById("brain"),worker=document.getElementById("worker"),seed=document.getElementById("seed"),iterations=document.getElementById("iterations"),brainTimeout=document.getElementById("brainTimeout"),workerTimeout=document.getElementById("workerTimeout"),minTurnDelay=document.getElementById("minTurnDelay"),status=document.getElementById("status"),log=document.getElementById("log"),startButton=document.getElementById("start"),deleteButton=document.getElementById("deleteSession");
const REQUIRED_CONTROL_IDS = [
  "session", "sessionName", "brain", "worker", "seed", "iterations",
  "brainTimeout", "workerTimeout", "minTurnDelay", "status", "log",
  "start", "deleteSession", "newSession", "refresh", "pause", "resume", "stop", "reset"
];
const missingControlIds = REQUIRED_CONTROL_IDS.filter(id => !document.getElementById(id));
if (missingControlIds.length) {
  const message = "BRIDGE no pudo inicializar el panel: faltan controles (" + missingControlIds.join(", ") + "). Recarga la extensión y comprueba que control.html y control.js pertenezcan a la misma versión.";
  if (status) status.textContent = message;
  console.error("[BRIDGE_UI_INIT]", JSON.stringify({ phase: "missing_dom_elements", missingIds: missingControlIds }));
  throw new Error(message);
}
let state=null,tabs=[],lastLog="",pollTimer=null,selectedBrainTabId=null,selectedWorkerTabId=null,brainSelectionDirty=false,workerSelectionDirty=false,sessionNameDirty=false,iterationsDirty=false,brainTimeoutDirty=false,workerTimeoutDirty=false,minTurnDelayDirty=false;
const UI_MESSAGE_TIMEOUT_MS = 10000;
const UI_BUTTON_IDS = ["newSession", "deleteSession", "refresh", "start", "pause", "resume", "stop", "reset"];
const UI_FIELD_IDS = ["session", "sessionName", "brain", "worker", "seed", "iterations", "brainTimeout", "workerTimeout", "minTurnDelay"];
let activeUiAction = null;
let statusNotice = null;
let pollInFlight = false;
let pollFailureLogged = false;
const current=()=>state?.sessions?.find(s=>s.id===state.activeSessionId)||null;
function statusText(t){if(status)status.textContent=t}
function emitUiDiagnostic(action,phase,messageType,error,extra={}){
  const record={action,phase,messageType,...extra};
  if(error)record.errorName=String(error?.name||"Error").slice(0,80);
  console.info("[BRIDGE_UI_ACTION]",JSON.stringify(record));
}
function setStatusNotice(message,kind="error"){
  statusNotice={message:String(message||"BRIDGE encontró un error"),kind};
  statusText(statusNotice.message);
}
function safeErrorMessage(error){
  if(error?.code==="BRIDGE_MESSAGE_TIMEOUT")return "BRIDGE no respondió en 10 segundos. Comprueba el estado antes de repetir una acción.";
  const message=String(error?.message||"Error inesperado").replace(/[\r\n\t]+/g," ").trim();
  if(/receiving end does not exist|could not establish connection|message port closed|context invalidated/i.test(message))
    return "No hay comunicación con el componente de BRIDGE. Recarga la extensión y las pestañas de ChatGPT.";
  return message.slice(0,180)||"Error inesperado";
}
function applyPendingUiState(){
  if(!activeUiAction)return;
  for(const id of UI_BUTTON_IDS){const element=document.getElementById(id);if(element)element.disabled=true;}
  for(const id of UI_FIELD_IDS){const element=document.getElementById(id);if(element)element.disabled=true;}
}
function sendMessageWithTimeout(message){
  let timerId;
  const timeout=new Promise((_,reject)=>{
    timerId=setTimeout(()=>{
      const error=new Error("Timeout esperando respuesta de BRIDGE");
      error.name="BridgeMessageTimeout";
      error.code="BRIDGE_MESSAGE_TIMEOUT";
      reject(error);
    },UI_MESSAGE_TIMEOUT_MS);
  });
  return Promise.race([
    Promise.resolve().then(()=>chrome.runtime.sendMessage(message)),
    timeout
  ]).finally(()=>clearTimeout(timerId));
}
async function runUiAction({action,buttonId=null,label,messageType,operation}){
  if(activeUiAction){
    emitUiDiagnostic(action,"ignored_busy",messageType,null);
    return;
  }
  const button=buttonId?document.getElementById(buttonId):null;
  if(button?.disabled)return;
  activeUiAction=action;
  setStatusNotice("EN CURSO — "+label,"pending");
  emitUiDiagnostic(action,"listener_invoked",messageType);
  emitUiDiagnostic(action,"action_started",messageType);
  applyPendingUiState();
  try{
    const result=await operation();
    if(result===null){
      if(statusNotice?.kind==="pending")statusNotice=null;
      emitUiDiagnostic(action,"action_cancelled",messageType);
      return;
    }
    if(statusNotice?.kind==="pending")statusNotice=null;
    emitUiDiagnostic(action,"action_completed",messageType);
    return result;
  }catch(error){
    setStatusNotice("ERROR — "+label+": "+safeErrorMessage(error),"error");
    emitUiDiagnostic(action,"action_failed",messageType,error);
  }finally{
    activeUiAction=null;
    if(state)render(state);
    else if(statusNotice)statusText(statusNotice.message);
    applyPendingUiState();
  }
}
function boundedNumber(el,fallback,min,max){
  const raw=String(el?.value??"").trim();
  if(raw==="")return fallback;
  const parsed=Number(raw);
  if(!Number.isFinite(parsed))return fallback;
  return Math.max(min,Math.min(max,parsed));
}
function addLog(role,text){const d=document.createElement("div");d.className="msg "+(role==="CEREBRO"?"brain":role==="OBRERO"?"worker":"system");const w=document.createElement("div");w.className="who";w.textContent=role+":";const b=document.createElement("div");b.textContent=text;d.append(w,b);log.append(d)}
function fillTabs(el,id,preferredId=null){
  el.replaceChildren();
  for(const t of tabs) el.add(new Option("Pestaña "+t.id+" — "+(t.title||"ChatGPT"),String(t.id)));
  const desired=id ?? preferredId;
  if(desired!=null&&[...el.options].some(o=>o.value===String(desired))) el.value=String(desired);
}
function getDistinctDefault(role){
  if(!tabs.length) return null;
  if(role==="CEREBRO") return tabs[0].id;
  return tabs.find(t=>t.id!==Number(brain.value))?.id ?? tabs[0].id;
}
function render(s){if(!s)return;state=s;sessionSelect.replaceChildren();for(const x of s.sessions||[])sessionSelect.add(new Option(x.name+(x.running?" ●":""),x.id));sessionSelect.value=s.activeSessionId;const x=current();if(!x)return;if(!sessionNameDirty&&document.activeElement!==sessionName)sessionName.value=x.name;fillTabs(brain,brainSelectionDirty?selectedBrainTabId:x.brainTabId);
fillTabs(worker,workerSelectionDirty?selectedWorkerTabId:x.workerTabId);
if(x.brainTabId==null&&selectedBrainTabId==null&&brain.options.length) brain.value=String(getDistinctDefault("CEREBRO"));
if(x.workerTabId==null&&selectedWorkerTabId==null&&worker.options.length) worker.value=String(getDistinctDefault("OBRERO"));if(statusNotice){statusText(statusNotice.message)}else{statusText(x.status||"IDLE")}if(!iterationsDirty&&document.activeElement!==iterations)iterations.value=x.maxIterations??10;if(!brainTimeoutDirty&&document.activeElement!==brainTimeout)brainTimeout.value=Math.round((x.brainTimeoutMs||60000)/1000);if(!workerTimeoutDirty&&document.activeElement!==workerTimeout)workerTimeout.value=Math.round((x.workerTimeoutMs||600000)/1000);if(!minTurnDelayDirty&&document.activeElement!==minTurnDelay)minTurnDelay.value=Math.round((x.minTurnDelayMs||0)/1000);const key=JSON.stringify(x.log||[])+x.id;if(key!==lastLog){lastLog=key;log.replaceChildren();for(const e of x.log||[])addLog(e.role,e.text);log.scrollTop=log.scrollHeight}const active=!!x.running;for(const e of [sessionName,brain,worker,iterations,brainTimeout,workerTimeout,minTurnDelay,deleteButton])e.disabled=active;startButton.disabled=active;applyPendingUiState()}
async function send(m){
  const action=activeUiAction||String(m?.type||"unknown");
  const type=String(m?.type||"unknown");
  emitUiDiagnostic(action,"message_send_started",type);
  let r;
  try{r=await sendMessageWithTimeout(m);}
  catch(error){emitUiDiagnostic(action,"message_transport_failed",type,error);throw error;}
  emitUiDiagnostic(action,"message_response_received",type,null,{accepted:r?.ok===true});
  if(!r?.ok){
    const error=new Error(r?.error||"BRIDGE rechazó la operación");
    error.code="BRIDGE_WORKER_REJECTED";
    emitUiDiagnostic(action,"message_rejected_by_receiver",type,error);
    throw error;
  }
  if(statusNotice&&statusNotice.kind!=="pending")statusNotice=null;
  if(r.state)render(r.state);
  return r;
}
async function refresh(){const r=await send({type:"LIST_CHATGPT_TABS"});tabs=r.tabs||[];render(r.state)}
sessionSelect.onchange=()=>void runUiAction({
  action:"select_session",label:"Cambiar sesión",messageType:"SELECT_SESSION",
  operation:async()=>{
    brainSelectionDirty=false;workerSelectionDirty=false;sessionNameDirty=false;iterationsDirty=false;brainTimeoutDirty=false;workerTimeoutDirty=false;minTurnDelayDirty=false;
    selectedBrainTabId=null;
    selectedWorkerTabId=null;
    await send({type:"SELECT_SESSION",sessionId:sessionSelect.value});
    await refresh();
  }
});
brain.onchange=()=>{selectedBrainTabId=Number(brain.value)||null;brainSelectionDirty=true};
worker.onchange=()=>{selectedWorkerTabId=Number(worker.value)||null;workerSelectionDirty=true};
sessionName.addEventListener("input",()=>{sessionNameDirty=true});
iterations.addEventListener("input",()=>{iterationsDirty=true});
brainTimeout.addEventListener("input",()=>{brainTimeoutDirty=true});
workerTimeout.addEventListener("input",()=>{workerTimeoutDirty=true});
minTurnDelay.addEventListener("input",()=>{minTurnDelayDirty=true});
document.getElementById("newSession").onclick=()=>void runUiAction({
  action:"create_session",buttonId:"newSession",label:"Crear sesión",messageType:"CREATE_SESSION",
  operation:async()=>{
    const n=prompt("Nombre de la sesión:","Cuenta "+((state?.sessions?.length||0)+1));
    if(n===null)return null;
    await send({type:"CREATE_SESSION",name:n.trim()});
    await refresh();
  }
});
deleteButton.onclick=()=>void runUiAction({
  action:"delete_session",buttonId:"deleteSession",label:"Eliminar sesión",messageType:"DELETE_SESSION",
  operation:async()=>{
    if(!confirm("¿Eliminar esta sesión?"))return null;
    await send({type:"DELETE_SESSION",sessionId:sessionSelect.value});
  }
});
document.getElementById("refresh").onclick=()=>void runUiAction({
  action:"refresh_tabs",buttonId:"refresh",label:"Actualizar pestañas",messageType:"LIST_CHATGPT_TABS",
  operation:()=>refresh()
});
async function save(){const x=current();if(!x)throw Error("No hay sesión seleccionada");if(!brain.value||!worker.value)throw Error("Selecciona CEREBRO y OBRERO");if(brain.value===worker.value)throw Error("CEREBRO y OBRERO deben ser pestañas distintas");await send({type:"SAVE_SESSION",sessionId:x.id,name:sessionName.value.trim(),brainTabId:+brain.value,workerTabId:+worker.value,maxIterations:boundedNumber(iterations,10,1,100),brainTimeoutMs:boundedNumber(brainTimeout,60,5,1800)*1000,workerTimeoutMs:boundedNumber(workerTimeout,600,5,1800)*1000,minTurnDelayMs:boundedNumber(minTurnDelay,0,0,60)*1000});brainSelectionDirty=false;workerSelectionDirty=false;sessionNameDirty=false;iterationsDirty=false;brainTimeoutDirty=false;workerTimeoutDirty=false;minTurnDelayDirty=false;const saved=current();if(saved){sessionName.value=saved.name;iterations.value=saved.maxIterations??10;brainTimeout.value=Math.round((saved.brainTimeoutMs||60000)/1000);workerTimeout.value=Math.round((saved.workerTimeoutMs||600000)/1000);minTurnDelay.value=Math.round((saved.minTurnDelayMs||0)/1000)}}
startButton.onclick=()=>void runUiAction({
  action:"start_loop",buttonId:"start",label:"Activar sesión",messageType:"START_LOOP",
  operation:async()=>{
    const x=current();
    if(!x)throw Error("No hay sesión seleccionada");
    await save();
    if(!seed.value.trim())throw Error("Escribe el mensaje inicial");
    await send({type:"START_LOOP",sessionId:x.id,brainTabId:+brain.value,workerTabId:+worker.value,seed:seed.value.trim(),maxIterations:boundedNumber(iterations,10,1,100),brainTimeoutMs:boundedNumber(brainTimeout,60,5,1800)*1000,workerTimeoutMs:boundedNumber(workerTimeout,600,5,1800)*1000,minTurnDelayMs:boundedNumber(minTurnDelay,0,0,60)*1000});
    seed.value="";
  }
});
for(const [id,type,label] of [
  ["pause","PAUSE","Pausar"],["resume","RESUME","Continuar"],
  ["stop","STOP","Detener"],["reset","RESET_SESSION","Limpiar sesión"]
]){
  document.getElementById(id).onclick=()=>void runUiAction({
    action:type.toLowerCase(),buttonId:id,label,messageType:type,
    operation:()=>send({type,sessionId:sessionSelect.value})
  });
}
async function poll(){
  if(pollInFlight)return;
  pollInFlight=true;
  try{
    const r=await sendMessageWithTimeout({type:"GET_STATE"});
    if(!r?.ok)throw new Error(r?.error||"BRIDGE rechazó la consulta de estado");
    pollFailureLogged=false;
    if(statusNotice?.kind==="communication")statusNotice=null;
    if(r.state)render(r.state);
  }catch(error){
    if(!pollFailureLogged){
      emitUiDiagnostic("state_poll","communication_failed","GET_STATE",error);
      pollFailureLogged=true;
    }
    if(!statusNotice||statusNotice.kind==="communication")
      setStatusNotice("ERROR — No se puede consultar BRIDGE. Comprueba chrome://extensions o brave://extensions y recarga la extensión.","communication");
  }finally{pollInFlight=false;}
}
async function initializeControlPanel(){
  try{await refresh();}
  catch(error){
    setStatusNotice("ERROR — No se pudo inicializar BRIDGE: "+safeErrorMessage(error),"error");
    emitUiDiagnostic("control_initialization","failed","LIST_CHATGPT_TABS",error);
  }
  if(pollTimer===null)pollTimer=setInterval(()=>void poll(),700);
  void poll();
}
void initializeControlPanel();
