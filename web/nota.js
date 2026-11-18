// Nota de pedido: asistente de carga para ventas (portado del prototipo aprobado por comercial)
(function(){
const PASOS=['Cliente y pedido','Producto','Distribución','Terminaciones','Aberturas','Instalaciones','Confirmar'];
const MED={'20 DV':[606,244,259],'40 ST':[1219,244,259],'40 HC':[1219,244,290]};
// Productos que son un módulo armado sobre contenedor (llevan distribución de espacios).
// 'Módulo habitacional' es el nombre viejo de 'Módulo habitable': las notas guardadas se pasan solas.
// Razones sociales del grupo (la misma lista está en la migración 0011)
const EMPRESAS=['LT1 SAS','Boxtainers Argentina SAS','Refeer Containers SA','Total Containers SA','Utilbox SAS'];
let revisandoGuardada=false; // true al revisar notas ya guardadas: las viejas no tienen empresa
// Pintura: se controla en tachos de 20 l. Rendimiento supuesto: 100 m² por tacho (dos manos).
const PINT_UNI='tacho 20 l', PINT_M2=100;
// Plazo mínimo de entrega desde que se carga la nota (días corridos): productos Company 5, el resto 15
const PLAZO_COMPANY=5, PLAZO_RESTO=15;
let fecha0='';               // fecha de entrega con la que se abrió la nota
// Una nota que ya salió de ventas (la corrige el líder) no vuelve a exigir el plazo si no se cambia la fecha
const sinCambioFecha=()=>!opts.enviar&&!!fecha0&&d.fecha===fecha0;
const PROD_MOD=['Módulo habitable','Módulo habitable Company','Oficina','Oficina Company','Sanitario','Pañol','Showroom'];
const esModulo=p=>PROD_MOD.includes(p)||p==='Módulo habitacional';
// Contenedores (paso 2): cada opción fija el producto y, si corresponde, el tamaño, el lado que se conserva y si es open top.
// 'Contenedor' es la venta del contenedor tal cual: distribución, terminaciones, aberturas e instalaciones quedan opcionales.
const CONT={
  'Cortado 20 DV parte trasera':{prod:'Contenedor cortado',tam:'20 DV',lado:'Parte trasera'},
  'Cortado 20 DV puerta original':{prod:'Contenedor cortado',tam:'20 DV',lado:'Puertas originales'},
  'Cortado 40 HC parte trasera':{prod:'Contenedor cortado',tam:'40 HC',lado:'Parte trasera'},
  'Cortado 40 HC puerta original':{prod:'Contenedor cortado',tam:'40 HC',lado:'Puertas originales'},
  'Contenedor 20 DV':{prod:'Contenedor',tam:'20 DV',ot:false},
  'Contenedor 20 DV OT':{prod:'Contenedor',tam:'20 DV',ot:true},
  'Contenedor 40 HC':{prod:'Contenedor',tam:'40 HC',ot:false},
  'Contenedor 40 HC OT':{prod:'Contenedor',tam:'40 HC',ot:true},
  'Contenedor reefers':{prod:'Reefer'}};
const esSolo=p=>p==='Contenedor'; // venta del contenedor sin transformar
// Notas guardadas antes de las opciones de contenedor: se les asigna la opción que corresponde
function contDe(x){if(x.cont&&CONT[x.cont])return x.cont;return Object.keys(CONT).find(k=>{const c=CONT[k];return c.prod===x.prod&&(!c.tam||c.tam===x.tam)&&(!c.lado||c.lado===x.lado)&&(c.ot==null||c.ot===!!x.ot)})||''}
const normProd=x=>{if(x.prod==='Módulo habitacional')x.prod='Módulo habitable';if(x.prod&&!PROD_MOD.includes(x.prod))x.cont=contDe(x);else x.cont='';return x};
const nomProd=()=>d.cont||d.prod;
const ESP={bano:'Baño',cocina:'Cocina',habitacion:'Habitación',oficina:'Oficina'};
const UBI=['Extremo izquierdo','Centro','Extremo derecho'];
const PAREDES=['Lateral A','Lateral B','Lado puertas','Lado opuesto'];
const REV_HUM=['Símil mármol','PVC','Melamina','Cerámico'];
const REV_INT=['PVC','Durlock','Fenólico','Melamina','Solo pintura','Sin revestimiento'];
const REV_EXT=['Sin revestimiento','Megacold','Chapa prepintada negra','Chapa prepintada blanca','PVC','Siding'];
const nuevaPuerta=()=>({tipo:'',med:'',ancho:'',alto:'',pared:'',pos:'',mano:'',prot:''});
const ITEMS={bano:['Inodoro','Mingitorio','Bidet','Lavamatic','Bacha','Ducha','Mueble','Espejo'],cocina:['Bacha monocomando','Bajo mesada','Alacena','Cocina eléctrica']};
const COLORES=['Blanco','Gris claro','Gris grafito','Negro','Azul','Verde inglés','Otro'];
const SIN_PINT='No lleva'; // pintura exterior: el contenedor queda sin pintar por fuera
let paso=0, intento=false, opts={}, archivos=[], ocupado=false;
const MAX_CROQUIS=3; // archivos del cliente por nota (croquis, planos, fotos)
const cupoCroquis=()=>Math.max(0,MAX_CROQUIS-(opts.croquisPrevios||0));
// Hay un plano o croquis para seguir: el que se sube ahora, uno ya subido (del cliente o de arquitectura)
const hayPlano=()=>!!(archivos.length||opts.croquisPrevios||opts.planosPrevios||d.segunPlano);
// Con "seguir tal cual plano adjunto" las aberturas no son obligatorias: solo se revisan las que se empezaron a cargar
const empezada=p=>!!(p.tipo||p.pared||p.mano||p.med);
const puertasVal=()=>d.segunPlano?d.puertas.filter(empezada):d.puertas;
function plazoMin(prod){return /Company$/.test(prod||'')?PLAZO_COMPANY:PLAZO_RESTO}
function fechaMin(dias){const f=new Date();f.setDate(f.getDate()+dias);return f.getFullYear()+'-'+String(f.getMonth()+1).padStart(2,'0')+'-'+String(f.getDate()).padStart(2,'0')}
// Error si la fecha de entrega no respeta el plazo mínimo del producto (solo al cargar o cambiar la fecha)
function errPlazo(){if(revisandoGuardada||!d.fecha||!d.prod||sinCambioFecha())return null;const n=plazoMin(d.prod);
  return d.fecha<fechaMin(n)?`Para ${nomProd()} la entrega es como mínimo a ${n} días: poné la fecha desde el ${fechaMin(n).split('-').reverse().join('/')} (paso 1)`:null}
function nuevo(){return {empresa:'',arq:'Sí',sol:'',cli:'',tel:'',cuit:'',loc:'',maps:'',mapsOk:false,fecha:'',modelo:'',
  unidades:1,prod:'',cont:'',ot:false,tam:'',motor:'',corte:'',lado:'',largo:'',ancho:'',alto:'',
  espacios:[],
  pExt:'',pExtOtro:'',pExtP:false,pInt:'',pIntOtro:'',piso:'',rev:[],revAsig:{},revExt:'',pInterior:'',
  linea:'',puertas:[nuevaPuerta()],puertaP:false,ventanas:[],segunPlano:false,
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
  if(paso===0){if(!d.empresa&&!revisandoGuardada)e.push('Elegí la empresa que vende');if(!d.sol)e.push('Elegí el tipo de solicitud');if(!d.cli.trim())e.push('Falta el cliente');if(!d.tel.trim())e.push('Falta el teléfono');if(!d.loc.trim())e.push('Falta la dirección de entrega');else if(!d.mapsOk)e.push('Verificá la dirección en el mapa y tildá la confirmación');if(!d.fecha)e.push('Falta la fecha de entrega');else if(!revisandoGuardada&&!d.prod&&!sinCambioFecha()&&d.fecha<fechaMin(PLAZO_COMPANY))e.push(`La entrega es como mínimo a ${PLAZO_COMPANY} días (productos Company) o ${PLAZO_RESTO} días (el resto)`);else{const ep=errPlazo();if(ep)e.push(ep)}}
  if(paso===1){if(!d.prod)e.push('Elegí el producto');{const ep=errPlazo();if(ep)e.push(ep)}if(!d.tam)e.push('Elegí el tamaño');
    if(d.prod==='Contenedor cortado'){const c=Number(d.corte);if(!c)e.push('Poné el largo final del corte');else if(c>=Number(d.largo))e.push(`El corte (${c} cm) tiene que ser menor que el largo del contenedor (${d.largo} cm)`);if(!d.lado)e.push('Elegí qué lado se conserva')}
    if(d.prod==='Reefer'&&!d.motor)e.push('Indicá si es con o sin motor');
    const u=Number(d.unidades);if(!Number.isInteger(u)||u<1)e.push('La cantidad de unidades tiene que ser un número entero, 1 o más');else if(u>MAX_U)e.push(`Máximo ${MAX_U} unidades por nota`)}
  if(esSolo(d.prod)&&paso>=2&&paso<=5)return e;
  if(paso===2){if(esModulo(d.prod)&&!total())e.push('Elegí al menos un espacio');d.espacios.forEach(x=>{if(!x.ubi)e.push(`Elegí dónde va ${etiqueta(x).toLowerCase()}`);})}
  if(paso===3){if(!d.pExt&&!d.pExtP)e.push('Elegí la pintura exterior o marcala a confirmar');if(d.pExt==='Otro'&&!d.pExtOtro.trim()&&!d.pExtP)e.push('Escribí el color o código exterior');if(d.pInt==='Otro'&&!d.pIntOtro.trim())e.push('Escribí el color o código interior');if(!d.revExt)e.push('Elegí el revestimiento exterior');if(!d.piso)e.push('Elegí el piso');if(!d.rev.length)e.push('Elegí el revestimiento interior');if(d.rev.length>1)revDestinos().forEach(x=>{if(!d.rev.includes(d.revAsig[x.k]))e.push(`Elegí qué revestimiento va en ${x.n.toLowerCase()}`)});if(total()>1&&!d.pInterior)e.push('Elegí las puertas interiores')}
  if(paso===4){if(!d.linea&&!d.segunPlano)e.push('Elegí la línea de aberturas');
    if(!d.puertaP)puertasVal().forEach((p,i)=>{const n=d.puertas.length>1?' '+(i+1):'';if(!p.tipo||!p.pared||!p.mano)e.push(`Completá tipo, pared y apertura de la puerta${n} (o marcá las puertas a confirmar)`);else if(esLateral(p.pared)&&!p.pos)e.push(`Elegí en qué parte del ${p.pared.toLowerCase()} va la puerta${n}`);if(p.med==='Otra'&&(!p.ancho||!p.alto))e.push(`Poné ancho y alto de la puerta${n}`)});
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
  $('#np-b-sig').textContent=paso===6?(opts.enviar?(d.arq==='No'?'Enviar al líder ✓':'Enviar a arquitectura ✓'):'Guardar nota ✓'):'Siguiente →';
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
    <div class="card"><div class="lbl">Empresa que vende</div>${ops('empresa',EMPRESAS,d.empresa)}</div>
    <div class="card"><div class="lbl">Tipo de solicitud</div>${ops('sol',['Presupuesto','Orden de compra confirmada'],d.sol)}</div>
    <div class="card"><div class="lbl">Cliente</div><input type="text" data-i="cli" placeholder="Nombre o razón social *" value="${esc(d.cli)}">
      <div class="fila"><input type="tel" data-i="tel" placeholder="Teléfono *" value="${esc(d.tel)}"></div>
      <div class="fila"><input type="text" data-i="cuit" placeholder="CUIT (opcional)" value="${esc(d.cuit)}"></div></div>
    <div class="card"><div class="lbl">Entrega</div><input type="text" data-i="loc" id="np-loc" placeholder="Calle, número, localidad, provincia *" value="${esc(d.loc)}">
      <a class="maps" id="np-maps-a" href="${mapsUrl()}" target="_blank" rel="noopener">📍 Ver en Google Maps</a>
      <div class="fila"><input type="text" data-i="maps" placeholder="Pegá el enlace del punto exacto (para logística)" value="${esc(d.maps)}"></div>
      <div class="fila"><label class="chk"><input type="checkbox" data-c="mapsOk" ${d.mapsOk?'checked':''}> Verifiqué en el mapa que la dirección es correcta</label></div>
      <div class="fila"><div><div class="lbl" style="margin:4px 0">Fecha comprometida</div><input type="date" data-i="fecha" min="${sinCambioFecha()?'':fechaMin(d.prod?plazoMin(d.prod):PLAZO_COMPANY)}" value="${esc(d.fecha)}">
        <div style="font-size:12px;color:var(--gris-m,#777);margin-top:4px">Mínimo ${PLAZO_COMPANY} días para productos Company y ${PLAZO_RESTO} días para el resto.</div></div></div></div>`;
  }
  if(paso===1){
    h=`<div class="paso-t">Producto</div><div class="paso-s">Elegí el tipo y el tamaño: las medidas se completan solas.</div>
    <div class="card"><div class="lbl">¿Qué se fabrica?</div>${ops('prod',PROD_MOD,d.cont?'':d.prod)}
      <div class="lbl" style="margin-top:12px">Contenedores</div>${ops('cont',Object.keys(CONT),d.cont)}
      ${esSolo(d.prod)?`<div class="auto">Venta del contenedor: los pasos de distribución, terminaciones, aberturas e instalaciones son opcionales.</div>`:''}</div>
    <div class="card"><div class="lbl">Tamaño de contenedor</div>${CONT[d.cont]&&CONT[d.cont].tam?`<div class="auto">Tamaño <b>${esc(d.tam)}</b>${d.ot?' open top':''}, según el contenedor elegido.</div>`:ops('tam',['20 DV','40 ST','40 HC'],d.tam)}
      ${d.tam?`<div class="auto">📏 Medidas exteriores: <b>${d.largo} × ${d.ancho} × ${d.alto} cm</b> (largo × ancho × alto)</div>`:''}</div>
    <div class="card"><div class="lbl">¿Cuántas unidades iguales? <small>si el cliente lleva varias idénticas, cargala una sola vez</small></div>
      <div class="cnt"><button data-um="1" aria-label="Una menos">−</button><input type="number" inputmode="numeric" min="1" max="${MAX_U}" data-i="unidades" value="${esc(d.unidades)}" style="width:80px;text-align:center;font-weight:800"><button data-up="1" aria-label="Una más">+</button></div>
      ${unidades()>1?`<div class="auto">📦 Se fabrican <b>${unidades()} unidades iguales</b>. Todo lo que cargues en los pasos siguientes es para <b>cada una</b>; materiales y costos se multiplican solos.</div>`:''}</div>
    ${d.prod==='Reefer'?`<div class="card"><div class="lbl">Motor</div>${ops('motor',['Con motor','Sin motor'],d.motor)}</div>`:''}
    ${d.prod==='Contenedor cortado'?`<div class="card"><div class="lbl">Corte</div>
      <div class="unidad"><input type="number" inputmode="numeric" data-i="corte" placeholder="Largo final" value="${esc(d.corte)}"><b>cm</b></div>
      ${d.cont?`<div class="auto" style="margin-top:12px">Se conserva: <b>${esc(d.lado.toLowerCase())}</b>.</div>`:`<div class="lbl" style="margin-top:12px">¿Qué parte se conserva?</div>${ops('lado',['Puertas originales','Parte trasera'],d.lado)}`}</div>`:''}`;
  }
  if(paso===2){
    h=`<div class="paso-t">Distribución</div><div class="paso-s">Cada espacio se personaliza por separado. El dibujo muestra dónde va quedando cada uno.</div><div class="card">${planoSVG()}</div><div class="card">
    ${Object.keys(ESP).map(k=>`<div class="esp"><div class="esp-h"><b>${ESP[k]}</b><div class="cnt"><button data-menos="${k}">−</button><span>${cuenta(k)}</span><button data-mas="${k}">+</button></div></div>
      ${d.espacios.filter(x=>x.tipo===k).map(x=>`<div class="sub"><div class="lbl">${esc(etiqueta(x))}: ¿dónde va?</div>${ops('ubi.'+x.id,UBI,x.ubi||'')}
      ${ITEMS[k]?`<div class="lbl" style="margin-top:10px">¿Qué lleva ${esc(etiqueta(x).toLowerCase())}? <small>tocá todo lo que aplique</small></div>${multi('it.'+x.id,ITEMS[k],x.items)}<div class="lbl" style="margin-top:10px">Revestimiento de paredes <small>opcional · tocá de nuevo para sacarlo</small></div>${ops('rh.'+x.id,REV_HUM,x.rev||'')}<div class="lbl" style="margin-top:10px">Revestimiento de techo <small>opcional · tocá de nuevo para sacarlo</small></div>${ops('rt.'+x.id,REV_HUM,x.revT||'')}`:''}</div>`).join('')}</div>`).join('')}
    </div><div class="card"><div class="lbl">Croquis o plano del cliente <small>recomendado · hasta ${MAX_CROQUIS} archivos</small></div>
      ${opts.croquisPrevios?`<div class="auto">Ya ${opts.croquisPrevios===1?'hay 1 archivo subido':'hay '+opts.croquisPrevios+' archivos subidos'} en este proyecto.</div>`:''}
      ${archivos.map((f,i)=>`<div class="auto">📎 ${esc(f.name)}: se sube al guardar <button class="x" data-quitaf="${i}">Quitar</button></div>`).join('')}
      ${archivos.length<cupoCroquis()?`<input type="file" accept="image/*,application/pdf" multiple data-f="1">`:`<div class="aviso" style="text-align:left">Llegaste al máximo de ${MAX_CROQUIS} archivos.</div>`}
      <div class="aviso" style="text-align:left">Una foto de un dibujo a mano alcanza.</div></div>`;
  }
  if(paso===3){
    h=`<div class="paso-t">Terminaciones</div><div class="paso-s">&nbsp;</div>
    <div class="card ${d.pExtP?'pend':''}"><div class="lbl">Pintura exterior ${confBox('pExtP',d.pExtP)}</div>${ops('pExt',[...COLORES,SIN_PINT],d.pExt)}
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
    ${hayPlano()?`<div class="card ${d.segunPlano?'pend':''}"><label class="chk"><input type="checkbox" data-c="segunPlano" ${d.segunPlano?'checked':''}> <b>Seguir tal cual plano adjunto</b></label>
      <div class="aviso" style="text-align:left">${d.segunPlano?'Puertas y ventanas van como en el plano. Podés avanzar sin cargarlas, o cargar alguna igual si querés dejarla aclarada.':'Si el cliente o arquitectura ya mandaron un plano con las aberturas, tildalo y avanzá sin cargarlas una por una.'}</div></div>`
      :`<div class="aviso" style="text-align:left;margin-bottom:8px">¿Hay un plano con las aberturas? Subilo en Distribución y vas a poder seguirlo tal cual.</div>`}
    <div class="card"><div class="lbl">Línea de aberturas${d.segunPlano?' <small>opcional</small>':''}</div>${ops('linea',['Herrero','Módena','DVH'],d.linea)}</div>
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
      <div class="aviso" style="text-align:left">Incluye todo el pedido, los dos dibujos y los planos o croquis adjuntos. Mandalo por WhatsApp y, cuando el cliente responda que está bien, tildá la confirmación de abajo.</div></div>
    <div class="card"><label class="chk"><input type="checkbox" id="np-confirmado" ${d.confirmado?'checked':''}> El cliente revisó y confirmó este pedido</label></div>
    <div class="card"><div class="lbl">¿Necesita plano de arquitectura?</div>${ops('arq',['Sí','No'],d.arq||'Sí')}
      <div class="aviso" style="text-align:left">${d.arq==='No'?'La nota va directo al líder de operaciones, sin pasar por arquitectura.':'La nota va a arquitectura para que haga el plano.'}</div></div>`;
  }
  $('#np-app').innerHTML=(opts.aviso?`<div class="card pend" style="font-size:13px">${opts.aviso}</div>`:'')+errHTML+h;
}
function resumenCuerpo(){
  const espTxt=d.espacios.map(x=>`${etiqueta(x)} (${(x.ubi||'?').toLowerCase()})${x.items&&x.items.length?' con '+x.items.join(', ').toLowerCase():''}${x.rev?', revestimiento '+x.rev.toLowerCase():''}${x.revT?', techo '+x.revT.toLowerCase():''}`).join('; ')||'sin divisiones';
  return `      <h4>Pedido</h4><p>${d.empresa?`Vende <b>${esc(d.empresa)}</b>. `:''}<b>${esc(d.sol||'?')}</b> para <b>${esc(d.cli||'?')}</b>, entrega en ${esc(d.loc||'?')}${d.maps?' (<a href="'+esc(d.maps)+'" target="_blank" rel="noopener">ubicación</a>)':''} el ${esc(d.fecha?d.fecha.split('-').reverse().join('/'):'?')}.</p>
      <h4>Producto</h4><p>${unidades()>1?`<b>${unidades()} unidades iguales</b>, cada una: `:''}${esc(d.cont||((d.prod||'?')+' '+d.tam))}${d.prod==='Contenedor cortado'?`, cortado a ${esc(d.corte)} cm conservando ${esc(d.lado.toLowerCase())}`:''}${d.prod==='Reefer'&&d.cont?' '+esc(d.tam):''}${d.motor?', '+esc(d.motor.toLowerCase()):''}. Medidas exteriores ${esc(d.largo)} × ${esc(d.ancho)} × ${esc(d.alto)} cm.</p>
      <h4>Distribución</h4><p>${esc(espTxt)}.</p>
      <h4>Terminaciones</h4><p>Pintura exterior ${d.pExtP?'<span class="tag">a confirmar</span>':(d.pExt===SIN_PINT?'no lleva':esc((d.pExt==='Otro'?d.pExtOtro:d.pExt)||'?'))}, revestimiento exterior ${esc((d.revExt||'?').toLowerCase())}, pintura interior ${esc((d.pInt==='Otro'?d.pIntOtro:d.pInt)||'—')}. Piso ${esc(d.piso.toLowerCase()||'?')}, revestimiento interior ${esc(revTexto())}.</p>
      <h4>Aberturas</h4><p>${d.segunPlano?'<b>Tal cual plano adjunto.</b> ':''}${d.linea||!d.segunPlano?`Línea ${esc(d.linea||'?')}. `:''}${d.puertaP?'Puertas exteriores <span class="tag">a confirmar</span>.':puertasVal().map((p,i)=>`Puerta ${i+1} (P${i+1}): ${esc(p.tipo.toLowerCase())} de ${p.med==='Otra'?esc(p.ancho)+' × '+esc(p.alto):esc(p.med||'?')} cm en ${esc(dondeTxt(p))}, ${esc(p.mano.toLowerCase())}${p.prot?', '+esc(p.prot.toLowerCase()):''}.`).join(' ')}
        ${d.ventanas.length?d.ventanas.map((v,i)=>` Ventana ${i+1} (V${i+1}): ${esc(v.esp)}, ${esc(v.ancho)} × ${esc(v.alto)} cm en ${esc(dondeTxt(v))}, ${esc([(v.tipo||''),(v.prot||'')].filter(Boolean).join(', ').toLowerCase())}.`).join(''):d.segunPlano?'':' Sin ventanas.'}</p>
      <h4>Instalaciones</h4><p>${Object.entries(d.elec).map(([e,x])=>`${esc(e)}: ${x.tomas} tomas, ${x.luces} luces ${esc(x.tipo.toLowerCase())} ${esc(x.luz.toLowerCase())}`).join(' · ')||'—'}. Aire: ${esc(d.aa||'?')}${d.aaFrig?' '+esc(d.aaFrig):''}. Termotanque: ${esc(d.termo||'?')}${d.termoL?' '+esc(d.termoL)+' l '+esc(d.termoTipo.toLowerCase()):''}. Tanque: ${esc(d.tanque||'?')}${d.tanqueL?' '+esc(d.tanqueL)+' l':''}.</p>`;
}
// Íconos de lo que lleva cada baño o cocina, con la pared en y=0 y hacia y positivo
function icono(n,t,sz){const h=sz,a=sz*.5;switch(n){ // íconos con la pared en y=0, hacia y positivo
    case 'Inodoro':return `<rect x="${-a*.8}" y="1" width="${a*1.6}" height="${h*.28}" rx="1"/><ellipse cx="0" cy="${h*.66}" rx="${a*.7}" ry="${h*.38}"/>`;
    case 'Bidet':return `<ellipse cx="0" cy="${h*.52}" rx="${a*.62}" ry="${h*.44}"/><circle cx="0" cy="${h*.35}" r="${sz*.06}"/>`;
    case 'Mingitorio':return `<rect x="${-a*.6}" y="1" width="${a*1.2}" height="${h*.55}" rx="${a*.5}"/>`;
    case 'Ducha':return `<rect x="${-a}" y="1" width="${sz}" height="${sz}"/><path d="M${-a} 1L${a} ${sz+1}M${a} 1L${-a} ${sz+1}"/>`;
    case 'Lavamatic':return `<rect x="${-a*.9}" y="1" width="${a*1.8}" height="${a*1.8}" rx="1"/><circle cx="0" cy="${a*.9+1}" r="${a*.55}"/>`;
    case 'Vanitory':return `<rect x="${-a*1.1}" y="1" width="${a*2.2}" height="${h*.6}" rx="1" fill="var(--azul-l)"/><ellipse cx="0" cy="${h*.32}" rx="${a*.6}" ry="${h*.18}"/>`;
    case 'Bacha':return `<rect x="${-a}" y="1" width="${sz}" height="${h*.55}" rx="1"/><ellipse cx="0" cy="${h*.3}" rx="${a*.6}" ry="${h*.17}"/>`;
    case 'Mueble':return `<rect x="${-a}" y="1" width="${sz}" height="${h*.5}" rx="1" fill="var(--azul-l)"/>`;
    case 'Espejo':return `<line x1="${-a}" y1="1.5" x2="${a}" y2="1.5" stroke-width="2.4"/>`;
    case 'Bacha monocomando':return `<rect x="${-a*.8}" y="${h*.08}" width="${a*1.6}" height="${h*.42}" rx="1"/>`;
    case 'Cocina eléctrica':return [[-1,-1],[1,-1],[-1,1],[1,1]].map(([i,j])=>`<circle cx="${i*a*.42}" cy="${h*.3+j*a*.42}" r="${a*.28}"/>`).join('');
    default:return `<rect x="${-a}" y="1" width="${sz}" height="${h*.5}" rx="1"/>`}}
// Referencias de los íconos que aparecen en el dibujo (solo los usados)
function leyendaAmb(){const usados=[];d.espacios.forEach(x=>{const it=x.items||[];
    if(x.tipo==='bano'){['Ducha','Inodoro','Bidet','Mingitorio'].forEach(k=>it.includes(k)&&usados.push(k));if(it.includes('Bacha'))usados.push(it.includes('Mueble')?'Vanitory':'Bacha');else if(it.includes('Mueble'))usados.push('Mueble');if(it.includes('Lavamatic'))usados.push('Lavamatic');if(it.includes('Espejo'))usados.push('Espejo')}
    if(x.tipo==='cocina'){['Bacha monocomando','Cocina eléctrica'].forEach(k=>it.includes(k)&&usados.push(k));if(it.includes('Bajo mesada')||it.some(k=>k!=='Alacena'))usados.push('Mesada');if(it.includes('Alacena'))usados.push('Alacena')}});
  const u=[...new Set(usados)];if(!u.length)return '';
  const nom={'Bacha monocomando':'bacha cocina','Cocina eléctrica':'anafe','Vanitory':'vanitory (bacha con mueble)'};
  return `<div class="aviso" style="text-align:left;margin-top:6px;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center">${u.map(k=>{
    const g=k==='Mesada'?`<rect x="-8" y="1" width="16" height="9" fill="var(--azul-l)" stroke="var(--azul)" stroke-width=".8"/>`:k==='Alacena'?`<rect x="-8" y="1" width="16" height="6" fill="none" stroke="var(--azul)" stroke-width=".8" stroke-dasharray="2 1.5"/>`:`<g fill="none" stroke="var(--azul)" stroke-width="1"${k==='Espejo'?'':''}>${icono(k,'',14)}</g>`;
    return `<span style="display:inline-flex;align-items:center;gap:4px"><svg viewBox="-9 0 18 17" width="18" height="17" data-w="18">${g}</svg>${esc(nom[k]||k.toLowerCase())}</span>`}).join('')}</div>`}
// Dibuja cada espacio dentro del contenedor visto desde arriba: tabiques, puerta interior de baños y habitaciones
// y lo que lleva cada baño o cocina (inodoro, vanitory, ducha, mesada...). Cada espacio ocupa su zona (UBI);
// si hay varios en la misma zona se reparten en franjas. Es un esquema, no un plano a escala.
// Supuesto de la puerta interior de baños y habitaciones: da a un espacio abierto (cocina, oficina o una zona libre).
// Primero a la cocina u oficina de la misma zona; si no, al centro (los del centro, al lado que quede abierto).
// Si alrededor solo hay baños o habitaciones (por ejemplo un sanitario), no se dibuja: la puerta es exterior y va en Aberturas.
function ambientesSVG(X0,X1,Y0,Y1,fs){
  const w=(X1-X0)/3,ln='var(--tx2)',az='var(--azul)';let s='';
  const ic=icono;
  const zonas=UBI.map(u=>d.espacios.filter(e=>e.ubi===u));
  const huecos={1:[],2:[]}; // puertas en los tabiques entre zonas (x = X0+i*w)
  const hh_={}; // puertas en los tabiques entre franjas de una misma zona ('zona|franja' de abajo)
  const cerrado=x=>x.tipo==='bano'||x.tipo==='habitacion';
  const abierta=i=>!zonas[i].length||zonas[i].some(x=>!cerrado(x)); // zona libre o con cocina/oficina
  zonas.forEach((esp,i)=>{const n=esp.length;if(!n)return;const zx=X0+i*w,hh=(Y1-Y0)/n;
    esp.forEach((x,j)=>{const y0=Y0+j*hh,y1=y0+hh;
      // puerta interior (ver el supuesto arriba): lado 1 derecha, -1 izquierda; vert -1 arriba, 1 abajo (a la misma zona)
      let lado=0,vert=0;
      if(cerrado(x)){if(j>0&&!cerrado(esp[j-1]))vert=-1;else if(j<n-1&&!cerrado(esp[j+1]))vert=1;
        else if(i===0&&abierta(1))lado=1;else if(i===2&&abierta(1))lado=-1;else if(i===1)lado=abierta(0)?-1:abierta(2)?1:0}
      const bx=lado?zx+(lado>0?w:0):0, adentro=-lado; // hacia dónde abre (dentro del espacio)
      if(lado){const g=Math.min(hh*.62,20),ga=(y0+y1)/2-g/2;huecos[lado>0?i+1:i].push([ga,ga+g]);
        s+=`<path d="M${bx} ${ga}L${bx+adentro*g} ${ga}" stroke="${ln}" stroke-width="1.5"/><path d="M${bx+adentro*g} ${ga}A${g} ${g} 0 0 ${adentro>0?1:0} ${bx} ${ga+g}" fill="none" stroke="${ln}" stroke-dasharray="2 2"/>`}
      if(vert){const g=Math.min(hh*.8,w*.3,20),by=vert<0?y0:y1,ga=zx+w-g-3,dn=-vert;hh_[i+'|'+(vert<0?j:j+1)]=[ga,ga+g];
        s+=`<path d="M${ga} ${by}L${ga} ${by+dn*g}" stroke="${ln}" stroke-width="1.5"/><path d="M${ga} ${by+dn*g}A${g} ${g} 0 0 ${dn>0?0:1} ${ga+g} ${by}" fill="none" stroke="${ln}" stroke-dasharray="2 2"/>`}
      // artefactos contra la pared exterior (arriba; la última franja, abajo), empezando lejos de la puerta
      const it=x.items||[];let pzs=[];
      if(x.tipo==='bano'){const hay=k=>it.includes(k);pzs=['Ducha','Inodoro','Bidet','Mingitorio'].filter(hay);
        if(hay('Bacha'))pzs.push(hay('Mueble')?'Vanitory':'Bacha');else if(hay('Mueble'))pzs.push('Mueble');
        if(hay('Lavamatic'))pzs.push('Lavamatic')}
      else if(x.tipo==='cocina')pzs=['Bacha monocomando','Cocina eléctrica'].filter(k=>it.includes(k));
      const abajo=n>1&&j===n-1, wy=abajo?y1:y0, dy=abajo?-1:1;
      const conMesada=x.tipo==='cocina'&&(it.includes('Bajo mesada')||pzs.length), conAlacena=x.tipo==='cocina'&&it.includes('Alacena');
      const nSlots=Math.max(pzs.length,conMesada||conAlacena?1:0);
      let ty=(y0+y1)/2+fs*.35;
      if(nSlots){const sz=Math.max(5,Math.min(16,hh*.42,(w-12-(lado?8:0))/(nSlots*1.3))),paso=sz*1.3,largo=nSlots*paso;
        // si la puerta está a la derecha, se arranca desde la izquierda y al revés
        const x0=lado>0?zx+5:zx+w-5-largo;
        if(conMesada)s+=`<rect x="${x0}" y="${abajo?wy-sz*.62:wy}" width="${largo}" height="${sz*.62}" fill="var(--azul-l)" stroke="${az}" stroke-width=".8"><title>${esc(etiqueta(x))}: mesada</title></rect>`;
        if(conAlacena)s+=`<rect x="${x0}" y="${abajo?wy-sz*.35:wy}" width="${largo}" height="${sz*.35}" fill="none" stroke="${az}" stroke-width=".8" stroke-dasharray="2 1.5"><title>${esc(etiqueta(x))}: alacena</title></rect>`;
        pzs.forEach((k,q)=>{const cx=x0+paso*(q+.5);
          s+=`<g transform="translate(${cx} ${wy}) scale(1 ${dy})" fill="none" stroke="${az}" stroke-width="1"><title>${esc(etiqueta(x))}: ${esc(k.toLowerCase())}</title>${ic(k,x.tipo,sz)}</g>`;
          if(k==='Vanitory'||k==='Bacha'){if(it.includes('Espejo'))s+=`<g transform="translate(${cx} ${wy}) scale(1 ${dy})" stroke="${az}"><title>espejo</title>${ic('Espejo',x.tipo,sz)}</g>`}});
        ty=abajo?y0+Math.min(hh*.42,fs+3):Math.max(y0+sz+fs*.9,y1-hh*.25)}
      const f2=Math.min(fs,hh*.34);
      s+=`<text x="${zx+w/2+(lado?-lado*4:vert?-12:0)}" y="${ty}" text-anchor="middle" font-size="${f2}" font-weight="700" fill="var(--tx)">${esc(etiqueta(x))}</text>`});
    // tabiques entre franjas de la misma zona, con el hueco de la puerta si hay
    for(let j=1;j<n;j++){const y=Y0+j*hh,gp=hh_[i+'|'+j];
      s+=gp?`<line x1="${zx}" y1="${y}" x2="${gp[0]}" y2="${y}" stroke="${ln}" stroke-width="1.5"/><line x1="${gp[1]}" y1="${y}" x2="${zx+w}" y2="${y}" stroke="${ln}" stroke-width="1.5"/>`
        :`<line x1="${zx}" y1="${y}" x2="${zx+w}" y2="${y}" stroke="${ln}" stroke-width="1.5"/>`}});
  // tabiques entre zonas: llenos si separan algún espacio (con el hueco de las puertas), punteados si no
  [1,2].forEach(i=>{const x=X0+i*w;
    if(!zonas[i-1].length&&!zonas[i].length){s+=`<line x1="${x}" y1="${Y0}" x2="${x}" y2="${Y1}" stroke="${ln}" stroke-dasharray="4 4" opacity=".6"/>`;return}
    let y=Y0;huecos[i].sort((a,b)=>a[0]-b[0]).forEach(([a,b])=>{if(a>y)s+=`<line x1="${x}" y1="${y}" x2="${x}" y2="${a}" stroke="${ln}" stroke-width="1.5"/>`;y=Math.max(y,b)});
    if(y<Y1)s+=`<line x1="${x}" y1="${y}" x2="${x}" y2="${Y1}" stroke="${ln}" stroke-width="1.5"/>`});
  return s;
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
    ${ambientesSVG(X0,X1,Y0,Y1,11.5)}
    ${puertas?`<rect x="${X0-6}" y="${Y0+4}" width="6" height="${(Y1-Y0)/2-6}" fill="var(--nar)"/><rect x="${X0-6}" y="${(Y0+Y1)/2+2}" width="6" height="${(Y1-Y0)/2-6}" fill="var(--nar)"/>
    <text x="${X0-2}" y="${Y0-8}" font-size="11" font-weight="700" fill="var(--nar)">🚪 PUERTAS</text>`:''}
    <text x="${X0+w/2}" y="${Y1+20}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--tx)">Extremo izquierdo</text>
    <text x="${X0+w/2}" y="${Y1+35}" text-anchor="middle" font-size="10.5" fill="var(--tx2)">${puertas?'lado puertas':'lado del corte'}</text>
    <text x="${X0+1.5*w}" y="${Y1+20}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--tx)">Centro</text>
    <text x="${X0+2.5*w}" y="${Y1+20}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--tx)">Extremo derecho</text>
    <text x="${X0+2.5*w}" y="${Y1+35}" text-anchor="middle" font-size="10.5" fill="var(--tx2)">lado opuesto</text>
  </svg>${leyendaAmb()}`;
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
  return `<div class="lbl">Dónde va cada abertura <small>vista desde arriba</small></div>
  <svg viewBox="0 0 360 196" width="100%" role="img" aria-label="Contenedor visto desde arriba con sus cuatro paredes y las aberturas cargadas" style="display:block;font-family:inherit">
    <text x="180" y="22" text-anchor="middle" font-size="12" font-weight="700" fill="var(--tx)">Lateral A</text>
    <rect x="${X0}" y="${Y0}" width="${X1-X0}" height="${Y1-Y0}" fill="none" stroke="${ln}" stroke-width="2" rx="2"/>
    ${ambientesSVG(X0,X1,Y0,Y1,10.5)}
    ${marcas}
    <text x="16" y="${(Y0+Y1)/2}" transform="rotate(-90 16 ${(Y0+Y1)/2})" text-anchor="middle" font-size="11" font-weight="700" fill="var(--nar)">${cortado?'Lado del corte':'Lado puertas'}</text>
    <text x="344" y="${(Y0+Y1)/2}" transform="rotate(90 344 ${(Y0+Y1)/2})" text-anchor="middle" font-size="11" font-weight="700" fill="var(--tx)">Lado opuesto</text>
    <text x="180" y="${Y1+40}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--tx)">Lateral B</text>
    <text x="${X0+w/2}" y="${Y1+58}" text-anchor="middle" font-size="9.5" fill="var(--tx2)">extremo izq.</text><text x="${X0+1.5*w}" y="${Y1+58}" text-anchor="middle" font-size="9.5" fill="var(--tx2)">centro</text><text x="${X0+2.5*w}" y="${Y1+58}" text-anchor="middle" font-size="9.5" fill="var(--tx2)">extremo der.</text>
  </svg>
  <div class="aviso" style="text-align:left;margin-top:4px"><b style="color:var(--nar)">P</b> puertas · <b style="color:var(--azul)">V</b> ventanas. Lateral A es el que queda a la izquierda parado en el lado puertas mirando hacia adentro.</div>`+leyendaAmb();
}
const COL={'--nar':'#E8650A','--nar-l':'#FDF0E6','--tx':'#1E2330','--tx2':'#5E6675','--azul':'#2563C9','--azul-l':'#E6EEFB','--warn':'#C98A00','--warn-l':'#FFF6DB','--borde':'#DDE1E7'};
const sinVars=t=>t.replace(/var\((--[a-z0-9-]+)\)/g,(m,k)=>COL[k]||'#1E2330');
function cargarJS(src){return new Promise((ok,mal)=>{if(document.querySelector(`script[src="${src}"]`)){ok();return}const sc=document.createElement('script');sc.src=src;sc.onload=ok;sc.onerror=()=>mal(new Error('no cargó '+src));document.head.appendChild(sc)})}
async function generarPDF(adj=[]){
  await cargarJS('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  await cargarJS('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  const hoy=new Date().toLocaleDateString('es-AR');const pend=pendientes();
  const box=document.createElement('div');
  box.style.cssText='position:fixed;left:-10000px;top:0;width:720px;background:#fff;color:#1E2330;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.45';
  const blq=(html,css='')=>`<div class="pb" style="padding:0 32px;background:#fff;${css}">${html}</div>`;
  const pl=d.espacios.length||esModulo(d.prod)?planoSVG():'';
  box.innerHTML=[
    blq(`<div style="background:#E8650A;color:#fff;padding:18px 20px;border-radius:0 0 10px 10px"><div style="font-size:20px;font-weight:800">Nota de pedido</div>${d.empresa?`<div style="font-size:14px;font-weight:700">${esc(d.empresa)}</div>`:''}<div style="font-size:13px;opacity:.9">${esc(d.sol||'Pedido')}${unidades()>1?' · '+unidades()+' unidades iguales':''} · emitida el ${esc(hoy)}</div></div>`,'padding-top:0'),
    ...sinVars(resumenCuerpo()).split('<h4>').filter(x=>x.trim()).map(x=>blq('<h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5E6675;margin:14px 0 4px">'+x.replace('</h4>','</h4><div>').replace(/<p>/g,'<p style="margin:0 0 6px">')+'</div>')),
    pend.length?blq(`<p style="margin-top:10px;color:#C98A00;font-weight:700">A confirmar: ${esc(pend.join(', '))}</p>`):'',
    d.obs.trim()?blq(`<h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5E6675;margin:14px 0 4px">Observaciones</h4><p>${esc(d.obs)}</p>`):'',
    pl?blq(`<div style="border:1px solid #DDE1E7;border-radius:10px;padding:12px;margin-top:14px">${sinVars(pl)}</div>`):'',
    blq(`<div style="border:1px solid #DDE1E7;border-radius:10px;padding:12px;margin-top:14px">${sinVars(abertSVG())}</div>`),
    adj.length?blq(`<h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5E6675;margin:14px 0 4px">Planos adjuntos</h4><p style="margin:0 0 6px">${adj.some(a=>a.blob)?'Forman parte de este pedido y van en las páginas siguientes:':'Forman parte de este pedido:'}</p>${adj.map(a=>`<div>📐 ${esc(a.nombre)}${a.blob?'':a.url?` · <a href="${esc(a.url)}">${esc(a.url)}</a>`:' (no se pudo adjuntar)'}</div>`).join('')}`):'',
    blq(`<div style="margin-top:28px;padding-top:14px;border-top:1px solid #DDE1E7;font-size:13px;color:#5E6675">Revisá que todo esté correcto. Si estás de acuerdo, respondé <b style="color:#1E2330">"Apruebo"</b> por WhatsApp o firmá abajo.</div>
      <div style="display:flex;gap:24px;margin-top:40px;padding-bottom:24px">${['Firma del cliente','Aclaración','Fecha'].map(t=>`<div style="flex:1;border-top:1px solid #1E2330;padding-top:4px;font-size:12px;color:#5E6675">${t}</div>`).join('')}</div>`)
  ].join('');
  for(const sv of [...box.querySelectorAll('svg')]){const vb=sv.getAttribute('viewBox').split(' ').map(Number);const dw=Number(sv.dataset.w)||430,W2=dw*2,H2=Math.round(W2*vb[3]/vb[2]);
    sv.setAttribute('xmlns','http://www.w3.org/2000/svg');sv.setAttribute('width',W2);sv.setAttribute('height',H2);sv.setAttribute('style','font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif');
    const im=new Image();await new Promise((ok,mal)=>{im.onload=ok;im.onerror=mal;im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(sv))});
    const cv=document.createElement('canvas');cv.width=W2;cv.height=H2;cv.getContext('2d').drawImage(im,0,0);
    const img=document.createElement('img');img.src=cv.toDataURL('image/png');img.style.cssText=(sv.dataset.w?'display:inline-block;':'display:block;margin:0 auto;')+'width:'+dw+'px;height:'+Math.round(dw*vb[3]/vb[2])+'px';sv.replaceWith(img)}
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
// Planos y croquis que van al final del PDF que firma el cliente: los del proyecto (arquitectura y cliente,
// los trae la app con opts.adjuntos) y los que se eligieron recién en la nota y todavía no se subieron.
async function adjuntosPDF(extra){
  let ya=[];try{ya=extra?await extra():[]}catch(e){console.error(e)}
  return [...(ya||[]),...archivos.map(f=>({nombre:'Croquis del cliente: '+f.name,blob:f}))];
}
const latin=t=>String(t).replace(/[^\x20-\x7E\xA0-\xFF]/g,'?');
function aPNG(blob){return new Promise((ok,mal)=>{const im=new Image(),u=URL.createObjectURL(blob);
  im.onload=()=>{const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext('2d').drawImage(im,0,0);URL.revokeObjectURL(u);c.toBlob(b=>b?b.arrayBuffer().then(ok,mal):mal(new Error('imagen')),'image/png')};
  im.onerror=()=>{URL.revokeObjectURL(u);mal(new Error('formato de imagen no soportado'))};im.src=u})}
// Suma al PDF de la nota las páginas de cada plano: los PDF se copian tal cual (sin perder calidad) y las imágenes van una por hoja
async function sumarPlanos(blob,adj){
  const conArchivo=adj.filter(a=>a.blob);if(!conArchivo.length)return blob;
  await cargarJS('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js');
  const {PDFDocument,StandardFonts,rgb}=window.PDFLib;
  const doc=await PDFDocument.load(await blob.arrayBuffer());const font=await doc.embedFont(StandardFonts.HelveticaBold);
  const fallaron=[];
  for(const a of conArchivo){
    try{const tipo=a.blob.type||'',nom=a.nombre||'';
      if(tipo==='application/pdf'||/\.pdf$/i.test(nom)){const src=await PDFDocument.load(await a.blob.arrayBuffer(),{ignoreEncryption:true});
        (await doc.copyPages(src,src.getPageIndices())).forEach(pg=>doc.addPage(pg));continue}
      const buf=await a.blob.arrayBuffer();
      const img=/jpe?g/i.test(tipo)||/\.jpe?g$/i.test(nom)?await doc.embedJpg(buf):/png/i.test(tipo)||/\.png$/i.test(nom)?await doc.embedPng(buf):await doc.embedPng(await aPNG(a.blob));
      const hor=img.width>img.height,W=hor?841.89:595.28,H=hor?595.28:841.89,M=28,T=22;
      const pg=doc.addPage([W,H]);pg.drawText(latin(nom).slice(0,110),{x:M,y:H-M-10,size:11,font,color:rgb(.12,.14,.19)});
      const k=Math.min((W-2*M)/img.width,(H-2*M-T)/img.height);
      pg.drawImage(img,{x:(W-img.width*k)/2,y:M+(H-2*M-T-img.height*k)/2,width:img.width*k,height:img.height*k});
    }catch(e){console.error(e);fallaron.push(a.nombre)}
  }
  if(fallaron.length)toast('⚠️ No se pudo sumar al PDF: '+fallaron.join(', '));
  return new Blob([await doc.save()],{type:'application/pdf'});
}
async function descargarPDF(btn,extra){
  const txt=btn.textContent;btn.textContent='Armando el PDF…';btn.disabled=true;
  try{
    const adj=await adjuntosPDF(extra||opts.adjuntos);
    let blob=await generarPDF(adj);
    blob=await sumarPlanos(blob,adj);
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
  const base={oficina:{prod:'Oficina',tam:'20 DV',espacios:[E('oficina','Extremo izquierdo'),E('bano','Extremo derecho',['Inodoro','Bacha'])],piso:'Flotante PVC',rev:['PVC'],pInterior:'Aluminio',linea:'Módena'},
    sanitario:{prod:'Sanitario',tam:'20 DV',espacios:[E('bano','Extremo izquierdo',['Inodoro','Mingitorio','Bacha']),E('bano','Centro',['Inodoro','Bacha']),E('bano','Extremo derecho',['Ducha','Bacha'])],piso:'Original epoxy alto tránsito',rev:['PVC'],pInterior:'Aluminio',linea:'Herrero'},
    vivienda:{prod:'Módulo habitable',tam:'40 HC',espacios:[E('habitacion','Extremo izquierdo'),E('habitacion','Extremo derecho'),E('cocina','Centro',['Bacha monocomando','Bajo mesada','Alacena']),E('bano','Centro',['Inodoro','Bidet','Bacha','Ducha','Espejo'])],piso:'Flotante madera',rev:['Durlock'],pInterior:'Madera',linea:'DVH'},
    otro:{}}[m];
  d.modelo=m;if(m==='otro'){render();toast('Empezás de cero: cargá todo en los pasos siguientes');return}
  Object.assign(d,limpio(base));d.espacios=base.espacios;d.revAsig={};d.elec={};const [l,a,h]=MED[d.tam];d.largo=l;d.ancho=a;d.alto=h;
  render();toast('Modelo cargado: revisá y cambiá lo que haga falta');
}
function limpio(o){return JSON.parse(JSON.stringify(o))}
function toast(t){let el=document.getElementById('np-tt');if(!el){el=document.createElement('div');el.id='np-tt';document.body.appendChild(el)}el.textContent=t;el.style.opacity=1;clearTimeout(toast.t);toast.t=setTimeout(()=>el.style.opacity=0,2400)}
function conectar(R0){
R0.addEventListener('click',e=>{
  const bp=e.target.closest('#np-b-pdf');if(bp){descargarPDF(bp);return}
  const t=e.target.closest('[data-k],[data-m],[data-mas],[data-menos],[data-em],[data-ep],[data-quitar],[data-quitarp],[data-quitaf],[data-modelo],[data-up],[data-um],#np-add-v,#np-add-p');if(!t)return;
  if(t.dataset.modelo){modelo(t.dataset.modelo);return}
  if(t.dataset.up||t.dataset.um){d.unidades=Math.min(MAX_U,Math.max(1,unidades()+(t.dataset.up?1:-1)));render();return}
  if(t.id==='np-add-v'){d.ventanas.push({esp:'',med:'',ancho:'',alto:'',tipo:'',pared:'',pos:'',prot:''});render();return}
  if(t.id==='np-add-p'){d.puertas.push(nuevaPuerta());render();return}
  if(t.dataset.quitaf!=null){archivos.splice(+t.dataset.quitaf,1);render();return}
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
  // revestimientos de baño/cocina (paredes y techo): son opcionales, tocar de nuevo la opción elegida la saca
  if(k.startsWith('rh.')){const y=d.espacios.find(z=>z.id===k.slice(3));y.rev=y.rev===v?'':v;render();return}
  if(k.startsWith('rt.')){const y=d.espacios.find(z=>z.id===k.slice(3));y.revT=y.revT===v?'':v;render();return}
  if(k.startsWith('ra.')){d.revAsig[k.slice(3)]=v;render();return}
  if(k.startsWith('elec.')){const p=k.slice(5).split('.');const c=p.pop();d.elec[p.join('.')][c]=v;render();return}
  if(k.startsWith('ubi.')){d.espacios.find(y=>y.id===k.slice(4)).ubi=v;render();return}
  if(k==='cont'){const c=CONT[v];d.cont=v;d.prod=c.prod;d.ot=!!c.ot;if(c.lado)d.lado=c.lado;if(c.tam){const [l,a,h]=MED[c.tam];d.tam=c.tam;d.largo=l;d.ancho=a;d.alto=h}render();return}
  if(k==='prod')d.cont='',d.ot=false;
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
  if(t.dataset.f&&t.files.length){const lugar=cupoCroquis()-archivos.length,nuevos=[...t.files];
    archivos.push(...nuevos.slice(0,lugar));
    toast(nuevos.length>lugar?`⚠️ Máximo ${MAX_CROQUIS} archivos: se agregaron ${Math.max(0,lugar)}`:'📎 '+(nuevos.length>1?nuevos.length+' archivos':nuevos[0].name)+' se sube'+(nuevos.length>1?'n':'')+' al guardar');render()}
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
  try{const ok=await opts.onGuardar(limpio(d),{enviar,borrador,archivos:archivos.slice()});if(ok!==false)cerrar(true)}
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
  opts=o||{};archivos=[];intento=false;paso=0;
  d=normProd(Object.assign(nuevo(),o&&o.ficha&&o.ficha.v===2?limpio(o.ficha):{}));
  if(!d.puertas||!d.puertas.length)d.puertas=[nuevaPuerta()];
  fecha0=d.fecha||'';
  if(!d.cli&&o&&o.cliente)d.cli=o.cliente;
  if(!d.empresa&&o&&o.empresa)d.empresa=o.empresa;
  const R0=montar();$('#np-tit').textContent=opts.titulo||'Nueva nota de pedido';$('#np-borr').style.display=opts.borrador===false?'none':'';
  inicial=JSON.stringify(d);R0.classList.add('on');document.body.style.overflow='hidden';render();arriba();
}
// Funciones para mostrar una nota guardada fuera del asistente
function conD(f,fn){const pd=d,pp=paso;d=normProd(Object.assign(nuevo(),limpio(f||{})));try{return fn()}finally{d=pd;paso=pp}}
function faltantes(f){return conD(f,()=>{const out=[];revisandoGuardada=true;try{for(paso=0;paso<6;paso++)out.push(...errores())}finally{revisandoGuardada=false}if(!d.confirmado)out.push('Falta la confirmación del cliente');return out})}
// Agrega las claves que la base ya exige para pasar a arquitectura (largo/ancho/alto, puerta, elec, sani, confirmada).
// largo, ancho, alto y elec ya vienen de la nota (en cm y por espacio); solo se suman las que faltan.
function compat(f){return conD(f,()=>({v:2,...limpio(d),
    puerta:d.puertaP?'A confirmar':(d.puertas.map(p=>p.tipo).filter(Boolean).join(' + ')||''),
    sani:d.espacios.some(x=>ITEMS[x.tipo])?'Sí':'No',confirmada:!!d.confirmado}))}
function nombreSugerido(f){const M={oficina:'Oficina',vivienda:'Vivienda',sanitario:'Sanitario'};const u=Math.floor(Number(f.unidades))||1;const pr=normProd({prod:f.prod}).prod;const c=normProd(limpio(f)).cont;if(c)return (u>1?u+' × ':'')+c+(c==='Contenedor reefers'&&f.tam?' '+f.tam:'')+(f.cli?' — '+f.cli:'');return (u>1?u+' × ':'')+[(pr&&pr!=='Módulo habitable'?pr:(M[f.modelo]||pr||'Pedido')),f.tam].filter(Boolean).join(' ')+(f.cli?' — '+f.cli:'')}
function tipoTrabajo(f){if(f.prod==='Contenedor')return 'Contenedor '+(/^40/.test(f.tam||'')?'40':'20')+' pies';if(f.prod==='Reefer')return 'Reefer';if(f.prod==='Contenedor cortado')return 'Modificación contenedor';const pr=normProd({prod:f.prod}).prod;if(pr&&pr!=='Módulo habitable')return pr;return f.modelo==='oficina'?'Oficina':'Módulo habitable'}

// ── Cómputo para el costeo (solo lo usa el administrador) ──
// Devuelve una línea por cada cosa a costear: clave (nombre en la lista de costos), rubro, unidad y cantidad.
// Las superficies son aproximadas a partir de las medidas del contenedor; el administrador puede corregirlas.
function lineasCosteo(){
  const out=[];const r2=x=>Math.round(x*100)/100;
  const add=(clave,rubro,unidad,cant,det='',pend=false)=>{if(!(cant>0))return;const ya=out.find(x=>x.clave===clave&&x.det===det);if(ya)ya.cant=r2(ya.cant+cant);else out.push({clave,rubro,unidad,cant:r2(cant),det,pend})};
  const L=largoTot()/100,A=(Number(d.ancho)||0)/100,H=(Number(d.alto)||0)/100;
  const paredes=2*(L+A)*H, techo=L*A, piso=L*A;
  if(d.tam)add('Contenedor '+d.tam+(d.ot?' OT':'')+(d.prod==='Reefer'?' reefer '+(d.motor||'').toLowerCase():''),'mat','c/u',1);
  if(d.prod==='Contenedor cortado')add('Corte de contenedor','mo','c/u',1,d.corte?d.corte+' cm':'');
  // espacios
  const esp=d.espacios, humedos=esp.filter(x=>ITEMS[x.tipo]);
  esp.forEach(x=>{add('Armado de '+ESP[x.tipo].toLowerCase(),'mo','c/u',1);
    (x.items||[]).forEach(it=>add((x.tipo==='bano'?'Sanitario · ':'Cocina · ')+it,'mat','c/u',1))});
  if(esp.length>1)add('Tabique divisorio','mat','m²',(esp.length-1)*A*H);
  if(humedos.length)add('Instalación sanitaria por ambiente','mo','c/u',humedos.length);
  const enZona=u=>Math.max(1,esp.filter(x=>x.ubi===u).length);
  let humedo=0;
  humedos.forEach(x=>{const m=2*(L/3+A)*H/enZona(x.ubi);humedo+=m;if(x.rev)add('Revestimiento '+x.rev.toLowerCase()+' (baño/cocina)','mat','m²',m,etiqueta(x));
    if(x.revT)add('Revestimiento de techo '+x.revT.toLowerCase()+' (baño/cocina)','mat','m²',L/3*A/enZona(x.ubi),etiqueta(x))});
  // terminaciones
  // pintura: un solo ítem (exterior + interior), en tachos de 20 l. Se redondea para arriba al final.
  const m2Pint=(paredes+techo)*((d.pExt===SIN_PINT?0:1)+((d.pInt&&d.pInt!=='Sin pintura')?1:0));
  if(!esSolo(d.prod)||d.pExt||d.pExtP)add('Pintura','mat',PINT_UNI,m2Pint/PINT_M2,'',d.pExtP);
  if(d.revExt&&d.revExt!=='Sin revestimiento')add('Revestimiento exterior · '+d.revExt,'mat','m²',paredes);
  // aislación de paredes y techo en los módulos armados
  if(esModulo(d.prod))add('Aislación térmica','mat','m²',paredes+techo);
  if(d.piso)add('Piso · '+d.piso,'mat','m²',piso);
  const resto=Math.max(0,paredes-humedo), dest=revDestinos();
  (d.rev||[]).filter(v=>v!=='Sin revestimiento'&&v!=='Solo pintura').forEach(v=>{
    const n=d.rev.length>1?dest.filter(x=>d.revAsig[x.k]===v).length:dest.length;
    if(n&&dest.length)add('Revestimiento interior · '+v,'mat','m²',resto*n/dest.length)});
  if(esp.length>1&&d.pInterior)add('Puerta interior · '+d.pInterior,'mat','c/u',esp.length-1);
  // aberturas
  if(d.puertaP)add('Puerta exterior (a confirmar)','mat','c/u',d.puertas.length||1,'',true);
  else if(d.segunPlano&&!d.puertas.some(p=>p.tipo))add('Puerta exterior (según plano)','mat','c/u',1,'',true);
  else d.puertas.forEach(p=>{if(!p.tipo)return;add('Puerta exterior · '+p.tipo+(p.tipo==='Original del contenedor'?'':' '+(p.med==='Otra'?'medida especial':(p.med||'90')+' cm')),'mat','c/u',1,p.med==='Otra'?p.ancho+' × '+p.alto+' cm':'');
    if(p.prot==='Reja')add('Reja de puerta','mat','c/u',1);if(p.prot==='Postigón')add('Postigón','mat','c/u',1)});
  d.ventanas.forEach(v=>{add('Ventana '+(d.linea||'')+' · '+(v.med==='Otra'?'medida especial':(v.med||'').replace(' (baño)','')),'mat','c/u',1,v.med==='Otra'?v.ancho+' × '+v.alto+' cm':'');
    if(v.prot==='Reja')add('Reja de ventana','mat','c/u',1);if(v.prot==='Mosquitero')add('Mosquitero','mat','c/u',1)});
  // instalaciones
  const el=Object.values(d.elec||{});
  if(!esSolo(d.prod))add('Tablero y disyuntor','mat','c/u',1);
  add('Toma','mat','c/u',el.reduce((s,x)=>s+(x.tomas||0),0));
  ['Plafón','Tubo LED'].forEach(t=>add('Luz · '+t,'mat','c/u',el.filter(x=>x.tipo===t).reduce((s,x)=>s+(x.luces||0),0)));
  if(d.aa==='Solo pre-instalación')add('Pre-instalación de aire','mat','c/u',1);
  if(d.aa==='Sí, con equipo')add('Aire acondicionado '+(d.aaFrig||''),'mat','c/u',1);
  if(d.termo==='Sí')add('Termotanque '+(d.termoTipo||'').toLowerCase(),'mat','c/u',1,d.termoL?d.termoL+' l':'');
  if(d.tanque==='Sí')add('Tanque de agua','mat','c/u',1,d.tanqueL?d.tanqueL+' l':'');
  // generales
  if(!esSolo(d.prod))add('Mano de obra general','mo','m²',piso);
  add('Flete','ter','c/u',1,d.loc||'');
  // varias unidades iguales: todo se multiplica por la cantidad
  const u=unidades();if(u>1)out.forEach(x=>x.cant=r2(x.cant*u));
  out.forEach(x=>{if(x.unidad===PINT_UNI)x.cant=Math.ceil(x.cant-1e-9)});
  return out;
}
window.NotaPedido={abrir,cerrar,
  lineasCosteo:f=>conD(f,()=>lineasCosteo()),
  resumen:f=>conD(f,()=>resumenCuerpo()),
  dibujos:f=>conD(f,()=>(d.espacios.length?planoSVG():'')+abertSVG()),
  pendientes:f=>conD(f,()=>pendientes()),
  faltantes,compat,nombreSugerido,tipoTrabajo,EMPRESAS,
  // tipología del proyecto, para la receta de materiales: producto, tamaño y cantidad de unidades
  TIPOLOGIAS:[...PROD_MOD,'Contenedor cortado','Reefer','Contenedor'],TAMS:Object.keys(MED),
  tipologia:f=>conD(f,()=>({prod:d.prod,tam:d.tam,unidades:unidades()})),
  // adj: función que devuelve los planos del proyecto [{nombre,blob}] o [{nombre,url}] para sumarlos al PDF
  pdf:(f,btn,adj)=>{const pd=d,pa=archivos;d=normProd(Object.assign(nuevo(),limpio(f)));archivos=[];return descargarPDF(btn||{textContent:'',disabled:false},adj||(()=>[])).finally(()=>{d=pd;archivos=pa})}};
})();
