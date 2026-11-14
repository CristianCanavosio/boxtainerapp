// Video de Arquitectura: plano, verificación contra la nota y envío al líder.
module.exports={
  usuario:'arquitectura', titulo:'ARQUITECTURA · Plano y verificación',
  async guion(g){
    await g.decir('Arquitectura hace el plano de cada proyecto que lo necesita y lo verifica contra la nota de pedido.');
    await g.decir('En el Tablero ves los proyectos que esperan plano. Tocá uno para abrirlo.',async()=>{
      await g.mostrar('#dash-content');
      await g.abrirProyecto(g.P.arq);
    });
    await g.decir('Arriba ves en qué etapa está. Abajo tenés la nota de pedido completa, con el dibujo de los espacios y las aberturas.',async()=>{
      await g.mostrar('#det-content .flujo');
      await g.mostrar('#det-content .nota-dib');
    });
    await g.decir('Si falta un dato, mandale una consulta a ventas desde el mismo proyecto. El semáforo mide cuánto tardan en responderte.',async()=>{
      await g.elegir('#cq-para','ventas');
      await g.escribir('#cq-texto','¿El aire va del lado de la oficina?');
      await g.tocar('#det-content button[onclick^="enviarConsulta"]',{espera:1200});
    });
    await g.decir('Para subir el plano tocá Subir plano y elegí el PDF o la imagen.',async()=>{
      await g.arriba('#m-det .modal');
      await g.subir('#det-content label:has(input[type=file])',g.archivos.plano);
      await g.pausa(1200);
    });
    await g.decir('Si pesa más de cincuenta megas, pegá el enlace de Drive, OneDrive o Dropbox.',()=>g.mostrar('#det-plano-url'));
    await g.decir('Dejá una nota para operaciones si hace falta.',
      ()=>g.escribir('#det-notaarq','Ojo: el baño lleva la ventana del lado opuesto a la puerta.'));
    await g.decir('Tildá que verificaste que el plano coincide con la nota: medidas, puertas, ventanas e instalaciones.',
      ()=>g.tocar('#det-verif'));
    await g.decir('Y tocá Enviar a Líder de Operaciones. Si a la nota le falta algo, podés devolverla a ventas.',
      ()=>g.tocar('#det-content button[onclick*="\'asignacion\'"]',{espera:1600}));
    await g.decir('Listo: el proyecto pasa al líder de operaciones para que valide materiales y asigne supervisor.');
  },
};
