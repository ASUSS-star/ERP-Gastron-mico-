# 🤖 Bitácora de uso de Inteligencia Artificial (AI_AUDIT)

**Proyecto:** ERP Gastronómico Full-Stack — Fase 2 (Backend)
**Herramienta principal:** Claude (Anthropic)
**Responsable del registro:** Victor Sainz
**Fecha de inicio:** 05/10/2026

> Formato de cada registro: **Prompt** utilizado → **Sugerencia** de la IA → **Decisión** (✅ Aceptada / ⚠️ Aceptada con cambios / ❌ Rechazada) → **Justificación técnica**.
> Todo el código generado fue revisado por el equipo antes de integrarse. La IA es un apoyo; las decisiones y la responsabilidad del código son del equipo.
>
> **Nota de transparencia:** el registro 1 es el prompt original enviado a la IA. Los registros 2–15 corresponden a análisis que la IA realizó dentro de esa misma sesión de trabajo (preguntas de aclaración, revisión de seguridad, depuración y generación de casos de prueba); el prompt se escribe como la pregunta equivalente. El equipo puede volver a ejecutar cada prompt para validar la respuesta y dejar su propia evidencia.

---

## Índice

| # | Dinámica | Tema | Decisión |
|---|---|---|---|
| 1 | Arquitectura | Generación de la estructura base del backend | ⚠️ |
| 2 | Arquitectura | Elección de BD y ORM | ✅ |
| 3 | Arquitectura | Multi-restaurante (multi-tenant) | ✅ |
| 4 | Arquitectura | Refresh tokens y cookies httpOnly | ❌ |
| 5 | Seguridad | Vulnerabilidades del middleware de autenticación | ✅ |
| 6 | Seguridad | Inyección SQL/NoSQL y mass assignment | ✅ |
| 7 | Depuración | Condición de carrera en el stock | ✅ |
| 8 | Depuración | Doble cambio de estado simultáneo | ✅ |
| 9 | Depuración | Bug en validación de rango de fechas (Joi.ref) | ✅ |
| 10 | Depuración | Timeout de transacciones con el pooler de Supabase | ✅ |
| 11 | Refactorización | try/catch repetido en controladores | ✅ |
| 12 | Refactorización | Consultas N+1 y en paralelo | ⚠️ |
| 13 | Casos de prueba | Edge cases de autenticación y roles | ✅ |
| 14 | Casos de prueba | Edge cases de comandas e inventario | ✅ |
| 15 | Arquitectura | Borrado físico vs. baja lógica | ✅ |
| 16+ | — | Registros del equipo (plantilla al final) | — |

---

## 1. Estructura base del backend

**Prompt:**
> "Actúa como ingeniero en sistemas, BACKEND, readme. El docente nos pidió un sistema de ERP Gastronómico Full-Stack General que cualquier empresa de restaurante lo pueda adquirir, registrarse y funcionando. [requisitos de la actividad] Hacer el backend con la estructura de las carpetas, los archivos, la arquitectura, con posibilidades para poner también el frontend y el cómo hacerlo paso a paso."

**Sugerencia de la IA:** Monorepo con `backend/` y `frontend/`; backend por capas (`routes → middlewares → controllers → services → Prisma`), validación con Joi, middleware global de errores, seeder y colección de Postman.

**Decisión:** ⚠️ Aceptada con cambios.

**Justificación:** La arquitectura por capas cumple el requisito de "Arquitectura limpia (Rutas, Controladores, Servicios/Modelos, Middlewares)" y separa la lógica de negocio de HTTP, lo que permite reutilizar `comandas.service` en el seeder. **Cambio:** se pidió a la IA usar PostgreSQL en Supabase (en lugar de una BD local) y React + Vite para el frontend, y se mantuvo la separación `backend/` – `frontend/` – `docs/` que ya usaba el repositorio del equipo.

---

## 2. Elección de base de datos y ORM

**Prompt:**
> "¿Qué base de datos y ORM usamos para el backend: PostgreSQL + Prisma, MySQL + Sequelize o MongoDB + Mongoose?"

**Sugerencia de la IA:** PostgreSQL + Prisma, porque pedidos, inventario y pagos son datos relacionales que necesitan transacciones ACID.

**Decisión:** ✅ Aceptada, usando **Supabase** como hosting de PostgreSQL (el equipo ya tenía experiencia con Supabase).

**Justificación:** Crear una comanda modifica 4 tablas (comanda, detalles, insumos, movimientos) y debe ser "todo o nada"; eso es natural en SQL con `prisma.$transaction`. MongoDB se descartó porque las relaciones platillo–insumo–proveedor requieren joins. Prisma da migraciones versionadas (`prisma/migrations`) y seeders (`prisma db seed`), dos entregables de la actividad. Supabase requiere dos URLs (`DATABASE_URL` por el pooler 6543 con `pgbouncer=true` y `DIRECT_URL` 5432 para migraciones); esto quedó documentado en `.env.example`.

