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
const esPresu=()=>d.sol==='Presupuesto';
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
  'Cortado 20 (3mts)':{prod:'Contenedor cortado',tam:'20 DV',corte:300},
  'Cortado 40 DV PT':{prod:'Contenedor cortado',tam:'40 ST',lado:'Parte trasera'},
  'Cortado 40 DV PO':{prod:'Contenedor cortado',tam:'40 ST',lado:'Puertas originales'},
  'Contenedor 20 DV':{prod:'Contenedor',tam:'20 DV',ot:false},
  'Contenedor 20 DV OT':{prod:'Contenedor',tam:'20 DV',ot:true},
  'Contenedor 40 HC':{prod:'Contenedor',tam:'40 HC',ot:false},
  'Contenedor 40 HC OT':{prod:'Contenedor',tam:'40 HC',ot:true},
  'Contenedor reefers':{prod:'Reefer'}};
const esSolo=p=>p==='Contenedor'; // venta del contenedor sin transformar
// Notas guardadas antes de las opciones de contenedor: se les asigna la opción que corresponde
function contDe(x){if(x.cont&&CONT[x.cont])return x.cont;return Object.keys(CONT).find(k=>{const c=CONT[k];return c.prod===x.prod&&(!c.tam||c.tam===x.tam)&&(!c.lado||c.lado===x.lado)&&(c.corte==null||Number(x.corte)===c.corte)&&(c.ot==null||c.ot===!!x.ot)})||''}
const normProd=x=>{if(x.prod==='Módulo habitacional')x.prod='Módulo habitable';if(x.prod&&!PROD_MOD.includes(x.prod))x.cont=contDe(x);else x.cont='';normAbert(x);return x};
// ---- Tipologías de aberturas y sus limitaciones técnicas ----
// La lista y los máximos los edita el líder o el admin (Materiales → "Limitaciones de aberturas", migración 0022).
// Si la migración no se corrió, se usan estos valores (tabla de Cristian, 24/11). Medidas máximas en mm.
const LIM_DEF=[
  {tipologia:'Puerta ingreso',clase:'puerta',ancho_max_mm:1000,alto_max_mm:null},
  {tipologia:'Puerta ventana corrediza',clase:'puerta',ancho_max_mm:null,alto_max_mm:2300},
  {tipologia:'Ventana corrediza',clase:'ventana'},{tipologia:'Raja',clase:'ventana'},{tipologia:'Ventiluz',clase:'ventana'},
  {tipologia:'Desplazable',clase:'ventana'},{tipologia:'Banderola',clase:'ventana'},{tipologia:'Oscilobatiente',clase:'ventana'}];
let LIM=LIM_DEF;
const PUERTA_ORIG='Original del contenedor';
const tiposPuerta=()=>[...LIM.filter(x=>x.clase==='puerta').map(x=>x.tipologia),PUERTA_ORIG];
const tiposVentana=()=>LIM.filter(x=>x.clase==='ventana').map(x=>x.tipologia);
// Notas cargadas antes: los tipos viejos pasan al nombre de la tabla
const PUERTA_VIEJA={'De abrir':'Puerta ingreso','Corrediza':'Puerta ventana corrediza'};
const VENTANA_VIEJA={'Corrediza':'Ventana corrediza'};
function normAbert(x){(x.puertas||[]).forEach(p=>{if(p&&PUERTA_VIEJA[p.tipo])p.tipo=PUERTA_VIEJA[p.tipo]});(x.ventanas||[]).forEach(v=>{if(v&&VENTANA_VIEJA[v.tipo])v.tipo=VENTANA_VIEJA[v.tipo]})}
// En la lista de materiales (y en Costos) las puertas conservan el nombre de siempre, para no perder los costos cargados
// Líneas y vidrios de ventanas (pedido de Cristian 26/11): Herrero y DVH dejan de ser línea; el DVH pasa a ser tipo de vidrio.
// Las notas viejas con línea Herrero/DVH se siguen mostrando como estaban (listaCon), y una línea DVH vieja cuenta como vidrio DVH.
const LINEAS=['Módena','A30','A40'], VIDRIOS=['Simple','DVH (3+3 / Cam 9)'];
const esDVH=()=>/^DVH/.test(d.vidrio||'')||d.linea==='DVH';
const VENT_M2='Aberturas: ventanas por m² (MO+MAT)', DVH_M2='Aberturas: adicional vidrio DVH por m²';
// toda la melamina (paredes, techo de baño/cocina y revestimiento interior) es un solo concepto, en m² (pedido de Cristian 27/11)
const MELAMINA='Revestimiento melamina 5.5';
const PUERTA_MAT={'Puerta ingreso':'De abrir','Puerta ventana corrediza':'Corrediza'};
const mmTxt=mm=>Number(mm).toLocaleString('es-AR')+' mm';
function limTxt(t){const L=LIM.find(x=>x.tipologia===t);if(!L)return '';const a=[];if(L.ancho_max_mm)a.push('ancho hasta '+mmTxt(L.ancho_max_mm));if(L.alto_max_mm)a.push('alto hasta '+mmTxt(L.alto_max_mm));return a.join(' y ')}
// Medidas que pasan el máximo de su tipología (las medidas de la nota están en cm)
function excesos(o,esPuerta){const L=LIM.find(x=>x.tipologia===o.tipo);if(!L)return [];
  const an=Number(esPuerta?(o.med==='Otra'?o.ancho:o.med):o.ancho)||0, al=Number(esPuerta?(o.med==='Otra'?o.alto:0):o.alto)||0, out=[];
  if(L.ancho_max_mm&&an*10>L.ancho_max_mm)out.push(`el ancho máximo es ${mmTxt(L.ancho_max_mm)} (${L.ancho_max_mm/10} cm) y tiene ${an} cm`);
  if(L.alto_max_mm&&al*10>L.alto_max_mm)out.push(`el alto máximo es ${mmTxt(L.alto_max_mm)} (${L.alto_max_mm/10} cm) y tiene ${al} cm`);
  return out}
const msgExceso=(o,esPuerta,nom)=>{const x=excesos(o,esPuerta);return x.length?`${nom} (${o.tipo.toLowerCase()}): ${x.join(' y ')}`:''};
// Opciones de tipo: si una nota vieja tiene un tipo que ya no está en la lista, se sigue mostrando
const listaCon=(l,v)=>v&&!l.includes(v)?[...l,v]:l;
function avisoLim(o,esPuerta,i,nom){const m=msgExceso(o,esPuerta,nom),t=limTxt(o.tipo);
  return `<div class="err" data-lim="${esPuerta?'p':'v'}${i}" style="${m?'':'display:none'}">⚠️ ${esc(m)}</div>${t?`<div class="auto" style="margin-top:6px">📏 ${esc(o.tipo)}: ${esc(t)}</div>`:''}`}
const nomProd=()=>d.cont||d.prod;
const ESP={bano:'Baño',cocina:'Cocina',habitacion:'Habitación',oficina:'Oficina'};
const UBI=['Extremo izquierdo','Centro','Extremo derecho'];
const PAREDES=['Lateral A','Lateral B','Lado puertas','Lado opuesto'];
const REV_HUM=['Símil mármol','PVC','Melamina','Cerámico'];
const REV_INT=['PVC','Durlock','Fenólico','Melamina','WPC Varillado','Solo pintura','Sin revestimiento'];
const REV_EXT=['Sin revestimiento','Megacold','Chapa prepintada negra','Chapa prepintada blanca','PVC','Siding','WPC Varillado'];
const nuevaPuerta=()=>({tipo:'',med:'',ancho:'',alto:'',pared:'',pos:'',mano:'',prot:''});
const ITEMS={bano:['Inodoro','Mingitorio','Bidet','Lavamatic','Bacha','Ducha','Mueble','Espejo'],cocina:['Bacha monocomando','Bajo mesada','Alacena','Cocina eléctrica']};
// Lo mínimo que lleva cada ambiente, ya marcado al agregarlo (pedido de Cristian 27/11): el vendedor suma o saca lo demás.
// Baño: inodoro, lavamatic y vanitory (bacha con grifería + mueble), más un ventiluz, tabique y puerta interior.
// Si lleva bidet no va el lavamatic. Cocina: bacha con grifería, bajo mesada y alacena (por metro). Habitación: ventana, tabique y puerta.
const DEF_ITEMS={bano:['Inodoro','Lavamatic','Bacha','Mueble'],cocina:['Bacha monocomando','Bajo mesada','Alacena']};
const ITEM_TXT={'Bacha':'Bacha con grifería','Mueble':'Mueble de vanitory','Bacha monocomando':'Bacha con grifería'};
const itemTxt=o=>ITEM_TXT[o]||o;
const ML_COCINA=1.4;   // metros de mesada por defecto (bajo mesada 1,40 × 0,60 y alacena 1,40 × 0,40 de la planilla)
const mlDe=x=>Number(x&&x.ml)>0?Number(x.ml):ML_COCINA;
const cerrados=()=>d.espacios.filter(x=>x.tipo==='bano'||x.tipo==='habitacion').length;   // cada uno lleva tabique y puerta sí o sí
// Revestimientos (interior y exterior): paredes + techo + 10% de desperdicio (pedido de Cristian 27/11: 20' ≈ 66 m², 40' ≈ 125 m²)
const REV_DESP=1.10;
const COLORES=['Blanco','Gris claro','Gris grafito','Negro','Azul','Verde inglés','Otro'];
const SIN_PINT='No lleva'; // pintura exterior: el contenedor queda sin pintar por fuera
let paso=0, intento=false, opts={}, archivos=[], ocupado=false;
// valor de venta de una orden de compra sin presupuesto: obligatorio (pedido de Cristian 27/11). No va en la ficha: la plata no la ven todos
let valVenta='';
// Croquis táctil: qué se va a ubicar al tocar el dibujo ({pon:'bano'|'puerta'|...} o {sel:id|'p0'|'v1'})
let herr={};
const MAX_CROQUIS=3; // archivos del cliente por nota (croquis, planos, fotos)
const cupoCroquis=()=>Math.max(0,MAX_CROQUIS-(opts.croquisPrevios||0));
// Hay un plano o croquis para seguir: el que se sube ahora, uno ya subido (del cliente o de arquitectura)
const hayPlano=()=>!!(archivos.length||opts.croquisPrevios||opts.planosPrevios||d.segunPlano);
// Correo del cliente obligatorio (pedido de ventas 27/11) en las notas nuevas y en las que siguen en ventas.
// Las que ya pasaron de ventas no se frenan por esto (se cargaron cuando era opcional).
const mailObligatorio=()=>!revisandoGuardada&&(!opts.proyectoId||opts.enviar!==false);
// El cliente trajo su propio plano o croquis (archivos de la nota): en el PDF se elige qué dibujo va
const PREF_CLI='Croquis del cliente: ';
const hayPlanoCliente=()=>!!(archivos.length||opts.croquisPrevios);
const PDF_DIB={plano:'El plano del cliente',croquis:'El croquis de la app',ambos:'Los dos'};
// Con "seguir tal cual plano adjunto" las aberturas no son obligatorias: solo se revisan las que se empezaron a cargar
const empezada=p=>!!(p.tipo||p.pared||p.mano||p.med);
const puertasVal=()=>d.segunPlano?d.puertas.filter(empezada):d.puertas;
// Equipos de aire por unidad: lo que cargó ventas o, si no, lo de la planilla de cotización:
// Módulo habitable Company 3, Oficina Company 2, el resto 1 (Cristian 19/11)
function aaPorDefecto(){return d.prod==='Módulo habitable Company'?3:d.prod==='Oficina Company'?2:1}
function aaCant(){const n=Math.floor(Number(d.aaCant));return n>0?n:aaPorDefecto()}
function plazoMin(prod){return /Company$/.test(prod||'')?PLAZO_COMPANY:PLAZO_RESTO}
function fechaMin(dias){const f=new Date();f.setDate(f.getDate()+dias);return f.getFullYear()+'-'+String(f.getMonth()+1).padStart(2,'0')+'-'+String(f.getDate()).padStart(2,'0')}
// Error si la fecha de entrega no respeta el plazo mínimo del producto (solo al cargar o cambiar la fecha)
function errPlazo(){if(revisandoGuardada||!d.fecha||!d.prod||sinCambioFecha())return null;const n=plazoMin(d.prod);
  return d.fecha<fechaMin(n)?`Para ${nomProd()} la entrega es como mínimo a ${n} días: poné la fecha desde el ${fechaMin(n).split('-').reverse().join('/')} (paso 1)`:null}
function nuevo(){return {empresa:'',arq:'Sí',sol:'',cli:'',tel:'',mail:'',cuit:'',loc:'',maps:'',mapsOk:false,fecha:'',modelo:'',
  unidades:1,prod:'',cont:'',ot:false,tam:'',motor:'',corte:'',lado:'',largo:'',ancho:'',alto:'',
  espacios:[],tab:null,
  pExt:'',pExtOtro:'',pExtP:false,pInt:'',pIntOtro:'',piso:'',rev:[],revAsig:{},revExt:'',pInterior:'',
  linea:'',vidrio:'',puertas:[nuevaPuerta()],puertaP:false,ventanas:[],segunPlano:false,
  elec:{},aa:'',aaFrig:'',aaEsp:'',aaCant:'',termo:'',termoL:'',termoTipo:'',tanque:'',tanqueL:'',
  obs:'',archivos:[],confirmado:false}}
let d=nuevo();
const raiz=()=>document.getElementById('nota');
const $=s=>raiz().querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function ops(key,lista,val,extra=''){return `<div class="ops">${lista.map(o=>`<div class="op ${val===o?'sel':''}" data-k="${key}" data-v="${esc(o)}" ${extra}>${esc(o)}</div>`).join('')}</div>`}
function multi(key,lista,vals,lab){return `<div class="ops">${lista.map(o=>`<div class="op ${vals.includes(o)?'sel':''}" data-m="${key}" data-v="${esc(o)}">${esc(lab?lab(o):o)}</div>`).join('')}</div>`}
function confBox(key,val){return `<label class="conf"><input type="checkbox" data-c="${key}" ${val?'checked':''}> A confirmar</label>`}
function setPath(path,v){const ks=path.split('.');let o=d;ks.slice(0,-1).forEach(k=>o=o[k]);o[ks.at(-1)]=v}
function getPath(path){return path.split('.').reduce((o,k)=>o?.[k],d)}
const total=()=>d.espacios.length;
const MAX_U=200;
const unidades=()=>Math.max(1,Math.floor(Number(d.unidades))||1);
const cuenta=k=>d.espacios.filter(x=>x.tipo===k).length;
function etiqueta(x){const n=d.espacios.filter(y=>y.tipo===x.tipo);return ESP[x.tipo]+(n.length>1?' '+(n.indexOf(x)+1):'')}
const nid=()=>Math.random().toString(36).slice(2,8);
// Agrega un espacio con lo que lleva por defecto. El baño trae su ventiluz y la habitación su ventana (falta elegir pared y medida).
function nuevoEsp(tipo,ubi){
  const x={id:nid(),tipo,ubi:ubi||'',items:(DEF_ITEMS[tipo]||[]).slice()};if(tipo==='cocina')x.ml=ML_COCINA;
  d.espacios.push(x);
  if(tipo==='bano')d.ventanas.push({esp:etiqueta(x),med:'60 × 40 (baño)',ancho:'60',alto:'40',tipo:tiposVentana().includes('Ventiluz')?'Ventiluz':'',pared:'',pos:x.ubi||'',prot:'',auto:x.id});
  if(tipo==='habitacion')d.ventanas.push({esp:etiqueta(x),med:'',ancho:'',alto:'',tipo:'',pared:'',pos:x.ubi||'',prot:'',auto:x.id});
  return x}
