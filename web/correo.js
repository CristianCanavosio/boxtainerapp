// ════════════════════════════════════════════════
// MANDAR LA NOTA POR CORREO AL CLIENTE (pedido de ventas 27/11, migración 0037)
// Presupuesto u orden de compra confirmada: se arma el mismo PDF que se descarga, se sube al depósito
// "correos" y la base lo manda con Resend (como el buzón de sugerencias). Queda registrado en el
// proyecto y como seguimiento hecho en el CRM del cliente.
// Respeta la aprobación del administrador (0033): mientras está prendida, no sale nada que él no haya aprobado.
// También el dibujo del PDF: si el cliente trajo su plano, se elige plano, croquis o los dos.
// ════════════════════════════════════════════════
const correo={dib:{},lista:{},cargado:{},id:null,enviando:false};
const MAIL_OK=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Qué dibujo va en el PDF de un proyecto guardado (lo elegido en el detalle, si no lo de la nota)
function correoDibujo(p){return correo.dib[p.id]||(NotaPedido.PDF_DIB[p.ficha?.pdfDibujo]?p.ficha.pdfDibujo:'plano');}
function correoFicha(p){return croquisDe(p)?{...p.ficha,pdfDibujo:correoDibujo(p)}:p.ficha;}
function correoSetDibujo(id,v){correo.dib[id]=v;}
function correoDibujoHTML(p){
  if(!croquisDe(p)) return '';
  const v=correoDibujo(p);
  return `<div class="fg" style="margin:8px 0 0"><label>¿Qué dibujo va en el PDF? <small>(el cliente trajo su plano)</small></label>
    <select onchange="correoSetDibujo('${esc(p.id)}',this.value)">${Object.entries(NotaPedido.PDF_DIB).map(([k,t])=>`<option value="${k}" ${v===k?'selected':''}>${esc(t)}</option>`).join('')}</select></div>`;
}

// Correo por defecto: el de la nota y, si no, el del contacto del CRM
function correoDe(p){
  const m=(p.ficha?.mail||'').trim(); if(m) return m;
  const o=typeof crm!=='undefined'?crm.ops.find(x=>x.proyecto_id===p.id&&x.mail):null;
  return o?o.mail:'';
}
// '' si se puede mandar, o el motivo (la base vuelve a controlar todo)
function correoBloqueo(p){
  if(!p||!esNota(p)) return 'No es una nota de pedido';
  if(p.ficha.sol!=='Presupuesto'&&typeof aprOCEsperando==='function'&&rol()!=='admin'){
    if(aprOCEsperando(p)) return '🛂 Esta orden de compra espera la aprobación del administrador: el correo sale cuando la apruebe';
    if(aprOCDevuelta(p)) return '↩️ El administrador devolvió esta orden de compra: corregila antes de mandarla';
    if(aprOCNecesita(p)) return '🛂 Primero enviá la orden de compra: el correo sale cuando el administrador la apruebe';
  }
  return '';
}

function correoBotonHTML(p){
  return `<button class="btn btn-sec btn-sm" onclick="correoNota('${esc(p.id)}')">✉️ Mandar por correo</button>`;
}

// Abre la ventanita para confirmar el correo y escribir un mensaje opcional
function correoNota(id){
  const p=todos[id]; if(!p) return;
  const b=correoBloqueo(p); if(b){toast(b);return;}
  correo.id=id;
  const m=crmModal('m-correo',280);
  m.querySelector('.crm-body').innerHTML=`<div class="modal-title">✉️ Mandar ${p.ficha.sol==='Presupuesto'?'el presupuesto':'la nota de pedido'} por correo</div>
    <p class="crm-ayuda" style="margin:0 0 10px">Le llega a ${esc(p.ficha.cli||p.cli||'el cliente')} con el PDF adjunto (el mismo que se descarga). Si responde, la respuesta te llega a tu correo.</p>
    <div class="fg"><label>Correo del cliente</label><input type="email" id="co-para" autocomplete="off" value="${esc(correoDe(p))}" placeholder="cliente@correo.com"></div>
    ${correoDibujoHTML(p)}
    <div class="fg" style="margin-top:8px"><label>Mensaje <small>(opcional, va arriba del correo)</small></label><textarea id="co-msg" rows="3" placeholder="Hola, como hablamos…"></textarea></div>
    <div class="flex-btns"><button class="btn btn-sec" onclick="closeOverlay('m-correo')">Cancelar</button>
      <button class="btn btn-nar" id="co-ir" onclick="correoMandar()">✉️ Mandar</button></div>`;
  openOverlay('m-correo');
}

