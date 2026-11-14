// Video de Ventas: cargar la nota de pedido, enviarla y responder consultas.
module.exports={
  usuario:'ventas', titulo:'VENTAS · Cargar la nota de pedido',
  async guion(g){
    await g.decir('Ventas carga el pedido del cliente y lo sigue hasta que entra a producción.',
      ()=>g.mostrar('#dash-content .card'));
    await g.decir('Para un pedido nuevo, andá a Proyectos y tocá el botón naranja.',async()=>{
      await g.pestana('proyectos');
      await g.tocar('#fab-proy',{espera:700});
    });
    await g.decir('Podés arrancar desde un modelo: Oficina ya trae los espacios, el piso y las aberturas.',
      ()=>g.tocar('#nota .modelo[data-modelo="oficina"]'));
    await g.decir('La empresa ya viene con la tuya. Elegí el tipo de solicitud y cargá el cliente.',async()=>{
      await g.op('sol','Orden de compra confirmada');
      await g.escribir('#nota input[data-i="cli"]','Estancia Demo');
      await g.escribir('#nota input[data-i="tel"]','351 555-0000');
    });
    await g.decir('Escribí la dirección, revisala en el mapa y tildá que la verificaste.',async()=>{
      await g.escribir('#nota input[data-i="loc"]','Ruta 5 km 10, Alta Gracia');
      await g.tocar('#nota input[data-c="mapsOk"]');
    });
    await g.decir('La entrega es como mínimo a cinco días para productos Company y a quince para el resto.',async()=>{
      await g.valor('#nota input[data-i="fecha"]',g.dia(20));
      await g.siguiente();
    });
    await g.decir('El producto ya viene del modelo. Si lleva varias unidades iguales, poné la cantidad.',async()=>{
      await g.mostrar('#nota .cnt');
      await g.siguiente();
    });
    await g.decir('El dibujo muestra dónde queda cada espacio. Elegí el revestimiento del baño.',async()=>{
      await g.mostrar('#nota svg');
      await g.tocar('#nota .op[data-k^="rh."][data-v="PVC"]');
      await g.siguiente();
    });
    await g.decir('Lo que el cliente no definió, marcalo A confirmar: avanza, pero no entra a producción hasta completarlo.',async()=>{
      await g.tocar('#nota input[data-c="pExtP"]');
      await g.op('revExt','Sin revestimiento');
      await g.op('pInt','Blanco');
      await g.siguiente();
    });
    await g.decir('Cada puerta lleva tipo, pared, ubicación y hacia dónde abre.',async()=>{
      await g.op('pu.0.tipo','De abrir');
      await g.op('pu.0.pared','Lateral A');
      await g.op('pu.0.pos','Extremo izquierdo');
      await g.op('pu.0.mano','Hacia afuera, bisagra derecha');
      await g.siguiente();
    });
    await g.decir('Indicá aire, termotanque y tanque de agua.',async()=>{
      await g.op('aa','Solo pre-instalación');
      await g.op('termo','No');
      await g.op('tanque','No');
      await g.siguiente();
    });
    await g.decir('Revisá el resumen con el cliente. Podés mandarle el PDF por WhatsApp.',()=>g.mostrar('#np-b-pdf'));
    await g.decir('Tildá que lo confirmó e indicá si necesita plano. Sin plano, va directo al líder de operaciones.',async()=>{
      await g.tocar('#np-confirmado');
      await g.mostrar('#nota .op[data-k="arq"][data-v="Sí"]');
      await g.tocar('#np-b-sig',{espera:1500});
    });
    await g.decir('Las consultas de otras áreas te aparecen en el Tablero, con semáforo: respondé antes de las cuatro horas.',async()=>{
      await g.pestana('dashboard');
      await g.tocar('#dash-content .fila-click',{espera:900});
      await g.escribir('#det-content textarea[id^="resp-"]','Va con reja.');
      await g.tocar('#det-content button[onclick^="responderConsulta"]',{espera:900});
    });
    await g.decir('Si el líder corrige una nota ya confirmada, mandale el PDF nuevo al cliente.',async()=>{
      await g.cerrar();
      await g.abrirProyecto(g.P.cambio);
      await g.mostrar('#det-content .nota-pend');
    });
    await g.decir('Cuando lo aprueba, tocá El cliente aprobó el cambio. Recién ahí puede pasar a ejecución.',
      ()=>g.tocar('#det-content .nota-pend button',{espera:1200}));
  },
};
