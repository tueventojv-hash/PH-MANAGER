# Conjunto PH · siguiente fase multiusuario

**Proyecto de Julio Alejandro Valencia García · Colombia**  
**Guía de arquitectura e implementación · 12 de noviembre de 2026**

La entrega actual permite organizar copropiedades desde un navegador y publicar sus páginas HTML en Netlify. Para que administradores y residentes trabajen desde distintos dispositivos sobre los mismos datos, la siguiente fase debe añadir cuentas verificadas, una base de datos compartida y permisos aplicados en el servidor.

## 1. Qué incluye la entrega actual

| Función | Alcance de esta entrega | Siguiente fase |
|---|---|---|
| Copropiedades y licencias | Registro local de aprobación, suspensión y vencimiento. | Validación por superadministrador y autorización real en servidor. |
| Viviendas, paquetería, accesos, gastos y mantenimiento | Herramientas locales con validaciones, respaldos e importación/exportación. | Datos compartidos, usuarios identificados y trazabilidad. |
| Actualización de residentes | El residente descarga una solicitud; el administrador comprueba su identidad y la importa. | Portal con sesión y vínculo verificado entre persona y vivienda. |
| Asambleas | Registro manual interno de votos; un voto por vivienda y asamblea. | Votación autenticada, reglas de participación y registro transaccional. |

Los datos del navegador no se sincronizan con otros equipos. Un enlace con identificadores de copropiedad o vivienda **no demuestra identidad ni concede permisos**. El estado de una licencia guardado localmente tampoco restringe de forma segura a un usuario. La entrega no contiene cuentas, contraseñas, correos automáticos ni un servidor conectado.

## 2. Arquitectura propuesta

Conservar las páginas en **Netlify**; añadir **Supabase Auth** para iniciar sesión y **PostgreSQL con RLS** para almacenar y separar datos. Incorporar **Netlify Functions** para invitaciones, aprobación de copropiedades y cambios de licencia. Esta es una propuesta para implementar, no una conexión ya realizada.

