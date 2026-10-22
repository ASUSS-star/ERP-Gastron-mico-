# 🍽️ ERP Gastronómico Full-Stack

Sistema ERP **multi-restaurante (SaaS)** para restaurantes, fondas y comederos: cualquier negocio se **registra**, obtiene su usuario administrador y empieza a operar (personal, menú, inventario, comandas y caja) con sus datos **aislados** del resto de restaurantes.

> Proyecto Integrador Institucional — Fase 2: **Backend** (API RESTful con Node.js + Express + PostgreSQL/Supabase + Prisma + JWT).

| Capa | Tecnología |
|---|---|
| Runtime / Framework | Node.js ≥ 20 · Express 5 |
| Base de datos | PostgreSQL en **Supabase** |
| ORM / Migraciones / Seeders | Prisma |
| Autenticación | JWT (jsonwebtoken) · bcryptjs |
| Validación | Joi |
| Seguridad | helmet · cors · express-rate-limit |
| Pruebas | Jest · Supertest · Colección de Postman |
| Frontend (Fase 3) | React + Vite · Axios · React Router |

---

## 📑 Índice

1. [Arquitectura](#-arquitectura)
2. [Estructura de carpetas](#-estructura-de-carpetas)
3. [Modelo de datos](#-modelo-de-datos)
4. [Instalación paso a paso](#-instalación-paso-a-paso)
5. [Endpoints de la API](#-endpoints-de-la-api)
6. [Roles y permisos](#-roles-y-permisos)
7. [Flujo de una comanda](#-flujo-de-una-comanda)
8. [Seguridad implementada](#-seguridad-implementada)
9. [Pruebas](#-pruebas)
10. [Frontend (React + Vite) paso a paso](#-frontend-react--vite-paso-a-paso)
11. [Despliegue](#-despliegue)
12. [Trabajo en equipo con Git](#-trabajo-en-equipo-con-git)

---

## 🏛️ Arquitectura

Arquitectura **por capas** (variante de MVC donde la "Vista" es la respuesta JSON y el frontend React es un proyecto aparte):

```
Petición HTTP
   │
   ▼
┌──────────────┐  helmet, cors, json, rate-limit
│  app.js      │
└──────┬───────┘
       ▼
┌──────────────┐  /api/comandas, /api/insumos ...
│   ROUTES     │  define URL + método + cadena de middlewares
└──────┬───────┘
       ▼
┌──────────────┐  autenticar (JWT) → permitirRoles(...) → validar(Joi)
│ MIDDLEWARES  │
└──────┬───────┘
       ▼
┌──────────────┐  sólo traduce HTTP ⇄ servicio (req → args, resultado → res.json)
│ CONTROLLERS  │
└──────┬───────┘
       ▼
┌──────────────┐  REGLAS DE NEGOCIO: stock, folios, máquina de estados, transacciones
│  SERVICES    │
└──────┬───────┘
       ▼
┌──────────────┐  Prisma Client (modelos definidos en prisma/schema.prisma)
│ MODEL (ORM)  │
└──────┬───────┘
       ▼
  PostgreSQL (Supabase)

Cualquier error lanzado en cualquier capa ──► error.middleware.js (manejo centralizado)
```

**¿Por qué así?**

- **Controladores delgados:** no tienen lógica, por eso son fáciles de leer y probar.
- **Servicios con la lógica:** el mismo `comandas.service` lo usan la API **y** el seeder, así el seed descuenta inventario igual que en producción.
- **Multi-tenant por columna:** todas las tablas de negocio tienen `restauranteId`. El `restauranteId` **sale del JWT**, nunca del body, y **todas** las consultas filtran por él. Un restaurante no puede ver ni tocar datos de otro (probado en los tests).

## 📁 Estructura de carpetas

```
erp-gastronomico/
├── README.md                     ← este archivo
├── .gitignore
├── docs/
│   ├── AI_AUDIT.md               ← bitácora obligatoria de uso de IA
│   └── postman/
│       ├── ERP_Gastronomico.postman_collection.json   (64 peticiones con tests)
│       └── ERP_Gastronomico.postman_environment.json
├── backend/
│   ├── .env.example              ← plantilla de variables de entorno
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma         ← MODELOS / tablas
│   │   ├── migrations/           ← (se genera con npm run db:migrate)
│   │   └── seed.js               ← datos iniciales: restaurantes, usuarios, menú, inventario, comandas
│   ├── src/
│   │   ├── server.js             ← levanta el servidor
│   │   ├── app.js                ← configura Express (middlewares + rutas)
│   │   ├── config/               ← env.js (valida .env) · prisma.js (singleton)
│   │   ├── constants/            ← roles, estados y MÁQUINA DE ESTADOS de comandas
│   │   ├── routes/               ← una ruta por módulo + index.js
│   │   ├── middlewares/          ← auth, roles, validate, error, rateLimit
│   │   ├── validators/           ← esquemas Joi por módulo
│   │   ├── controllers/          ← capa HTTP
│   │   ├── services/             ← lógica de negocio
│   │   └── utils/                ← AppError, jwt, respuestas, slug
│   └── tests/
│       └── api.test.js           ← 34 pruebas de integración (edge cases)
└── frontend/                     ← React + Vite (base lista para la Fase 3)
    ├── .env.example
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── api/                  ← client.js (axios + JWT) · services.js
        ├── context/              ← AuthContext (sesión)
        ├── components/           ← RutaProtegida, Layout
        └── pages/                ← Login, Inicio (salón), Cocina, Caja
```

## 🗃️ Modelo de datos

```
Restaurante 1──* Usuario (ADMIN | MESERO | COCINERO | CAJERO)
Restaurante 1──* Mesa
Restaurante 1──* Categoria 1──* Platillo
Restaurante 1──* Proveedor 1──* Insumo
Platillo *──* Insumo   (tabla RecetaInsumo: cuánto insumo usa 1 platillo)
Insumo 1──* MovimientoInventario (ENTRADA | SALIDA | AJUSTE)  ← trazabilidad del stock
Restaurante 1──* Comanda (folio consecutivo por restaurante)
Comanda 1──* DetalleComanda *──1 Platillo  (precio congelado al momento del pedido)
Mesa 1──* Comanda *──1 Usuario (mesero)
```

Decisiones importantes:

- **Dinero con `Decimal(10,2)`**, nunca `Float` (evita errores tipo `0.1 + 0.2 = 0.30000000000000004`).
- **Receta → inventario automático:** al crear una comanda se descuentan los insumos de la receta; al cancelarla se devuelven.
- **Baja lógica** de usuarios (`activo=false`) y **no se borran** platillos/mesas con historial: se conserva la trazabilidad de ventas.
- **Kardex:** el stock nunca se edita directo; sólo con movimientos `ENTRADA/SALIDA/AJUSTE`, cada uno guarda el `stockFinal`.

## 🚀 Instalación paso a paso

### Requisitos

- [Node.js 20 o superior](https://nodejs.org/) (`node -v`)
- Una cuenta de [Supabase](https://supabase.com) (gratis)
- Git y [Postman](https://www.postman.com/downloads/)

### Paso 1 — Crear la base de datos en Supabase

1. Entra a Supabase → **New project**. Elige nombre (`erp-gastronomico`), contraseña de BD (**guárdala**) y región cercana (p. ej. `us-east-1`).
2. Cuando termine, pulsa **Connect** (arriba) → pestaña **ORMs** → **Prisma**. Supabase te muestra dos cadenas:
   - `DATABASE_URL` → *Transaction pooler*, puerto **6543**, con `?pgbouncer=true` (la usa la app).
   - `DIRECT_URL` → *Session pooler*, puerto **5432** (la usa Prisma para migraciones).
3. Reemplaza `[YOUR-PASSWORD]` con tu contraseña. Si tiene símbolos como `@`, `#` o `/`, codifícalos (`@` → `%40`).

> No necesitas crear tablas a mano: Prisma las crea en el paso 4.

### Paso 2 — Clonar e instalar

```bash
git clone https://github.com/TU_USUARIO/erp-gastronomico.git
cd erp-gastronomico/backend
npm install
```

### Paso 3 — Variables de entorno

```bash
cp .env.example .env        # en Windows (PowerShell): copy .env.example .env
```

Edita `.env`: pega `DATABASE_URL` y `DIRECT_URL` de Supabase y genera un `JWT_SECRET` seguro:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Paso 4 — Crear las tablas (migración)

```bash
npx prisma migrate dev --name init
```

Esto crea `prisma/migrations/…_init/migration.sql`, ejecuta el SQL en Supabase y genera el Prisma Client. Ya puedes ver las tablas en Supabase → **Table Editor**. **Sube la carpeta `migrations/` a Git** (es parte del entregable).

### Paso 5 — Poblar con datos de prueba (seeder)

```bash
npm run db:seed
```

Crea 2 restaurantes, 8 mesas, 5 categorías, 10 platillos con receta, 4 proveedores, 13 insumos y 3 comandas en distintos estados. Usuarios (contraseña `Password123!`):

| Restaurante | Rol | Email |
|---|---|---|
| La Huerta Cocina Mexicana | ADMIN | `admin@lahuerta.com` |
| La Huerta Cocina Mexicana | MESERO | `mesero@lahuerta.com` |
| La Huerta Cocina Mexicana | MESERO | `mesero2@lahuerta.com` |
| La Huerta Cocina Mexicana | COCINERO | `cocinero@lahuerta.com` |
| La Huerta Cocina Mexicana | CAJERO | `cajero@lahuerta.com` |
| Tacos El Güero | ADMIN | `admin@elguero.com` (para probar aislamiento) |

### Paso 6 — Levantar el servidor

```bash
npm run dev
# 🍽️  ERP Gastronómico API escuchando en http://localhost:4000/api
```

Prueba: abre <http://localhost:4000/api/health>.

### Paso 7 — Probar con Postman

1. Postman → **Import** → selecciona los 2 archivos de `docs/postman/`.
2. Elige el entorno **ERP Gastronómico - Local**.
3. Ejecuta la carpeta **0. Auth**: cada *Login* guarda su token en las variables `tokenAdmin`, `tokenMesero`, `tokenCocinero`, `tokenCajero` y en `token` (variable global de la colección).
4. Ejecuta el resto de carpetas en orden o toda la colección con **Run collection**.

### Scripts disponibles

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga automática (nodemon) |
| `npm start` | Servidor en modo producción |
| `npm run db:migrate` | Crea/aplica migraciones en desarrollo |
| `npm run db:deploy` | Aplica migraciones en producción |
| `npm run db:seed` | Carga datos iniciales |
| `npm run db:reset` | ⚠️ Borra TODO, re-migra y re-ejecuta el seed |
| `npm run db:studio` | Abre Prisma Studio (ver/editar datos en el navegador) |
| `npm test` | Pruebas automáticas (usar BD de pruebas) |

## 📡 Endpoints de la API

Base URL: `http://localhost:4000/api` · Todas las rutas (excepto registro/login/health) requieren `Authorization: Bearer <token>`.

Formato de respuesta:

```jsonc
// éxito
{ "ok": true, "mensaje": "Comanda creada", "data": { ... }, "meta": { "total": 30, "page": 1, "limit": 20, "totalPages": 2 } }
// error
{ "ok": false, "mensaje": "Error de validación", "errores": [ { "campo": "body.precio", "mensaje": "precio must be greater than 0" } ] }
```

### Auth

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/auth/registro` | Público | Registra restaurante + usuario ADMIN, devuelve token |
| POST | `/auth/login` | Público | Devuelve token JWT |
| GET | `/auth/perfil` | Todos | Datos del usuario autenticado |
| PATCH | `/auth/password` | Todos | Cambia la contraseña propia |

### Usuarios (personal)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/usuarios?rol=&activo=&q=&page=&limit=` | ADMIN | Listar con filtros y paginación |
| GET | `/usuarios/:id` | ADMIN | Detalle |
| POST | `/usuarios` | ADMIN | Crear mesero/cocinero/cajero/admin |
| PUT | `/usuarios/:id` | ADMIN | Editar (rol, nombre, email, password, activo) |
| DELETE | `/usuarios/:id` | ADMIN | Baja lógica (no permite dejar al restaurante sin ADMIN) |

### Mesas

| Método | Ruta | Roles |
|---|---|---|
| GET | `/mesas?estado=` · `/mesas/:id` | Todos |
| POST / PUT / DELETE | `/mesas` · `/mesas/:id` | ADMIN |

### Menú

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/categorias` · `/categorias/:id` | Todos | |
| POST/PUT/DELETE | `/categorias[/:id]` | ADMIN | |
| GET | `/platillos?categoriaId=&disponible=&q=` | Todos | Menú paginado |
| GET | `/platillos/:id` | Todos | Incluye la receta |
| POST/PUT/DELETE | `/platillos[/:id]` | ADMIN | |
| PUT | `/platillos/:id/receta` | ADMIN | Define insumos y cantidades por platillo |

### Inventario

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/proveedores` · `/proveedores/:id` | ADMIN, COCINERO | |
| POST/PUT/DELETE | `/proveedores[/:id]` | ADMIN | |
| GET | `/insumos?proveedorId=&stockBajo=true&q=` | ADMIN, COCINERO | |
| GET | `/insumos/alertas/stock-bajo` | ADMIN, COCINERO | Insumos con stock ≤ mínimo |
| GET | `/insumos/:id` · `/insumos/:id/movimientos` | ADMIN, COCINERO | Detalle y kardex |
| POST | `/insumos/:id/movimientos` | ADMIN, COCINERO | ENTRADA / SALIDA / AJUSTE |
| POST/PUT/DELETE | `/insumos[/:id]` | ADMIN | |

### Comandas (pedidos)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/comandas` | MESERO, ADMIN | Crea comanda, descuenta stock, ocupa la mesa |
| GET | `/comandas?estado=PENDIENTE,EN_PREPARACION&mesaId=&meseroId=&desde=&hasta=` | Todos* | Listado / pantalla de cocina |
| GET | `/comandas/mesa/:mesaId` | Todos* | Comandas por mesa |
| GET | `/comandas/mesero/:meseroId` | Todos* | Comandas por mesero |
| GET | `/comandas/:id` | Todos* | Detalle |
| PUT | `/comandas/:id` | MESERO, ADMIN | Editar notas/platillos (sólo PENDIENTE) |
| PATCH | `/comandas/:id/estado` | Según transición | Cambiar estado (ver flujo) |
| DELETE | `/comandas/:id` | ADMIN | Sólo PENDIENTE o CANCELADO |

\* El MESERO sólo ve sus propias comandas.

### Reportes

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/reportes/resumen?desde=&hasta=` | ADMIN, CAJERO | Ventas, ticket promedio, top 5 platillos, ventas por método de pago, stock bajo, mesas ocupadas |

## 👥 Roles y permisos

| Acción | ADMIN | MESERO | COCINERO | CAJERO |
|---|:-:|:-:|:-:|:-:|
| Gestionar personal | ✅ | ❌ | ❌ | ❌ |
| Editar menú, mesas, proveedores | ✅ | ❌ | ❌ | ❌ |
| Ver menú y mesas | ✅ | ✅ | ✅ | ✅ |
| Ver inventario / registrar movimientos | ✅ | ❌ | ✅ | ❌ |
| Crear / editar comandas | ✅ | ✅ (propias) | ❌ | ❌ |
| PENDIENTE → EN_PREPARACION | ✅ | ❌ | ✅ | ❌ |
| EN_PREPARACION → ENTREGADO | ✅ | ✅ | ✅ | ❌ |
| ENTREGADO → PAGADO | ✅ | ❌ | ❌ | ✅ |
| Cancelar comanda | ✅ | ✅ (sólo PENDIENTE, propias) | ❌ | ❌ |
| Reportes | ✅ | ❌ | ❌ | ✅ |

## 🔄 Flujo de una comanda

```
            (MESERO crea)            (COCINERO)                (MESERO/COCINERO)        (CAJERO + metodoPago)
  ──────►  PENDIENTE  ───────────►  EN_PREPARACION  ───────────►  ENTREGADO  ───────────►  PAGADO
               │                          │
               │ (MESERO/ADMIN)           │ (sólo ADMIN)
               ▼                          ▼
           CANCELADO  ◄───────────────────┘          → devuelve los insumos al inventario
```

La máquina de estados está en `src/constants/index.js` (`TRANSICIONES_COMANDA`). Cualquier transición no listada responde **400**; si el rol no puede hacerla, **403**. Al pasar a PAGADO o CANCELADO la mesa se libera automáticamente si no tiene otras comandas abiertas.

## 🔐 Seguridad implementada

| Riesgo | Mitigación |
|---|---|
| Contraseñas filtradas | `bcryptjs` con salt (10 rondas); el hash nunca se devuelve en respuestas |
| Token robado / eterno | JWT con expiración (`JWT_EXPIRES_IN=8h`); algoritmo fijo `HS256` (bloquea `alg:none`) |
| Usuario dado de baja con token vigente | `autenticar` revisa en BD que el usuario y el restaurante sigan activos |
| Escalada de privilegios | `permitirRoles()` por ruta + máquina de estados por rol |
| IDOR / ver datos de otro restaurante | Toda consulta filtra por `restauranteId` del JWT (`findFirst({ where: { id, restauranteId } })`) |
| Mass assignment (`"rol":"ADMIN"`, `"restauranteId":5`) | Joi con `stripUnknown: true` elimina campos no declarados |
| Inyección SQL / NoSQL | Prisma usa consultas parametrizadas; Joi rechaza objetos donde se espera string (`{"$ne":null}`) |
| Enumeración de emails | Mismo mensaje y tiempo de respuesta para "email no existe" y "password incorrecto" |
| Fuerza bruta en login | `express-rate-limit`: 20 intentos / 15 min por IP |
| Stock negativo por concurrencia | `UPDATE … WHERE stockActual >= cantidad` atómico dentro de transacción |
| Doble cobro / carreras al cambiar estado | Bloqueo optimista: `updateMany({ where: { id, estado: estadoAnterior } })` |
| Fugas de información en errores | `errorHandler` oculta el stack en producción; mapea errores de Prisma/JWT a 4xx |
| Cabeceras inseguras / CORS abierto | `helmet()` y `cors({ origin: CORS_ORIGIN })` |
| Payloads gigantes | `express.json({ limit: '100kb' })` |

## 🧪 Pruebas

### Automáticas (Jest + Supertest)

`tests/api.test.js` contiene 34 pruebas de integración: autenticación (token expirado, firma falsa, `alg:none`), roles, aislamiento entre restaurantes, mass assignment, validaciones, máquina de estados, rollback de stock insuficiente, devolución de stock al cancelar y **20 salidas concurrentes** sobre el mismo insumo.

> ⚠️ Las pruebas escriben en la BD. Usa un **segundo proyecto de Supabase** (o una BD local) para pruebas, nunca la de producción. Cada corrida crea y borra sus propios datos.

```bash
# con DATABASE_URL apuntando a la BD de pruebas (y connection_limit=5 o más)
npx prisma migrate deploy
npm test
```

### Manuales (Postman)

Ver [Paso 7](#paso-7--probar-con-postman). La carpeta **7. Seguridad** contiene los edge cases de seguridad.

## ⚛️ Frontend (React + Vite) paso a paso

La carpeta `frontend/` ya trae una base funcional: login, sesión con JWT, rutas protegidas por rol, vista de salón (mesas), pantalla de cocina y caja.

```bash
cd frontend
npm install
cp .env.example .env     # VITE_API_URL=http://localhost:4000/api
npm run dev              # http://localhost:5173
```

Inicia sesión con `admin@lahuerta.com` / `Password123!`. Con `cocinero@…` sólo verás "Cocina"; con `cajero@…`, "Caja".

**Cómo está conectado:**

1. `src/api/client.js` → instancia de Axios que agrega `Authorization: Bearer <token>` en cada petición y, si la API responde 401, cierra sesión.
2. `src/api/services.js` → una función por endpoint (`comandasApi.crear(...)`). Los componentes nunca escriben URLs.
3. `src/context/AuthContext.jsx` → guarda el usuario y expone `login()` / `logout()`.
4. `src/components/RutaProtegida.jsx` → oculta páginas según el rol (sólo UX: **la seguridad real está en el backend**).

**Siguientes pantallas sugeridas para la Fase 3:**

| Pantalla | Rol | Endpoints |
|---|---|---|
| Registro de restaurante | Público | `POST /auth/registro` |
| Tomar pedido (mesa → platillos → enviar) | MESERO | `GET /platillos`, `POST /comandas` |
| Administración de menú y recetas | ADMIN | `/categorias`, `/platillos`, `PUT /platillos/:id/receta` |
| Inventario y kardex | ADMIN, COCINERO | `/insumos`, `/insumos/:id/movimientos`, `/insumos/alertas/stock-bajo` |
| Personal | ADMIN | `/usuarios` |
| Dashboard | ADMIN, CAJERO | `GET /reportes/resumen` |

Para agregar una pantalla: crea el archivo en `src/pages/`, agrega la función en `services.js`, registra la ruta en `App.jsx` y el enlace en `Layout.jsx`.

## ☁️ Despliegue

| Parte | Servicio sugerido (plan gratis) | Notas |
|---|---|---|
| BD | Supabase | Ya está en la nube |
| Backend | Render / Railway | Build: `npm install && npx prisma generate && npx prisma migrate deploy` · Start: `npm start` · Configura las variables del `.env` en el panel |
| Frontend | Netlify / Vercel | Build: `npm run build` · Publish: `dist` · Variable `VITE_API_URL` con la URL del backend · agrega la URL del frontend a `CORS_ORIGIN` del backend |

El archivo `frontend/public/_redirects` ya incluye la regla para que Netlify sirva las rutas de React Router.

## 🤝 Trabajo en equipo con Git

El docente revisa **commits frecuentes y colaborativos**. Flujo sugerido:

```bash
git checkout -b feature/comandas        # una rama por módulo
# ... trabajar ...
git add .
git commit -m "feat(comandas): cambio de estado con máquina de estados"
git push -u origin feature/comandas     # luego abrir Pull Request hacia main
```

Reparto sugerido por módulo (cada integrante hace commits de su parte):

| Integrante | Módulo | Archivos |
|---|---|---|
| 1 | Usuarios y Auth | `auth.*`, `usuarios.*`, middlewares de auth/roles |
| 2 | Comandas y mesas | `comandas.*`, `mesas.*`, `reportes.*` |
| 3 | Inventario y menú | `insumos.*`, `proveedores.*`, `platillos.*`, `categorias.*`, `seed.js` |

Convención de commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`.

---

📄 Bitácora de uso de IA: [`docs/AI_AUDIT.md`](docs/AI_AUDIT.md)
