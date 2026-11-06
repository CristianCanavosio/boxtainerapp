# BoxTainer Gestión Pro

App móvil de gestión de proyectos de BoxTainer Argentina SAS: ventas carga la nota de pedido (asistente de 7 pasos con dibujo del contenedor y PDF para el cliente), arquitectura sube el plano, el líder de operaciones asigna supervisor, fechas y presupuesto, y cada supervisor ve solo sus proyectos y carga avance, gastos, faltantes y consultas.

## Estructura

- `supabase/migrations/` — esquema de la base y permisos por rol (Row Level Security). Los permisos se aplican en la base, no solo en la app.
- `web/` — la app (HTML + JavaScript, sin compilación). `web/config.js` tiene la URL del proyecto y la clave pública (publishable/anon). Nunca poner ahí la `service_role`.

## Roles

| Rol | Ve | Puede |
| --- | --- | --- |
| Ventas | Sus proyectos (sin costos) | Cargar pedido y ficha técnica, enviar a arquitectura, responder consultas |
| Arquitectura | Proyectos en su etapa y los que planificó (sin costos) | Subir planos, verificar contra la ficha, enviar al líder |
| Líder de operaciones | Todo | Asignar supervisor, fechas, presupuesto y stock; resolver faltantes |
| Supervisor | Solo sus proyectos asignados | Avance, gastos reales, faltantes, reportar errores, consultas |
| Administrador | Todo | Lo mismo que el líder y asignar roles |
| Solo lectura | Todo | Nada |

## Puesta en marcha

### 1. Base de datos (Supabase → SQL Editor)

Correr en orden, una sola vez cada uno:

1. `supabase/migrations/0001_esquema_y_permisos.sql`
2. `supabase/migrations/0002_tiempo_real_y_ajustes.sql`
3. `supabase/migrations/0003_croquis_de_ventas.sql` (deja que ventas suba el croquis del cliente desde la nota de pedido)
4. `supabase/migrations/0004_costeo_solo_admin.sql` (lista de costos y costeo del pedido, solo para el administrador)

### 2. Publicar la app (Vercel, gratis)

1. Entrar a vercel.com con la cuenta de GitHub → **Add New… → Project** → importar `boxtainerapp`.
2. En **Root Directory** elegir `web`. Framework: **Other**. Sin comando de build.
3. **Deploy**. Vercel da una dirección tipo `https://boxtainerapp.vercel.app`. Cada cambio que se suba a `main` se publica solo.

### 3. Supabase → Authentication → URL Configuration

- **Site URL**: la dirección de Vercel.
- **Redirect URLs**: agregar la misma dirección. Así funcionan los enlaces de confirmación de correo y de recuperar contraseña.

### 4. Primer administrador

1. Abrir la app, tocar **Crear cuenta**, confirmar el correo.
2. En el SQL Editor correr, con ese correo:
   ```sql
   update perfiles set rol = 'admin' where email = 'tu-correo@empresa.com';
   ```
3. Desde ahí, el resto del equipo se crea su cuenta y el administrador le asigna el rol en la pestaña **Usuarios**.

### 5. Pasar los datos de la app anterior

En la app anterior (artefacto), pestaña Reportes → **Descargar respaldo completo**. En la app nueva, como administrador, Reportes → **Importar respaldo (app anterior)**. Los supervisores se asignan buscando una cuenta con el mismo nombre, así que conviene que el equipo cree sus cuentas antes de importar. Los planos que estaban subidos dentro del artefacto no se pueden mover automáticamente: hay que volver a subirlos (los que eran enlaces sí pasan).

## Límites conocidos

- Planos: hasta 50 MB por archivo en el plan gratuito de Supabase (Storage → Settings permite más en el plan Pro). Para archivos más grandes, pegar un enlace de Drive/OneDrive.
- Cada cambio hace que los celulares abiertos vuelvan a leer los datos que pueden ver. Con muchos miles de proyectos convendrá cargar por partes.
- El valor de venta de un proyecto lo ve cualquiera que vea el proyecto (incluido el supervisor). Si hay que ocultarlo, se mueve a una tabla aparte como el presupuesto.

## Nota de pedido

`web/nota.js` y `web/nota.css` tienen el asistente de carga que usa ventas (cliente, producto, distribución, terminaciones, aberturas, instalaciones y confirmación). Se guarda en la columna `ficha` del proyecto con `v: 2`. Los proyectos viejos siguen mostrando la ficha técnica anterior y se pueden pasar a la nota nueva desde Editar.

- Lo marcado "a confirmar" deja enviar a arquitectura, pero el líder no puede pasar el proyecto a ejecución hasta completarlo.
- El PDF para el cliente se arma en el celular (html2canvas y jsPDF desde cdnjs).

## Costeo del pedido (solo administrador)

`web/costeo.js`. Cada nota de pedido se convierte en una lista de ítems con cantidades (contenedor, espacios, artefactos, m² de pintura, revestimientos y piso calculados con las medidas del contenedor, puertas, ventanas, eléctrica, etc.). El administrador carga el precio unitario de cada ítem en la pestaña **🔒 Costos** (o directo en el proyecto) y el pedido se costea solo, con margen contra el valor de venta. Puede corregir cantidades y agregar ítems a mano, y pasar los totales por rubro al presupuesto de obra que ve el líder.

Las tablas `lista_costos` y `costeos` tienen Row Level Security que solo deja leer y escribir al rol `admin`: ninguna otra área puede verlas, ni siquiera usando la API de Supabase.