---

## 3. Multi-restaurante (multi-tenant)

**Prompt:**
> "El sistema debe poder adquirirlo cualquier restaurante, registrarse y funcionar. ¿Cómo separo los datos de cada restaurante?"

**Sugerencia de la IA:** Tres opciones: (a) una BD por restaurante, (b) un esquema por restaurante, (c) una sola BD con columna `restauranteId` en cada tabla. Recomendó (c), tomando el `restauranteId` del JWT y filtrando todas las consultas con `findFirst({ where: { id, restauranteId } })` en lugar de `findUnique({ where: { id } })`.

**Decisión:** ✅ Aceptada.

**Justificación:** (a) y (b) son costosas de migrar y Supabase gratis da un solo proyecto. Con (c), un endpoint `POST /auth/registro` crea restaurante + ADMIN en una sola operación. El riesgo de (c) es el **IDOR** (pedir `/mesas/5` de otro restaurante); se mitiga porque el `restauranteId` **nunca** viene del body, sólo del token, y está cubierto por la prueba *"admin del restaurante 2 NO ve la mesa del restaurante 1 → 404"*. Se usa 404 (no 403) para no revelar que el recurso existe.

---

## 4. Refresh tokens y cookies httpOnly

**Prompt:**
> "¿Qué vulnerabilidades tiene guardar el JWT en localStorage? ¿Debo usar refresh tokens?"

**Sugerencia de la IA:** Lo más robusto sería un access token corto (15 min) + refresh token rotativo en cookie `httpOnly; Secure; SameSite=Strict`, porque `localStorage` es accesible si hay XSS.

**Decisión:** ❌ Rechazada para esta fase (documentada como mejora futura).

**Justificación:** La rúbrica pide "generación/validación de JWT"; implementar refresh tokens implica tabla de sesiones, rotación, revocación y protección CSRF, lo cual excede el alcance de la Fase 2. Se compensó con: expiración de 8 h (un turno), verificación en BD de que el usuario siga activo en cada petición (un usuario dado de baja pierde acceso de inmediato) y React escapa el HTML por defecto, lo que reduce el riesgo de XSS. Queda anotado para la Fase 3.

---

## 5. Vulnerabilidades del middleware de autenticación

**Prompt:**
> "Analiza posibles vulnerabilidades en mi middleware de autenticación JWT: expiración de token, firma, algoritmo y usuarios desactivados."

**Sugerencia de la IA:**
1. Fijar el algoritmo en `jwt.verify(token, secret, { algorithms: ['HS256'] })` para evitar el ataque `alg: none` / confusión de algoritmos.
2. Exigir `JWT_SECRET` de al menos 32 caracteres y fallar al arrancar si no existe.
3. No meter datos sensibles en el payload (sólo `sub`, `rol`, `restauranteId`).
4. Consultar la BD en cada petición para rechazar usuarios desactivados aunque su token siga vigente.
5. Traducir `TokenExpiredError` y `JsonWebTokenError` a **401** en el manejador global (no a 500).
6. En login, responder igual (mensaje y tiempo) si el email no existe o la contraseña es incorrecta, comparando contra un hash "dummy" para evitar enumeración de usuarios por tiempo.

**Decisión:** ✅ Aceptada completa.

**Justificación:** Cada punto tiene prueba automática (`token expirado → 401`, `firma falsa → 401`, `alg none → 401`, `email inexistente → mismo 401`). La consulta extra a BD por petición cuesta ~1 consulta por clave primaria (muy barata) y a cambio permite revocar acceso al instante, importante cuando se despide a un empleado.

---

## 6. Inyección SQL/NoSQL y mass assignment

**Prompt:**
> "¿Mi API es vulnerable a inyección SQL o NoSQL? ¿Y a que alguien mande campos extra como rol o restauranteId?"

**Sugerencia de la IA:** Prisma parametriza las consultas, así que no hay inyección SQL mientras no se use `$queryRawUnsafe`. Para NoSQL-style (`{"email": {"$ne": null}}`), validar que cada campo sea del tipo esperado. Para mass assignment, configurar Joi con `stripUnknown: true` y no pasar `req.body` directo al ORM sin validar.

**Decisión:** ✅ Aceptada.

