const sessionSelect=document.getElementById("session"),sessionName=document.getElementById("sessionName"),brain=document.getElementById("brain"),worker=document.getElementById("worker"),seed=document.getElementById("seed"),iterations=document.getElementById("iterations"),brainTimeout=document.getElementById("brainTimeout"),workerTimeout=document.getElementById("workerTimeout"),minTurnDelay=document.getElementById("minTurnDelay"),status=document.getElementById("status"),log=document.getElementById("log"),startButton=document.getElementById("start"),deleteButton=document.getElementById("deleteSession");
let state=null,tabs=[],lastLog="",pollTimer=null,selectedBrainTabId=null,selectedWorkerTabId=null;
const current=()=>state?.sessions?.find(s=>s.id===state.activeSessionId)||null;
function statusText(t){status.textContent=t}
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
function updateDashboard(x){
  const metricStatus=document.getElementById("metricStatus");
  const metricStatusDetail=document.getElementById("metricStatusDetail");
  const metricIteration=document.getElementById("metricIteration");
  const metricRole=document.getElementById("metricRole");
  const metricJob=document.getElementById("metricJob");
  const metricTabs=document.getElementById("metricTabs");
  const metricTabsDetail=document.getElementById("metricTabsDetail");
  const progressBar=document.getElementById("progressBar");
  const progressTrack=document.getElementById("progressTrack");
  const brainSummary=document.getElementById("brainSummary");
  const workerSummary=document.getElementById("workerSummary");
  const statusValue=String(x.status||"IDLE");
  const tone=statusValue.startsWith("ERROR")?"error":(x.running||statusValue.includes("RUNNING")||statusValue.includes("STARTING"))?"good":(statusValue.includes("PAUSED")||statusValue.includes("LIMIT_REACHED"))?"warn":"";
  status.dataset.tone=tone;
  metricStatus.textContent=x.running?(x.paused?"PAUSADA":"EN CURSO"):statusValue.split(" — ")[0];
  metricStatusDetail.textContent=statusValue;
  const max=Math.max(1,Number(x.maxIterations)||10);
  const iteration=Math.max(0,Math.min(max,Number(x.iteration)||0));
  metricIteration.textContent=iteration+" / "+max;
  const percent=Math.round(iteration/max*100);
  progressBar.style.width=percent+"%";
  progressTrack.setAttribute("aria-valuenow",String(percent));
  metricRole.textContent=x.activeRole||(x.running?(x.paused?"PAUSA":"PREPARADO"):"—");
  metricJob.textContent=x.activeJobId?"Job "+x.activeJobId.slice(0,8):"Sin trabajo activo";
  metricTabs.textContent=String(tabs.length);
  metricTabsDetail.textContent=tabs.length===0?"No se detectaron pestañas ChatGPT":"Pestañas ChatGPT disponibles";
  const titleFor=id=>{if(id==null)return "Sin asignar";const t=tabs.find(tab=>tab.id===id);return t?(t.title||("Pestaña "+id)):"Pestaña "+id+" (no detectada)"};
  brainSummary.textContent=titleFor(x.brainTabId);
  workerSummary.textContent=titleFor(x.workerTabId);
  const diagnostic=x.diagnostic||null;
  const diagnosticTitle=document.getElementById("diagnosticTitle");
  const diagnosticReason=document.getElementById("diagnosticReason");
  const diagnosticRole=document.getElementById("diagnosticRole");
  const diagnosticTab=document.getElementById("diagnosticTab");
  const diagnosticRecovery=document.getElementById("diagnosticRecovery");
  const diagnosticTime=document.getElementById("diagnosticTime");
  const diagnosticPanel=document.getElementById("diagnosticPanel");
  if(diagnostic){
    diagnosticPanel.dataset.kind=diagnostic.category||"error";
    diagnosticTitle.textContent=diagnostic.title||"Diagnóstico de sesión";
    diagnosticReason.textContent=diagnostic.reason||"BRIDGE no guardó un motivo detallado.";
    diagnosticRole.textContent=diagnostic.role||"No identificado";
    diagnosticTab.textContent=diagnostic.tabId==null?"No identificada":titleFor(diagnostic.tabId)+" · ID "+diagnostic.tabId;
    diagnosticRecovery.textContent=diagnostic.recovery||"Revisa el historial y corrige la causa antes de volver a iniciar.";
    diagnosticTime.textContent=diagnostic.timestamp?new Date(diagnostic.timestamp).toLocaleString():"Hora no registrada";
  }else if(statusValue.startsWith("ERROR")){
    diagnosticPanel.dataset.kind="error";
    diagnosticTitle.textContent="Error registrado antes del diagnóstico detallado";
    diagnosticReason.textContent=statusValue.replace(/^ERROR\s*[—-]\s*/,"");
    diagnosticRole.textContent="No identificado";
    diagnosticTab.textContent="No identificada";
    diagnosticRecovery.textContent="Revisa el historial de actividad, confirma que ambas pestañas ChatGPT estén abiertas y vuelve a iniciar solo después de corregir la causa.";
    diagnosticTime.textContent="Hora no registrada";
  }else{
    diagnosticPanel.dataset.kind="none";
    diagnosticTitle.textContent=statusValue==="STOPPED"?"La sesión se detuvo":"Sin incidencias registradas";
    diagnosticReason.textContent=statusValue==="STOPPED"?"La sesión está detenida. En sesiones antiguas puede no estar disponible el motivo exacto.":"No hay un fallo registrado para esta sesión.";
    diagnosticRole.textContent="—";
    diagnosticTab.textContent="—";
    diagnosticRecovery.textContent=statusValue==="STOPPED"?"Revisa la última respuesta confirmada y activa una sesión nueva cuando estés listo.":"Si ocurre un problema, aquí aparecerán la causa registrada y los pasos sugeridos.";
    diagnosticTime.textContent="—";
  }
}
function render(s){if(!s)return;state=s;sessionSelect.replaceChildren();for(const x of s.sessions||[])sessionSelect.add(new Option(x.name+(x.running?" ●":""),x.id));sessionSelect.value=s.activeSessionId;const x=current();if(!x)return;sessionName.value=x.name;fillTabs(brain,x.brainTabId,selectedBrainTabId);
fillTabs(worker,x.workerTabId,selectedWorkerTabId);
if(x.brainTabId==null&&selectedBrainTabId==null&&brain.options.length) brain.value=String(getDistinctDefault("CEREBRO"));
if(x.workerTabId==null&&selectedWorkerTabId==null&&worker.options.length) worker.value=String(getDistinctDefault("OBRERO"));statusText(x.status||"IDLE");updateDashboard(x);iterations.value=x.maxIterations||10;brainTimeout.value=Math.round((x.brainTimeoutMs||60000)/1000);workerTimeout.value=Math.round((x.workerTimeoutMs||600000)/1000);minTurnDelay.value=Math.round((x.minTurnDelayMs||0)/1000);const key=JSON.stringify(x.log||[])+x.id;if(key!==lastLog){lastLog=key;log.replaceChildren();if(!(x.log||[]).length){const empty=document.createElement("div");empty.className="empty";empty.textContent="Todavía no hay actividad. Activa una sesión para ver aquí los mensajes.";log.appendChild(empty)}else{for(const e of x.log||[])addLog(e.role,e.text)}log.scrollTop=log.scrollHeight}const active=!!x.running;for(const e of [sessionName,brain,worker,iterations,brainTimeout,workerTimeout,minTurnDelay,deleteButton])e.disabled=active;startButton.disabled=active}
async function send(m){const r=await chrome.runtime.sendMessage(m);if(!r?.ok)throw Error(r?.error||"BRIDGE rechazó la operación");if(r.state)render(r.state);return r}
async function refresh(){const r=await send({type:"LIST_CHATGPT_TABS"});tabs=r.tabs||[];render(r.state)}
sessionSelect.onchange=async()=>{
  selectedBrainTabId=null;
  selectedWorkerTabId=null;
  try{await send({type:"SELECT_SESSION",sessionId:sessionSelect.value});await refresh()}catch(e){statusText("ERROR — "+e.message)}
};
brain.onchange=()=>{selectedBrainTabId=Number(brain.value)||null};
worker.onchange=()=>{selectedWorkerTabId=Number(worker.value)||null};
document.getElementById("newSession").onclick=async()=>{try{const n=prompt("Nombre de la sesión:","Cuenta "+((state?.sessions?.length||0)+1));if(n===null)return;await send({type:"CREATE_SESSION",name:n.trim()});await refresh()}catch(e){statusText("ERROR — "+e.message)}};
deleteButton.onclick=async()=>{try{if(confirm("¿Eliminar esta sesión?"))await send({type:"DELETE_SESSION",sessionId:sessionSelect.value})}catch(e){statusText("ERROR — "+e.message)}};
document.getElementById("refresh").onclick=()=>refresh().catch(e=>statusText("ERROR — "+e.message));
async function save(){const x=current();if(!x)throw Error("No hay sesión seleccionada");if(!brain.value||!worker.value)throw Error("Selecciona CEREBRO y OBRERO");if(brain.value===worker.value)throw Error("CEREBRO y OBRERO deben ser pestañas distintas");await send({type:"SAVE_SESSION",sessionId:x.id,name:sessionName.value.trim(),brainTabId:+brain.value,workerTabId:+worker.value,maxIterations:+iterations.value||10,brainTimeoutMs:(+brainTimeout.value||60)*1000,workerTimeoutMs:(+workerTimeout.value||600)*1000,minTurnDelayMs:(+minTurnDelay.value||0)*1000})}
startButton.onclick=async()=>{try{const x=current();if(!x)throw Error("No hay sesión seleccionada");await save();if(!seed.value.trim())throw Error("Escribe el mensaje inicial");await send({type:"START_LOOP",sessionId:x.id,brainTabId:+brain.value,workerTabId:+worker.value,seed:seed.value.trim(),maxIterations:+iterations.value||10,brainTimeoutMs:(+brainTimeout.value||60)*1000,workerTimeoutMs:(+workerTimeout.value||600)*1000,minTurnDelayMs:(+minTurnDelay.value||0)*1000});seed.value=""}catch(e){statusText("ERROR — "+e.message)}};
for(const id of ["pause","resume","stop","reset"])document.getElementById(id).onclick=()=>send({type:id==="pause"?"PAUSE":id==="resume"?"RESUME":id==="stop"?"STOP":"RESET_SESSION",sessionId:sessionSelect.value}).catch(e=>statusText("ERROR — "+e.message));
async function poll(){try{const r=await chrome.runtime.sendMessage({type:"GET_STATE"});if(r?.ok)render(r.state)}catch{}}
refresh().finally(()=>{pollTimer=setInterval(poll,700);poll()});
