# BoxTainer Gestión Pro

App móvil de gestión de proyectos de BoxTainer Argentina SAS: ventas carga el pedido con su ficha técnica, arquitectura sube el plano, el líder de operaciones asigna supervisor, fechas y presupuesto, y cada supervisor ve solo sus proyectos y carga avance, gastos, faltantes y consultas.

## Estructura

- `supabase/migrations/` — esquema de la base y permisos por rol (Row Level Security). Los permisos se aplican en la base, no solo en la app.

## Roles

| Rol | Ve | Puede |
| --- | --- | --- |
| Ventas | Sus proyectos (sin costos) | Cargar pedido y ficha técnica, enviar a arquitectura, responder consultas |
| Arquitectura | Proyectos en su etapa y los que planificó (sin costos) | Subir planos, verificar contra la ficha, enviar al líder |
| Líder de operaciones | Todo | Asignar supervisor, fechas, presupuesto y stock; resolver faltantes |
| Supervisor | Solo sus proyectos asignados | Avance, gastos reales, faltantes, reportar errores, consultas |
| Administrador | Todo | Lo mismo que el líder y asignar roles |
| Solo lectura | Todo | Nada |