**Justificación:** El middleware `validar()` aplica Joi a `params`, `query` y `body` con `abortEarly:false, stripUnknown:true, convert:true`. Pruebas: *"mass-assignment: restauranteId en el body se ignora"* y en Postman *"Intento de inyección en login → 400"*. Además `stockActual` no está en el esquema de actualización de insumos, así que no se puede alterar el stock sin un movimiento auditado.

---

## 7. Condición de carrera en el stock

**Prompt:**
> "Revisa este código de descuento de inventario. ¿Qué pasa si dos meseros piden el último platillo al mismo tiempo?"
> ```js
> const insumo = await prisma.insumo.findUnique({ where: { id } });
> if (insumo.stockActual < cantidad) throw new Error('Sin stock');
> await prisma.insumo.update({ where: { id }, data: { stockActual: insumo.stockActual - cantidad } });
> ```

**Sugerencia de la IA:** Es un patrón *read-modify-write* con condición de carrera: ambas peticiones leen stock = 1, ambas pasan el `if` y el stock queda en −1 (o se pierde una actualización). Solución: un `UPDATE` condicional atómico: `updateMany({ where: { id, stockActual: { gte: cantidad } }, data: { stockActual: { decrement: cantidad } } })` y revisar `count === 0`. Además, recorrer los insumos en orden de `id` para evitar *deadlocks* entre transacciones.

**Decisión:** ✅ Aceptada.

**Justificación:** PostgreSQL bloquea la fila durante el `UPDATE` y reevalúa el `WHERE`, así que sólo una transacción puede dejarlo en 0. Se implementó en `comandas.service` (`descontarStock`) y en `insumos.service` (SALIDA). Prueba: *"20 SALIDAS concurrentes de 1 con stock 1 → sólo una pasa"*.

---

## 8. Doble cambio de estado simultáneo

**Prompt:**
> "¿Qué pasa si el cajero da doble clic en 'Cobrar' o si cocina y admin cambian la misma comanda al mismo tiempo?"

**Sugerencia de la IA:** Usar **bloqueo optimista**: el `UPDATE` incluye el estado anterior en el `WHERE` (`updateMany({ where: { id, estado: actual } })`). Si `count === 0`, alguien más la cambió → responder 409.

**Decisión:** ✅ Aceptada.

**Justificación:** Evita cobrar dos veces o cancelar una comanda que ya se pagó. Es más ligero que un `SELECT … FOR UPDATE` y no requiere SQL crudo.

---

## 9. Bug en validación de rango de fechas

**Prompt:**
> "Revisa mis esquemas Joi y busca casos que fallen."

**Sugerencia de la IA:** En `hasta: Joi.date().iso().min(Joi.ref('desde'))`, si el cliente manda sólo `?hasta=2026-10-01` (sin `desde`), la referencia resuelve a `undefined` y Joi marca error aunque la petición sea válida. Solución: `Joi.when('desde', { is: Joi.exist(), then: Joi.date().iso().min(Joi.ref('desde')), otherwise: Joi.date().iso() })`.

**Decisión:** ✅ Aceptada.

**Justificación:** Bug real detectado en revisión antes de entregar; corregido en `comandas.validator.js` y `reportes.validator.js`.

---

## 10. Timeout de transacciones con el pooler de Supabase

**Prompt:**
> "Al correr pruebas concurrentes algunas peticiones devuelven 500 'Unable to start a transaction in the given time'. ¿Por qué?"

**Sugerencia de la IA:** Con `connection_limit=1` (recomendado para el pooler en modo transacción), las transacciones interactivas hacen fila y superan el `maxWait` por defecto de Prisma (2 s). Solución: subir `maxWait`/`timeout` en las transacciones críticas y usar `connection_limit` mayor en la BD de pruebas.

**Decisión:** ✅ Aceptada.

**Justificación:** Se agregaron `{ timeout: 15000, maxWait: 10000 }` a las transacciones de comandas y movimientos de inventario, y se documentó en el README que la BD de pruebas use `connection_limit=5` o más.

---

## 11. try/catch repetido en controladores

**Prompt:**
> "Mis controladores tienen el mismo try/catch en cada función. ¿Cómo lo simplifico?"

**Sugerencia de la IA:** Express 5 reenvía automáticamente las promesas rechazadas al middleware de errores, por lo que no se necesita `try/catch` ni el paquete `express-async-handler`. Lanzar `AppError` con su código HTTP desde los servicios y que un solo `errorHandler` traduzca también los errores de Prisma (`P2002` → 409, `P2025` → 404, `P2003` → 409) y de JWT (→ 401).

**Decisión:** ✅ Aceptada.

**Justificación:** Cumple "Manejo centralizado de errores" y elimina ~100 líneas repetidas. Además se creó `crud.factory.js` para los recursos simples (mesas, categorías, proveedores). En producción el `errorHandler` no expone el stack (`debug` sólo en desarrollo).

