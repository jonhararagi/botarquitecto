const status=document.getElementById("status");
const list=document.getElementById("tabs");
const refresh=document.getElementById("refresh");
const REQUIRED_IDS=["status","tabs","refresh"];
const missing=REQUIRED_IDS.filter(id=>!document.getElementById(id));
const MESSAGE_TIMEOUT_MS=8000;
let busy=false;

function diagnostic(phase,error=null,extra={}){
  const record={action:"popup_refresh",phase,messageType:"LIST_CHATGPT_TABS",...extra};
  if(error)record.errorName=String(error?.name||"Error").slice(0,80);
  console.info("[BRIDGE_UI_ACTION]",JSON.stringify(record));
}
function safeError(error){
  if(error?.code==="BRIDGE_MESSAGE_TIMEOUT")return "BRIDGE no respondió en 8 segundos. Comprueba el estado antes de volver a intentar.";
  const message=String(error?.message||"Error desconocido").replace(/[\r\n\t]+/g," ").trim();
  if(/receiving end does not exist|could not establish connection|message port closed|context invalidated/i.test(message))
    return "No hay comunicación con BRIDGE. Recarga la extensión y vuelve a abrir esta vista.";
  return message.slice(0,180)||"Error desconocido";
}
if(missing.length){
  const message="BRIDGE popup no pudo inicializarse: faltan controles ("+missing.join(", ")+").";
  if(status)status.textContent=message;
  console.error("[BRIDGE_UI_INIT]",JSON.stringify({phase:"missing_dom_elements",missingIds:missing}));
  throw new Error(message);
}
async function requestWithTimeout(){
  let timerId;
  const timeout=new Promise((_,reject)=>{
    timerId=setTimeout(()=>{
      const error=new Error("Timeout esperando respuesta de BRIDGE");
      error.code="BRIDGE_MESSAGE_TIMEOUT";
      reject(error);
    },MESSAGE_TIMEOUT_MS);
  });
  try{
    return await Promise.race([
      Promise.resolve().then(()=>chrome.runtime.sendMessage({type:"LIST_CHATGPT_TABS"})),
      timeout
    ]);
  }finally{clearTimeout(timerId);}
}
async function refreshTabs(source="manual"){
  if(busy){diagnostic("ignored_busy",null,{source});return;}
  busy=true;
  refresh.disabled=true;
  status.textContent="Consultando BRIDGE…";
  list.replaceChildren();
  diagnostic("listener_invoked",null,{source});
  diagnostic("message_send_started",null,{source});
  try{
    const response=await requestWithTimeout();
    diagnostic("message_response_received",null,{source,accepted:response?.ok===true});
    if(!response?.ok)throw new Error(response?.error||"BRIDGE rechazó la consulta");
    const tabs=response.tabs||[];
    status.textContent="Pestañas ChatGPT detectadas: "+tabs.length;
    for(const tab of tabs){
      const item=document.createElement("li");
      item.textContent="tabId="+tab.id+" — "+(tab.title||"ChatGPT");
      list.appendChild(item);
    }
    diagnostic("action_completed",null,{source,resultCount:tabs.length});
  }catch(error){
    status.textContent="ERROR — "+safeError(error);
    diagnostic("action_failed",error,{source});
  }finally{busy=false;refresh.disabled=false;}
}
refresh.addEventListener("click",()=>void refreshTabs("button_click"));
void refreshTabs("popup_initialization");