RLS significa «seguridad por fila»: la base de datos decide qué registros puede leer o modificar cada persona. Supabase recomienda activarla en todas las tablas expuestas y combinar políticas con permisos de tabla. Las reglas usarán la identidad autenticada; los roles no se tomarán de datos de perfil editables por el usuario. [Documentación de RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

El navegador puede contener la URL del proyecto y su **clave publishable**. La clave **secret**, o la antigua `service_role`, queda exclusivamente en el servidor: puede omitir RLS. Por ello, cada función privilegiada debe comprobar al solicitante y sus permisos antes de utilizarla. Nunca debe incluirse en HTML, JavaScript público, respaldos ni archivos descargables. [Claves de Supabase](https://supabase.com/docs/guides/getting-started/api-keys).

### Permisos propuestos

| Persona | Puede hacer | Límite obligatorio |
|---|---|---|
| Superadministrador | Revisar solicitudes, aprobar o suspender copropiedades, asignar administradores y gestionar licencias. | Asignación inicial desde un proceso privado; registrar cada cambio. El acceso de soporte a información personal debe ser explícito y auditado. |
| Administrador del conjunto | Gestionar viviendas, residentes, operaciones, gastos, mantenimiento y asambleas de su conjunto. | Membresía activa, copropiedad aprobada y licencia vigente. No puede convertirse en superadministrador ni modificar su propia licencia. |
| Residente | Actualizar campos autorizados de su perfil, consultar información permitida de su vivienda y participar cuando sea elegible. | Identidad y vivienda verificadas. Sin acceso a otras viviendas, listados generales de residentes ni edición de resultados. |
| Visitante sin sesión | Leer páginas públicas y presentar una solicitud de registro. | Sin lectura de datos privados. Una solicitud no activa una cuenta, membresía o licencia. |

Para resolver una suspensión, el administrador podrá consultar el estado de su licencia y solicitar revisión; eso no le dará acceso a las operaciones bloqueadas. Los controles deben funcionar aunque alguien cambie los identificadores o el JavaScript del navegador.

## 3. Modelo de datos inicial

Este esquema describe las tablas a implementar. No es una migración SQL ejecutada.

| Tablas | Información y restricciones propuestas |
|---|---|
| `properties`, `licenses` | Copropiedad, estado de aprobación, licencia, inicio y vencimiento. Solo el proceso de superadministración modifica estos estados. |
| `profiles`, `platform_roles` | Perfil asociado al usuario de Auth; roles globales protegidos y separados del perfil editable. |
| `memberships` | Usuario, copropiedad, rol y estado. Una combinación usuario/copropiedad única. Alta y cambios mediante operación autorizada. |
| `units`, `unit_memberships` | Viviendas con código único por copropiedad y relación verificada con sus residentes. Una persona puede tener vínculos autorizados con varias viviendas. |
| `parcels`, `accesses`, `expenses`, `maintenance` | Operaciones con `property_id`, autor y fechas de servidor. Relaciones que impidan vincular una vivienda de otro conjunto. Importes en centavos enteros. |
| `assemblies`, `questions`, `options` | Convocatoria, preguntas, opciones, horario y estados. Conservar las reglas y el padrón utilizados al abrir una votación. |
| `ballots` | Identidad verificada, unidad representada, pregunta, opción y fecha de servidor. Restricción única según la unidad de voto acordada. |
| `audit_events` | Actor, operación, entidad y fecha. Escritura del servidor y sin edición por el usuario que realizó la acción. |

**Regla transversal de autorización propuesta:** antes de acceder a operaciones de un conjunto, comprobar usuario, membresía, estado de la copropiedad y vigencia de licencia usando la hora del servidor. Revisar estas condiciones en cada operación; no depender de un estado antiguo guardado en el navegador. Las escrituras deben comprobar tanto el registro original como su resultado para impedir cambios de propietario o conjunto.

## 4. Implementación en cinco fases

### Fase 1 · Publicar y acordar las reglas

Para publicar la versión actual: descomprimir el ZIP y arrastrar a **Netlify Drop** la carpeta que contiene `index.html` y `assets`. Los HTML ya están preparados; esta versión no necesita compilación. Publicarla no activa sincronización ni autenticación. [Despliegue manual oficial](https://docs.netlify.com/deploy/create-deploys/).

Definir quién puede representar una vivienda, qué información ve cada residente y qué sucede al vencer una licencia. Para asambleas, acordar quórum, representación, ponderaciones, abstenciones y condiciones de cierre antes de implementar resultados vinculantes. El conteo local actual no resuelve esas reglas.

**Resultado:** sitio disponible y reglas de operación escritas.

### Fase 2 · Configurar cuentas e invitaciones

Crear el proyecto de Supabase y configurar Auth. En su configuración de URL, establecer la dirección oficial del sitio y las rutas exactas de retorno permitidas. Construir el flujo de ingreso, recuperación y aceptación de invitaciones. [Redirecciones de Auth](https://supabase.com/docs/guides/auth/redirect-urls).

Registrar al primer superadministrador mediante el panel o un proceso privado. Las invitaciones se emiten desde el servidor mediante `inviteUserByEmail`; aceptar una invitación no sustituye la comprobación de la vivienda. Para residentes reales, configurar SMTP propio: el servicio predeterminado de Supabase restringe los destinatarios al equipo del proyecto. [Invitaciones](https://supabase.com/docs/guides/auth/users) · [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

**Resultado:** cuentas verificadas y vínculos con copropiedades aprobados por una persona autorizada.

### Fase 3 · Implementar base de datos y permisos

Crear migraciones versionadas para las tablas anteriores, sus relaciones e índices. Activar RLS, conceder solo los permisos necesarios y escribir políticas para lectura, creación, modificación y eliminación. Probarlas con dos copropiedades y usuarios distintos antes de conectar datos reales.

Implementar un proceso específico para asignar administradores, aprobar copropiedades y modificar licencias. La comprobación de rol no puede consistir en mostrar u ocultar botones.

**Resultado:** intentar acceder a un conjunto ajeno o usar una membresía revocada falla en el servidor.

### Fase 4 · Conectar los módulos y el portal

Sustituir el almacenamiento local por un adaptador asíncrono que consulte la base compartida. Mantener validaciones, estados de guardado, errores claros y exportaciones. Importar un respaldo existente después de validar y mapear identificadores; nunca usar una restauración local para reemplazar toda la base compartida.

El archivo `_headers` de esta versión establece `connect-src 'none'` en su política CSP porque todas las herramientas funcionan localmente. Al conectar el backend, permitir únicamente los orígenes utilizados: el origen HTTPS exacto del proyecto Supabase y `'self'` si las funciones operan en el mismo dominio. Añadir el origen `wss://` correspondiente solo si se implementa comunicación en tiempo real. Probar la CSP con autenticación, consultas y funciones; mantener bloqueados los demás destinos.

Las funciones privilegiadas deben validar el token del solicitante, por ejemplo con `getUser(jwt)`, y comprobar sus permisos actuales en la base. [Verificación del usuario](https://supabase.com/docs/reference/javascript/auth-getuser).

El voto remoto debe guardarse en una transacción que verifique elegibilidad, licencia, asamblea abierta y ausencia de un voto previo. La restricción de unicidad debe impedir duplicados incluso cuando lleguen dos solicitudes simultáneas. La regla actual de una vivienda por asamblea solo se trasladará si coincide con las reglas acordadas.

**Resultado:** dos dispositivos comparten datos y cada residente accede únicamente a lo autorizado.

### Fase 5 · Validar y activar el servicio

Desplegar frontend y funciones mediante un flujo con Git o CLI. Guardar `SUPABASE_URL` y `SUPABASE_SECRET_KEY` para las funciones en la configuración de entorno de Netlify; cuando se utilicen ámbitos, incluir **Functions**. Las variables declaradas en `netlify.toml` no están disponibles para las funciones en ejecución. [Variables de Netlify Functions](https://docs.netlify.com/build/functions/environment-variables/).

En un entorno de prueba, verificar cambio malicioso de conjunto, escalamiento de rol, licencia vencida, invitación inválida, acceso a otra vivienda y envío simultáneo de votos. Comprobar también recuperación de cuenta, respaldo/restauración y registro de auditoría. Activar usuarios reales después de superar esas pruebas.

**Resultado:** servicio compartido con permisos comprobados y procedimiento de recuperación.

## Estado de esta guía

Las referencias técnicas se consultaron el **12 de noviembre de 2026**. La arquitectura, el modelo y los permisos son decisiones propuestas para este proyecto. **No se han creado proyectos remotos, aplicado migraciones, enviado invitaciones ni probado políticas RLS en PostgreSQL.** Esa validación corresponde a las fases descritas. La entrega HTML conserva su funcionamiento local y puede utilizarse sin completar esta siguiente fase.
