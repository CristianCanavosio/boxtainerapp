// Video de Carpinterías (aluminio y madera funcionan igual).
module.exports={
  usuario:'aluminio', titulo:'CARPINTERÍAS · Responder los pedidos',
  async guion(g){
    await g.decir('Las carpinterías de aluminio y de madera reciben los pedidos de la obra en esta pestaña. Las dos funcionan igual.');
    await g.decir('Ves solo los pedidos que te mandaron: qué se pide, las medidas, para cuándo lo necesita la obra y dónde se entrega.',
      ()=>g.mostrar('#lista-pedcarp .pc-card'));
    await g.decir('Con el enlace del plano ves los planos de ese proyecto. No ves precios ni el resto del proyecto.',
      ()=>g.mostrar('#lista-pedcarp .pc-card'));
    await g.decir('Si lo podés hacer, tocá Aceptar y poné la fecha en que lo vas a tener listo.',async()=>{
      await g.tocar('#lista-pedcarp .pc-card button[onclick*="\'aceptado\'"]',{espera:900});
      await g.valor('#pcr-fecha',g.dia(4));
      await g.escribir('#pcr-nota','Lo tenemos el jueves.');
      await g.tocar('#m-pcresp button.btn-nar, #m-pcresp button.btn-verde',{espera:1500});
    });
    await g.decir('Si no se puede, tocá Rechazar y explicá el motivo: la obra lo corrige y te lo reenvía.');
    await g.decir('Cuando empiecen, tocá Empezamos a fabricar.',
      ()=>g.tocar('#lista-pedcarp .pc-card button[onclick*="en_fabricacion"]',{espera:1500}));
    await g.decir('Si no llegás a la fecha, tocá Correr la fecha y contá por qué. La obra se entera en el momento.',
      ()=>g.mostrar('#lista-pedcarp .pc-card button[onclick*="\'fecha\'"]'));
    await g.decir('Cuando esté terminado, tocá Está listo, así coordinan el retiro.',async()=>{
      await g.tocar('#lista-pedcarp .pc-card button[onclick*="\'listo\'"]',{espera:900});
      await g.tocar('#cf-si',{espera:1500});
    });
    await g.decir('El color de cada pedido avisa si está sin responder, si vence pronto o si está atrasado. En Alertas tenés el resumen.',
      ()=>g.pestana('alertas'));
  },
};