---

## 12. Consultas N+1 y paralelismo

**Prompt:**
> "Busca cuellos de botella en las consultas a la base de datos y patrones async/await ineficientes."

**Sugerencia de la IA:**
1. Al crear una comanda, traer todos los platillos con su receta en **una** consulta (`findMany({ where: { id: { in: ids } }, include: { receta: true } })`) en lugar de una por platillo.
2. En listados, ejecutar `count` y `findMany` juntos con `prisma.$transaction([...])`.
3. En el reporte, lanzar las 6 consultas independientes con `Promise.all`.
4. Agregar índices `@@index([restauranteId, estado])` en comandas.
5. Paralelizar también el descuento de stock con `Promise.all`.

**Decisión:** ⚠️ Aceptadas 1–4, ❌ rechazada la 5.

**Justificación:** El descuento de stock se mantiene **secuencial y ordenado por id** dentro de la transacción: paralelizarlo dentro de una misma conexión no acelera nada (Postgres ejecuta una sentencia a la vez por conexión) y el orden fijo es lo que previene *deadlocks* (registro 7).

---

## 13. Edge cases de autenticación y roles

**Prompt:**
> "Genera escenarios límite (edge cases) para validar las rutas de autenticación y roles del ERP."

**Sugerencia de la IA:** Email duplicado, contraseña débil, JSON mal formado, sin header `Authorization`, token con firma de otro secreto, token expirado, token `alg:none`, email inexistente vs. contraseña incorrecta, MESERO creando usuarios, ID no numérico en la URL, ruta inexistente, desactivar al último ADMIN, mass assignment de `restauranteId`, acceso cruzado entre restaurantes.

**Decisión:** ✅ Aceptada.

**Justificación:** Se convirtieron en pruebas Jest (`describe('Autenticación')` y `describe('Roles y aislamiento')`) y en la carpeta **7. Seguridad** de Postman. Se agregó la regla de negocio "no dejar al restaurante sin ADMIN activo", que surgió de este análisis.

---

## 14. Edge cases de comandas e inventario

**Prompt:**
> "Genera casos de prueba límite para el módulo de comandas e inventario."

**Sugerencia de la IA:** Comanda sin items, cantidad 0 o negativa, platillo de otro restaurante, platillo no disponible, mesa inactiva, stock insuficiente (verificar que **no** se descuente nada), saltar estados (PENDIENTE → PAGADO), rol incorrecto para una transición, PAGADO sin método de pago, cancelar una comanda pagada, editar una comanda ya en preparación, devolución de stock al cancelar, salida mayor al stock, ajuste a 0, concurrencia.

**Decisión:** ✅ Aceptada.

**Justificación:** Cubiertos en `describe('Inventario, menú y comandas')`. El caso "stock insuficiente → 409 y el stock sigue en 10" comprueba que la transacción hace *rollback* completo (incluido el folio).

---

## 15. Borrado físico vs. baja lógica

**Prompt:**
> "¿Debo permitir DELETE de usuarios, platillos y mesas?"

**Sugerencia de la IA:** Usuarios → baja lógica (`activo=false`). Platillos y mesas con historial de comandas → bloquear el borrado (409) y sugerir `disponible=false` / `estado=INACTIVA`. Comandas pagadas → nunca borrar (registro contable).

**Decisión:** ✅ Aceptada.

**Justificación:** Borrar un mesero o platillo rompería los reportes históricos de ventas. En la BD, las relaciones de comandas con mesa, mesero y platillo usan `onDelete: NoAction` para que PostgreSQL también lo impida.

---

## 16+. Registros del equipo

> Cada integrante agrega aquí sus propias interacciones con IA (Copilot, ChatGPT, Claude, etc.) siguiendo el mismo formato. **Copien el prompt exacto** que usaron.

### 16. _(Título)_

- **Integrante:**
- **Herramienta:**
- **Dinámica:** Casos de prueba / Depuración y refactorización / Arquitectura y seguridad
- **Prompt:**
  > ...
- **Sugerencia de la IA:**
- **Decisión:** ✅ / ⚠️ / ❌
- **Justificación técnica:**

---

## Conclusiones

- La IA fue más útil en **revisión de seguridad** y **generación de edge cases**, donde detectó problemas reales (condición de carrera en el stock, bug de `Joi.ref`, timeout de transacciones) antes de la entrega.
- Se rechazaron sugerencias que excedían el alcance de la fase (refresh tokens) o que eran incorrectas para el contexto (paralelizar escrituras dentro de una transacción).
- Todo el código generado se revisó, se probó con Jest/Postman y se ajustó a la estructura del repositorio del equipo.
