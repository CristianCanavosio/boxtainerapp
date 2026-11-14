// Datos de prueba para grabar los videos. Todo es inventado: personas, clientes y proyectos de ejemplo.
// Nunca usar datos reales de la empresa acá.
const dia=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
const hace=(horas)=>new Date(Date.now()-horas*36e5).toISOString();

const U={
  admin:{id:'00000000-0000-4000-8000-000000000001',nombre:'Laura Gómez',email:'laura@ejemplo.com',rol:'admin'},
  ventas:{id:'00000000-0000-4000-8000-000000000002',nombre:'Martín Ríos',email:'martin@ejemplo.com',rol:'ventas',empresa:'Boxtainers Argentina SAS'},
  arquitectura:{id:'00000000-0000-4000-8000-000000000003',nombre:'Sofía Paz',email:'sofia@ejemplo.com',rol:'arquitectura'},
  lider:{id:'00000000-0000-4000-8000-000000000004',nombre:'Diego Ferreyra',email:'diego@ejemplo.com',rol:'lider'},
  supervisor:{id:'00000000-0000-4000-8000-000000000005',nombre:'Juan Pérez',email:'juan@ejemplo.com',rol:'supervisor'},
  supervisor2:{id:'00000000-0000-4000-8000-000000000006',nombre:'Carlos Medina',email:'carlos@ejemplo.com',rol:'supervisor'},
  aluminio:{id:'00000000-0000-4000-8000-000000000007',nombre:'Aluminios del Sur',email:'aluminio@ejemplo.com',rol:'carp_aluminio'},
  madera:{id:'00000000-0000-4000-8000-000000000008',nombre:'Maderas del Norte',email:'madera@ejemplo.com',rol:'carp_madera'},
  pendiente:{id:'00000000-0000-4000-8000-000000000009',nombre:'Pablo Luna',email:'pablo@ejemplo.com',rol:'pendiente'},
};
const P={
  ventas:'10000000-0000-4000-8000-000000000001',
  arq:'10000000-0000-4000-8000-000000000002',
  asig:'10000000-0000-4000-8000-000000000003',
  obra:'10000000-0000-4000-8000-000000000004',
  obra2:'10000000-0000-4000-8000-000000000005',
  cambio:'10000000-0000-4000-8000-000000000006',
};

function ficha(cli,extra){
  return Object.assign({v:2,empresa:'Boxtainers Argentina SAS',arq:'Sí',sol:'Orden de compra confirmada',cli,tel:'351 555-0101',cuit:'',
    loc:'Av. Siempre Viva 742, Córdoba',maps:'',mapsOk:true,fecha:dia(25),modelo:'oficina',unidades:1,prod:'Oficina',tam:'20 DV',
    motor:'',corte:'',lado:'',largo:606,ancho:244,alto:259,
    espacios:[{id:'e1',tipo:'oficina',ubi:'Extremo izquierdo',items:[]},{id:'e2',tipo:'bano',ubi:'Extremo derecho',items:['Inodoro','Bacha'],rev:'PVC'}],
    pExt:'Blanco',pExtOtro:'',pExtP:false,pInt:'Blanco',pIntOtro:'',piso:'Flotante PVC',rev:['PVC'],revAsig:{},revExt:'Sin revestimiento',pInterior:'Aluminio',
    linea:'Módena',
    puertas:[{tipo:'De abrir',med:'90',ancho:'',alto:'',pared:'Lateral A',pos:'Extremo izquierdo',mano:'Hacia afuera, bisagra derecha',prot:'Reja'}],puertaP:false,
    ventanas:[{esp:'Oficina',med:'100 × 100',ancho:'100',alto:'100',tipo:'Corrediza',pared:'Lateral A',pos:'Centro',prot:'Reja'},
      {esp:'Baño',med:'60 × 40 (baño)',ancho:'60',alto:'40',tipo:'Ventiluz',pared:'Lado opuesto',pos:'',prot:'Sin protección'}],
    elec:{'Oficina':{tomas:4,luces:2,tipo:'Tubo LED',luz:'Fría'},'Baño':{tomas:1,luces:1,tipo:'Plafón',luz:'Fría'}},
    aa:'Sí, con equipo',aaFrig:'3.000 fg',aaEsp:'',termo:'Sí',termoL:'40',termoTipo:'Eléctrico',tanque:'No',tanqueL:'',
    obs:'',archivos:[],confirmado:true,puerta:'De abrir',sani:'Sí',confirmada:true},extra||{});
}
function proy(id,nombre,cli,etapa,extra){
  return Object.assign({id,nombre,cliente:cli,empresa:'Boxtainers Argentina SAS',tipo:'Oficina',etapa,estado:etapa==='ejecucion'?'en-curso':'presupuesto',
    avance:0,valor_venta:null,creado_por:U.ventas.id,vendedor_id:U.ventas.id,vendedor:U.ventas.nombre,supervisor_id:null,
    inicio:null,entrega:null,personas:0,deposito:'Córdoba',prioridad:'normal',observaciones:null,ficha:ficha(cli),nota_arquitectura:null,
    creado_en:hace(72)},extra||{});
}