// las ventanas que trajo un espacio siguen su nombre (Baño → Baño 1 cuando se agrega otro)
function syncAuto(){d.ventanas.forEach(v=>{if(!v.auto)return;const x=d.espacios.find(y=>y.id===v.auto);if(x)v.esp=etiqueta(x)})}
const largoTot=()=>Number(d.corte)||Number(d.largo)||0;
const esLateral=p=>p==='Lateral A'||p==='Lateral B';
const anchoPuerta=p=>Number(p.med==='Otra'?p.ancho:p.med)||90;
function revDestinos(){return d.espacios.length?d.espacios.filter(x=>!ITEMS[x.tipo]).map(x=>({k:x.id,n:etiqueta(x)})):UBI.map(u=>({k:u,n:u}))}
function revTexto(){if(!d.rev.length)return '?';if(d.rev.length===1)return d.rev[0].toLowerCase();return revDestinos().map(x=>`${(d.revAsig[x.k]||'?').toLowerCase()} en ${x.n.toLowerCase()}`).join(', ')}
function nomPared(p){return p==='Lado puertas'&&d.prod==='Contenedor cortado'&&d.lado==='Parte trasera'?'lado del corte':esLateral(p)?p:p.toLowerCase()}
function dondeTxt(o){return o.pared?nomPared(o.pared)+(esLateral(o.pared)&&o.pos?', '+o.pos.toLowerCase():''):'?'}

function errores(){
  const e=[];
  if(paso===0){if(!d.empresa&&!revisandoGuardada)e.push('Elegí la empresa que vende');if(!d.sol)e.push('Elegí el tipo de solicitud');if(!d.cli.trim())e.push('Falta el cliente');if(!d.tel.trim())e.push('Falta el teléfono');if(!(d.mail||'').trim()){if(mailObligatorio())e.push('Falta el correo del cliente')}else if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.mail.trim()))e.push('Revisá el correo del cliente');if(!d.loc.trim())e.push('Falta la dirección de entrega');else if(!d.mapsOk)e.push('Verificá la dirección en el mapa y tildá la confirmación');if(!d.fecha)e.push('Falta la fecha de entrega');else if(!revisandoGuardada&&!d.prod&&!sinCambioFecha()&&d.fecha<fechaMin(PLAZO_COMPANY))e.push(`La entrega es como mínimo a ${PLAZO_COMPANY} días (productos Company) o ${PLAZO_RESTO} días (el resto)`);else{const ep=errPlazo();if(ep)e.push(ep)}}
  if(paso===1){if(!d.prod)e.push('Elegí el producto');{const ep=errPlazo();if(ep)e.push(ep)}if(!d.tam)e.push('Elegí el tamaño');
    if(d.prod==='Contenedor cortado'){const c=Number(d.corte);if(!c)e.push('Poné el largo final del corte');else if(c>=Number(d.largo))e.push(`El corte (${c} cm) tiene que ser menor que el largo del contenedor (${d.largo} cm)`);if(!d.lado)e.push('Elegí qué lado se conserva')}
    if(d.prod==='Reefer'&&!d.motor)e.push('Indicá si es con o sin motor');
    const u=Number(d.unidades);if(!Number.isInteger(u)||u<1)e.push('La cantidad de unidades tiene que ser un número entero, 1 o más');else if(u>MAX_U)e.push(`Máximo ${MAX_U} unidades por nota`)}
  if(esSolo(d.prod)&&paso>=2&&paso<=5)return e;
  if(paso===2){if(esModulo(d.prod)&&!total())e.push('Elegí al menos un espacio');d.espacios.forEach(x=>{if(!x.ubi)e.push(`Elegí dónde va ${etiqueta(x).toLowerCase()}`);});if(!revisandoGuardada)e.push(...cortos())}
  if(paso===3){if(!d.pExt&&!d.pExtP)e.push('Elegí la pintura exterior o marcala a confirmar');if(d.pExt==='Otro'&&!d.pExtOtro.trim()&&!d.pExtP)e.push('Escribí el color o código exterior');if(d.pInt==='Otro'&&!d.pIntOtro.trim())e.push('Escribí el color o código interior');if(!d.revExt)e.push('Elegí el revestimiento exterior');if(!d.piso)e.push('Elegí el piso');if(!d.rev.length)e.push('Elegí el revestimiento interior');if(d.rev.length>1)revDestinos().forEach(x=>{if(!d.rev.includes(d.revAsig[x.k]))e.push(`Elegí qué revestimiento va en ${x.n.toLowerCase()}`)});if(total()>1&&!d.pInterior)e.push('Elegí las puertas interiores')}
  if(paso===4){if(!d.linea&&!d.segunPlano)e.push('Elegí la línea de aberturas');if(d.ventanas.length&&!d.vidrio&&!esDVH()&&!revisandoGuardada)e.push('Elegí el tipo de vidrio de las ventanas');
    if(!d.puertaP)puertasVal().forEach((p,i)=>{const n=d.puertas.length>1?' '+(i+1):'';if(!p.tipo||!p.pared||!p.mano)e.push(`Completá tipo, pared y apertura de la puerta${n} (o marcá las puertas a confirmar)`);else if(esLateral(p.pared)&&!p.pos)e.push(`Elegí en qué parte del ${p.pared.toLowerCase()} va la puerta${n}`);if(p.med==='Otra'&&(!p.ancho||!p.alto))e.push(`Poné ancho y alto de la puerta${n}`);if(!revisandoGuardada){const m=msgExceso(p,true,'Puerta'+n);if(m)e.push(m)}});
    d.ventanas.forEach((v,i)=>{if(!v.esp||!v.ancho||!v.alto||!v.tipo||!v.pared)e.push(`Completá la ventana ${i+1}`);else if(esLateral(v.pared)&&!v.pos)e.push(`Elegí en qué parte del ${v.pared.toLowerCase()} va la ventana ${i+1}`);if(!revisandoGuardada){const m=msgExceso(v,false,'Ventana '+(i+1));if(m)e.push(m)}});
    const L=largoTot(),A=Number(d.ancho)||244;
    PAREDES.forEach(pa=>{const suma=d.ventanas.filter(v=>v.pared===pa).reduce((s,v)=>s+(Number(v.ancho)||0),0)+d.puertas.filter(p=>p.pared===pa).reduce((s,p)=>s+anchoPuerta(p),0);const max=esLateral(pa)?L-60:A-40;
      if(L&&suma>max)e.push(`Las aberturas del ${nomPared(pa)} suman ${suma} cm y no entran en ${esLateral(pa)?L:A} cm de pared`)})}
  if(paso===5){if(!d.aa)e.push('Indicá aire acondicionado');if(!d.termo)e.push('Indicá termotanque');if(!d.tanque)e.push('Indicá tanque de agua');if(d.termo==='Sí'&&!d.termoL)e.push('Poné los litros del termotanque');if(d.tanque==='Sí'&&!d.tanqueL)e.push('Poné los litros del tanque')}
  // un presupuesto todavía no lo confirmó el cliente: eso se pide al pasarlo a orden de compra
  if(paso===6&&!esPresu()){if(!d.confirmado)e.push('Marcá que el cliente revisó el pedido');if(opts.pideValor&&!revisandoGuardada&&!(Number(valVenta)>0))e.push('Poné el valor de venta (USD sin IVA): sin precio no se puede revisar la orden de compra')}
  return e;
}
function pendientes(){const p=[];if(d.pExtP)p.push('Pintura exterior');if(d.puertaP)p.push('Puertas exteriores');return p}

