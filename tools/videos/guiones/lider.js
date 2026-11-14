// Video del Líder de operaciones: stock, asignación, carpinterías y faltantes.
module.exports={
  usuario:'lider', titulo:'LÍDER DE OPERACIONES · Asignar y seguir',
  async guion(g){
    await g.decir('El líder de operaciones valida los materiales, asigna supervisor y fechas, y sigue cada proyecto hasta la entrega.');
    await g.decir('En el Tablero aparecen primero los faltantes de material que avisaron los supervisores, y los proyectos que esperan asignación.',
      ()=>g.mostrar('#dash-content .card'));
    await g.decir('Abrimos un proyecto que espera asignación.',()=>g.abrirProyecto(g.P.asig));
    await g.decir('Revisá la nota de pedido. Si hay que corregirla, tocá Corregir nota: el cambio queda en el historial y ventas lo tiene que reconfirmar con el cliente.',
      ()=>g.mostrar('#det-content button[onclick*="editarNota"]'));
    await g.decir('En Materiales del proyecto está todo lo que sale de la nota y de la receta de la tipología. Marcá cada uno: hay, pedido o falta.',async()=>{
      await g.mostrar('#mp-sec');
      await g.tocar('#mp-sec .mp-f:nth-child(1) .mp-b:nth-child(2)',{espera:900});
    });
    await g.decir('Si está todo, marcá el resto como que hay. Sin el stock validado no se puede asignar.',
      ()=>g.tocar('#mp-sec button[onclick^="todoHay"]',{espera:4000}));
    await g.decir('Elegí el supervisor, la fecha de inicio y la de entrega, y tocá Asignar y comenzar.',async()=>{
      await g.arriba('#m-det .modal');
      await g.elegir('#as-sup',g.U.supervisor.id);
      await g.valor('#as-ent',g.dia(20));
      await g.tocar('#det-content button[onclick^="asignar"]',{espera:1600});
    });
    await g.decir('Ahora el proyecto está en ejecución. Desde el proyecto le pedís a la carpintería de aluminio o de madera.',async()=>{
      await g.abrirProyecto(g.P.asig);
      await g.tocar('#det-content button[onclick*="\'aluminio\'"]',{espera:1000});
    });
    await g.decir('La lista sale de la nota de pedido: revisala, poné para cuándo la necesita la obra y enviala. La carpintería no ve precios.',async()=>{
      await g.valor('#pc-form input[type=date]',g.dia(10));
      await g.tocar('#m-pedcarp button[onclick^="enviarPedidoCarp"]',{espera:1500});
    });
    await g.decir('Cuando un supervisor avisa que falta un material, conseguilo y marcalo Resuelto.',async()=>{
      await g.cerrar();
      await g.pestana('dashboard');
      await g.tocar('#dash-content .card:has-text("Faltantes") .fila-click',{espera:1000});
      await g.tocar('#det-content button[onclick^="resolverFaltante"]',{espera:1200});
    });
    await g.decir('En Alertas tenés los proyectos atrasados o desviados y los pedidos a carpinterías con problemas.',async()=>{
      await g.cerrar();
      await g.pestana('alertas');
    });
    await g.decir('Y en Materiales cargás la receta de cada tipología: lo que se suma solo a cada proyecto de ese tipo.',async()=>{
      await g.pestana('materiales');
      await g.mostrar('#recetas-sec');
    });
  },
};