module.exports=function datos(){
  const perfiles=Object.values(U).map(u=>({id:u.id,nombre:u.nombre,email:u.email,rol:u.rol,empresa:u.empresa||null,creado_en:hace(500)}));
  const proyectos=[
    proy(P.ventas,'Oficina 20 DV — Estancia La Prueba','Estancia La Prueba','ventas',{creado_en:hace(5)}),
    proy(P.arq,'Oficina 20 DV — Constructora Demo SA','Constructora Demo SA','arquitectura',{creado_en:hace(30)}),
    proy(P.asig,'Oficina 20 DV — Minera Ejemplo SRL','Minera Ejemplo SRL','asignacion',{creado_en:hace(50),
      ficha:ficha('Minera Ejemplo SRL',{arq:'No'})}),
    proy(P.obra,'Oficina 20 DV — Agro Modelo SA','Agro Modelo SA','ejecucion',{creado_en:hace(300),supervisor_id:U.supervisor.id,
      inicio:dia(-6),entrega:dia(9),avance:35,personas:3,valor_venta:18000,stock_verificado_por:U.lider.id,stock_verificado_en:hace(150)}),
    proy(P.obra2,'Sanitario 20 DV — Club Ficticio','Club Ficticio','ejecucion',{tipo:'Sanitario',creado_en:hace(400),supervisor_id:U.supervisor2.id,
      inicio:dia(-12),entrega:dia(2),avance:60,personas:2,ficha:ficha('Club Ficticio',{prod:'Sanitario',modelo:'sanitario'})}),
    proy(P.cambio,'Oficina 20 DV — Hotel Imaginario','Hotel Imaginario','asignacion',{creado_en:hace(90)}),
  ];
  const consultas=[
    {id:'20000000-0000-4000-8000-000000000001',proyecto_id:P.arq,para:'ventas',de_id:U.arquitectura.id,
      texto:'¿La ventana de la oficina va con reja o con mosquitero?',es_error:false,creado_en:hace(5)},
    {id:'20000000-0000-4000-8000-000000000002',proyecto_id:P.obra,para:'lider',de_id:U.supervisor.id,
      texto:'¿Confirmamos color gris grafito para el exterior?',es_error:false,creado_en:hace(2),
      respuesta:'Sí, gris grafito. Lo confirmó el cliente.',respondida_por:U.lider.id,respondida_en:hace(1)},
  ];
  const recorrido=[
    {id:1,proyecto_id:P.arq,a_etapa:'arquitectura',autor_id:U.ventas.id,creado_en:hace(29)},
    {id:2,proyecto_id:P.asig,a_etapa:'asignacion',autor_id:U.ventas.id,creado_en:hace(49)},
    {id:3,proyecto_id:P.obra,a_etapa:'arquitectura',autor_id:U.ventas.id,creado_en:hace(290)},
    {id:4,proyecto_id:P.obra,a_etapa:'asignacion',autor_id:U.arquitectura.id,creado_en:hace(250)},
    {id:5,proyecto_id:P.obra,a_etapa:'ejecucion',autor_id:U.lider.id,creado_en:hace(150)},
    {id:6,proyecto_id:P.cambio,a_etapa:'asignacion',autor_id:U.ventas.id,creado_en:hace(80)},
  ];
  const actualizaciones=[
    {id:'30000000-0000-4000-8000-000000000001',proyecto_id:P.obra,avance:20,estado:'en-curso',texto:'Corte de vanos y estructura de puerta.',personas:3,horas:8,autor_id:U.supervisor.id,creado_en:hace(50)},
    {id:'30000000-0000-4000-8000-000000000002',proyecto_id:P.obra,avance:35,estado:'en-curso',texto:'Aislación de techo y paredes terminada.',personas:3,horas:8,autor_id:U.supervisor.id,creado_en:hace(26)},
  ];
  const mats=[
    ['Pintura exterior','tacho 20 l',1,1],['Pintura interior','tacho 20 l',1,0.5],['Aislación térmica','m²',38,30],
    ['Revestimiento PVC','m²',32,null],['Piso flotante PVC','m²',13,null],['Puerta exterior de abrir 90','c/u',1,1],
  ];
  const materiales_proyecto=mats.map(([clave,unidad,plan,usada],i)=>({id:'40000000-0000-4000-8000-00000000000'+(i+1),proyecto_id:P.obra,clave,det:'',unidad,
    cant_plan:plan,extra:false,stock:'hay',stock_por:U.lider.id,cant_usada:usada,usada_por:usada!=null?U.supervisor.id:null,usada_en:usada!=null?hace(26):null,creado_en:hace(150)}));
  const pedidos_carpinteria=[
    {id:'50000000-0000-4000-8000-000000000001',numero:12,proyecto_id:P.obra,proyecto_nombre:'Oficina 20 DV — Agro Modelo SA',taller:'aluminio',
      items:[{desc:'Ventana Módena corrediza',medida:'100 × 100 cm',cant:'1',unidad:'c/u'},{desc:'Ventiluz Módena',medida:'60 × 40 cm',cant:'1',unidad:'c/u'}],
      para_fecha:dia(5),entregar_en:'Depósito Córdoba',observaciones:'Color blanco. Con reja la ventana grande.',estado:'enviado',
      historial:[{estado:'enviado',por:U.supervisor.id,en:hace(3)}],creado_por:U.supervisor.id,creado_en:hace(3)},
    {id:'50000000-0000-4000-8000-000000000002',numero:9,proyecto_id:P.obra2,proyecto_nombre:'Sanitario 20 DV — Club Ficticio',taller:'aluminio',
      items:[{desc:'Puerta interior aluminio',medida:'70 × 200 cm',cant:'3',unidad:'c/u'}],
      para_fecha:dia(1),entregar_en:'Depósito Córdoba',observaciones:'',estado:'aceptado',fecha_compromiso:dia(1),
      historial:[{estado:'enviado',por:U.supervisor2.id,en:hace(120)},{estado:'aceptado',por:U.aluminio.id,en:hace(100)}],creado_por:U.supervisor2.id,creado_en:hace(120)},
  ];
  const planos=[
    {id:'60000000-0000-4000-8000-000000000001',proyecto_id:P.obra,nombre:'Planta y cortes v1',archivo:'demo/plano.pdf',enlace:null,autor_id:U.arquitectura.id,creado_en:hace(260)},
  ];
  const nota_versiones=[
    {id:'70000000-0000-4000-8000-000000000001',proyecto_id:P.cambio,version:1,tipo:'enviada',ficha:ficha('Hotel Imaginario'),autor_id:U.ventas.id,creado_en:hace(80)},
    {id:'70000000-0000-4000-8000-000000000002',proyecto_id:P.cambio,version:2,tipo:'cambio',ficha:ficha('Hotel Imaginario',{pExt:'Gris grafito'}),autor_id:U.lider.id,creado_en:hace(4)},
  ];
  proyectos.find(p=>p.id===P.cambio).ficha=ficha('Hotel Imaginario',{pExt:'Gris grafito'});
  consultas.push({id:'20000000-0000-4000-8000-000000000003',proyecto_id:P.cambio,para:'ventas',de_id:U.lider.id,es_error:false,creado_en:hace(4),
    texto:'✏️ Cambio en la nota: Diego Ferreyra cambió pintura exterior. Mandale el PDF nuevo al cliente y, cuando lo apruebe, tocá "El cliente aprobó el cambio" en el proyecto.'});
  const faltantes=[
    {id:'80000000-0000-4000-8000-000000000001',proyecto_id:P.obra2,material:'Bacha de acero',cantidad:'2',para_fecha:dia(1),frena:true,autor_id:U.supervisor2.id,creado_en:hace(6)},
  ];
  const recetas_tipologia=[
    {id:'90000000-0000-4000-8000-000000000001',tipologia:'Oficina',tam:'',clave:'Sellador poliuretánico',unidad:'pomo',cant:4,creado_en:hace(300)},
    {id:'90000000-0000-4000-8000-000000000002',tipologia:'Oficina',tam:'',clave:'Aislación térmica',unidad:'m²',cant:38,creado_en:hace(300)},
  ];
  const sugerencias=[
    {id:'a0000000-0000-4000-8000-000000000001',autor:U.supervisor.id,autor_nombre:U.supervisor.nombre,autor_rol:'supervisor',autor_email:U.supervisor.email,
      texto:'Tener los tachos de pintura en un estante con el nombre del color: se pierde tiempo buscando.',adjuntos:[],estado:'nueva',respuesta:'',creado_en:hace(20),actualizado_en:hace(20)},
  ];
  const lista_costos=[
    {id:'b1',clave:'Pintura exterior',rubro:'mat',unidad:'tacho 20 l',costo:120},{id:'b2',clave:'Aislación térmica',rubro:'mat',unidad:'m²',costo:9},
    {id:'b3',clave:'Revestimiento PVC',rubro:'mat',unidad:'m²',costo:14},{id:'b4',clave:'Piso flotante PVC',rubro:'mat',unidad:'m²',costo:18},
  ];
  return {perfiles,proyectos,consultas,recorrido,actualizaciones,materiales_proyecto,pedidos_carpinteria,planos,nota_versiones,faltantes,
    recetas_tipologia,sugerencias,lista_costos,presupuestos:[],costos:[],incidencias:[],personal:[],contenedores:[],materiales:[],costeos:[],
    precios_proveedor:[],recursos:[]};
};
module.exports.U=U; module.exports.P=P;