function render(){
  syncAuto();
  $('#np-prog').innerHTML=PASOS.map((_,i)=>`<span class="${i<=paso?'on':''}"></span>`).join('');
  $('#np-h-sub').textContent=`Paso ${paso+1} de 7 · ${PASOS[paso]}`;
  $('#np-b-atras').textContent=paso?'← Atrás':'Cancelar';
  $('#np-b-sig').textContent=paso===6?(esPresu()?'Guardar presupuesto ✓':opts.enviar?(d.arq==='No'?'Enviar al líder ✓':'Enviar a arquitectura ✓'):'Guardar nota ✓'):'Siguiente →';
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
      <div class="fila"><input type="email" data-i="mail" placeholder="Correo electrónico (obligatorio: se le manda el PDF)" autocomplete="off" value="${esc(d.mail||'')}"></div>
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
    <div class="card"><div class="lbl">Tamaño de contenedor</div>${CONT[d.cont]&&CONT[d.cont].tam?`<div class="auto">Tamaño <b>${esc(d.tam==='40 ST'?'40 DV':d.tam)}</b>${d.ot?' open top':''}, según el contenedor elegido.</div>`:ops('tam',['20 DV','40 ST','40 HC'],d.tam)}
      ${d.tam?`<div class="auto">📏 Medidas exteriores: <b>${d.largo} × ${d.ancho} × ${d.alto} cm</b> (largo × ancho × alto)</div>`:''}</div>
    <div class="card"><div class="lbl">¿Cuántas unidades iguales? <small>si el cliente lleva varias idénticas, cargala una sola vez</small></div>
      <div class="cnt"><button data-um="1" aria-label="Una menos">−</button><input type="number" inputmode="numeric" min="1" max="${MAX_U}" data-i="unidades" value="${esc(d.unidades)}" style="width:80px;text-align:center;font-weight:800"><button data-up="1" aria-label="Una más">+</button></div>
      ${unidades()>1?`<div class="auto">📦 Se fabrican <b>${unidades()} unidades iguales</b>. Todo lo que cargues en los pasos siguientes es para <b>cada una</b>; materiales y costos se multiplican solos.</div>`:''}</div>
    ${d.prod==='Reefer'?`<div class="card"><div class="lbl">Motor</div>${ops('motor',['Con motor','Sin motor'],d.motor)}</div>`:''}
    ${d.prod==='Contenedor cortado'?`<div class="card"><div class="lbl">Corte</div>
      <div class="unidad"><input type="number" inputmode="numeric" data-i="corte" placeholder="Largo final" value="${esc(d.corte)}"><b>cm</b></div>
      ${CONT[d.cont]&&CONT[d.cont].lado?`<div class="auto" style="margin-top:12px">Se conserva: <b>${esc(d.lado.toLowerCase())}</b>.</div>`:`<div class="lbl" style="margin-top:12px">¿Qué parte se conserva?</div>${ops('lado',['Puertas originales','Parte trasera'],d.lado)}`}</div>`:''}`;
  }
  if(paso===2){
    h=`<div class="paso-t">Distribución</div><div class="paso-s">Cada espacio se personaliza por separado. Elegí qué querés poner y tocá en el dibujo dónde va.</div><div class="card" id="np-croq">${croquisEsp()}</div><div class="card">
    ${Object.keys(ESP).map(k=>`<div class="esp"><div class="esp-h"><b>${ESP[k]}</b><div class="cnt"><button data-menos="${k}">−</button><span>${cuenta(k)}</span><button data-mas="${k}">+</button></div></div>
      ${d.espacios.filter(x=>x.tipo===k).map(x=>`<div class="sub"><div class="lbl">${esc(etiqueta(x))}: ¿dónde va?</div>${ops('ubi.'+x.id,UBI,x.ubi||'')}${puertaOps(x)}${k==='habitacion'?`<div class="auto" style="margin-top:6px">Ya trae su ventana (elegí medida y pared en Aberturas), tabique y puerta.</div>`:''}
      ${ITEMS[k]?`<div class="lbl" style="margin-top:10px">¿Qué lleva ${esc(etiqueta(x).toLowerCase())}? <small>tocá todo lo que aplique</small></div>${multi('it.'+x.id,ITEMS[k],x.items,itemTxt)}${k==='bano'?`<div class="auto" style="margin-top:6px">Ya viene lo mínimo de un baño: inodoro, lavamatic, vanitory con grifería, ventiluz (elegí la pared en Aberturas), tabique y puerta. Si lleva bidet, el lavamatic sale solo.</div>`:''}${k==='cocina'?`<div class="lbl" style="margin-top:10px">Metros de mesada <small>bajo mesada y alacena se cotizan por metro</small></div><div class="unidad"><input type="number" inputmode="decimal" step="0.1" min="0.5" data-esml="${esc(x.id)}" value="${esc(x.ml??ML_COCINA)}"><b>m</b></div>`:''}<div class="lbl" style="margin-top:10px">Revestimiento de paredes <small>opcional · tocá de nuevo para sacarlo</small></div>${ops('rh.'+x.id,REV_HUM,x.rev||'')}<div class="lbl" style="margin-top:10px">Revestimiento de techo <small>opcional · tocá de nuevo para sacarlo</small></div>${ops('rt.'+x.id,REV_HUM,x.revT||'')}`:''}</div>`).join('')}</div>`).join('')}
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
    ${total()>1||cerrados()?`<div class="card"><div class="lbl">Puertas interiores${cerrados()?' <small>cada baño y habitación lleva la suya</small>':''}</div>${ops('pInterior',['Aluminio','Chapa contenedor','Madera'],d.pInterior)}</div>`:''}`;
  }
  if(paso===4){
    const espOps=d.espacios.map(etiqueta);
    h=`<div class="paso-t">Aberturas</div><div class="paso-s">Las puertas son lo que más consultas genera en obra: pared, ubicación y apertura son obligatorias. El dibujo se actualiza con cada abertura.</div>
    ${hayPlano()?`<div class="card ${d.segunPlano?'pend':''}"><label class="chk"><input type="checkbox" data-c="segunPlano" ${d.segunPlano?'checked':''}> <b>Seguir tal cual plano adjunto</b></label>
      <div class="aviso" style="text-align:left">${d.segunPlano?'Puertas y ventanas van como en el plano. Podés avanzar sin cargarlas, o cargar alguna igual si querés dejarla aclarada.':'Si el cliente o arquitectura ya mandaron un plano con las aberturas, tildalo y avanzá sin cargarlas una por una.'}</div></div>`
      :`<div class="aviso" style="text-align:left;margin-bottom:8px">¿Hay un plano con las aberturas? Subilo en Distribución y vas a poder seguirlo tal cual.</div>`}
    <div class="card"><div class="lbl">Línea de aberturas${d.segunPlano?' <small>opcional</small>':''}</div>${ops('linea',listaCon(LINEAS,d.linea),d.linea)}</div>
    <div class="card"><div class="lbl">Tipo de vidrio de las ventanas${d.ventanas.length?'':' <small>si hay ventanas</small>'}</div>${ops('vidrio',listaCon(VIDRIOS,d.vidrio),d.vidrio)}</div>
    <div class="card">${barraAbert()}${abertSVG(true)}</div>
    <div class="card ${d.puertaP?'pend':''}"><div class="lbl">Puertas exteriores <small>${d.puertas.length} cargada${d.puertas.length>1?'s':''}</small> ${confBox('puertaP',d.puertaP)}</div>
      ${d.puertas.map((p,i)=>`<div class="abert"><div class="abert-h">Puerta ${i+1} <span style="color:var(--nar)">(P${i+1})</span>${d.puertas.length>1?`<button class="x" data-quitarp="${i}">Quitar</button>`:''}</div>
      <div class="lbl" style="font-weight:600">Tipo</div>${ops('pu.'+i+'.tipo',listaCon(tiposPuerta(),p.tipo),p.tipo)}
      <div class="lbl" style="font-weight:600;margin-top:10px">Medida (ancho)</div>${ops('pu.'+i+'.med',['80','90','Otra'],p.med)}
      ${p.med==='Otra'?`<div class="fila"><div class="unidad"><input type="number" data-pui="${i}.ancho" placeholder="Ancho" value="${esc(p.ancho)}"><b>cm</b></div><div class="unidad"><input type="number" data-pui="${i}.alto" placeholder="Alto" value="${esc(p.alto)}"><b>cm</b></div></div>`:''}
      ${avisoLim(p,true,i,'Puerta'+(d.puertas.length>1?' '+(i+1):''))}
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
        <div class="lbl" style="font-weight:600;margin-top:8px">Tipo</div>${ops('v.'+i+'.tipo',listaCon(tiposVentana(),v.tipo),v.tipo)}
        ${avisoLim(v,false,i,'Ventana '+(i+1))}
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
      ${d.aa==='Sí, con equipo'?`<div class="fila">${ops('aaFrig',['2.250 fg','3.000 fg','4.500 fg'],d.aaFrig)}</div>`:''}
      ${d.aa&&d.aa!=='No'?`<div class="fila"><div class="lbl" style="margin:4px 0">Cantidad de equipos por unidad${/Company$/.test(d.prod||'')?` <small>(${esc(d.prod)} lleva ${aaPorDefecto()})</small>`:''}</div>
        <input type="number" inputmode="numeric" min="1" max="10" step="1" data-i="aaCant" placeholder="${aaPorDefecto()}" value="${esc(d.aaCant||'')}" style="max-width:120px"></div>`:''}</div>
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
    <div id="np-precio"></div>
    ${opts.pideValor&&!esPresu()?`<div class="card"><div class="lbl">💲 Valor de venta <small>obligatorio · USD sin IVA${unidades()>1?', las '+unidades()+' unidades':''}</small></div><input type="number" inputmode="decimal" min="0" id="np-val" placeholder="USD" value="${esc(valVenta)}"></div>`:''}
    <div class="card"><div class="lbl">Observaciones <small>opcional</small></div><textarea data-i="obs" placeholder="Algo que producción tenga que saber">${esc(d.obs)}</textarea></div>
    <div class="card"><div class="lbl">Enviar al cliente para que ${esPresu()?'lo vea':'apruebe'}</div>
      ${hayPlanoCliente()?`<div class="lbl" style="margin-top:2px">¿Qué dibujo va en el PDF? <small>el cliente trajo su plano</small></div>${ops('pdfDibujo',Object.keys(PDF_DIB),d.pdfDibujo||'plano').replace(/>(plano|croquis|ambos)</g,(m,k)=>'>'+PDF_DIB[k]+'<')}`:''}
      <button class="add" id="np-b-pdf" style="border-style:solid">📄 Descargar PDF del ${esPresu()?'presupuesto':'resumen'}</button>
      ${correoBtnHTML()}
      <div class="aviso" style="text-align:left">${esPresu()?'Incluye todo el pedido, los dibujos, los planos o croquis adjuntos y el precio. Mandalo por WhatsApp. Cuando el cliente acepte, desde la nota la pasás a orden de compra confirmada sin volver a cargar nada.':'Incluye todo el pedido, los dos dibujos y los planos o croquis adjuntos. Mandalo por WhatsApp y, cuando el cliente responda que está bien, tildá la confirmación de abajo.'}</div></div>
    ${esPresu()?'':`<div class="card"><label class="chk"><input type="checkbox" id="np-confirmado" ${d.confirmado?'checked':''}> El cliente revisó y confirmó este pedido</label></div>
    <div class="card"><div class="lbl">¿Necesita plano de arquitectura?</div>${ops('arq',['Sí','No'],d.arq||'Sí')}
      <div class="aviso" style="text-align:left">${d.arq==='No'?'La nota va directo al líder de operaciones, sin pasar por arquitectura.':'La nota va a arquitectura para que haga el plano.'}</div></div>`}`;
  }
  $('#np-app').innerHTML=(opts.aviso?`<div class="card pend" style="font-size:13px">${opts.aviso}</div>`:'')+errHTML+h;
  // precio al cliente (lo pinta el cotizador de la app: acá no hay costos)
  if(paso===6&&window.notaPrecio){try{window.notaPrecio.pintar($('#np-precio'),limpio(d),opts)}catch(e){console.error(e)}}
}
// el dibujo queda arriba y quieto; lo que se elige va debajo
function croquisEsp(){const c=cortos();return planoSVG(true)+(c.length?`<div class="err" style="margin-top:6px">⚠️ ${esc(c.join('. '))}</div>`:'')+barraEsp()}
// Texto de un espacio para el resumen y el PDF: parte, medidas, puerta interior y sanitarios ubicados a mano
function espDesc(x){const g=geoEsp(x);return `${etiqueta(x)} (${(x.ubi||'?').toLowerCase()}${g?', '+mTxt(g.largo)+' × '+mTxt(g.ancho):''})`}
function puertaTxt(x){const g=geoEsp(x),pu=g&&puertaDe(x,g.i,g.j,g.n);if(!pu)return '';const q=posTxt(pu.pared,pu.pos);return ', puerta interior hacia '+haciaTxt(x,g,pu.pared).toLowerCase()+' '+q[0].toLowerCase()+q.slice(1)}
function sinTabTxt(){const T=tabs();return [0,1].filter(k=>T.off[k]&&tabUsada(k)).map(k=>`. Sin tabique entre ${(nomZona(k)||'el espacio libre').toLowerCase()} y ${(nomZona(k+1)||'el espacio libre').toLowerCase()}`).join('')}
function resumenCuerpo(){
  const espTxt=(d.espacios.map(x=>`${espDesc(x)}${x.items&&x.items.length?' con '+x.items.join(', ').toLowerCase():''}${x.rev?', revestimiento '+x.rev.toLowerCase():''}${x.revT?', techo '+x.revT.toLowerCase():''}${x.art&&Object.keys(x.art).length?', sanitarios ubicados como en el dibujo':''}${puertaTxt(x)}`).join('; ')||'sin divisiones')+sinTabTxt();
  return `      <h4>Pedido</h4><p>${d.empresa?`Vende <b>${esc(d.empresa)}</b>. `:''}<b>${esc(d.sol||'?')}</b> para <b>${esc(d.cli||'?')}</b>${d.tel||d.mail?` (${esc([d.tel,d.mail].filter(Boolean).join(' · '))})`:''}, entrega en ${esc(d.loc||'?')}${d.maps?' (<a href="'+esc(d.maps)+'" target="_blank" rel="noopener">ubicación</a>)':''} el ${esc(d.fecha?d.fecha.split('-').reverse().join('/'):'?')}.</p>
      <h4>Producto</h4><p>${unidades()>1?`<b>${unidades()} unidades iguales</b>, cada una: `:''}${esc(d.cont||((d.prod||'?')+' '+d.tam))}${d.prod==='Contenedor cortado'?`, cortado a ${esc(d.corte)} cm conservando ${esc(d.lado.toLowerCase())}`:''}${d.prod==='Reefer'&&d.cont?' '+esc(d.tam):''}${d.motor?', '+esc(d.motor.toLowerCase()):''}. Medidas exteriores ${esc(d.largo)} × ${esc(d.ancho)} × ${esc(d.alto)} cm.</p>
      <h4>Distribución</h4><p>${esc(espTxt)}.</p>
      <h4>Terminaciones</h4><p>Pintura exterior ${d.pExtP?'<span class="tag">a confirmar</span>':(d.pExt===SIN_PINT?'no lleva':esc((d.pExt==='Otro'?d.pExtOtro:d.pExt)||'?'))}, revestimiento exterior ${esc((d.revExt||'?').toLowerCase())}, pintura interior ${esc((d.pInt==='Otro'?d.pIntOtro:d.pInt)||'—')}. Piso ${esc(d.piso.toLowerCase()||'?')}, revestimiento interior ${esc(revTexto())}.</p>
      <h4>Aberturas</h4><p>${d.segunPlano?'<b>Tal cual plano adjunto.</b> ':''}${d.linea||!d.segunPlano?`Línea ${esc(d.linea||'?')}. `:''}${d.vidrio&&(d.ventanas.length||d.segunPlano)?`Vidrio ${esc(d.vidrio)}. `:''}${d.puertaP?'Puertas exteriores <span class="tag">a confirmar</span>.':puertasVal().map((p,i)=>`Puerta ${i+1} (P${i+1}): ${esc(p.tipo.toLowerCase())} de ${p.med==='Otra'?esc(p.ancho)+' × '+esc(p.alto):esc(p.med||'?')} cm en ${esc(dondeTxt(p))}, ${esc(p.mano.toLowerCase())}${p.prot?', '+esc(p.prot.toLowerCase()):''}.`).join(' ')}
        ${d.ventanas.length?d.ventanas.map((v,i)=>` Ventana ${i+1} (V${i+1}): ${esc(v.esp)}, ${esc(v.ancho)} × ${esc(v.alto)} cm en ${esc(dondeTxt(v))}, ${esc([(v.tipo||''),(v.prot||'')].filter(Boolean).join(', ').toLowerCase())}.`).join(''):d.segunPlano?'':' Sin ventanas.'}</p>
      <h4>Instalaciones</h4><p>${Object.entries(d.elec).map(([e,x])=>`${esc(e)}: ${x.tomas} tomas, ${x.luces} luces ${esc(x.tipo.toLowerCase())} ${esc(x.luz.toLowerCase())}`).join(' · ')||'—'}. Aire: ${esc(d.aa||'?')}${d.aa&&d.aa!=='No'?' × '+aaCant():''}${d.aaFrig?' '+esc(d.aaFrig):''}. Termotanque: ${esc(d.termo||'?')}${d.termoL?' '+esc(d.termoL)+' l '+esc(d.termoTipo.toLowerCase()):''}. Tanque: ${esc(d.tanque||'?')}${d.tanqueL?' '+esc(d.tanqueL)+' l':''}.</p>`;
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
// ---- Medidas del croquis: líneas divisorias movibles ----
// Hay dos líneas divisorias posibles: la 0 (entre extremo izquierdo y centro) y la 1 (entre centro y extremo derecho).
// Se guardan en d.tab = {L: largo interior, p: [cm desde el lado puertas], off: [borrada?]}; sin d.tab quedan en tercios.
// Largo y ancho interior: el exterior menos las paredes (supuesto: 8 cm por pared, con aislación y revestimiento).
// La línea se mueve de a 10 cm y ningún espacio puede quedar más corto que su mínimo (MIN_ESP).
const PARED_CM=8, PASO_TAB=10;
const MIN_ESP={bano:120,cocina:120,habitacion:180,oficina:120}, MIN_LIBRE=30;
const largoInt=()=>Math.max(100,(largoTot()||606)-2*PARED_CM);
const anchoInt=()=>Math.max(100,(Number(d.ancho)||244)-2*PARED_CM);
const zonaEsp=i=>d.espacios.filter(e=>e.ubi===UBI[i]);
const minZona=i=>Math.max(MIN_LIBRE,...zonaEsp(i).map(x=>MIN_ESP[x.tipo]||MIN_LIBRE));
// una línea divisoria existe si separa algún espacio (si los dos lados están libres no hay tabique)
const tabUsada=k=>!!(zonaEsp(k).length||zonaEsp(k+1).length);
const mTxt=cm=>(Math.round(cm)/100).toFixed(2).replace('.',',')+' m';
const rnd=v=>Math.round(v/PASO_TAB)*PASO_TAB;
function tabs(){const Li=largoInt(),t=d.tab;
  let p=[rnd(Li/3),rnd(2*Li/3)],off=[false,false];
  if(t&&Array.isArray(t.p)){const k=t.L&&t.L!==Li?Li/t.L:1;p=t.p.map(v=>k===1?Number(v)||0:rnd(Number(v)*k));off=[0,1].map(j=>!!(t.off||[])[j])}
  p[0]=Math.max(MIN_LIBRE,Math.min(Li-2*MIN_LIBRE,p[0]));p[1]=Math.max(p[0]+MIN_LIBRE,Math.min(Li-MIN_LIBRE,p[1]));
  return {Li,p,off}}
const largoZona=(T,i)=>[T.p[0],T.p[1]-T.p[0],T.Li-T.p[1]][i];
// Mueve la línea k a v cm (de a 10 cm), sin achicar ningún espacio por debajo de su mínimo. Devuelve si topó.
function moverTab(k,v){const T=tabs();
  let lo=0;for(let z=k;z>=0;z--){lo+=minZona(z);if(z>0&&tabUsada(z-1)){lo+=T.p[z-1];break}}
  let s=0,base=T.Li;for(let z=k+1;z<=2;z++){s+=minZona(z);if(z<2&&tabUsada(z)){base=T.p[z];break}}
  const hi=base-s,pide=rnd(v);let nv=Math.max(lo,Math.min(hi,pide));if(lo>hi)nv=rnd((lo+hi)/2);
  T.p[k]=nv;const j=1-k;
  if(!tabUsada(j)){if(j<k)T.p[j]=Math.max(minZona(0),Math.min(T.p[j],T.p[k]-minZona(1)));else T.p[j]=Math.min(T.Li-minZona(2),Math.max(T.p[j],T.p[k]+minZona(1)))}
  d.tab={L:T.Li,p:T.p,off:T.off};return {tope:nv!==pide}}
const MIN_TXT=()=>`baño y cocina ${mTxt(MIN_ESP.bano)}, oficina ${mTxt(MIN_ESP.oficina)}, habitación ${mTxt(MIN_ESP.habitacion)}`;
// Cortes de las líneas que existen: [0, línea..., largo interior]
function cortesTab(T){return [0,...[0,1].filter(tabUsada).map(k=>T.p[k]),T.Li]}
function nomZona(z){const e=zonaEsp(z);return e.length?e.map(etiqueta).join(' / '):''}
function nomTramo(T,a,b){const n=[0,1,2].filter(z=>{const z0=z?T.p[z-1]:0,z1=z<2?T.p[z]:T.Li;return z0>=a-1&&z1<=b+1}).map(nomZona).filter(Boolean);return n.length?n.join(' + '):'Libre'}
// Geometría del dibujo: bordes de cada parte (zona) y rectángulo de cada espacio (si hay varios en una parte, en franjas)
function geo(X0,X1,Y0,Y1){const T=tabs(),sx=(X1-X0)/T.Li,xb=[X0,X0+T.p[0]*sx,X0+T.p[1]*sx,X1];
  const zonas=UBI.map((u,i)=>{const esp=zonaEsp(i),n=esp.length,hh=(Y1-Y0)/(n||1);
    return {i,x:xb[i],w:xb[i+1]-xb[i],esp,n,hh,rects:esp.map((x,j)=>({x,j,x0:xb[i],x1:xb[i+1],y0:Y0+j*hh,y1:Y0+(j+1)*hh}))}});
  return {T,xb,zonas}}
// Medidas de un espacio: largo de su parte × ancho interior (repartido si comparte la parte)
function geoEsp(x){const i=UBI.indexOf(x.ubi);if(i<0)return null;const T=tabs(),esp=zonaEsp(i),n=esp.length;
  return {i,j:esp.indexOf(x),n,largo:largoZona(T,i),ancho:anchoInt()/n}}
function cortos(){const T=tabs();return d.espacios.filter(x=>{const i=UBI.indexOf(x.ubi);return i>=0&&largoZona(T,i)<(MIN_ESP[x.tipo]||0)})
  .map(x=>`${etiqueta(x)} queda de ${mTxt(largoZona(T,UBI.indexOf(x.ubi)))} de largo y el mínimo es ${mTxt(MIN_ESP[x.tipo])}: tocá la línea divisoria y correla`)}
// ---- Puertas interiores ----
// Cada espacio puede llevar una puerta interior en un tabique: 'izq'/'der' (las líneas divisorias, hacia el lado puertas
// o el lado opuesto) o 'arr'/'abj' (el tabique con el espacio de al lado en la misma parte). pos: 'a' cerca del lateral A
// (o del lado puertas), 'c' al centro, 'b' cerca del lateral B (o del lado opuesto). x.pi={pared,pos}; {pared:'no'} sin puerta.
// Si el vendedor no la elige, va donde la ponía el croquis: baños y habitaciones abren a un espacio abierto.
const cerrado=x=>x.tipo==='bano'||x.tipo==='habitacion';
function paredesPuerta(i,j,n){const T=tabs(),o=[];if(i>0&&!T.off[i-1])o.push('izq');if(i<2&&!T.off[i])o.push('der');if(j>0)o.push('arr');if(j<n-1)o.push('abj');return o}
function puertaAuto(x,i,j,esp){if(!cerrado(x))return null;const n=esp.length,abierta=z=>{const e=zonaEsp(z);return !e.length||e.some(y=>!cerrado(y))};let p=null;
  if(j>0&&!cerrado(esp[j-1]))p={pared:'arr',pos:'b'};else if(j<n-1&&!cerrado(esp[j+1]))p={pared:'abj',pos:'b'};
  else if(i===0&&abierta(1))p={pared:'der',pos:'c'};else if(i===2&&abierta(1))p={pared:'izq',pos:'c'};
  else if(i===1)p=abierta(0)?{pared:'izq',pos:'c'}:abierta(2)?{pared:'der',pos:'c'}:null;
  return p&&paredesPuerta(i,j,n).includes(p.pared)?p:null}
function puertaDe(x,i,j,n){if(x.pi){if(x.pi.pared==='no')return null;if(paredesPuerta(i,j,n).includes(x.pi.pared))return {pared:x.pi.pared,pos:x.pi.pos||'c'}}
  return puertaAuto(x,i,j,zonaEsp(i))}
function haciaTxt(x,g,pared){const esp=zonaEsp(g.i);
  const n=pared==='izq'?nomZona(g.i-1):pared==='der'?nomZona(g.i+1):pared==='arr'?etiqueta(esp[g.j-1]):etiqueta(esp[g.j+1]);return n||'el espacio libre'}
function posTxt(pared,pos){const v=pared==='izq'||pared==='der';
  return pos==='a'?(v?'Cerca del lateral A':'Cerca del '+(d.prod==='Contenedor cortado'&&d.lado==='Parte trasera'?'lado del corte':'lado puertas')):pos==='b'?(v?'Cerca del lateral B':'Cerca del lado opuesto'):'Al centro'}
function puertaOps(x){const g=geoEsp(x);if(!g)return '';const ps=paredesPuerta(g.i,g.j,g.n);if(!ps.length)return '';const act=puertaDe(x,g.i,g.j,g.n);
  return `<div class="lbl" style="margin-top:10px">Puerta interior de ${esc(etiqueta(x).toLowerCase())}</div><div class="ops">${ps.map(p=>`<div class="op ${act&&act.pared===p?'sel':''}" data-croq="pi" data-id="${x.id}" data-v="${p}">Hacia ${esc(haciaTxt(x,g,p))}</div>`).join('')}<div class="op ${act?'':'sel'}" data-croq="pi" data-id="${x.id}" data-v="no">Sin puerta</div></div>
  ${act?`<div class="ops" style="margin-top:6px">${['a','c','b'].map(q=>`<div class="op ${act.pos===q?'sel':''}" data-croq="pip" data-id="${x.id}" data-v="${q}">${esc(posTxt(act.pared,q))}</div>`).join('')}</div>`:''}`}
// ---- Artefactos del baño movibles ----
// x.art = {Inodoro:{pared:'arr'|'abj'|'izq'|'der', f:0..1 a lo largo de esa pared}}. Bacha, vanitory y mueble son 'Lavatorio'.
const artKey=k=>k==='Bacha'||k==='Vanitory'||k==='Mueble'?'Lavatorio':k;
const artDe=(x,k)=>x.art&&x.art[artKey(k)];
function piezasBano(x){const it=x.items||[],hay=k=>it.includes(k);const p=['Ducha','Inodoro','Bidet','Mingitorio'].filter(hay);
  if(hay('Bacha'))p.push(hay('Mueble')?'Vanitory':'Bacha');else if(hay('Mueble'))p.push('Mueble');if(hay('Lavamatic'))p.push('Lavamatic');return p}
function artTf(a,x0,x1,y0,y1,sz){const m=sz*.6+2,cl=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  if(a.pared==='arr'||a.pared==='abj'){const cx=cl(x0+a.f*(x1-x0),x0+m,x1-m);return a.pared==='arr'?`translate(${cx} ${y0})`:`translate(${cx} ${y1}) rotate(180)`}
  const cy=cl(y0+a.f*(y1-y0),y0+m,y1-m);return a.pared==='izq'?`translate(${x0} ${cy}) rotate(-90)`:`translate(${x1} ${cy}) rotate(90)`}
// Dibuja cada espacio dentro del contenedor visto desde arriba: tabiques (en la posición de las líneas divisorias),
// puertas interiores y lo que lleva cada baño o cocina (inodoro, vanitory, ducha, mesada...). Cada espacio ocupa su zona (UBI);
// si hay varios en la misma zona se reparten en franjas. Es un esquema: el largo de cada parte es proporcional, el ancho no.
// Los artefactos que el vendedor no movió van contra la pared exterior, empezando lejos de la puerta.
function ambientesSVG(X0,X1,Y0,Y1,fs,tactil){
  const G=geo(X0,X1,Y0,Y1),T=G.T,ln='var(--tx2)',az='var(--azul)';let s='';
  const ic=icono;
  const huecos={1:[],2:[]}; // puertas en los tabiques entre zonas (x = xb[i])
  const hh_={}; // puertas en los tabiques entre franjas de una misma zona ('zona|franja' de abajo)
  G.zonas.forEach(Z=>{const {i,esp,n,hh}=Z,zx=Z.x,w=Z.w;if(!n)return;
    esp.forEach((x,j)=>{const y0=Y0+j*hh,y1=y0+hh;
      const pu=puertaDe(x,i,j,n);
      const lado=pu&&pu.pared==='der'?1:pu&&pu.pared==='izq'?-1:0;
      if(lado){const bx=zx+(lado>0?w:0),adentro=-lado,g=Math.min(hh*.62,20,w*.8),ga=pu.pos==='a'?y0+3:pu.pos==='b'?y1-3-g:(y0+y1)/2-g/2;huecos[lado>0?i+1:i].push([ga,ga+g]);
        s+=`<path d="M${bx} ${ga}L${bx+adentro*g} ${ga}" stroke="${ln}" stroke-width="1.5"/><path d="M${bx+adentro*g} ${ga}A${g} ${g} 0 0 ${adentro>0?1:0} ${bx} ${ga+g}" fill="none" stroke="${ln}" stroke-dasharray="2 2"/>`}
      if(pu&&!lado){const arr=pu.pared==='arr',g=Math.min(hh*.8,w*.3,20),by=arr?y0:y1,dn=arr?1:-1,ga=pu.pos==='a'?zx+3:pu.pos==='c'?zx+w/2-g/2:zx+w-g-3;hh_[i+'|'+(arr?j:j+1)]=[ga,ga+g];
        s+=`<path d="M${ga} ${by}L${ga} ${by+dn*g}" stroke="${ln}" stroke-width="1.5"/><path d="M${ga} ${by+dn*g}A${g} ${g} 0 0 ${dn>0?0:1} ${ga+g} ${by}" fill="none" stroke="${ln}" stroke-dasharray="2 2"/>`}
      const it=x.items||[];let pzs=[];
      if(x.tipo==='bano')pzs=piezasBano(x);
      else if(x.tipo==='cocina')pzs=['Bacha monocomando','Cocina eléctrica'].filter(k=>it.includes(k));
      const abajo=n>1&&j===n-1, wy=abajo?y1:y0, dy=abajo?-1:1;
      const conMesada=x.tipo==='cocina'&&(it.includes('Bajo mesada')||pzs.length), conAlacena=x.tipo==='cocina'&&it.includes('Alacena');
      const libres=pzs.filter(k=>!artDe(x,k)),nSlots=Math.max(libres.length,conMesada||conAlacena?1:0),nTot=Math.max(pzs.length,nSlots,1);
      const sz=Math.max(5,Math.min(16,hh*.42,(w-12-(lado?8:0))/(nTot*1.3))),paso=sz*1.3;
      const pieza=(tf,k)=>{s+=`<g transform="${tf}" fill="none" stroke="${az}" stroke-width="1"><title>${esc(etiqueta(x))}: ${esc(k.toLowerCase())}</title>${ic(k,x.tipo,sz)}</g>`;
        if((k==='Vanitory'||k==='Bacha')&&it.includes('Espejo'))s+=`<g transform="${tf}" stroke="${az}"><title>espejo</title>${ic('Espejo',x.tipo,sz)}</g>`};
      let ty=(y0+y1)/2+fs*.35;
      if(nSlots){const largo=nSlots*paso;
        // si la puerta está a la derecha, se arranca desde la izquierda y al revés
        const x0=lado>0?zx+5:zx+w-5-largo;
        if(conMesada)s+=`<rect x="${x0}" y="${abajo?wy-sz*.62:wy}" width="${largo}" height="${sz*.62}" fill="var(--azul-l)" stroke="${az}" stroke-width=".8"><title>${esc(etiqueta(x))}: mesada</title></rect>`;
        if(conAlacena)s+=`<rect x="${x0}" y="${abajo?wy-sz*.35:wy}" width="${largo}" height="${sz*.35}" fill="none" stroke="${az}" stroke-width=".8" stroke-dasharray="2 1.5"><title>${esc(etiqueta(x))}: alacena</title></rect>`;
        libres.forEach((k,q)=>pieza(`translate(${x0+paso*(q+.5)} ${wy}) scale(1 ${dy})`,k));
        ty=abajo?y0+Math.min(hh*.42,fs+3):Math.max(y0+sz+fs*.9,y1-hh*.25)}
      // los que el vendedor ubicó a mano, contra la pared que eligió
      pzs.filter(k=>artDe(x,k)).forEach(k=>pieza(artTf(artDe(x,k),zx,zx+w,y0,y1,sz),k));
      const nom=etiqueta(x),f2=Math.max(5,Math.min(fs,hh*.34,(w-4)/(nom.length*.62))),tx=zx+w/2+(lado?-lado*4:0);
      // medidas del espacio debajo del nombre (si entra)
      const g=geoEsp(x),med=g?(g.largo/100).toFixed(2).replace('.',',')+' × '+(g.ancho/100).toFixed(2).replace('.',','):'';
      const f3=Math.min(f2*.85,(w-4)/((med.length+2)*.56));let ty2=ty+f2*.95;
      if(med&&hh>=44&&f3>=5){if(ty2>y1-2){ty-=ty2-(y1-2);ty2=y1-2}}
      s+=`<text x="${tx}" y="${ty}" text-anchor="middle" font-size="${f2}" font-weight="700" fill="var(--tx)">${esc(nom)}</text>`;
      if(med&&hh>=44&&f3>=5)s+=`<text x="${tx}" y="${ty2}" text-anchor="middle" font-size="${f3}" fill="var(--tx2)">${med} m</text>`});
    // tabiques entre franjas de la misma zona, con el hueco de la puerta si hay
    for(let j=1;j<n;j++){const y=Y0+j*hh,gp=hh_[i+'|'+j];
      s+=gp?`<line x1="${zx}" y1="${y}" x2="${gp[0]}" y2="${y}" stroke="${ln}" stroke-width="1.5"/><line x1="${gp[1]}" y1="${y}" x2="${zx+w}" y2="${y}" stroke="${ln}" stroke-width="1.5"/>`
        :`<line x1="${zx}" y1="${y}" x2="${zx+w}" y2="${y}" stroke="${ln}" stroke-width="1.5"/>`}});
  // tabiques entre zonas: llenos si separan algún espacio (con el hueco de las puertas), punteados si no.
  // Una línea borrada no lleva tabique: queda punteada suave (naranja en pantalla, para poder volver a ponerla).
  [1,2].forEach(i=>{const x=G.xb[i],k=i-1;
    if(!tabUsada(k)){s+=`<line x1="${x}" y1="${Y0}" x2="${x}" y2="${Y1}" stroke="${ln}" stroke-dasharray="4 4" opacity=".6"/>`;return}
    if(T.off[k]){s+=`<line x1="${x}" y1="${Y0}" x2="${x}" y2="${Y1}" stroke="${tactil?'var(--nar)':ln}" stroke-dasharray="2 4" opacity="${tactil?.8:.35}"/>`;return}
    let y=Y0;huecos[i].sort((a,b)=>a[0]-b[0]).forEach(([a,b])=>{if(a>y)s+=`<line x1="${x}" y1="${y}" x2="${x}" y2="${a}" stroke="${ln}" stroke-width="1.5"/>`;y=Math.max(y,b)});
    if(y<Y1)s+=`<line x1="${x}" y1="${y}" x2="${x}" y2="${Y1}" stroke="${ln}" stroke-width="1.5"/>`});
  return s;
}
// Nombres de las partes debajo del dibujo, centrados en cada parte (abreviados si la parte es angosta)
function nombresZonas(G,y,fs,sub){const L=[['Extremo izquierdo','Ext. izq.'],['Centro','Centro'],['Extremo derecho','Ext. der.']];
  return G.zonas.map(Z=>{const cx=Z.x+Z.w/2,t=Z.w>=fs*8.4?L[Z.i][0]:Z.w>=fs*4.4?L[Z.i][1]:'';if(!t)return '';
    return `<text x="${cx}" y="${y}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="var(--tx)">${t}</text>`+(sub&&sub[Z.i]&&Z.w>=fs*6?`<text x="${cx}" y="${y+15}" text-anchor="middle" font-size="${fs*.875}" fill="var(--tx2)">${sub[Z.i]}</text>`:'')}).join('')}
function planoSVG(tactil){
  const X0=24,X1=336,Y0=46,Y1=118,G=geo(X0,X1,Y0,Y1),T=G.T;
  const linea='var(--tx2)';
  const puertas=d.prod==='Contenedor cortado'&&d.lado==='Parte trasera'?false:true;
  // cota: metros de cada tramo entre las líneas divisorias que existen
  const c=cortesTab(T),px=cm=>X0+cm/T.Li*(X1-X0),yc=Y1+11;let cota='';
  for(let q=0;q<c.length-1;q++){const a=px(c[q]),b=px(c[q+1]),f=Math.min(10.5,(b-a)/3.4);
    cota+=`<line x1="${a}" y1="${yc}" x2="${b}" y2="${yc}" stroke="${linea}" stroke-width=".8"/><line x1="${a}" y1="${yc-4}" x2="${a}" y2="${yc+4}" stroke="${linea}" stroke-width=".8"/><line x1="${b}" y1="${yc-4}" x2="${b}" y2="${yc+4}" stroke="${linea}" stroke-width=".8"/>`+
      (f>=5?`<text x="${(a+b)/2}" y="${yc+12}" text-anchor="middle" font-size="${f}" font-weight="700" fill="var(--nar)">${mTxt(c[q+1]-c[q])}</text>`:'')}
  return `<div class="lbl">Ubicación de los espacios <small>vista desde arriba · medidas interiores</small></div>
  <svg viewBox="0 0 360 200" width="100%" role="img" aria-label="Contenedor visto desde arriba con lado puertas a la izquierda" style="display:block;font-family:inherit">
    <text x="180" y="18" text-anchor="middle" font-size="11" fill="var(--tx2)">${d.tam?esc(d.tam==='40 ST'?'40 DV':d.tam)+' · ':''}${d.largo?esc(d.corte||d.largo)+' cm de largo · '+mTxt(T.Li)+' útiles adentro':'contenedor'}</text>
    ${G.zonas.map(Z=>`<rect x="${Z.x}" y="${Y0}" width="${Z.w}" height="${Y1-Y0}" fill="${Z.n?'var(--nar-l)':'none'}"/>`).join('')}
    <rect x="${X0}" y="${Y0}" width="${X1-X0}" height="${Y1-Y0}" fill="none" stroke="${linea}" stroke-width="2" rx="2"/>
    ${ambientesSVG(X0,X1,Y0,Y1,11.5,tactil)}
    ${puertas?`<rect x="${X0-6}" y="${Y0+4}" width="6" height="${(Y1-Y0)/2-6}" fill="var(--nar)"/><rect x="${X0-6}" y="${(Y0+Y1)/2+2}" width="6" height="${(Y1-Y0)/2-6}" fill="var(--nar)"/>
    <text x="10" y="${(Y0+Y1)/2}" transform="rotate(-90 10 ${(Y0+Y1)/2})" text-anchor="middle" font-size="9.5" font-weight="700" fill="var(--nar)">PUERTAS</text>`:''}
    ${cota}
    ${nombresZonas(G,Y1+44,12,[puertas?'lado puertas':'lado del corte','','lado opuesto'])}
    ${tactil?capaEsp(G,X0,X1,Y0,Y1):''}
  </svg>${leyendaAmb()}`;
}
function abertSVG(tactil){
  const X0=44,X1=316,Y0=58,Y1=128,G=geo(X0,X1,Y0,Y1),L=largoTot()||606,A=Number(d.ancho)||244,esc2=(X1-X0)/L,ln='var(--tx2)';
  const cortado=d.prod==='Contenedor cortado'&&d.lado==='Parte trasera';
  const todas=[...d.puertas.map((p,i)=>({...p,ref:'p'+i,cod:'P'+(i+1),col:'var(--nar)',an:anchoPuerta(p)})),...d.ventanas.map((v,i)=>({...v,ref:'v'+i,cod:'V'+(i+1),col:'var(--azul)',an:Number(v.ancho)||100}))].filter(o=>o.pared&&(!esLateral(o.pared)||o.pos));
  const grupos={};todas.forEach(o=>{const g=o.pared+'|'+(esLateral(o.pared)?o.pos:'');(grupos[g]=grupos[g]||[]).push(o)});
  let marcas='';
  Object.entries(grupos).forEach(([g,arr])=>{const [pa,pos]=g.split('|');arr.forEach((o,j)=>{const f=(j+1)/(arr.length+1);
    if(esLateral(pa)){const zi=UBI.indexOf(pos),zx=G.xb[zi],zw=G.xb[zi+1]-zx;const cx=zx+zw*f;const lw=Math.max(14,Math.min(zw/arr.length-4,o.an*esc2));const y=pa==='Lateral A'?Y0:Y1;
      o.cx=cx;o.cy=y;marcas+=`<rect x="${cx-lw/2}" y="${y-4}" width="${lw}" height="8" rx="2" fill="${o.col}"/><text x="${cx}" y="${pa==='Lateral A'?y-9:y+18}" text-anchor="middle" font-size="11" font-weight="700" fill="${o.col}">${o.cod}</text>`}
    else{const cy=Y0+(Y1-Y0)*f;const lh=Math.max(12,Math.min((Y1-Y0)/arr.length-4,o.an*(Y1-Y0)/A));const x=pa==='Lado puertas'?X0:X1;
      o.cx=x;o.cy=cy;marcas+=`<rect x="${x-4}" y="${cy-lh/2}" width="8" height="${lh}" rx="2" fill="${o.col}"/><text x="${pa==='Lado puertas'?x-7:x+7}" y="${cy+4}" text-anchor="${pa==='Lado puertas'?'end':'start'}" font-size="11" font-weight="700" fill="${o.col}">${o.cod}</text>`}})});
  return `<div class="lbl">Dónde va cada abertura <small>vista desde arriba</small></div>
  <svg viewBox="0 0 360 196" width="100%" role="img" aria-label="Contenedor visto desde arriba con sus cuatro paredes y las aberturas cargadas" style="display:block;font-family:inherit">
    <text x="180" y="22" text-anchor="middle" font-size="12" font-weight="700" fill="var(--tx)">Lateral A</text>
    <rect x="${X0}" y="${Y0}" width="${X1-X0}" height="${Y1-Y0}" fill="none" stroke="${ln}" stroke-width="2" rx="2"/>
    ${ambientesSVG(X0,X1,Y0,Y1,10.5)}
    ${marcas}
    <text x="16" y="${(Y0+Y1)/2}" transform="rotate(-90 16 ${(Y0+Y1)/2})" text-anchor="middle" font-size="11" font-weight="700" fill="var(--nar)">${cortado?'Lado del corte':'Lado puertas'}</text>
    <text x="344" y="${(Y0+Y1)/2}" transform="rotate(90 344 ${(Y0+Y1)/2})" text-anchor="middle" font-size="11" font-weight="700" fill="var(--tx)">Lado opuesto</text>
    <text x="180" y="${Y1+40}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--tx)">Lateral B</text>
    ${G.zonas.map(Z=>{const t=Z.w>=52?['extremo izq.','centro','extremo der.'][Z.i]:Z.w>=30?['ext. izq.','centro','ext. der.'][Z.i]:'';return t?`<text x="${Z.x+Z.w/2}" y="${Y1+58}" text-anchor="middle" font-size="9.5" fill="var(--tx2)">${t}</text>`:''}).join('')}
    ${tactil?capaAbert(todas,X0,X1,Y0,Y1):''}
  </svg>
  <div class="aviso" style="text-align:left;margin-top:4px"><b style="color:var(--nar)">P</b> puertas · <b style="color:var(--azul)">V</b> ventanas. Lateral A es el que queda a la izquierda parado en el lado puertas mirando hacia adentro.</div>`+leyendaAmb();
}
// ---- Croquis táctil: ubicar espacios y aberturas tocando el dibujo con el dedo ----
// Las capas son rectángulos transparentes encima del dibujo; solo se agregan en pantalla (no en el PDF).
function barraTab(){const k=herr.tab,T=tabs(),c=cortesTab(T),q=c.indexOf(T.p[k]);
  const izq=c[q]-c[q-1],der=c[q+1]-c[q],nI=nomTramo(T,c[q-1],c[q]),nD=nomTramo(T,c[q],c[q+1]);
  const conBano=zonaEsp(k).concat(zonaEsp(k+1)).some(x=>x.tipo==='bano');
  return `<div class="croq-bar sel"><div class="croq-t"><b>Línea divisoria${T.off[k]?' (borrada: no lleva tabique)':''}</b><br>${esc(nI)}: <b>${mTxt(izq)}</b> · ${esc(nD)}: <b>${mTxt(der)}</b><br><small>Arrastrala con el dedo o usá los botones. Se mueve de a 10 cm. Mínimos: ${MIN_TXT()}.</small></div>
    <div class="ops"><div class="op" data-croq="tabm" data-v="-10">◀ 10 cm</div><div class="op" data-croq="tabm" data-v="10">10 cm ▶</div></div>
    <div class="fila" style="align-items:center"><div class="lbl" style="margin:0;flex:1">${esc(nI)} mide</div><div class="unidad" style="flex:1"><input type="number" inputmode="numeric" step="10" data-tabcm="${k}" value="${izq}"><b>cm</b></div></div>
    <div class="ops" style="margin-top:8px">${conBano&&!T.off[k]?'':`<div class="op" data-croq="taboff">${T.off[k]?'Volver a poner la línea':'Borrar la línea'}</div>`}<div class="op" data-croq="listo">Listo</div></div>
    ${conBano&&!T.off[k]?'<div class="aviso" style="text-align:left;margin-top:6px">Esta línea es tabique de un baño: no se puede borrar.</div>':''}</div>`}
function artNom(x,k){return k==='Lavatorio'?((x.items||[]).includes('Bacha')?((x.items||[]).includes('Mueble')?'Vanitory':'Bacha'):'Mueble'):k}
function barraEsp(){
  if(herr.tab!=null)return barraTab();
  const sel=herr.sel&&d.espacios.find(x=>x.id===herr.sel);
  if(sel){const g=geoEsp(sel),keys=sel.tipo==='bano'?[...new Set(piezasBano(sel).map(artKey))]:[];
    const txt=herr.mov?`Tocá dentro de ${esc(etiqueta(sel).toLowerCase())} dónde va <b>${esc(artNom(sel,herr.mov).toLowerCase())}</b>: se pega a la pared más cercana.`
      :`Tocá otra parte del dibujo para moverlo. Para cambiar sus medidas, tocá o arrastrá la línea divisoria (⇆).`;
    return `<div class="croq-bar sel"><div class="croq-t"><b>${esc(etiqueta(sel))}</b>${g?` · ${mTxt(g.largo)} × ${mTxt(g.ancho)}`:''}<br>${txt}</div>
    ${puertaOps(sel)}
    ${keys.length?`<div class="lbl" style="margin-top:10px">Mover sanitarios <small>elegí uno y tocá dónde va</small></div><div class="ops">${keys.map(k=>`<div class="op ${herr.mov===k?'sel':''}" data-croq="mov" data-v="${k}">${esc(artNom(sel,k))}</div>`).join('')}${sel.art&&Object.keys(sel.art).length?'<div class="op" data-croq="auto">Acomodar solos</div>':''}</div>`:''}
    <div class="ops" style="margin-top:10px"><div class="op" data-croq="quitar">Quitar ${esc(etiqueta(sel).toLowerCase())}</div><div class="op" data-croq="listo">Listo</div></div></div>`}
  const sinUbi=d.espacios.filter(x=>!x.ubi).length;
  return `<div class="croq-bar"><div class="croq-t">${herr.pon?`Tocá en el dibujo dónde va ${ESP[herr.pon]==='Habitación'?'la':ESP[herr.pon]==='Baño'?'el':'la'} <b>${esc(ESP[herr.pon].toLowerCase())}</b>. Podés tocar varias veces.`:'Elegí qué querés poner y tocá en el dibujo dónde va. Tocá un espacio para moverlo, elegir su puerta o mover sus sanitarios. Para cambiar medidas, tocá o arrastrá la línea divisoria (⇆).'}</div>
    <div class="ops">${Object.keys(ESP).map(k=>`<div class="op ${herr.pon===k?'sel':''}" data-croq="pon" data-v="${k}">+ ${ESP[k]}</div>`).join('')}</div>
    ${sinUbi?`<div class="aviso" style="text-align:left;margin-top:6px">${sinUbi===1?'Hay 1 espacio':'Hay '+sinUbi+' espacios'} sin ubicar: tocá una parte del dibujo y se ubica${sinUbi===1?'':' el primero'}.</div>`:''}</div>`;
}
function capaEsp(G,X0,X1,Y0,Y1){
  // una zona tocable por parte del contenedor; el espacio seleccionado se marca con su rectángulo.
  // Encima, una manija por línea divisoria que existe: se toca para elegirla o se arrastra para moverla.
  const sel=herr.sel&&d.espacios.find(x=>x.id===herr.sel),gg=`${X0},${X1},${Y0},${Y1}`;let h='';
  G.zonas.forEach(Z=>{Z.rects.forEach(r=>{if(sel&&r.x===sel)h+=`<rect x="${r.x0+2}" y="${r.y0+2}" width="${Math.max(2,r.x1-r.x0-4)}" height="${r.y1-r.y0-4}" rx="4" fill="none" stroke="var(--nar)" stroke-width="3"${herr.mov?' stroke-dasharray="6 4"':''}/>`});
    h+=`<rect class="croq-z" x="${Z.x}" y="${Y0-6}" width="${Z.w}" height="${Y1-Y0+62}" fill="transparent" data-croq="zona" data-v="${UBI[Z.i]}" data-g="${gg}"/>`});
  // mientras se ubica un sanitario no hay manijas, para que el toque caiga en el baño
  if(!herr.mov)[0,1].filter(tabUsada).forEach(k=>{const x=G.xb[k+1],on=herr.tab===k,yh=Y0-13;
    h+=(on?`<line x1="${x}" y1="${Y0}" x2="${x}" y2="${Y1}" stroke="var(--nar)" stroke-width="4" opacity=".5"/>`:'')+
      `<g pointer-events="none"><line x1="${x}" y1="${yh+8}" x2="${x}" y2="${Y0}" stroke="var(--nar)" stroke-width="1.5"/><circle cx="${x}" cy="${yh}" r="9" fill="${on?'var(--nar)':'#fff'}" stroke="var(--nar)" stroke-width="2"/><text x="${x}" y="${yh+4}" text-anchor="middle" font-size="11" font-weight="800" fill="${on?'#fff':'var(--nar)'}">⇆</text></g>`+
       `<rect class="croq-tab" x="${x-10}" y="${yh-11}" width="20" height="${Y1-yh+11}" fill="transparent" data-croq="tab" data-v="${k}" data-g="${gg}"/>`});
  return h;
}
function barraAbert(){
  const o=herr.sel&&abertDe(herr.sel);
  if(o)return `<div class="croq-bar sel"><div class="croq-t"><b>${herr.sel[0]==='p'?'Puerta':'Ventana'} ${+herr.sel.slice(1)+1}</b> seleccionada: tocá otra pared para moverla. Tipo y medida se completan abajo.</div>
    <div class="ops"><div class="op" data-croq="quitar">Quitar</div><div class="op" data-croq="listo">Listo</div></div></div>`;
  return `<div class="croq-bar"><div class="croq-t">${herr.pon?`Tocá la pared donde va la <b>${herr.pon}</b>. En los laterales, tocá cerca del extremo o del centro.`:'Elegí qué querés poner y tocá la pared en el dibujo. Tocá una P o una V para moverla.'}</div>
    <div class="ops"><div class="op ${herr.pon==='puerta'?'sel':''}" data-croq="pon" data-v="puerta">+ Puerta</div><div class="op ${herr.pon==='ventana'?'sel':''}" data-croq="pon" data-v="ventana">+ Ventana</div></div></div>`;
}
function capaAbert(todas,X0,X1,Y0,Y1){
  // toda el área del dibujo es tocable; la pared se calcula por cercanía
  let h=`<rect x="0" y="0" width="360" height="196" fill="transparent" data-croq="pared" data-g="${X0},${X1},${Y0},${Y1}"/>`;
  todas.forEach(o=>{if(o.cx==null)return;
    if(herr.sel===o.ref)h+=`<circle cx="${o.cx}" cy="${o.cy}" r="13" fill="none" stroke="${o.col}" stroke-width="2.5"/>`;
    h+=`<circle cx="${o.cx}" cy="${o.cy}" r="15" fill="transparent" data-croq="ab" data-v="${o.ref}"/>`});
  return h;
}
const abertDe=r=>r&&(r[0]==='p'?d.puertas:d.ventanas)[+r.slice(1)];
// Punto del toque en coordenadas del dibujo
function puntoSVG(e,el){const sv=el.ownerSVGElement||el;const m=sv.getScreenCTM();if(!m)return null;const pt=sv.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;return pt.matrixTransform(m.inverse())}
// Pared y parte de la pared más cercanas al toque
function paredDe(p,g){const [X0,X1,Y0,Y1]=g.split(',').map(Number);
  const dist={'Lateral A':Math.abs(p.y-Y0),'Lateral B':Math.abs(p.y-Y1),'Lado puertas':Math.abs(p.x-X0),'Lado opuesto':Math.abs(p.x-X1)};
  // dentro de los extremos del contenedor pesan más los laterales (son las paredes largas)
  if(p.x>X0+12&&p.x<X1-12){dist['Lado puertas']+=30;dist['Lado opuesto']+=30}
  const pared=Object.keys(dist).sort((a,b)=>dist[a]-dist[b])[0];
  const xb=geo(X0,X1,Y0,Y1).xb,zi=p.x<xb[1]?0:p.x<xb[2]?1:2;
  return {pared,pos:esLateral(pared)?UBI[zi]:''};
}
function espEn(ubi){const x=d.espacios.find(y=>y.ubi===ubi);return x?etiqueta(x):''}
function tocarCroquis(e){
  const t=e.target.closest('[data-croq]');if(!t)return false;
  const c=t.dataset.croq,v=t.dataset.v;
  if(c==='pon'){herr=herr.pon===v?{}:{pon:v};render();return true}
  if(c==='listo'){herr={};render();return true}
  if(c==='quitar'){
    if(paso===2){const i=d.espacios.findIndex(x=>x.id===herr.sel);if(i>=0)d.espacios.splice(i,1)}
    else if(herr.sel){const arr=herr.sel[0]==='p'?d.puertas:d.ventanas;arr.splice(+herr.sel.slice(1),1);if(!d.puertas.length)d.puertas.push(nuevaPuerta())}
    herr={};render();return true}
  if(c==='ab'){herr=herr.sel===v?{}:{sel:v};render();return true}
  // líneas divisorias: elegir, mover de a 10 cm, borrar o volver a poner
  if(c==='tab'){const k=+v;herr=herr.tab===k?{}:{tab:k};render();return true}
  if(c==='tabm'&&herr.tab!=null){const T=tabs(),r=moverTab(herr.tab,T.p[herr.tab]+Number(v));render();if(r.tope)toast(`⚠️ Hasta ahí: mínimos ${MIN_TXT()}`);return true}
  if(c==='taboff'&&herr.tab!=null){const T=tabs(),k=herr.tab;
    if(!T.off[k]&&zonaEsp(k).concat(zonaEsp(k+1)).some(x=>x.tipo==='bano')){toast('⚠️ El baño necesita su tabique: esta línea no se puede borrar');return true}
    T.off[k]=!T.off[k];d.tab={L:T.Li,p:T.p,off:T.off};render();toast(T.off[k]?'Línea borrada: los dos lados quedan como un solo ambiente':'Línea puesta de nuevo');return true}
  // puerta interior de un espacio: hacia qué tabique y en qué parte
  if(c==='pi'||c==='pip'){const x=d.espacios.find(y=>y.id===t.dataset.id);if(!x)return true;const g=geoEsp(x);
    if(c==='pi')x.pi=v==='no'?{pared:'no'}:{pared:v,pos:(x.pi&&x.pi.pos)||(g&&(puertaDe(x,g.i,g.j,g.n)||{}).pos)||'c'};
    else{const act=g&&puertaDe(x,g.i,g.j,g.n);if(act)x.pi={pared:act.pared,pos:v}}
    render();return true}
  // sanitarios: elegir cuál mover (después se toca dónde va) o volver a acomodarlos solos
  if(c==='mov'){herr=herr.mov===v?{sel:herr.sel}:{sel:herr.sel,mov:v};render();return true}
  if(c==='auto'){const x=d.espacios.find(y=>y.id===herr.sel);if(x)delete x.art;herr={sel:herr.sel};render();return true}
  if(c==='zona'){
    const sel=herr.sel&&d.espacios.find(x=>x.id===herr.sel);
    const aqui=d.espacios.filter(x=>x.ubi===v);
    // el espacio tocado: si hay varios en la misma parte, el de la franja tocada
    const p=puntoSVG(e,t),G=t.dataset.g?geo(...t.dataset.g.split(',').map(Number)):null,Z=G&&G.zonas[UBI.indexOf(v)];
    const r=p&&Z?Z.rects.find(q=>p.y>=q.y0&&p.y<q.y1)||(p.y<Z.rects[0]?.y0?Z.rects[0]:Z.rects.at(-1)):null,tocado=r?r.x:aqui[0];
    if(sel&&herr.mov){const q=p&&G&&G.zonas.flatMap(z=>z.rects).find(z=>z.x===sel);
      if(!q||p.x<q.x0||p.x>q.x1||p.y<q.y0||p.y>q.y1){toast(`Tocá dentro de ${etiqueta(sel).toLowerCase()}`);return true}
      const dist={arr:p.y-q.y0,abj:q.y1-p.y,izq:p.x-q.x0,der:q.x1-p.x},pared=Object.keys(dist).sort((a,b)=>dist[a]-dist[b])[0];
      const f=pared==='arr'||pared==='abj'?(p.x-q.x0)/(q.x1-q.x0):(p.y-q.y0)/(q.y1-q.y0);
      sel.art=Object.assign(sel.art||{},{[herr.mov]:{pared,f:Math.round(f*1000)/1000}});herr={sel:sel.id};render();return true}
    // tocar el seleccionado lo suelta; otro espacio de la misma parte lo elige; otra parte lo mueve
    if(sel&&sel.ubi===v){herr=tocado&&tocado!==sel?{sel:tocado.id}:{};render();return true}
    if(sel){sel.ubi=v;herr={};render();toast(`${etiqueta(sel)} movido a ${v.toLowerCase()}`);return true}
    if(herr.pon){const x=nuevoEsp(herr.pon,v);render();toast(`${etiqueta(x)} en ${v.toLowerCase()}. Completá abajo qué lleva.`);return true}
    const libre=d.espacios.find(x=>!x.ubi);if(libre){libre.ubi=v;render();return true}
    if(tocado){herr={sel:tocado.id};render();return true}
    toast('Primero elegí arriba qué querés poner (baño, cocina, habitación u oficina)');return true}
  if(c==='pared'){const p=puntoSVG(e,t);if(!p)return true;const {pared,pos}=paredDe(p,t.dataset.g);
    const o=abertDe(herr.sel);
    if(o){o.pared=pared;o.pos=pos;herr={};render();return true}
    if(herr.pon==='puerta'){let i=d.puertas.findIndex(x=>!x.pared);if(i<0){d.puertas.push(nuevaPuerta());i=d.puertas.length-1}
      Object.assign(d.puertas[i],{pared,pos});d.puertaP=false;render();toast(`Puerta ${i+1} en ${dondeTxt(d.puertas[i])}. Completá tipo, medida y apertura abajo.`);return true}
    if(herr.pon==='ventana'){let i=d.ventanas.findIndex(x=>!x.pared);if(i<0){d.ventanas.push({esp:'',med:'',ancho:'',alto:'',tipo:'',pared:'',pos:'',prot:''});i=d.ventanas.length-1}
      const w=d.ventanas[i];Object.assign(w,{pared,pos});if(!w.esp)w.esp=(pos&&espEn(pos))||(d.espacios.length?'':'General');
      render();toast(`Ventana ${i+1} en ${dondeTxt(w)}. Completá medida y tipo abajo.`);return true}
    toast('Primero elegí arriba si es una puerta o una ventana');return true}
  return false;
}
const COL={'--nar':'#E8650A','--nar-l':'#FDF0E6','--tx':'#1E2330','--tx2':'#5E6675','--azul':'#2563C9','--azul-l':'#E6EEFB','--warn':'#C98A00','--warn-l':'#FFF6DB','--borde':'#DDE1E7'};
const sinVars=t=>t.replace(/var\((--[a-z0-9-]+)\)/g,(m,k)=>COL[k]||'#1E2330');
function cargarJS(src){return new Promise((ok,mal)=>{if(document.querySelector(`script[src="${src}"]`)){ok();return}const sc=document.createElement('script');sc.src=src;sc.onload=ok;sc.onerror=()=>mal(new Error('no cargó '+src));document.head.appendChild(sc)})}
async function generarPDF(adj=[],pid,sinDib=false){
  await cargarJS('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  await cargarJS('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  const hoy=new Date().toLocaleDateString('es-AR');const pend=pendientes();
  const box=document.createElement('div');
  box.style.cssText='position:fixed;left:-10000px;top:0;width:720px;background:#fff;color:#1E2330;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.45';
  const blq=(html,css='')=>`<div class="pb" style="padding:0 32px;background:#fff;${css}">${html}</div>`;
  const pl=!sinDib&&(d.espacios.length||esModulo(d.prod))?planoSVG():'';
  box.innerHTML=[
    blq(`<div style="background:#E8650A;color:#fff;padding:18px 20px;border-radius:0 0 10px 10px"><div style="font-size:20px;font-weight:800">Nota de pedido</div>${d.empresa?`<div style="font-size:14px;font-weight:700">${esc(d.empresa)}</div>`:''}<div style="font-size:13px;opacity:.9">${esc(d.sol||'Pedido')}${unidades()>1?' · '+unidades()+' unidades iguales':''} · emitida el ${esc(hoy)}</div></div>`,'padding-top:0'),
    ...sinVars(resumenCuerpo()).split('<h4>').filter(x=>x.trim()).map(x=>blq('<h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5E6675;margin:14px 0 4px">'+x.replace('</h4>','</h4><div>').replace(/<p>/g,'<p style="margin:0 0 6px">')+'</div>')),
    pend.length?blq(`<p style="margin-top:10px;color:#C98A00;font-weight:700">A confirmar: ${esc(pend.join(', '))}</p>`):'',
    d.obs.trim()?blq(`<h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5E6675;margin:14px 0 4px">Observaciones</h4><p>${esc(d.obs)}</p>`):'',
    pl?blq(`<div style="border:1px solid #DDE1E7;border-radius:10px;padding:12px;margin-top:14px">${sinVars(pl)}</div>`):'',
    sinDib?'':blq(`<div style="border:1px solid #DDE1E7;border-radius:10px;padding:12px;margin-top:14px">${sinVars(abertSVG())}</div>`),
    adj.length?blq(`<h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5E6675;margin:14px 0 4px">Planos adjuntos</h4><p style="margin:0 0 6px">${adj.some(a=>a.blob)?'Forman parte de este pedido y van en las páginas siguientes:':'Forman parte de este pedido:'}</p>${adj.map(a=>`<div>📐 ${esc(a.nombre)}${a.blob?'':a.url?` · <a href="${esc(a.url)}">${esc(a.url)}</a>`:' (no se pudo adjuntar)'}</div>`).join('')}`):'',
    precioPDF(pid),
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
// Pasa cualquier imagen que el navegador sepa abrir (jpg, png, webp, heic en iPhone...) a JPEG por un canvas:
// respeta la rotación de la foto del celular y la achica a 2400 px como máximo para que el PDF no pese de más.
function aJPG(blob,max=2400){return new Promise((ok,mal)=>{const im=new Image(),u=URL.createObjectURL(blob);
  im.onload=()=>{const k=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight));const c=document.createElement('canvas');c.width=Math.round(im.naturalWidth*k);c.height=Math.round(im.naturalHeight*k);
    const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);
    c.toBlob(b=>b?b.arrayBuffer().then(ok,mal):mal(new Error('imagen')),'image/jpeg',0.85)};
  im.onerror=()=>{URL.revokeObjectURL(u);mal(new Error('formato de imagen no soportado'))};im.src=u})}
// PDF que no se puede copiar tal cual (protegido o dañado): se dibuja cada hoja como imagen con pdf.js
async function pdfAImagenes(buf){
  await cargarJS('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  const lib=window.pdfjsLib;lib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf=await lib.getDocument({data:new Uint8Array(buf)}).promise;const out=[];
  for(let n=1;n<=Math.min(pdf.numPages,10);n++){const pg=await pdf.getPage(n);const v0=pg.getViewport({scale:1});const vp=pg.getViewport({scale:Math.min(3,2400/Math.max(v0.width,v0.height))});
    const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
    await pg.render({canvasContext:g,viewport:vp}).promise;out.push(await new Promise((ok,mal)=>c.toBlob(b=>b?b.arrayBuffer().then(ok,mal):mal(new Error('pdf')),'image/jpeg',0.85)))}
  return out;
}
let faltaronPDF=[]; // planos que no se pudieron sumar en el último PDF
// Suma al PDF de la nota las páginas de cada plano: los PDF se copian tal cual (sin perder calidad) y las imágenes van una por hoja.
// Si alguno no entra, queda una hoja que lo dice (para que no pase desapercibido) y se avisa al terminar.
async function sumarPlanos(blob,adj){
  faltaronPDF=[];
  const conArchivo=adj.filter(a=>a.blob);if(!conArchivo.length)return blob;
  await cargarJS('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js');
  const {PDFDocument,StandardFonts,rgb}=window.PDFLib;
  const doc=await PDFDocument.load(await blob.arrayBuffer());const font=await doc.embedFont(StandardFonts.HelveticaBold);
  const hoja=(nom,img)=>{const hor=img.width>img.height,W=hor?841.89:595.28,H=hor?595.28:841.89,M=28,T=22;
    const pg=doc.addPage([W,H]);pg.drawText(latin(nom).slice(0,110),{x:M,y:H-M-10,size:11,font,color:rgb(.12,.14,.19)});
    const k=Math.min((W-2*M)/img.width,(H-2*M-T)/img.height);
    pg.drawImage(img,{x:(W-img.width*k)/2,y:M+(H-2*M-T-img.height*k)/2,width:img.width*k,height:img.height*k})};
  for(const a of conArchivo){const tipo=a.blob.type||'',nom=a.nombre||'';
    try{const buf=await a.blob.arrayBuffer();
      if(tipo==='application/pdf'||/\.pdf$/i.test(nom)){
        let copiado=false;
        try{const src=await PDFDocument.load(buf);(await doc.copyPages(src,src.getPageIndices())).forEach(pg=>doc.addPage(pg));copiado=true}catch(e){console.warn('PDF no copiable, se pasa a imagen',e)}
        if(!copiado){const imgs=await pdfAImagenes(buf);if(!imgs.length)throw new Error('PDF vacío');for(const b of imgs)hoja(nom,await doc.embedJpg(b))}
        continue}
      hoja(nom,await doc.embedJpg(await aJPG(a.blob)));
    }catch(e){console.error(e);faltaronPDF.push(nom);
      const pg=doc.addPage([595.28,841.89]);
      pg.drawText(latin('No se pudo incluir este archivo en el PDF:'),{x:40,y:780,size:13,font,color:rgb(.83,.23,.17)});
      pg.drawText(latin(nom).slice(0,90),{x:40,y:758,size:11,font,color:rgb(.12,.14,.19)});
      pg.drawText(latin('Se manda aparte al cliente.'),{x:40,y:738,size:11,font,color:rgb(.37,.4,.46)})}
  }
  return new Blob([await doc.save()],{type:'application/pdf'});
}
// Precio del presupuesto en el PDF (lo arma el cotizador de la app; si no hay precio autorizado, no va)
function precioPDF(pid){let h='';try{h=window.notaPrecio?window.notaPrecio.pdfHTML(limpio(d),pid):''}catch(e){console.error(e)}
  return h?`<div class="pb" style="padding:0 32px;background:#fff">${h}</div>`:''}
// Qué dibujo va cuando el cliente trajo su plano (pedido de ventas 27/11): por defecto, el plano del cliente.
// Los planos de arquitectura van siempre.
function elegirDibujo(adj){
  const cli=adj.filter(a=>String(a.nombre||'').startsWith(PREF_CLI));
  const modo=cli.length?(PDF_DIB[d.pdfDibujo]?d.pdfDibujo:'plano'):'croquis';
  return {adj:modo==='croquis'?adj.filter(a=>!cli.includes(a)):adj,sinDib:modo==='plano'};
}
// Arma el PDF que va al cliente: {blob,nombre}, o null si todavía no puede salir (aprobación del administrador)
async function armarPDF(extra,pid){
  // aprobación del administrador (migración 0033): el presupuesto sale con precio solo cuando él lo aprueba
  if(esPresu()&&window.notaPrecio&&window.notaPrecio.bloqueoPDF){
    let bloq='';try{bloq=window.notaPrecio.bloqueoPDF(limpio(d),pid===undefined?opts.proyectoId:pid)}catch(e){console.error(e)}
    if(bloq){toast(bloq);return null;}
  }
  const el=elegirDibujo(await adjuntosPDF(extra||opts.adjuntos));
  let blob=await generarPDF(el.adj,pid===undefined?opts.proyectoId:pid,el.sinDib);
  blob=await sumarPlanos(blob,el.adj);
  return {blob,nombre:`${esPresu()?'Presupuesto':'Nota de pedido'} - ${(d.cli||'cliente').trim()}.pdf`,faltaron:faltaronPDF.slice()};
}
async function descargarPDF(btn,extra,pid){
  const txt=btn.textContent;btn.textContent='Armando el PDF…';btn.disabled=true;
  try{
    const r=await armarPDF(extra,pid);if(!r)return;
    const url=URL.createObjectURL(r.blob),a=document.createElement('a');a.href=url;a.download=r.nombre;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    toast(r.faltaron.length?'⚠️ PDF listo, pero no se pudo sumar: '+r.faltaron.join(', ')+'. Mandalo aparte.':'PDF listo: mandalo al cliente por WhatsApp o por correo');
  }catch(e){toast('No se pudo armar el PDF: '+e.message)}
  finally{btn.textContent=txt;btn.disabled=false}
}
// Mandar por correo desde el último paso: solo con la nota guardada y sin cambios pendientes,
// así el cliente recibe lo mismo que quedó en la app (lo manda app.js con window.correoNota).
const sinCambios=()=>JSON.stringify(d)===inicial&&!archivos.length;
function correoBtnHTML(){
  if(typeof window.correoNota!=='function')return '';
  if(!opts.proyectoId)return `<div class="aviso" style="text-align:left">✉️ Para mandarlo por correo, guardá la nota: después lo mandás desde el proyecto.</div>`;
  if(!sinCambios())return `<div class="aviso" style="text-align:left">✉️ Guardá los cambios para poder mandarlo por correo.</div>`;
  return `<button class="add" id="np-b-mail" style="border-style:solid;margin-top:6px">✉️ Mandar por correo${d.mail?' a '+esc(d.mail):''}</button>`;
}
function mapsUrl(){return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(d.loc||'')}
function modelo(m){
  const E=(tipo,ubi,items)=>({id:nid(),tipo,ubi,items:items||[]});
  const base={oficina:{prod:'Oficina',tam:'20 DV',espacios:[E('oficina','Extremo izquierdo'),E('bano','Extremo derecho',['Inodoro','Bacha'])],piso:'Flotante PVC',rev:['PVC'],pInterior:'Aluminio',linea:'Módena',vidrio:'Simple'},
    sanitario:{prod:'Sanitario',tam:'20 DV',espacios:[E('bano','Extremo izquierdo',['Inodoro','Mingitorio','Bacha']),E('bano','Centro',['Inodoro','Bacha']),E('bano','Extremo derecho',['Ducha','Bacha'])],piso:'Original epoxy alto tránsito',rev:['PVC'],pInterior:'Aluminio',linea:'Módena',vidrio:'Simple'},
    vivienda:{prod:'Módulo habitable',tam:'40 HC',espacios:[E('habitacion','Extremo izquierdo'),E('habitacion','Extremo derecho'),E('cocina','Centro',['Bacha monocomando','Bajo mesada','Alacena']),E('bano','Centro',['Inodoro','Bidet','Bacha','Ducha','Espejo'])],piso:'Flotante madera',rev:['Durlock'],pInterior:'Madera',linea:'Módena',vidrio:'DVH (3+3 / Cam 9)'},
    otro:{}}[m];
  d.modelo=m;if(m==='otro'){render();toast('Empezás de cero: cargá todo en los pasos siguientes');return}
  Object.assign(d,limpio(base));d.espacios=base.espacios;d.tab=null;d.revAsig={};d.elec={};const [l,a,h]=MED[d.tam];d.largo=l;d.ancho=a;d.alto=h;
  render();toast('Modelo cargado: revisá y cambiá lo que haga falta');
}
// Aviso de medida fuera de límite mientras se escribe (sin redibujar, para no perder el foco)
function pintarLim(k,i){const el=$(`[data-lim="${k}${i}"]`);if(!el)return;const esP=k==='p',o=(esP?d.puertas:d.ventanas)[i];
  const m=msgExceso(o,esP,esP?'Puerta'+(d.puertas.length>1?' '+(i+1):''):'Ventana '+(i+1));el.textContent=m?'⚠️ '+m:'';el.style.display=m?'':'none'}
function limpio(o){return JSON.parse(JSON.stringify(o))}
function toast(t){let el=document.getElementById('np-tt');if(!el){el=document.createElement('div');el.id='np-tt';document.body.appendChild(el)}el.textContent=t;el.style.opacity=1;clearTimeout(toast.t);toast.t=setTimeout(()=>el.style.opacity=0,/^⚠️/.test(t)?7000:2400)}
function conectar(R0){
R0.addEventListener('click',e=>{
  const bp=e.target.closest('#np-b-pdf');if(bp){descargarPDF(bp);return}
  if(e.target.closest('#np-b-mail')){window.correoNota(opts.proyectoId);return}
  if(tocarCroquis(e))return;
  const t=e.target.closest('[data-k],[data-m],[data-mas],[data-menos],[data-em],[data-ep],[data-quitar],[data-quitarp],[data-quitaf],[data-modelo],[data-up],[data-um],#np-add-v,#np-add-p');if(!t)return;
  if(t.dataset.modelo){modelo(t.dataset.modelo);return}
  if(t.dataset.up||t.dataset.um){d.unidades=Math.min(MAX_U,Math.max(1,unidades()+(t.dataset.up?1:-1)));render();return}
  if(t.id==='np-add-v'){d.ventanas.push({esp:'',med:'',ancho:'',alto:'',tipo:'',pared:'',pos:'',prot:''});render();return}
  if(t.id==='np-add-p'){d.puertas.push(nuevaPuerta());render();return}
  if(t.dataset.quitaf!=null){archivos.splice(+t.dataset.quitaf,1);render();return}
  if(t.dataset.quitarp!=null){d.puertas.splice(+t.dataset.quitarp,1);render();return}
  if(t.dataset.quitar!=null){d.ventanas.splice(+t.dataset.quitar,1);render();return}
  if(t.dataset.mas){nuevoEsp(t.dataset.mas,'');render();return}
  if(t.dataset.menos){const k=t.dataset.menos;const i=d.espacios.map(x=>x.tipo).lastIndexOf(k);if(i>=0){const [x]=d.espacios.splice(i,1);d.ventanas=d.ventanas.filter(v=>v.auto!==x.id)}render();return}
  if(t.dataset.ep||t.dataset.em){const [esp,c]=(t.dataset.ep||t.dataset.em).split('|');d.elec[esp][c]=Math.max(0,d.elec[esp][c]+(t.dataset.ep?1:-1));render();return}
  if(t.dataset.m&&t.dataset.m.startsWith('it.')){const x=d.espacios.find(y=>y.id===t.dataset.m.slice(3));const i=x.items.indexOf(t.dataset.v);i>=0?x.items.splice(i,1):x.items.push(t.dataset.v);
    // con bidet no va el lavamatic; sin bidet vuelve
    if(x.tipo==='bano'&&t.dataset.v==='Bidet'){const l=x.items.indexOf('Lavamatic');if(x.items.includes('Bidet')){if(l>=0)x.items.splice(l,1)}else if(l<0)x.items.push('Lavamatic')}
    render();return}
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
  if(k==='cont'){const c=CONT[v];d.cont=v;d.prod=c.prod;d.ot=!!c.ot;d.lado=c.lado||'';if(c.corte)d.corte=String(c.corte);if(c.tam){const [l,a,h]=MED[c.tam];d.tam=c.tam;d.largo=l;d.ancho=a;d.alto=h}render();return}
  if(k==='prod')d.cont='',d.ot=false;
  setPath(k,v);
  if(k==='tam'){const [l,a,h]=MED[v];d.largo=l;d.ancho=a;d.alto=h}
  render();
});
// arrastrar una línea divisoria con el dedo o el mouse: se redibuja solo el croquis mientras se mueve
let arrastre=null;
R0.addEventListener('pointerdown',e=>{const t=e.target.closest('[data-croq="tab"]');if(!t||paso!==2)return;
  const k=+t.dataset.v,[X0,X1]=t.dataset.g.split(',').map(Number);e.preventDefault();
  arrastre={k,x0:e.clientX,mov:false};
  const mover=ev=>{if(!arrastre)return;if(!arrastre.mov&&Math.abs(ev.clientX-arrastre.x0)<4)return;arrastre.mov=true;ev.preventDefault();
    const sv=$('#np-croq svg');const p=sv&&puntoSVG(ev,sv);if(!p)return;herr={tab:k};moverTab(k,(p.x-X0)/(X1-X0)*tabs().Li);const c=$('#np-croq');if(c)c.innerHTML=croquisEsp()};
  const fin=()=>{document.removeEventListener('pointermove',mover);document.removeEventListener('pointerup',fin);document.removeEventListener('pointercancel',fin);
    if(arrastre&&arrastre.mov){arrastre.fin=true;herr={tab:k};render();setTimeout(()=>{arrastre=null},0)}else arrastre=null};
  document.addEventListener('pointermove',mover,{passive:false});document.addEventListener('pointerup',fin);document.addEventListener('pointercancel',fin)});
// el click que sigue a un arrastre no cuenta como toque
R0.addEventListener('click',e=>{if(arrastre&&arrastre.fin){arrastre=null;e.stopImmediatePropagation();e.preventDefault()}},true);
R0.addEventListener('input',e=>{const t=e.target;
  if(t.dataset.i==='unidades'){d.unidades=t.value===''?'':Number(t.value);return}
  if(t.dataset.i){d[t.dataset.i]=t.value;if(t.dataset.i==='loc'){const a=$('#np-maps-a');if(a)a.href=mapsUrl()}}
  if(t.dataset.pui){const [i,c]=t.dataset.pui.split('.');d.puertas[+i][c]=t.value;pintarLim('p',+i)}
  if(t.dataset.vi){const [i,c]=t.dataset.vi.split('.');d.ventanas[+i][c]=t.value;pintarLim('v',+i)}
  if(t.dataset.esml){const x=d.espacios.find(y=>y.id===t.dataset.esml);if(x)x.ml=t.value}
  if(t.id==='np-val'){valVenta=t.value}
});
R0.addEventListener('change',e=>{const t=e.target;
  if(t.dataset.tabcm!=null){const k=+t.dataset.tabcm,T=tabs(),c=cortesTab(T),q=c.indexOf(T.p[k]);const r=moverTab(k,c[q-1]+(Number(t.value)||0));render();if(r.tope)toast(`⚠️ Hasta ahí: mínimos ${MIN_TXT()}`);return}
  if(t.dataset.c){d[t.dataset.c]=t.checked;render()}
  if(t.dataset.i==='unidades'){if(t.value!=='')d.unidades=Math.min(MAX_U,Math.max(1,Math.floor(Number(t.value))||1));render()}
  if(t.id==='np-confirmado'){d.confirmado=t.checked}
  if(t.dataset.f&&t.files.length){const lugar=cupoCroquis()-archivos.length,nuevos=[...t.files];
    archivos.push(...nuevos.slice(0,lugar));
    toast(nuevos.length>lugar?`⚠️ Máximo ${MAX_CROQUIS} archivos: se agregaron ${Math.max(0,lugar)}`:'📎 '+(nuevos.length>1?nuevos.length+' archivos':nuevos[0].name)+' se sube'+(nuevos.length>1?'n':'')+' al guardar');render()}
});
$('#np-b-sig').onclick=siguiente;
$('#np-b-atras').onclick=()=>{if(paso){paso--;intento=false;herr={};render();arriba()}else salir()};
$('#np-x').onclick=salir;
$('#np-borr').onclick=()=>guardar(false,true);
}
const arriba=()=>{const m=$('#np-app');if(m)m.scrollTop=0};
async function siguiente(){
  if(ocupado)return;
  intento=true;const errs=errores();
  if(errs.length){render();arriba();return}
  intento=false;
  // un presupuesto se guarda en ventas: pasa a arquitectura cuando el cliente lo acepta (orden de compra)
  if(paso===6){await guardar(!!opts.enviar&&!esPresu(),false);return}
  paso++;herr={};render();arriba();
}
async function guardar(enviar,borrador){
  if(ocupado||!opts.onGuardar)return;
  ocupado=true;['#np-b-sig','#np-borr'].forEach(s=>{const b=$(s);if(b)b.disabled=true});
  try{const ok=await opts.onGuardar(limpio(d),{enviar,borrador,archivos:archivos.slice(),valor:opts.pideValor&&Number(valVenta)>0?Number(valVenta):null});if(ok!==false)cerrar(true)}
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
  opts=o||{};archivos=[];intento=false;valVenta=opts.valor==null?'':String(opts.valor);paso=Math.min(6,Math.max(0,Number(opts.paso)||0));herr={};
  d=normProd(Object.assign(nuevo(),o&&o.ficha&&o.ficha.v===2?limpio(o.ficha):{}));
  if(!d.puertas||!d.puertas.length)d.puertas=[nuevaPuerta()];
  fecha0=d.fecha||'';
  if(!d.cli&&o&&o.cliente)d.cli=o.cliente;
  if(!d.empresa&&o&&o.empresa)d.empresa=o.empresa;
  if(window.notaPrecio){try{window.notaPrecio.abrir(opts,d)}catch(e){console.error(e)}}
  const R0=montar();$('#np-tit').textContent=opts.titulo||'Nueva nota de pedido';$('#np-borr').style.display=opts.borrador===false?'none':'';
  inicial=JSON.stringify(d);R0.classList.add('on');document.body.style.overflow='hidden';render();arriba();
}
// Funciones para mostrar una nota guardada fuera del asistente
function conD(f,fn){const pd=d,pp=paso;d=normProd(Object.assign(nuevo(),limpio(f||{})));try{return fn()}finally{d=pd;paso=pp}}
function faltantes(f){return conD(f,()=>{const out=[];revisandoGuardada=true;try{for(paso=0;paso<6;paso++)out.push(...errores())}finally{revisandoGuardada=false}if(!d.confirmado)out.push('Falta la confirmación del cliente');return out})}
// Agrega las claves que la base ya exige para pasar a arquitectura (largo/ancho/alto, puerta, elec, sani, confirmada).
// largo, ancho, alto y elec ya vienen de la nota (en cm y por espacio); solo se suman las que faltan.
function compat(f){return conD(f,()=>({v:2,...limpio(d),
    // la base exige 'puerta' para pasar de ventas: la venta del contenedor sin aberturas y "tal cual plano" también cuentan
    puerta:d.puertaP?'A confirmar':(d.puertas.map(p=>p.tipo).filter(Boolean).join(' + ')||(d.segunPlano?'Según plano':esSolo(d.prod)?'Sin puertas nuevas':'')),
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
  // sin costos de armado (decisión de Cristian 26/11): la mano de obra va por m²
  esp.forEach(x=>{
    // bajo mesada y alacena van por metro de mesada (pedido de Cristian 27/11)
    (x.items||[]).forEach(it=>x.tipo==='cocina'&&(it==='Bajo mesada'||it==='Alacena')?add('Cocina · '+it,'mat','ml',mlDe(x)):add((x.tipo==='bano'?'Sanitario · ':'Cocina · ')+it,'mat','c/u',1))});
  // líneas borradas: ese tabique no se hace
  const T=tabs(),borradas=[0,1].filter(k=>T.off[k]&&tabUsada(k)).length;
  // cada baño y cada habitación llevan sí o sí tabique y puerta (pedido de Cristian 27/11)
  const nCerr=esp.filter(x=>x.tipo==='bano'||x.tipo==='habitacion').length;
  const nTab=Math.max(esp.length>1?esp.length-1-borradas:0,nCerr), nPInt=Math.max(esp.length>1?esp.length-1:0,nCerr);
  if(nTab)add('Tabique divisorio','mat','m²',nTab*A*H);
  if(humedos.length)add('Instalación sanitaria por ambiente','mo','c/u',humedos.length);
  const enZona=u=>Math.max(1,esp.filter(x=>x.ubi===u).length);
  const Lz=u=>{const i=UBI.indexOf(u);return d.tab&&i>=0?largoZona(T,i)/T.Li*L:L/3};
  let humedo=0;
  let humedoT=0;
  humedos.forEach(x=>{const m=2*(Lz(x.ubi)+A)*H/enZona(x.ubi)*REV_DESP;humedo+=m;if(x.rev)x.rev==='Melamina'?add(MELAMINA,'mat','m²',m):add('Revestimiento '+x.rev.toLowerCase()+' (baño/cocina)','mat','m²',m,etiqueta(x));
    const mT=Lz(x.ubi)*A/enZona(x.ubi)*REV_DESP;if(x.revT)humedoT+=mT;
    if(x.revT)x.revT==='Melamina'?add(MELAMINA,'mat','m²',mT):add('Revestimiento de techo '+x.revT.toLowerCase()+' (baño/cocina)','mat','m²',mT,etiqueta(x))});
  // terminaciones
  // pintura: un solo ítem (exterior + interior), en tachos de 20 l. Se redondea para arriba al final.
  const m2Pint=(paredes+techo)*((d.pExt===SIN_PINT?0:1)+((d.pInt&&d.pInt!=='Sin pintura')?1:0));
  if(!esSolo(d.prod)||d.pExt||d.pExtP)add('Pintura','mat',PINT_UNI,m2Pint/PINT_M2,'',d.pExtP);
  if(d.revExt&&d.revExt!=='Sin revestimiento')add('Revestimiento exterior · '+d.revExt,'mat','m²',(paredes+techo)*REV_DESP);
  // aislación de paredes y techo en los módulos armados
  if(esModulo(d.prod))add('Aislación térmica','mat','m²',paredes+techo);
  if(d.piso)add('Piso · '+d.piso,'mat','m²',piso);
  const resto=Math.max(0,(paredes+techo)*REV_DESP-humedo-humedoT), dest=revDestinos();
  (d.rev||[]).filter(v=>v!=='Sin revestimiento'&&v!=='Solo pintura').forEach(v=>{
    const n=d.rev.length>1?dest.filter(x=>d.revAsig[x.k]===v).length:dest.length;
    if(n&&dest.length)add(v==='Melamina'?MELAMINA:'Revestimiento interior · '+v,'mat','m²',resto*n/dest.length)});
  if(nPInt)add(d.pInterior?'Puerta interior · '+d.pInterior:'Puerta interior','mat','c/u',nPInt);
  // aberturas
  if(d.puertaP)add('Puerta exterior (a confirmar)','mat','c/u',d.puertas.length||1,'',true);
  else if(d.segunPlano&&!d.puertas.some(p=>p.tipo))add('Puerta exterior (según plano)','mat','c/u',1,'',true);
  else d.puertas.forEach(p=>{if(!p.tipo)return;add('Puerta exterior · '+(PUERTA_MAT[p.tipo]||p.tipo)+(p.tipo===PUERTA_ORIG?'':' '+(p.med==='Otra'?'medida especial':(p.med||'90')+' cm')),'mat','c/u',1,p.med==='Otra'?p.ancho+' × '+p.alto+' cm':'');
    if(p.prot==='Reja')add('Reja de puerta','mat','c/u',1);if(p.prot==='Postigón')add('Postigón','mat','c/u',1)});
  // ventanas: el costo es uno solo por m² (MO+MAT) y el DVH suma un adicional por m² (pedido de Cristian 26/11).
  // Cada ventana sigue como ítem para el taller y la carpintería, con costo 0 (queda incluida en el m²).
  const m2V=d.ventanas.reduce((s,v)=>{const m=String(v.med||'').match(/(\d+) × (\d+)/);const an=Number(v.ancho)||(m?+m[1]:0),al=Number(v.alto)||(m?+m[2]:0);return s+an*al/10000},0);
  add(VENT_M2,'mo','m²',m2V);
  if(esDVH())add(DVH_M2,'mo','m²',m2V);
  d.ventanas.forEach(v=>{add('Ventana '+(d.linea||'')+(esDVH()&&d.linea!=='DVH'?' DVH':'')+' · '+(v.med==='Otra'?'medida especial':(v.med||'').replace(' (baño)','')),'mat','c/u',1,v.med==='Otra'?v.ancho+' × '+v.alto+' cm':'');
    if(v.prot==='Reja')add('Reja de ventana','mat','c/u',1);if(v.prot==='Mosquitero')add('Mosquitero','mat','c/u',1)});
  // instalaciones
  const el=Object.values(d.elec||{});
  if(!esSolo(d.prod))add('Tablero y disyuntor','mat','c/u',1);
  add('Toma','mat','c/u',el.reduce((s,x)=>s+(x.tomas||0),0));
  ['Plafón','Tubo LED'].forEach(t=>add('Luz · '+t,'mat','c/u',el.filter(x=>x.tipo===t).reduce((s,x)=>s+(x.luces||0),0)));
  if(d.aa==='Solo pre-instalación')add('Pre-instalación de aire','mat','c/u',aaCant());
  if(d.aa==='Sí, con equipo')add('Aire acondicionado '+(d.aaFrig||''),'mat','c/u',aaCant());
  if(d.termo==='Sí')add('Termotanque '+(d.termoTipo||'').toLowerCase(),'mat','c/u',1,d.termoL?d.termoL+' l':'');
  if(d.tanque==='Sí')add('Tanque de agua','mat','c/u',1,d.tanqueL?d.tanqueL+' l':'');
  // generales
  if(!esSolo(d.prod))add('Mano de obra general','mo','m²',piso);
  // todo lo eléctrico se costea por m² (pedido de Cristian 26/11): los ítems de arriba quedan para el taller con costo 0
  if(!esSolo(d.prod))add('Instalación eléctrica','mo','m²',piso);
  add('Flete','ter','c/u',1,d.loc||'');
  // van en todos los pedidos, sea cual sea el producto (pedido de Cristian 19/11): el administrador carga en Costos cuánto es por unidad
  add('Comisión de venta','otr','c/u',1);
  add('Amortización de planta y máquinas','otr','c/u',1);
  // varias unidades iguales: todo se multiplica por la cantidad
  const u=unidades();if(u>1)out.forEach(x=>x.cant=r2(x.cant*u));
  out.forEach(x=>{if(x.unidad===PINT_UNI)x.cant=Math.ceil(x.cant-1e-9)});
  return out;
}
// ── Breve descripción para quien aprueba (pedido de Cristian 27/11): 6 a 8 renglones con lo que se pidió ──
function breve(){
  const out=[],lc=t=>String(t||'').toLowerCase().replace(/\b(pvc|wpc|dvh|led|osb)\b/g,m=>m.toUpperCase()),L=largoTot()/100,A=(Number(d.ancho)||0)/100,m2=L*A,u=unidades();
  const n2=x=>(Math.round(x*10)/10).toLocaleString('es-AR');
  out.push(`${u>1?u+' × ':''}${nomProd()||'?'}${d.tam&&!d.cont?' '+d.tam:''}${m2?` · ${n2(L)} × ${n2(A)} m (${n2(m2)} m²)`:''}${d.sol?' · '+lc(d.sol):''}`);
  if(d.espacios.length){const c={};d.espacios.forEach(x=>c[x.tipo]=(c[x.tipo]||0)+1);
    out.push('Ambientes: '+Object.keys(ESP).filter(k=>c[k]).map(k=>(c[k]>1?c[k]+' ':'')+lc(ESP[k])+(c[k]>1?(k==='habitacion'?'es':'s'):'')).join(', ')+'.');
    d.espacios.filter(x=>ITEMS[x.tipo]).forEach(x=>{const it=(x.items||[]).map(itemTxt);out.push(`${etiqueta(x)}: ${it.length?lc(it.join(', ')):'sin artefactos marcados'}${x.tipo==='cocina'&&(x.items||[]).some(i=>i==='Bajo mesada'||i==='Alacena')?' ('+n2(mlDe(x))+' m de mesada)':''}${x.rev?', revestimiento '+lc(x.rev):''}.`)})}
  else if(!esSolo(d.prod))out.push('Sin divisiones.');
  const term=[];if(esModulo(d.prod))term.push('aislado');
  const ri=(d.rev||[]).filter(v=>v!=='Sin revestimiento');if(ri.length)term.push('interior '+lc(ri.join(' y ')));
  if(d.revExt&&d.revExt!=='Sin revestimiento')term.push('exterior '+lc(d.revExt));
  if(d.piso)term.push('piso '+lc(d.piso));
  if(term.length)out.push('Terminaciones: '+term.join(', ')+'.');
  const pu=d.puertaP?['puertas a confirmar']:puertasVal().filter(p=>p.tipo).map(p=>lc(p.tipo)+(p.tipo===PUERTA_ORIG?'':' '+(p.med==='Otra'?p.ancho+' × '+p.alto:(p.med||'?'))+' cm'));
  const ve=d.ventanas.map(v=>(v.ancho&&v.alto?v.ancho+' × '+v.alto:'medida a elegir')+(v.esp?' en '+lc(v.esp):''));
  if(pu.length||ve.length||d.segunPlano)out.push(`Aberturas: ${d.segunPlano?'tal cual plano. ':''}${pu.length?pu.length+' puerta'+(pu.length>1?'s':'')+' ('+pu.join(', ')+')':'sin puertas nuevas'}${ve.length?', '+ve.length+' ventana'+(ve.length>1?'s':'')+' ('+ve.join('; ')+')':''}${d.linea?', línea '+d.linea:''}${esDVH()?', vidrio DVH':''}.`);
  const ins=[];if(d.aa&&d.aa!=='No')ins.push(aaCant()+' aire'+(aaCant()>1?'s':'')+(d.aa==='Solo pre-instalación'?' (solo pre-instalación)':d.aaFrig?' de '+d.aaFrig:''));
  if(d.termo==='Sí')ins.push('termotanque'+(d.termoL?' '+d.termoL+' l':''));if(d.tanque==='Sí')ins.push('tanque de agua'+(d.tanqueL?' '+d.tanqueL+' l':''));
  if(ins.length)out.push('Instalaciones: '+ins.join(', ')+'.');
  if(d.obs&&d.obs.trim())out.push('Observaciones: '+d.obs.trim().slice(0,160)+(d.obs.trim().length>160?'…':''));
  return out}
// Datos para comparar el precio por m² con los valores de referencia: m² de piso por unidad, 20 o 40 pies y si lleva baño o cocina
function datosM2(){const L=largoTot()/100,A=(Number(d.ancho)||0)/100;
  return {aplica:esModulo(d.prod)&&!/Company$/.test(d.prod||'')&&L*A>0,m2:L*A,pies:/^40/.test(d.tam||'')?40:20,conBano:d.espacios.some(x=>ITEMS[x.tipo]),unidades:unidades(),nombre:nomProd()}}
window.NotaPedido={abrir,cerrar,
  breve:f=>conD(f,()=>breve()),datosM2:f=>conD(f,()=>datosM2()),
  lineasCosteo:f=>conD(f,()=>lineasCosteo()),
  resumen:f=>conD(f,()=>resumenCuerpo()),
  dibujos:f=>conD(f,()=>(d.espacios.length?planoSVG():'')+abertSVG()),
  pendientes:f=>conD(f,()=>pendientes()),
  faltantes,compat,nombreSugerido,tipoTrabajo,EMPRESAS,
  // limitaciones de aberturas: la app las trae de la base (migración 0022) y las pasa acá
  LIM_DEF,limites:()=>LIM,setLimites:l=>{LIM=Array.isArray(l)&&l.length?l:LIM_DEF},
  // tipología del proyecto, para la receta de materiales: producto, tamaño y cantidad de unidades
  TIPOLOGIAS:[...PROD_MOD,'Contenedor cortado','Reefer','Contenedor'],TAMS:Object.keys(MED),
  tipologia:f=>conD(f,()=>({prod:d.prod,tam:d.tam,unidades:unidades()})),
  // adj: función que devuelve los planos del proyecto [{nombre,blob}] o [{nombre,url}] para sumarlos al PDF
  // pid: el proyecto, para sumar el precio del presupuesto
  armar:(f,adj,pid)=>{const pd=d,pa=archivos;d=normProd(Object.assign(nuevo(),limpio(f)));archivos=[];return armarPDF(adj||(()=>[]),pid||null).finally(()=>{d=pd;archivos=pa})},
  PDF_DIB,
  pdf:(f,btn,adj,pid)=>{const pd=d,pa=archivos;d=normProd(Object.assign(nuevo(),limpio(f)));archivos=[];return descargarPDF(btn||{textContent:'',disabled:false},adj||(()=>[]),pid||null).finally(()=>{d=pd;archivos=pa})}};
})();