async function correoMandar(){
  const id=correo.id, p=todos[id]; if(!p||correo.enviando) return;
  const para=(document.getElementById('co-para').value||'').trim(), msg=(document.getElementById('co-msg').value||'').trim();
  if(!MAIL_OK.test(para)){toast('⚠️ Revisá el correo del cliente');return;}
  const b=correoBloqueo(p); if(b){toast(b);return;}
  const btn=document.getElementById('co-ir'), txt=btn.textContent;
  correo.enviando=true; btn.disabled=true; btn.textContent='Armando el PDF…';
  try{
    const r=await NotaPedido.armar(correoFicha(p),()=>adjuntosPDF(id),id);
    if(!r) return;   // lo frenó la aprobación del administrador (ya avisó)
    if(r.faltaron.length&&!await confirmar('No se pudo sumar al PDF: '+r.faltaron.join(', ')+'. ¿Lo mandamos igual? (eso mandalo aparte)')) return;
    btn.textContent='Mandando…';
    const seguro=r.nombre.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\w.\-]+/g,'_').slice(-80);
    const ruta=`${id}/${Date.now()}-${seguro}`;
    const up=await sb.storage.from('correos').upload(ruta,r.blob,{contentType:'application/pdf',upsert:false});
    if(up.error){toast(/bucket|not found/i.test(up.error.message||'')?'⚠️ Falta correr la migración 0037 para mandar correos':msgError(up.error));return;}
    const sg=await sb.storage.from('correos').createSignedUrl(ruta,60*60*24*30);
    if(sg.error||!sg.data?.signedUrl){toast(msgError(sg.error||{message:'sin enlace'}));return;}
    const rp=await sb.rpc('enviar_nota_por_correo',{p_proyecto:id,p_para:para,p_ruta:ruta,p_url:sg.data.signedUrl,p_mensaje:msg||null});
    if(rp.error){toast(/enviar_nota_por_correo|schema cache/i.test(rp.error.message||'')&&rp.error.code!=='P0001'?'⚠️ Falta correr la migración 0037 para mandar correos':msgError(rp.error));return;}
    closeOverlay('m-correo');
    toast('✉️ Listo: se lo mandamos a '+para);
    if(typeof cargarCRM==='function'&&typeof puedeCRM==='function'&&puedeCRM()) cargarCRM();
    correo.cargado[id]=0; correoPintar(id);
  }catch(e){toast('⚠️ No se pudo mandar: '+(e.message||e));}
  finally{correo.enviando=false; btn.disabled=false; btn.textContent=txt;}
}

// ── correos enviados de un proyecto (en el detalle) ──
function correosHTML(p){
  setTimeout(()=>correoPintar(p.id),0);
  return `<div id="co-lista-${esc(p.id)}">${correoListaHTML(p.id)}</div>`;
}
function correoListaHTML(id){
  const l=correo.lista[id]||[]; if(!l.length) return '';
  const est=k=>k.status_code==null?'':k.status_code<300?' · ✅ salió':` · <b style="color:var(--rojo)">⚠️ no salió${k.error?': '+esc(String(k.error).slice(0,120)):''}</b>`;
  return `<div style="font-size:12px;color:var(--gris-m);margin-top:8px"><b>✉️ Enviado por correo</b>
    ${l.slice(0,5).map(k=>`<div>${esc(new Date(k.creado_en).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}))} · ${k.tipo==='oc'?'Nota de pedido':'Presupuesto'} a ${esc(k.para)} · ${esc(nombreDe(k.enviado_por))}${est(k)}</div>`).join('')}</div>`;
}
async function correoPintar(id){
  const el=document.getElementById('co-lista-'+id); if(!el) return;
  if(Date.now()-(correo.cargado[id]||0)>60000){
    correo.cargado[id]=Date.now();
    const [r,e]=await Promise.all([
      sb.from('correos_clientes').select('id,tipo,para,enviado_por,creado_en').eq('proyecto_id',id).order('creado_en',{ascending:false}).limit(5),
      sb.rpc('estado_correos_clientes',{p_proyecto:id})]);
    if(r.error){correo.lista[id]=[];return;}   // sin la 0037 no se muestra nada
    const st={}; (e.data||[]).forEach(x=>st[x.id]=x);
    correo.lista[id]=(r.data||[]).map(k=>({...k,...(st[k.id]?{status_code:st[k.id].status_code,error:st[k.id].error}:{})}));
  }
  const el2=document.getElementById('co-lista-'+id); if(el2) el2.innerHTML=correoListaHTML(id);
}
window.correoNota=correoNota;
// Quién ve el botón (la base vuelve a controlar que pueda ver el proyecto)
function puedeCorreo(p){return !!(p&&esNota(p)&&['admin','lider','ventas','lider_ventas'].includes(rol()));}
