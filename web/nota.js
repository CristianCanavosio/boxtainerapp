// Nota de pedido: asistente de carga para ventas (portado del prototipo aprobado por comercial)
(function(){
const PASOS=['Cliente y pedido','Producto','Distribución','Terminaciones','Aberturas','Instalaciones','Confirmar'];
const MED={'20 DV':[606,244,259],'40 ST':[1219,244,259],'40 HC':[1219,244,290]};
const ESP={bano:'Baño',cocina:'Cocina',habitacion:'Habitación',oficina:'Oficina'};
const UBI=['Extremo izquierdo','Centro','Extremo derecho'];
const PAREDES=['Lateral A','Lateral B','Lado puertas','Lado opuesto'];
const REV_HUM=['Símil mármol','PVC','Melamina','Cerámico'];
const REV_INT=['PVC','Durlock','Fenólico','Melamina','Solo pintura','Sin revestimiento'];
const REV_EXT=['Sin revestimiento','Megacold','Chapa prepintada negra','Chapa prepintada blanca','PVC','Siding'];
const nuevaPuerta=()=>({tipo:'',med:'',ancho:'',alto:'',pared:'',pos:'',mano:'',prot:''});
const ITEMS={bano:['Inodoro','Mingitorio','Bidet','Lavamatic','Bacha','Ducha','Mueble','Espejo'],cocina:['Bacha monocomando','Bajo mesada','Alacena','Cocina eléctrica']};
const COLORES=['Blanco','Gris claro','Gris grafito','Negro','Azul','Verde inglés','Otro'];
let paso=0, intento=false, opts={}, archivo=null, ocupado=false;
function nuevo(){return {sol:'',cli:'',tel:'',cuit:'',loc:'',maps:'',mapsOk:false,fecha:'',modelo:'',
  unidades:1,prod:'',tam:'',motor:'',corte:'',lado:'',largo:'',ancho:'',alto:'',
  espacios:[],
  pExt:'',pExtOtro:'',pExtP:false,pInt:'',pIntOtro:'',piso:'',rev:[],revAsig:{},revExt:'',pInterior:'',
  linea:'',puertas:[nuevaPuerta()],puertaP:false,ventanas:[],
  elec:{},aa:'',aaFrig:'',aaEsp:'',termo:'',termoL:'',termoTipo:'',tanque:'',tanqueL:'',
  obs:'',archivos:[],confirmado:false}}
let d=nuevo();
const raiz=()=>document.getElementById('nota');
const $=s=>raiz().querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function ops(key,lista,val,extra=''){return `<div class="ops">${lista.map(o=>`<div class="op ${val===o?'sel':''}" data-k="${key}" data-v="${esc(o)}" ${extra}>${esc(o)}</div>`).join('')}</div>`}
function multi(key,lista,vals){return `<div class="ops">${lista.map(o=>`<div class="op ${vals.includes(o)?'sel':''}" data-m="${key}" data-v="${esc(o)}">${esc(o)}</div>`).join('')}</div>`}
function confBox(key,val){return `<label class="conf"><input type="checkbox" data-c="${key}" ${val?'checked':''}> A confirmar</label>`}
function setPath(path,v){const ks=path.split('.');let o=d;ks.slice(0,-1).forEach(k=>o=o[k]);o[ks.at(-1)]=v}
function getPath(path){return path.split('.').reduce((o,k)=>o?.[k],d)}
const total=()=>d.espacios.length;
const MAX_U=200;
const unidades=()=>Math.max(1,Math.floor(Number(d.unidades))||1);
const cuenta=k=>d.espacios.filter(x=>x.tipo===k).length;
function etiqueta(x){const n=d.espacios.filter(y=>y.tipo===x.tipo);return ESP[x.tipo]+(n.length>1?' '+(n.indexOf(x)+1):'')}
const nid=()=>Math.random().toString(36).slice(2,8);
const largoTot=()=>Number(d.corte)||Number(d.largo)||0;
const esLateral=p=>p==='Lateral A'||p==='Lateral B';
const anchoPuerta=p=>Number(p.med==='Otra'?p.ancho:p.med)||90;
function revDestinos(){return d.espacios.length?d.espacios.filter(x=>!ITEMS[x.tipo]).map(x=>({k:x.id,n:etiqueta(x)})):UBI.map(u=>({k:u,n:u}))}
function revTexto(){if(!d.rev.length)return '?';if(d.rev.length===1)return d.rev[0].toLowerCase();return revDestinos().map(x=>`${(d.revAsig[x.k]||'?').toLowerCase()} en ${x.n.toLowerCase()}`).join(', ')}
function nomPared(p){return p==='Lado puertas'&&d.prod==='Contenedor cortado'&&d.lado==='Parte trasera'?'lado del corte':esLateral(p)?p:p.toLowerCase()}
function dondeTxt(o){return o.pared?nomPared(o.pared)+(esLateral(o.pared)&&o.pos?', '+o.pos.toLowerCase():''):'?'}

function errores(){
  const e=[];
  if(paso===0){if(!d.sol)e.push('Elegí el tipo de solicitud');if(!d.cli.trim())e.push('Falta el cliente');if(!d.tel.trim())e.push('Falta el teléfono');if(!d.loc.trim())e.push('Falta la dirección de entrega');else if(!d.mapsOk)e.push('Verificá la dirección en el mapa y tildá la confirmación');if(!d.fecha)e.push('Falta la fecha de entrega')}
  if(paso===1){if(!d.prod)e.push('Elegí el producto');if(!d.tam)e.push('Elegí el tamaño');
    if(d.prod==='Contenedor cortado'){const c=Number(d.corte);if(!c)e.push('Poné el largo final del corte');else if(c>=Number(d.largo))e.push(`El corte (${c} cm) tiene que ser menor que el largo del contenedor (${d.largo} cm)`);if(!d.lado)e.push('Elegí qué lado se conserva')}
    if(d.prod==='Reefer'&&!d.motor)e.push('Indicá si es con o sin motor');
    const u=Number(d.unidades);if(!Number.isInteger(u)||u<1)e.push('La cantidad de unidades tiene que ser un número entero, 1 o más');else if(u>MAX_U)e.push(`Máximo ${MAX_U} unidades por nota`)}
  if(paso===2){if(d.prod==='Módulo habitacional'&&!total())e.push('Elegí al menos un espacio');d.espacios.forEach(x=>{if(!x.ubi)e.push(`Elegí dónde va ${etiqueta(x).toLowerCase()}`);if(ITEMS[x.tipo]&&!x.rev)e.push(`Elegí el revestimiento de ${etiqueta(x).toLowerCase()}`)})}
  if(paso===3){if(!d.pExt&&!d.pExtP)e.push('Elegí la pintura exterior o marcala a confirmar');if(d.pExt==='Otro'&&!d.pExtOtro.trim()&&!d.pExtP)e.push('Escribí el color o código exterior');if(d.pInt==='Otro'&&!d.pIntOtro.trim())e.push('Escribí el color o código interior');if(!d.revExt)e.push('Elegí el revestimiento exterior');if(!d.piso)e.push('Elegí el piso');if(!d.rev.length)e.push('Elegí el revestimiento interior');if(d.rev.length>1)revDestinos().forEach(x=>{if(!d.rev.includes(d.revAsig[x.k]))e.push(`Elegí qué revestimiento va en ${x.n.toLowerCase()}`)});if(total()>1&&!d.pInterior)e.push('Elegí las puertas interiores')}
  if(paso===4){if(!d.linea)e.push('Elegí la línea de aberturas');
    if(!d.puertaP)d.puertas.forEach((p,i)=>{const n=d.puertas.length>1?' '+(i+1):'';if(!p.tipo||!p.pared||!p.mano)e.push(`Completá tipo, pared y apertura de la puerta${n} (o marcá las puertas a confirmar)`);else if(esLateral(p.pared)&&!p.pos)e.push(`Elegí en qué parte del ${p.pared.toLowerCase()} va la puerta${n}`);if(p.med==='Otra'&&(!p.ancho||!p.alto))e.push(`Poné ancho y alto de la puerta${n}`)});
    d.ventanas.forEach((v,i)=>{if(!v.esp||!v.ancho||!v.alto||!v.tipo||!v.pared)e.push(`Completá la ventana ${i+1}`);else if(esLateral(v.pared)&&!v.pos)e.push(`Elegí en qué parte del ${v.pared.toLowerCase()} va la ventana ${i+1}`)});
    const L=largoTot(),A=Number(d.ancho)||244;
    PAREDES.forEach(pa=>{const suma=d.ventanas.filter(v=>v.pared===pa).reduce((s,v)=>s+(Number(v.ancho)||0),0)+d.puertas.filter(p=>p.pared===pa).reduce((s,p)=>s+anchoPuerta(p),0);const max=esLateral(pa)?L-60:A-40;
      if(L&&suma>max)e.push(`Las aberturas del ${nomPared(pa)} suman ${suma} cm y no entran en ${esLateral(pa)?L:A} cm de pared`)})}
  if(paso===5){if(!d.aa)e.push('Indicá aire acondicionado');if(!d.termo)e.push('Indicá termotanque');if(!d.tanque)e.push('Indicá tanque de agua');if(d.termo==='Sí'&&!d.termoL)e.push('Poné los litros del termotanque');if(d.tanque==='Sí'&&!d.tanqueL)e.push('Poné los litros del tanque')}
  if(paso===6){if(!d.confirmado)e.push('Marcá que el cliente revisó el pedido')}
  return e;
}
function pendientes(){const p=[];if(d.pExtP)p.push('Pintura exterior');if(d.puertaP)p.push('Puertas exteriores');return p}

function render(){
  $('#np-prog').innerHTML=PASOS.map((_,i)=>`<span class="${i<=paso?'on':''}"></span>`).join('');
  $('#np-h-sub').textContent=`Paso ${paso+1} de 7 · ${PASOS[paso]}`;
  $('#np-b-atras').textContent=paso?'← Atrás':'Cancelar';
  $('#np-b-sig').textContent=paso===6?(opts.enviar?'Enviar a arquitectura ✓':'Guardar nota ✓'):'Siguiente →';
  const errs=intento?errores():[];
  const errHTML=errs.length?`<div class="card" style="border-color:var(--err)">${errs.map(x=>`<div class="err">⚠️ ${esc(x)}</div>`).join('')}</div>`:'';
  let h='';
  if(paso===0){
    h=`<div class="paso-t">Cliente y pedido</div><div class="paso-s">El vendedor se completa solo con tu usuario.</div>
    <div class="card"><div class="lbl">Atajo: empezar desde un modelo <small>opcional</small></div><div class="modelos">
      <div class="modelo ${d.modelo==='oficina'?'sel':''}" data-modelo="oficina"><b>Oficina</b></div>
      <div class="modelo ${d.modelo==='vivienda'?'sel':''}" data-modelo="vivienda"><b>Vivienda</b></div>
      <div class="modelo ${d.modelo==='sanitario'?'sel':''}" data-modelo="sanitario"><b>Sanitario</b></div>
      <div class="modelo ${d.modelo==='otro'?'sel':''}" data-modelo="otro"><b>Otro</b></div></div></div>
    <div class="card"><div class="lbl">Tipo de solicitud</div>${ops('sol',['Presupuesto','Orden de compra confirmada'],d.sol)}</div>
    <div class="card"><div class="lbl">Cliente</div><input type="text" data-i="cli" placeholder="Nombre o razón social *" value="${esc(d.cli)}">
      <div class="fila"><input type="tel" data-i="tel" placeholder="Teléfono *" value="${esc(d.tel)}"></div>
      <div class="fila"><input type="text" data-i="cuit" placeholder="CUIT (opcional)" value="${esc(d.cuit)}"></div></div>
    <div class="card"><div class="lbl">Entrega</div><input type="text" data-i="loc" id="np-loc" placeholder="Calle, número, localidad, provincia *" value="${esc(d.loc)}">
      <a class="maps" id="np-maps-a" href="${mapsUrl()}" target="_blank" rel="noopener">📍 Ver en Google Maps</a>
      <div class="fila"><input type="text" data-i="maps" placeholder="Pegá el enlace del punto exacto (para logística)" value="${esc(d.maps)}"></div>
      <div class="fila"><label class="chk"><input type="checkbox" data-c="mapsOk" ${d.mapsOk?'checked':''}> Verifiqué en el mapa que la dirección es correcta</label></div>
      <div class="fila"><div><div class="lbl" style="margin:4px 0">Fecha comprometida</div><input type="date" data-i="fecha" value="${esc(d.fecha)}"></div></div></div>`;
  }
  if(paso===1){
    h=`<div class="paso-t">Producto</div><div class="paso-s">Elegí el tipo y el tamaño: las medidas se completan solas.</div>
    <div class="card"><div class="lbl">¿Qué se fabrica?</div>${ops('prod',['Módulo habitacional','Contenedor cortado','Reefer'],d.prod)}</div>
    <div class="card"><div class="lbl">Tamaño de contenedor</div>${ops('tam',['20 DV','40 ST','40 HC'],d.tam)}
      ${d.tam?`<div class="auto">📏 Medidas exteriores: <b>${d.largo} × ${d.ancho} × ${d.alto} cm</b> (largo × ancho × alto)</div>`:''}</div>
    <div class="card"><div class="lbl">¿Cuántas unidades iguales? <small>si el cliente lleva varias idénticas, cargala una sola vez</small></div>
      <div class="cnt"><button data-um="1" aria-label="Una menos">−</button><input type="number" inputmode="numeric" min="1" max="${MAX_U}" data-i="unidades" value="${esc(d.unidades)}" style="width:80px;text-align:center;font-weight:800"><button data-up="1" aria-label="Una más">+</button></div>
      ${unidades()>1?`<div class="auto">📦 Se fabrican <b>${unidades()} unidades iguales</b>. Todo lo que cargues en los pasos siguientes es para <b>cada una</b>; materiales y costos se multiplican solos.</div>`:''}</div>
    ${d.prod==='Reefer'?`<div class="card"><div class="lbl">Motor</div>${ops('motor',['Con motor','Sin motor'],d.motor)}</div>`:''}
    ${d.prod==='Contenedor cortado'?`<div class="card"><div class="lbl">Corte</div>
      <div class="unidad"><input type="number" inputmode="numeric" data-i="corte" placeholder="Largo final" value="${esc(d.corte)}"><b>cm</b></div>
      <div class="lbl" style="margin-top:12px">¿Qué parte se conserva?</div>${ops('lado',['Puertas originales','Parte trasera'],d.lado)}</div>`:''}`;
  }
  if(paso===2){
    h=`<div class="paso-t">Distribución</div><div class="paso-s">Cada espacio se personaliza por separado. El dibujo muestra dónde va quedando cada uno.</div><div class="card">${planoSVG()}</div><div class="card">
    ${Object.keys(ESP).map(k=>`<div class="esp"><div class="esp-h"><b>${ESP[k]}</b><div class="cnt"><button data-menos="${k}">−</button><span>${cuenta(k)}</span><button data-mas="${k}">+</button></div></div>
      ${d.espacios.filter(x=>x.tipo===k).map(x=>`<div class="sub"><div class="lbl">${esc(etiqueta(x))}: ¿dónde va?</div>${ops('ubi.'+x.id,UBI,x.ubi||'')}
      ${ITEMS[k]?`<div class="lbl" style="margin-top:10px">¿Qué lleva ${esc(etiqueta(x).toLowerCase())}? <small>tocá todo lo que aplique</small></div>${multi('it.'+x.id,ITEMS[k],x.items)}<div class="lbl" style="margin-top:10px">Revestimiento de paredes</div>${ops('rh.'+x.id,REV_HUM,x.rev||'')}`:''}</div>`).join('')}</div>`).join('')}
    </div><div class="card"><div class="lbl">Croquis o plano del cliente <small>recomendado</small></div><input type="file" accept="image/*,application/pdf" data-f="1">${archivo?`<div class="auto">📎 ${esc(archivo.name)}: se sube al guardar</div>`:''}<div class="aviso" style="text-align:left">Una foto de un dibujo a mano alcanza.</div></div>`;
  }
  if(paso===3){
    h=`<div class="paso-t">Terminaciones</div><div class="paso-s">&nbsp;</div>
    <div class="card ${d.pExtP?'pend':''}"><div class="lbl">Pintura exterior ${confBox('pExtP',d.pExtP)}</div>${ops('pExt',COLORES,d.pExt)}
      ${d.pExt==='Otro'?`<div class="fila"><input type="text" data-i="pExtOtro" placeholder="Color o código (ej: RAL 5010)" value="${esc(d.pExtOtro)}"></div>`:''}</div>
    <div class="card"><div class="lbl">Revestimiento exterior</div>${ops('revExt',REV_EXT,d.revExt)}</div>
    <div class="card"><div class="lbl">Pintura interior</div>${ops('pInt',['Blanco','Gris claro','Sin pintura','Otro'],d.pInt)}
      ${d.pInt==='Otro'?`<div class="fila"><input type="text" data-i="pIntOtro" placeholder="Color o código (ej: RAL 9002)" value="${esc(d.pIntOtro)}"></div>`:''}</div>
    <div class="card"><div class="lbl">Piso</div>${ops('piso',['Original','Original epoxy alto tránsito','Original laqueado','Flotante madera','Flotante PVC','Goma','Vinílico'],d.piso)}</div>
    <div class="card"><div class="lbl">Revestimiento interior <small>podés elegir más de uno</small></div>${d.espacios.some(x=>ITEMS[x.tipo])?'<div class="aviso" style="text-align:left;margin:-4px 0 8px">Baños y cocina ya tienen su revestimiento elegido en Distribución.</div>':''}${multi('rev',REV_INT,d.rev)}
      ${d.rev.length>1?`<div class="auto" style="margin-top:12px"><b>Elegiste ${d.rev.length} revestimientos.</b> Indicá cuál va en cada ${d.espacios.length?'espacio':'parte del contenedor'}:</div>${revDestinos().map(x=>`<div class="sub"><div class="lbl">${esc(x.n)}</div>${ops('ra.'+x.k,d.rev,d.revAsig[x.k]||'')}</div>`).join('')}`:''}</div>
    ${total()>1?`<div class="card"><div class="lbl">Puertas interiores</div>${ops('pInterior',['Aluminio','Chapa contenedor','Madera'],d.pInterior)}</div>`:''}`;
  }
  if(paso===4){
    const espOps=d.espacios.map(etiqueta);
    h=`<div class="paso-t">Aberturas</div><div class="paso-s">Las puertas son lo que más consultas genera en obra: pared, ubicación y apertura son obligatorias. El dibujo se actualiza con cada abertura.</div>
    <div class="card"><div class="lbl">Línea de aberturas</div>${ops('linea',['Herrero','Módena','DVH'],d.linea)}</div>
    <div class="card">${abertSVG()}</div>
    <div class="card ${d.puertaP?'pend':''}"><div class="lbl">Puertas exteriores <small>${d.puertas.length} cargada${d.puertas.length>1?'s':''}</small> ${confBox('puertaP',d.puertaP)}</div>
      ${d.puertas.map((p,i)=>`<div class="abert"><div class="abert-h">Puerta ${i+1} <span style="color:var(--nar)">(P${i+1})</span>${d.puertas.length>1?`<button class="x" data-quitarp="${i}">Quitar</button>`:''}</div>
      <div class="lbl" style="font-weight:600">Tipo</div>${ops('pu.'+i+'.tipo',['De abrir','Corrediza','Original del contenedor'],p.tipo)}
      <div class="lbl" style="font-weight:600;margin-top:10px">Medida (ancho)</div>${ops('pu.'+i+'.med',['80','90','Otra'],p.med)}
      ${p.med==='Otra'?`<div class="fila"><div class="unidad"><input type="number" data-pui="${i}.ancho" placeholder="Ancho" value="${esc(p.ancho)}"><b>cm</b></div><div class="unidad"><input type="number" data-pui="${i}.alto" placeholder="Alto" value="${esc(p.alto)}"><b>cm</b></div></div>`:''}
      <div class="lbl" style="font-weight:600;margin-top:10px">Pared <small>mirá el dibujo</small></div>${ops('pu.'+i+'.pared',PAREDES,p.pared)}
      ${esLateral(p.pared)?`<div class="lbl" style="font-weight:600;margin-top:10px">¿En qué parte del ${p.pared.toLowerCase()}?</div>${ops('pu.'+i+'.pos',UBI,p.pos)}`:''}
      <div class="lbl" style="font-weight:600;margin-top:10px">Apertura</div>${ops('pu.'+i+'.mano',['Hacia afuera, bisagra izquierda','Hacia afuera, bisagra derecha','Hacia adentro, bisagra izquierda','Hacia adentro, bisagra derecha'],p.mano)}
      <div class="lbl" style="font-weight:600;margin-top:10px">Protección</div>${ops('pu.'+i+'.prot',['Reja','Postigón','Sin protección'],p.prot)}</div>`).join('')}
      <button class="add" id="np-add-p">+ Agregar puerta</button></div>
    <div class="card"><div class="lbl">Ventanas <small>${d.ventanas.length} cargadas</small></div>
      ${d.ventanas.map((v,i)=>`<div class="abert"><div class="abert-h">Ventana ${i+1} <span style="color:var(--azul)">(V${i+1})</span><button class="x" data-quitar="${i}">Quitar</button></div>
        <div class="lbl" style="font-weight:600">Espacio</div>${ops('v.'+i+'.esp',espOps.length?espOps:['General'],v.esp)}
        <div class="lbl" style="font-weight:600;margin-top:8px">Medida</div>${ops('v.'+i+'.med',['100 × 100','100 × 60','60 × 40 (baño)','Otra'],v.med)}
        ${v.med==='Otra'?`<div class="fila"><div class="unidad"><input type="number" data-vi="${i}.ancho" placeholder="Ancho" value="${esc(v.ancho)}"><b>cm</b></div><div class="unidad"><input type="number" data-vi="${i}.alto" placeholder="Alto" value="${esc(v.alto)}"><b>cm</b></div></div>`:''}
        <div class="lbl" style="font-weight:600;margin-top:8px">Tipo</div>${ops('v.'+i+'.tipo',['Corrediza','De abrir','Ventiluz'],v.tipo)}
        <div class="lbl" style="font-weight:600;margin-top:8px">Pared <small>mirá el dibujo</small></div>${ops('v.'+i+'.pared',PAREDES,v.pared)}
        ${esLateral(v.pared)?`<div class="lbl" style="font-weight:600;margin-top:8px">¿En qué parte del ${v.pared.toLowerCase()}?</div>${ops('v.'+i+'.pos',UBI,v.pos)}`:''}
        <div class="lbl" style="font-weight:600;margin-top:8px">Protección</div>${ops('v.'+i+'.prot',['Reja','Mosquitero','Sin protección'],v.prot)}</div>`).join('')}
      <button class="add" id="np-add-v">+ Agregar ventana</button></div>`;
  }
  if(paso===5){
    const esps=d.espacios.map(etiqueta);if(!esps.length)esps.push('General');Object.keys(d.elec).forEach(k=>{if(!esps.includes(k))delete d.elec[k]});
    h=`<div class="paso-t">Instalaciones</div><div class="paso-s">Tablero y disyuntor van incluidos.</div>
    <div class="card"><div class="lbl">Electricidad por espacio</div>${esps.map(e=>{const x=d.elec[e]||(d.elec[e]={tomas:2,luces:1,tipo:'Plafón',luz:'Fría'});return `<div class="esp"><div class="esp-h"><b>${esc(e)}</b></div>
      <div class="fila"><div><div class="lbl" style="font-weight:600">Tomas</div><div class="cnt"><button data-em="${esc(e)}|tomas">−</button><span>${x.tomas}</span><button data-ep="${esc(e)}|tomas">+</button></div></div>
      <div><div class="lbl" style="font-weight:600">Luces</div><div class="cnt"><button data-em="${esc(e)}|luces">−</button><span>${x.luces}</span><button data-ep="${esc(e)}|luces">+</button></div></div></div>
      <div class="fila">${ops('elec.'+e+'.tipo',['Plafón','Tubo LED'],x.tipo)}</div><div class="fila">${ops('elec.'+e+'.luz',['Fría','Cálida'],x.luz)}</div></div>`}).join('')}</div>
    <div class="card"><div class="lbl">Aire acondicionado</div>${ops('aa',['No','Solo pre-instalación','Sí, con equipo'],d.aa)}
      ${d.aa==='Sí, con equipo'?`<div class="fila">${ops('aaFrig',['2.250 fg','3.000 fg','4.500 fg'],d.aaFrig)}</div>`:''}</div>
    <div class="card"><div class="lbl">Termotanque</div>${ops('termo',['No','Sí'],d.termo)}
      ${d.termo==='Sí'?`<div class="fila"><div class="unidad"><input type="number" data-i="termoL" placeholder="Capacidad" value="${esc(d.termoL)}"><b>litros</b></div></div><div class="fila">${ops('termoTipo',['Eléctrico','Gas'],d.termoTipo)}</div>`:''}</div>
    <div class="card"><div class="lbl">Tanque de agua</div>${ops('tanque',['No','Sí'],d.tanque)}
      ${d.tanque==='Sí'?`<div class="fila"><div class="unidad"><input type="number" data-i="tanqueL" placeholder="Capacidad" value="${esc(d.tanqueL)}"><b>litros</b></div></div>`:''}</div>`;
  }
  if(paso===6){
    const pend=pendientes();
    h=`<div class="paso-t">Revisá con el cliente</div><div class="paso-s">Así lo va a leer producción.</div>
    <div class="card res">
      ${resumenCuerpo()}
      ${pend.length?`<p style="margin-top:10px"><span class="tag">A confirmar: ${esc(pend.join(', '))}</span><br><small style="color:var(--tx2)">Se puede enviar a arquitectura, pero no pasa a producción hasta completarlo.</small></p>`:''}
    </div>
    <div class="card"><div class="lbl">Observaciones <small>opcional</small></div><textarea data-i="obs" placeholder="Algo que producción tenga que saber">${esc(d.obs)}</textarea></div>
    <div class="card"><div class="lbl">Enviar al cliente para que apruebe</div>
      <button class="add" id="np-b-pdf" style="border-style:solid">📄 Descargar PDF del resumen</button>
      <div class="aviso" style="text-align:left">Incluye todo el pedido y los dos dibujos. Mandalo por WhatsApp y, cuando el cliente responda que está bien, tildá la confirmación de abajo.</div></div>
    <div class="card"><label class="chk"><input type="checkbox" id="np-confirmado" ${d.confirmado?'checked':''}> El cliente revisó y confirmó este pedido</label></div>`;
  }
  $('#np-app').innerHTML=(opts.aviso?`<div class="card pend" style="font-size:13px">${opts.aviso}</div>`:'')+errHTML+h;
}
function resumenCuerpo(){
  const espTxt=d.espacios.map(x=>`${etiqueta(x)} (${(x.ubi||'?').toLowerCase()})${x.items&&x.items.length?' con '+x.items.join(', ').toLowerCase():''}${x.rev?', revestimiento '+x.rev.toLowerCase():''}`).join('; ')||'sin divisiones';
  return `      <h4>Pedido</h4><p><b>${esc(d.sol||'?')}</b> para <b>${esc(d.cli||'?')}</b>, entrega en ${esc(d.loc||'?')}${d.maps?' (<a href="'+esc(d.maps)+'" target="_blank" rel="noopener">ubicación</a>)':''} el ${esc(d.fecha?d.fecha.split('-').reverse().join('/'):'?')}.</p>
      <h4>Producto</h4><p>${unidades()>1?`<b>${unidades()} unidades iguales</b>, cada una: `:''}${esc(d.prod||'?')} ${esc(d.tam)}${d.prod==='Contenedor cortado'?`, cortado a ${esc(d.corte)} cm conservando ${esc(d.lado.toLowerCase())}`:''}${d.motor?', '+esc(d.motor.toLowerCase()):''}. Medidas exteriores ${esc(d.largo)} × ${esc(d.ancho)} × ${esc(d.alto)} cm.</p>
      <h4>Distribución</h4><p>${esc(espTxt)}.</p>
      <h4>Terminaciones</h4><p>Pintura exterior ${d.pExtP?'<span class="tag">a confirmar</span>':esc((d.pExt==='Otro'?d.pExtOtro:d.pExt)||'?')}, revestimiento exterior ${esc((d.revExt||'?').toLowerCase())}, pintura interior ${esc((d.pInt==='Otro'?d.pIntOtro:d.pInt)||'—')}. Piso ${esc(d.piso.toLowerCase()||'?')}, revestimiento interior ${esc(revTexto())}.</p>
      <h4>Aberturas</h4><p>Línea ${esc(d.linea||'?')}. ${d.puertaP?'Puertas exteriores <span class="tag">a confirmar</span>.':d.puertas.map((p,i)=>`Puerta ${i+1} (P${i+1}): ${esc(p.tipo.toLowerCase())} de ${p.med==='Otra'?esc(p.ancho)+' × '+esc(p.alto):esc(p.med||'?')} cm en ${esc(dondeTxt(p))}, ${esc(p.mano.toLowerCase())}${p.prot?', '+esc(p.prot.toLowerCase()):''}.`).join(' ')}
        ${d.ventanas.length?d.ventanas.map((v,i)=>` Ventana ${i+1} (V${i+1}): ${esc(v.esp)}, ${esc(v.ancho)} × ${esc(v.alto)} cm en ${esc(dondeTxt(v))}, ${esc([(v.tipo||''),(v.prot||'')].filter(Boolean).join(', ').toLowerCase())}.`).join(''):' Sin ventanas.'}</p>
      <h4>Instalaciones</h4><p>${Object.entries(d.elec).map(([e,x])=>`${esc(e)}: ${x.tomas} tomas, ${x.luces} luces ${esc(x.tipo.toLowerCase())} ${esc(x.luz.toLowerCase())}`).join(' · ')||'—'}. Aire: ${esc(d.aa||'?')}${d.aaFrig?' '+esc(d.aaFrig):''}. Termotanque: ${esc(d.termo||'?')}${d.termoL?' '+esc(d.termoL)+' l '+esc(d.termoTipo.toLowerCase()):''}. Tanque: ${esc(d.tanque||'?')}${d.tanqueL?' '+esc(d.tanqueL)+' l':''}.</p>`;
}
function planoSVG(){
  const X0=24,X1=336,Y0=46,Y1=118,w=(X1-X0)/3;
  const zonas=UBI.map((u,i)=>({u,x:X0+i*w,items:d.espacios.filter(e=>e.ubi===u).map(etiqueta)}));
  const linea='var(--tx2)';
  const puertas=d.prod==='Contenedor cortado'&&d.lado==='Parte trasera'?false:true;
  return `<div class="lbl">Ubicación de los espacios <small>vista desde arriba</small></div>
  <svg viewBox="0 0 360 176" width="100%" role="img" aria-label="Contenedor visto desde arriba con lado puertas a la izquierda" style="display:block;font-family:inherit">
    <text x="180" y="18" text-anchor="middle" font-size="11" fill="var(--tx2)">${d.tam?esc(d.tam)+' · ':''}${d.largo?esc(d.corte||d.largo)+' cm de largo':'contenedor'}</text>
    ${zonas.map((z,i)=>`<rect x="${z.x}" y="${Y0}" width="${w}" height="${Y1-Y0}" fill="${z.items.length?'var(--nar-l)':'none'}"/>`).join('')}
    <rect x="${X0}" y="${Y0}" width="${X1-X0}" height="${Y1-Y0}" fill="none" stroke="${linea}" stroke-width="2" rx="2"/>
    <line x1="${X0+w}" y1="${Y0}" x2="${X0+w}" y2="${Y1}" stroke="${linea}" stroke-dasharray="4 4"/>
    <line x1="${X0+2*w}" y1="${Y0}" x2="${X0+2*w}" y2="${Y1}" stroke="${linea}" stroke-dasharray="4 4"/>
    ${puertas?`<rect x="${X0-6}" y="${Y0+4}" width="6" height="${(Y1-Y0)/2-6}" fill="var(--nar)"/><rect x="${X0-6}" y="${(Y0+Y1)/2+2}" width="6" height="${(Y1-Y0)/2-6}" fill="var(--nar)"/>
    <text x="${X0-2}" y="${Y0-8}" font-size="11" font-weight="700" fill="var(--nar)">🚪 PUERTAS</text>`:''}
    ${zonas.map(z=>z.items.slice(0,3).map((t,j)=>`<text x="${z.x+w/2}" y="${Y0+22+j*15}" text-anchor="middle" font-size="11.5" font-weight="700" fill="var(--tx)">${esc(t)}</text>`).join('')+(z.items.length>3?`<text x="${z.x+w/2}" y="${Y0+67}" text-anchor="middle" font-size="10.5" fill="var(--tx2)">+${z.items.length-3} más</text>`:'')).join('')}
    <text x="${X0+w/2}" y="${Y1+20}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--tx)">Extremo izquierdo</text>
    <text x="${X0+w/2}" y="${Y1+35}" text-anchor="middle" font-size="10.5" fill="var(--tx2)">${puertas?'lado puertas':'lado del corte'}</text>
    <text x="${X0+1.5*w}" y="${Y1+20}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--tx)">Centro</text>
    <text x="${X0+2.5*w}" y="${Y1+20}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--tx)">Extremo derecho</text>
    <text x="${X0+2.5*w}" y="${Y1+35}" text-anchor="middle" font-size="10.5" fill="var(--tx2)">lado opuesto</text>
  </svg>`;
}
function abertSVG(){
  const X0=44,X1=316,Y0=58,Y1=128,w=(X1-X0)/3,L=largoTot()||606,A=Number(d.ancho)||244,esc2=(X1-X0)/L,ln='var(--tx2)';
  const cortado=d.prod==='Contenedor cortado'&&d.lado==='Parte trasera';
  const todas=[...d.puertas.map((p,i)=>({...p,cod:'P'+(i+1),col:'var(--nar)',an:anchoPuerta(p)})),...d.ventanas.map((v,i)=>({...v,cod:'V'+(i+1),col:'var(--azul)',an:Number(v.ancho)||100}))].filter(o=>o.pared&&(!esLateral(o.pared)||o.pos));
  const grupos={};todas.forEach(o=>{const g=o.pared+'|'+(esLateral(o.pared)?o.pos:'');(grupos[g]=grupos[g]||[]).push(o)});
  let marcas='';
  Object.entries(grupos).forEach(([g,arr])=>{const [pa,pos]=g.split('|');arr.forEach((o,j)=>{const f=(j+1)/(arr.length+1);
    if(esLateral(pa)){const zi=UBI.indexOf(pos);const cx=X0+zi*w+w*f;const lw=Math.max(14,Math.min(w/arr.length-4,o.an*esc2));const y=pa==='Lateral A'?Y0:Y1;
      marcas+=`<rect x="${cx-lw/2}" y="${y-4}" width="${lw}" height="8" rx="2" fill="${o.col}"/><text x="${cx}" y="${pa==='Lateral A'?y-9:y+18}" text-anchor="middle" font-size="11" font-weight="700" fill="${o.col}">${o.cod}</text>`}
    else{const cy=Y0+(Y1-Y0)*f;const lh=Math.max(12,Math.min((Y1-Y0)/arr.length-4,o.an*(Y1-Y0)/A));const x=pa==='Lado puertas'?X0:X1;
      marcas+=`<rect x="${x-4}" y="${cy-lh/2}" width="8" height="${lh}" rx="2" fill="${o.col}"/><text x="${pa==='Lado puertas'?x-7:x+7}" y="${cy+4}" text-anchor="${pa==='Lado puertas'?'end':'start'}" font-size="11" font-weight="700" fill="${o.col}">${o.cod}</text>`}})});
  const zonas=UBI.map((u,i)=>d.espacios.filter(e=>e.ubi===u).map(etiqueta));
  return `<div class="lbl">Dónde va cada abertura <small>vista desde arriba</small></div>
  <svg viewBox="0 0 360 196" width="100%" role="img" aria-label="Contenedor visto desde arriba con sus cuatro paredes y las aberturas cargadas" style="display:block;font-family:inherit">
    <text x="180" y="22" text-anchor="middle" font-size="12" font-weight="700" fill="var(--tx)">Lateral A</text>
    <rect x="${X0}" y="${Y0}" width="${X1-X0}" height="${Y1-Y0}" fill="none" stroke="${ln}" stroke-width="2" rx="2"/>
    <line x1="${X0+w}" y1="${Y0}" x2="${X0+w}" y2="${Y1}" stroke="${ln}" stroke-dasharray="3 5" opacity=".6"/><line x1="${X0+2*w}" y1="${Y0}" x2="${X0+2*w}" y2="${Y1}" stroke="${ln}" stroke-dasharray="3 5" opacity=".6"/>
    ${zonas.map((z,i)=>z.slice(0,2).map((t,j)=>`<text x="${X0+i*w+w/2}" y="${(Y0+Y1)/2+(z.length>1?j*14-3:4)}" text-anchor="middle" font-size="10.5" fill="var(--tx2)">${esc(t)}</text>`).join('')+(z.length>2?`<text x="${X0+i*w+w/2}" y="${(Y0+Y1)/2+25}" text-anchor="middle" font-size="9.5" fill="var(--tx2)">+${z.length-2}</text>`:'')).join('')}
    ${marcas}
    <text x="16" y="${(Y0+Y1)/2}" transform="rotate(-90 16 ${(Y0+Y1)/2})" text-anchor="middle" font-size="11" font-weight="700" fill="var(--nar)">${cortado?'Lado del corte':'Lado puertas'}</text>
    <text x="344" y="${(Y0+Y1)/2}" transform="rotate(90 344 ${(Y0+Y1)/2})" text-anchor="middle" font-size="11" font-weight="700" fill="var(--tx)">Lado opuesto</text>
    <text x="180" y="${Y1+40}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--tx)">Lateral B</text>
    <text x="${X0+w/2}" y="${Y1+58}" text-anchor="middle" font-size="9.5" fill="var(--tx2)">extremo izq.</text><text x="${X0+1.5*w}" y="${Y1+58}" text-anchor="middle" font-size="9.5" fill="var(--tx2)">centro</text><text x="${X0+2.5*w}" y="${Y1+58}" text-anchor="middle" font-size="9.5" fill="var(--tx2)">extremo der.</text>
  </svg>
  <div class="aviso" style="text-align:left;margin-top:4px"><b style="color:var(--nar)">P</b> puertas · <b style="color:var(--azul)">V</b> ventanas. Lateral A es el que queda a la izquierda parado en el lado puertas mirando hacia adentro.</div>`;
}
const COL={'--nar':'#E8650A','--nar-l':'#FDF0E6','--tx':'#1E2330','--tx2':'#5E6675','--azul':'#2563C9','--azul-l':'#E6EEFB','--warn':'#C98A00','--warn-l':'#FFF6DB','--borde':'#DDE1E7'};
const sinVars=t=>t.replace(/var\((--[a-z0-9-]+)\)/g,(m,k)=>COL[k]||'#1E2330');
function cargarJS(src){return new Promise((ok,mal)=>{if(document.querySelector(`script[src="${src}"]`)){ok();return}const sc=document.createElement('script');sc.src=src;sc.onload=ok;sc.onerror=()=>mal(new Error('no cargó '+src));document.head.appendChild(sc)})}
async function generarPDF(){
  await cargarJS('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  await cargarJS('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  const hoy=new Date().toLocaleDateString('es-AR');const pend=pendientes();
  const box=document.createElement('div');
  box.style.cssText='position:fixed;left:-10000px;top:0;width:720px;background:#fff;color:#1E2330;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.45';
  const blq=(html,css='')=>`<div class="pb" style="padding:0 32px;background:#fff;${css}">${html}</div>`;
  const pl=d.espacios.length||d.prod==='Módulo habitacional'?planoSVG():'';
  box.innerHTML=[
    blq(`<div style="background:#E8650A;color:#fff;padding:18px 20px;border-radius:0 0 10px 10px"><div style="font-size:20px;font-weight:800">Nota de pedido</div><div style="font-size:13px;opacity:.9">${esc(d.sol||'Pedido')}${unidades()>1?' · '+unidades()+' unidades iguales':''} · emitida el ${esc(hoy)}</div></div>`,'padding-top:0'),
    ...sinVars(resumenCuerpo()).split('<h4>').filter(x=>x.trim()).map(x=>blq('<h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5E6675;margin:14px 0 4px">'+x.replace('</h4>','</h4><div>').replace(/<p>/g,'<p style="margin:0 0 6px">')+'</div>')),
    pend.length?blq(`<p style="margin-top:10px;color:#C98A00;font-weight:700">A confirmar: ${esc(pend.join(', '))}</p>`):'',
    d.obs.trim()?blq(`<h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5E6675;margin:14px 0 4px">Observaciones</h4><p>${esc(d.obs)}</p>`):'',
    pl?blq(`<div style="border:1px solid #DDE1E7;border-radius:10px;padding:12px;margin-top:14px">${sinVars(pl)}</div>`):'',
    blq(`<div style="border:1px solid #DDE1E7;border-radius:10px;padding:12px;margin-top:14px">${sinVars(abertSVG())}</div>`),
    blq(`<div style="margin-top:28px;padding-top:14px;border-top:1px solid #DDE1E7;font-size:13px;color:#5E6675">Revisá que todo esté correcto. Si estás de acuerdo, respondé <b style="color:#1E2330">"Apruebo"</b> por WhatsApp o firmá abajo.</div>
      <div style="display:flex;gap:24px;margin-top:40px;padding-bottom:24px">${['Firma del cliente','Aclaración','Fecha'].map(t=>`<div style="flex:1;border-top:1px solid #1E2330;padding-top:4px;font-size:12px;color:#5E6675">${t}</div>`).join('')}</div>`)
  ].join('');
  for(const sv of [...box.querySelectorAll('svg')]){const vb=sv.getAttribute('viewBox').split(' ').map(Number);const W2=860,H2=Math.round(W2*vb[3]/vb[2]);
    sv.setAttribute('xmlns','http://www.w3.org/2000/svg');sv.setAttribute('width',W2);sv.setAttribute('height',H2);sv.setAttribute('style','font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif');
    const im=new Image();await new Promise((ok,mal)=>{im.onload=ok;im.onerror=mal;im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(sv))});
    const cv=document.createElement('canvas');cv.width=W2;cv.height=H2;cv.getContext('2d').drawImage(im,0,0);
    const img=document.createElement('img');img.src=cv.toDataURL('image/png');img.style.cssText='display:block;margin:0 auto;width:430px;height:'+Math.round(430*vb[3]/vb[2])+'px';sv.replaceWith(img)}
  box.querySelectorAll('a').forEach(x=>x.style.color='#2563C9');
  document.body.appendChild(box);
  try{
    const {jsPDF}=window.jspdf;const pdf=new jsPDF({unit:'mm',format:'a4'});const W=210,H=297,M=10;let y=M;
    for(const el of box.querySelectorAll('.pb')){
      const c=await html2canvas(el,{scale:2,backgroundColor:'#ffffff',logging:false});
      if(!c.width||!c.height)continue;const h=c.height*(W-2*M)/c.width;
      if(y+h>H-M&&y>M){pdf.addPage();y=M}
      pdf.addImage(c.toDataURL('image/jpeg',0.92),'JPEG',M,y,W-2*M,h);y+=h;
    }
    return pdf.output('blob');
  }finally{box.remove()}
}
async function descargarPDF(btn){
  const txt=btn.textContent;btn.textContent='Armando el PDF…';btn.disabled=true;
  try{
    const blob=await generarPDF();
    const nombre=`Nota de pedido - ${(d.cli||'cliente').trim()}.pdf`;
    if(window.claude){const dl=await claude.use('downloads');if(!dl){toast('En esta vista no se puede descargar. Abrí el enlace en el navegador.');return}
      try{await dl.save({filename:nombre,data:blob});toast('PDF listo: mandalo por WhatsApp al cliente')}catch(e){if(e&&e.code!=='declined')toast('No se pudo descargar el PDF')}}
    else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nombre;document.body.appendChild(a);a.click();a.remove();toast('PDF listo: mandalo por WhatsApp al cliente')}
  }catch(e){toast('No se pudo armar el PDF: '+e.message)}
  finally{btn.textContent=txt;btn.disabled=false}
}
function mapsUrl(){return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(d.loc||'')}
function modelo(m){
  const E=(tipo,ubi,items)=>({id:nid(),tipo,ubi,items:items||[]});
  const base={oficina:{prod:'Módulo habitacional',tam:'20 DV',espacios:[E('oficina','Extremo izquierdo'),E('bano','Extremo derecho',['Inodoro','Bacha'])],piso:'Flotante PVC',rev:['PVC'],pInterior:'Aluminio',linea:'Módena'},
    sanitario:{prod:'Módulo habitacional',tam:'20 DV',espacios:[E('bano','Extremo izquierdo',['Inodoro','Mingitorio','Bacha']),E('bano','Centro',['Inodoro','Bacha']),E('bano','Extremo derecho',['Ducha','Bacha'])],piso:'Original epoxy alto tránsito',rev:['PVC'],pInterior:'Aluminio',linea:'Herrero'},
    vivienda:{prod:'Módulo habitacional',tam:'40 HC',espacios:[E('habitacion','Extremo izquierdo'),E('habitacion','Extremo derecho'),E('cocina','Centro',['Bacha monocomando','Bajo mesada','Alacena']),E('bano','Centro',['Inodoro','Bidet','Bacha','Ducha','Espejo'])],piso:'Flotante madera',rev:['Durlock'],pInterior:'Madera',linea:'DVH'},
    otro:{}}[m];
  d.modelo=m;if(m==='otro'){render();toast('Empezás de cero: cargá todo en los pasos siguientes');return}
  Object.assign(d,limpio(base));d.espacios=base.espacios;d.revAsig={};d.elec={};const [l,a,h]=MED[d.tam];d.largo=l;d.ancho=a;d.alto=h;
  render();toast('Modelo cargado: revisá y cambiá lo que haga falta');
}
function limpio(o){return JSON.parse(JSON.stringify(o))}
function toast(t){let el=document.getElementById('np-tt');if(!el){el=document.createElement('div');el.id='np-tt';document.body.appendChild(el)}el.textContent=t;el.style.opacity=1;clearTimeout(toast.t);toast.t=setTimeout(()=>el.style.opacity=0,2400)}
function conectar(R0){
R0.addEventListener('click',e=>{
  const t=e.target.closest('[data-k],[data-m],[data-mas],[data-menos],[data-em],[data-ep],[data-quitar],[data-quitarp],[data-modelo],[data-up],[data-um],#np-add-v,#np-add-p');if(!t)return;
  if(t.dataset.modelo){modelo(t.dataset.modelo);return}
  if(t.dataset.up||t.dataset.um){d.unidades=Math.min(MAX_U,Math.max(1,unidades()+(t.dataset.up?1:-1)));render();return}
  if(t.id==='np-add-v'){d.ventanas.push({esp:'',med:'',ancho:'',alto:'',tipo:'',pared:'',pos:'',prot:''});render();return}
  if(t.id==='np-add-p'){d.puertas.push(nuevaPuerta());render();return}
  if(t.dataset.quitarp!=null){d.puertas.splice(+t.dataset.quitarp,1);render();return}
  if(t.dataset.quitar!=null){d.ventanas.splice(+t.dataset.quitar,1);render();return}
  if(t.dataset.mas){d.espacios.push({id:nid(),tipo:t.dataset.mas,ubi:'',items:[]});render();return}
  if(t.dataset.menos){const k=t.dataset.menos;const i=d.espacios.map(x=>x.tipo).lastIndexOf(k);if(i>=0)d.espacios.splice(i,1);render();return}
  if(t.dataset.ep||t.dataset.em){const [esp,c]=(t.dataset.ep||t.dataset.em).split('|');d.elec[esp][c]=Math.max(0,d.elec[esp][c]+(t.dataset.ep?1:-1));render();return}
  if(t.dataset.m&&t.dataset.m.startsWith('it.')){const x=d.espacios.find(y=>y.id===t.dataset.m.slice(3));const i=x.items.indexOf(t.dataset.v);i>=0?x.items.splice(i,1):x.items.push(t.dataset.v);render();return}
  if(t.dataset.m){const arr=d[t.dataset.m],v=t.dataset.v,i=arr.indexOf(v);i>=0?arr.splice(i,1):arr.push(v);if(t.dataset.m==='rev'){Object.keys(d.revAsig).forEach(k=>{if(!d.rev.includes(d.revAsig[k]))delete d.revAsig[k]})}render();return}
  const k=t.dataset.k,v=t.dataset.v;
  if(k.startsWith('v.')){const [,i,c]=k.split('.');const w=d.ventanas[+i];w[c]=v;if(c==='med'&&v!=='Otra'){const m=v.match(/(\d+) × (\d+)/);w.ancho=m[1];w.alto=m[2]}if(c==='med'&&v==='Otra'){w.ancho='';w.alto=''}if(c==='esp'&&!w.pos){const x=d.espacios.find(y=>etiqueta(y)===v);if(x&&x.ubi)w.pos=x.ubi}render();return}
  if(k.startsWith('pu.')){const [,i,c]=k.split('.');const p=d.puertas[+i];p[c]=v;if(c==='med'&&v==='Otra'){p.ancho='';p.alto=''}render();return}
  if(k.startsWith('rh.')){d.espacios.find(y=>y.id===k.slice(3)).rev=v;render();return}
  if(k.startsWith('ra.')){d.revAsig[k.slice(3)]=v;render();return}
  if(k.startsWith('elec.')){const p=k.slice(5).split('.');const c=p.pop();d.elec[p.join('.')][c]=v;render();return}
  if(k.startsWith('ubi.')){d.espacios.find(y=>y.id===k.slice(4)).ubi=v;render();return}
  setPath(k,v);
  if(k==='tam'){const [l,a,h]=MED[v];d.largo=l;d.ancho=a;d.alto=h}
  render();
});
R0.addEventListener('input',e=>{const t=e.target;
  if(t.dataset.i==='unidades'){d.unidades=t.value===''?'':Number(t.value);return}
  if(t.dataset.i){d[t.dataset.i]=t.value;if(t.dataset.i==='loc'){const a=$('#np-maps-a');if(a)a.href=mapsUrl()}}
  if(t.dataset.pui){const [i,c]=t.dataset.pui.split('.');d.puertas[+i][c]=t.value}
  if(t.dataset.vi){const [i,c]=t.dataset.vi.split('.');d.ventanas[+i][c]=t.value}
});
R0.addEventListener('change',e=>{const t=e.target;
  if(t.dataset.c){d[t.dataset.c]=t.checked;render()}
  if(t.dataset.i==='unidades'){if(t.value!=='')d.unidades=Math.min(MAX_U,Math.max(1,Math.floor(Number(t.value))||1));render()}
  if(t.id==='np-confirmado'){d.confirmado=t.checked}
  if(t.dataset.f&&t.files[0]){archivo=t.files[0];toast('📎 '+archivo.name+' se sube al guardar')}
});
$('#np-b-sig').onclick=siguiente;
$('#np-b-atras').onclick=()=>{if(paso){paso--;intento=false;render();arriba()}else salir()};
$('#np-x').onclick=salir;
$('#np-borr').onclick=()=>guardar(false,true);
}
const arriba=()=>{const m=$('#np-app');if(m)m.scrollTop=0};
async function siguiente(){
  if(ocupado)return;
  intento=true;const errs=errores();
  if(errs.length){render();arriba();return}
  intento=false;
  if(paso===6){await guardar(!!opts.enviar,false);return}
  paso++;render();arriba();
}
async function guardar(enviar,borrador){
  if(ocupado||!opts.onGuardar)return;
  ocupado=true;['#np-b-sig','#np-borr'].forEach(s=>{const b=$(s);if(b)b.disabled=true});
  try{const ok=await opts.onGuardar(limpio(d),{enviar,borrador,archivo});if(ok!==false)cerrar(true)}
  finally{ocupado=false;['#np-b-sig','#np-borr'].forEach(s=>{const b=$(s);if(b)b.disabled=false})}
}
function montar(){
  let R0=document.getElementById('nota');if(R0)return R0;
  R0=document.createElement('div');R0.id='nota';
  R0.innerHTML=`<header><div class="np-top"><h1 id="np-tit">Nota de pedido</h1><div><button class="np-hb" id="np-borr">Guardar borrador</button> <button class="np-hb" id="np-x" aria-label="Cerrar">✕</button></div></div>
    <p id="np-h-sub"></p><div class="prog" id="np-prog"></div></header><main id="np-app"></main>
    <footer><button class="b2" id="np-b-atras">← Atrás</button><button class="b1" id="np-b-sig">Siguiente →</button></footer>`;
  document.body.appendChild(R0);conectar(R0);return R0;
}
let inicial='';
async function salir(){if(JSON.stringify(d)!==inicial&&typeof window.confirmar==='function'&&!(await window.confirmar('¿Salir sin guardar la nota de pedido?')))return;cerrar()}
function cerrar(guardado){const R0=document.getElementById('nota');if(R0)R0.classList.remove('on');document.body.style.overflow='';if(!guardado&&opts.onCerrar)opts.onCerrar()}
function abrir(o){
  opts=o||{};archivo=null;intento=false;paso=0;
  d=Object.assign(nuevo(),o&&o.ficha&&o.ficha.v===2?limpio(o.ficha):{});
  if(!d.puertas||!d.puertas.length)d.puertas=[nuevaPuerta()];
  if(!d.cli&&o&&o.cliente)d.cli=o.cliente;
  const R0=montar();$('#np-tit').textContent=opts.titulo||'Nueva nota de pedido';$('#np-borr').style.display=opts.borrador===false?'none':'';
  inicial=JSON.stringify(d);R0.classList.add('on');document.body.style.overflow='hidden';render();arriba();
}
// Funciones para mostrar una nota guardada fuera del asistente
function conD(f,fn){const pd=d,pp=paso;d=Object.assign(nuevo(),limpio(f||{}));try{return fn()}finally{d=pd;paso=pp}}
function faltantes(f){return conD(f,()=>{const out=[];for(paso=0;paso<6;paso++)out.push(...errores());if(!d.confirmado)out.push('Falta la confirmación del cliente');return out})}
// Agrega las claves que la base ya exige para pasar a arquitectura (largo/ancho/alto, puerta, elec, sani, confirmada).
// largo, ancho, alto y elec ya vienen de la nota (en cm y por espacio); solo se suman las que faltan.
function compat(f){return conD(f,()=>({v:2,...limpio(d),
    puerta:d.puertaP?'A confirmar':(d.puertas.map(p=>p.tipo).filter(Boolean).join(' + ')||''),
    sani:d.espacios.some(x=>ITEMS[x.tipo])?'Sí':'No',confirmada:!!d.confirmado}))}
function nombreSugerido(f){const M={oficina:'Oficina',vivienda:'Vivienda',sanitario:'Sanitario'};const u=Math.floor(Number(f.unidades))||1;return (u>1?u+' × ':'')+[(M[f.modelo]||f.prod||'Pedido'),f.tam].filter(Boolean).join(' ')+(f.cli?' — '+f.cli:'')}
function tipoTrabajo(f){if(f.prod==='Reefer')return 'Reefer';if(f.prod==='Contenedor cortado')return 'Modificación contenedor';return f.modelo==='oficina'?'Oficina modular':'Módulo habitable'}

// ── Cómputo para el costeo (solo lo usa el administrador) ──
// Devuelve una línea por cada cosa a costear: clave (nombre en la lista de costos), rubro, unidad y cantidad.
// Las superficies son aproximadas a partir de las medidas del contenedor; el administrador puede corregirlas.
function lineasCosteo(){
  const out=[];const r2=x=>Math.round(x*100)/100;
  const add=(clave,rubro,unidad,cant,det='',pend=false)=>{if(!(cant>0))return;const ya=out.find(x=>x.clave===clave&&x.det===det);if(ya)ya.cant=r2(ya.cant+cant);else out.push({clave,rubro,unidad,cant:r2(cant),det,pend})};
  const L=largoTot()/100,A=(Number(d.ancho)||0)/100,H=(Number(d.alto)||0)/100;
  const paredes=2*(L+A)*H, techo=L*A, piso=L*A;
  if(d.tam)add('Contenedor '+d.tam+(d.prod==='Reefer'?' reefer '+(d.motor||'').toLowerCase():''),'mat','c/u',1);
  if(d.prod==='Contenedor cortado')add('Corte de contenedor','mo','c/u',1,d.corte?d.corte+' cm':'');
  // espacios
  const esp=d.espacios, humedos=esp.filter(x=>ITEMS[x.tipo]);
  esp.forEach(x=>{add('Armado de '+ESP[x.tipo].toLowerCase(),'mo','c/u',1);
    (x.items||[]).forEach(it=>add((x.tipo==='bano'?'Sanitario · ':'Cocina · ')+it,'mat','c/u',1))});
  if(esp.length>1)add('Tabique divisorio','mat','m²',(esp.length-1)*A*H);
  if(humedos.length)add('Instalación sanitaria por ambiente','mo','c/u',humedos.length);
  const enZona=u=>Math.max(1,esp.filter(x=>x.ubi===u).length);
  let humedo=0;
  humedos.forEach(x=>{const m=2*(L/3+A)*H/enZona(x.ubi);humedo+=m;if(x.rev)add('Revestimiento '+x.rev.toLowerCase()+' (baño/cocina)','mat','m²',m,etiqueta(x))});
  // terminaciones
  add('Pintura exterior','mat','m²',paredes+techo,d.pExtP?'color a confirmar':(d.pExt==='Otro'?d.pExtOtro:d.pExt),d.pExtP);
  if(d.revExt&&d.revExt!=='Sin revestimiento')add('Revestimiento exterior · '+d.revExt,'mat','m²',paredes);
  if(d.pInt&&d.pInt!=='Sin pintura')add('Pintura interior','mat','m²',paredes+techo,d.pInt==='Otro'?d.pIntOtro:d.pInt);
  if(d.piso)add('Piso · '+d.piso,'mat','m²',piso);
  const resto=Math.max(0,paredes-humedo), dest=revDestinos();
  (d.rev||[]).filter(v=>v!=='Sin revestimiento'&&v!=='Solo pintura').forEach(v=>{
    const n=d.rev.length>1?dest.filter(x=>d.revAsig[x.k]===v).length:dest.length;
    if(n&&dest.length)add('Revestimiento interior · '+v,'mat','m²',resto*n/dest.length)});
  if(esp.length>1&&d.pInterior)add('Puerta interior · '+d.pInterior,'mat','c/u',esp.length-1);
  // aberturas
  if(d.puertaP)add('Puerta exterior (a confirmar)','mat','c/u',d.puertas.length||1,'',true);
  else d.puertas.forEach(p=>{if(!p.tipo)return;add('Puerta exterior · '+p.tipo+(p.tipo==='Original del contenedor'?'':' '+(p.med==='Otra'?'medida especial':(p.med||'90')+' cm')),'mat','c/u',1,p.med==='Otra'?p.ancho+' × '+p.alto+' cm':'');
    if(p.prot==='Reja')add('Reja de puerta','mat','c/u',1);if(p.prot==='Postigón')add('Postigón','mat','c/u',1)});
  d.ventanas.forEach(v=>{add('Ventana '+(d.linea||'')+' · '+(v.med==='Otra'?'medida especial':(v.med||'').replace(' (baño)','')),'mat','c/u',1,v.med==='Otra'?v.ancho+' × '+v.alto+' cm':'');
    if(v.prot==='Reja')add('Reja de ventana','mat','c/u',1);if(v.prot==='Mosquitero')add('Mosquitero','mat','c/u',1)});
  // instalaciones
  const el=Object.values(d.elec||{});
  add('Tablero y disyuntor','mat','c/u',1);
  add('Toma','mat','c/u',el.reduce((s,x)=>s+(x.tomas||0),0));
  ['Plafón','Tubo LED'].forEach(t=>add('Luz · '+t,'mat','c/u',el.filter(x=>x.tipo===t).reduce((s,x)=>s+(x.luces||0),0)));
  if(d.aa==='Solo pre-instalación')add('Pre-instalación de aire','mo','c/u',1);
  if(d.aa==='Sí, con equipo')add('Aire acondicionado '+(d.aaFrig||''),'mat','c/u',1);
  if(d.termo==='Sí')add('Termotanque '+(d.termoTipo||'').toLowerCase(),'mat','c/u',1,d.termoL?d.termoL+' l':'');
  if(d.tanque==='Sí')add('Tanque de agua','mat','c/u',1,d.tanqueL?d.tanqueL+' l':'');
  // generales
  add('Mano de obra general','mo','m²',piso);
  add('Flete','ter','c/u',1,d.loc||'');
  // varias unidades iguales: todo se multiplica por la cantidad
  const u=unidades();if(u>1)out.forEach(x=>x.cant=r2(x.cant*u));
  return out;
}
window.NotaPedido={abrir,cerrar,
  lineasCosteo:f=>conD(f,()=>lineasCosteo()),
  resumen:f=>conD(f,()=>resumenCuerpo()),
  dibujos:f=>conD(f,()=>(d.espacios.length?planoSVG():'')+abertSVG()),
  pendientes:f=>conD(f,()=>pendientes()),
  faltantes,compat,nombreSugerido,tipoTrabajo,
  pdf:(f,btn)=>{const pd=d;d=Object.assign(nuevo(),limpio(f));return descargarPDF(btn||{textContent:'',disabled:false}).finally(()=>{d=pd})}};
})();
