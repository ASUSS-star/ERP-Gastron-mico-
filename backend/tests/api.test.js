/**
 * Pruebas de integración (Jest + Supertest) — incluye los EDGE CASES
 * generados con apoyo de IA (ver docs/AI_AUDIT.md).
 *
 * ⚠️ Ejecutar contra una BD de PRUEBAS, nunca la de producción:
 *    1) En .env.test pon DATABASE_URL/DIRECT_URL de una BD vacía
 *    2) npx dotenv -e .env.test -- prisma migrate deploy   (o ajusta tu .env)
 *    3) npm test
 *
 * Cada corrida crea sus propios restaurantes con emails aleatorios,
 * así que no depende del seed ni choca con datos existentes.
 */
process.env.NODE_ENV = 'test';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const prisma = require('../src/config/prisma');

const api = request(app);
const run = Date.now().toString(36);
const PASS = 'Prueba123!';
const auth = (t) => ({ Authorization: `Bearer ${t}` });

const ctx = {}; // tokens e ids compartidos entre pruebas

const registrar = async (nombre, email) => {
  const res = await api.post('/api/auth/registro').send({
    restaurante: { nombre },
    admin: { nombre: 'Admin Test', email, password: PASS },
  });
  return res;
};

const crearUsuario = async (rol) => {
  const email = `${rol.toLowerCase()}-${run}@test.com`;
  const res = await api.post('/api/usuarios').set(auth(ctx.admin)).send({ nombre: `${rol} Test`, email, password: PASS, rol });
  expect(res.status).toBe(201);
  const login = await api.post('/api/auth/login').send({ email, password: PASS });
  return { token: login.body.data.token, id: res.body.data.id };
};

beforeAll(async () => {
  const r1 = await registrar(`Restaurante Test ${run}`, `admin-${run}@test.com`);
  expect(r1.status).toBe(201);
  ctx.admin = r1.body.data.token;
  ctx.restauranteId = r1.body.data.restaurante.id;

  const r2 = await registrar(`Otro Restaurante ${run}`, `admin2-${run}@test.com`);
  ctx.admin2 = r2.body.data.token;
  ctx.restaurante2Id = r2.body.data.restaurante.id;

  const mesero = await crearUsuario('MESERO');
  ctx.mesero = mesero.token;
  ctx.meseroId = mesero.id;
  ctx.cocinero = (await crearUsuario('COCINERO')).token;
  ctx.cajero = (await crearUsuario('CAJERO')).token;
});

afterAll(async () => {
  // Limpieza: borra los restaurantes creados por esta corrida
  const ids = [ctx.restauranteId, ctx.restaurante2Id].filter(Boolean);
  await prisma.comanda.deleteMany({ where: { restauranteId: { in: ids } } });
  await prisma.restaurante.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
describe('Autenticación', () => {
  test('registro duplicado con el mismo email → 409', async () => {
    const res = await registrar('Duplicado', `admin-${run}@test.com`);
    expect(res.status).toBe(409);
  });

  test('registro con password débil → 400 con detalle de errores', async () => {
    const res = await api.post('/api/auth/registro').send({
      restaurante: { nombre: 'X' },
      admin: { nombre: 'A', email: 'no-es-email', password: '123' },
    });
    expect(res.status).toBe(400);
    expect(res.body.errores.length).toBeGreaterThanOrEqual(3);
  });

  test('login con password incorrecto → 401 genérico', async () => {
    const res = await api.post('/api/auth/login').send({ email: `admin-${run}@test.com`, password: 'Incorrecta1' });
    expect(res.status).toBe(401);
    expect(res.body.mensaje).toBe('Credenciales inválidas');
  });

  test('login con email inexistente → mismo 401 (no revela si existe)', async () => {
    const res = await api.post('/api/auth/login').send({ email: `nadie-${run}@test.com`, password: 'Cualquiera1' });
    expect(res.status).toBe(401);
    expect(res.body.mensaje).toBe('Credenciales inválidas');
  });

  test('JSON mal formado → 400', async () => {
    const res = await api.post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
  });

  test('sin token → 401', async () => {
    expect((await api.get('/api/auth/perfil')).status).toBe(401);
  });

  test('token con firma falsa → 401', async () => {
    const falso = jwt.sign({ sub: 1, rol: 'ADMIN', restauranteId: 1 }, 'otro-secreto-cualquiera-de-32-caracteres!!');
    expect((await api.get('/api/auth/perfil').set(auth(falso))).status).toBe(401);
  });

  test('token expirado → 401 con mensaje de expiración', async () => {
    const expirado = jwt.sign({ sub: 1, rol: 'ADMIN', restauranteId: 1 }, process.env.JWT_SECRET, { expiresIn: -10 });
    const res = await api.get('/api/auth/perfil').set(auth(expirado));
    expect(res.status).toBe(401);
    expect(res.body.mensaje).toMatch(/expirado/);
  });

  test('token con alg "none" → 401', async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const sinFirma = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 1, rol: 'ADMIN', restauranteId: 1 })}.`;
    expect((await api.get('/api/auth/perfil').set(auth(sinFirma))).status).toBe(401);
  });

  test('perfil con token válido → 200 y sin password', async () => {
    const res = await api.get('/api/auth/perfil').set(auth(ctx.admin));
    expect(res.status).toBe(200);
    expect(res.body.data.password).toBeUndefined();
    expect(res.body.data.rol).toBe('ADMIN');
  });
});

// ---------------------------------------------------------------------------
describe('Roles y aislamiento entre restaurantes', () => {
  test('MESERO no puede crear usuarios → 403', async () => {
    const res = await api.post('/api/usuarios').set(auth(ctx.mesero))
      .send({ nombre: 'Hack', email: `hack-${run}@test.com`, password: PASS, rol: 'ADMIN' });
    expect(res.status).toBe(403);
  });

  test('mass-assignment: restauranteId en el body se ignora', async () => {
    const res = await api.post('/api/mesas').set(auth(ctx.admin)).send({ numero: 99, restauranteId: ctx.restaurante2Id });
    expect(res.status).toBe(201);
    expect(res.body.data.restauranteId).toBe(ctx.restauranteId);
  });

  test('admin del restaurante 2 NO ve la mesa del restaurante 1 → 404', async () => {
    const mesas = await api.get('/api/mesas').set(auth(ctx.admin));
    const id = mesas.body.data[0].id;
    expect((await api.get(`/api/mesas/${id}`).set(auth(ctx.admin2))).status).toBe(404);
  });

  test('id no numérico en la URL → 400', async () => {
    expect((await api.get('/api/mesas/abc').set(auth(ctx.admin))).status).toBe(400);
  });

  test('ruta inexistente → 404', async () => {
    expect((await api.get('/api/no-existe').set(auth(ctx.admin))).status).toBe(404);
  });

  test('desactivar al último ADMIN (a sí mismo) → 400', async () => {
    const perfil = await api.get('/api/auth/perfil').set(auth(ctx.admin));
    expect((await api.delete(`/api/usuarios/${perfil.body.data.id}`).set(auth(ctx.admin))).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe('Inventario, menú y comandas', () => {
  beforeAll(async () => {
    const mesa = await api.post('/api/mesas').set(auth(ctx.admin)).send({ numero: 1, capacidad: 4 });
    ctx.mesaId = mesa.body.data.id;

    const insumo = await api.post('/api/insumos').set(auth(ctx.admin))
      .send({ nombre: 'Tortilla', unidad: 'pza', stockActual: 10, stockMinimo: 2, costoUnitario: 1 });
    expect(insumo.status).toBe(201);
    ctx.insumoId = insumo.body.data.id;

    const platillo = await api.post('/api/platillos').set(auth(ctx.admin)).send({ nombre: 'Taco', precio: 20.5 });
    expect(platillo.status).toBe(201);
    ctx.platilloId = platillo.body.data.id;

    const receta = await api.put(`/api/platillos/${ctx.platilloId}/receta`).set(auth(ctx.admin))
      .send({ insumos: [{ insumoId: ctx.insumoId, cantidad: 2 }] });
    expect(receta.status).toBe(200);
  });

  test('precio negativo → 400', async () => {
    expect((await api.post('/api/platillos').set(auth(ctx.admin)).send({ nombre: 'Malo', precio: -5 })).status).toBe(400);
  });

  test('nombre de platillo duplicado → 409', async () => {
    expect((await api.post('/api/platillos').set(auth(ctx.admin)).send({ nombre: 'Taco', precio: 10 })).status).toBe(409);
  });

  test('receta con insumo de OTRO restaurante → 404', async () => {
    const ajeno = await api.post('/api/insumos').set(auth(ctx.admin2)).send({ nombre: 'Ajeno', unidad: 'kg' });
    const res = await api.put(`/api/platillos/${ctx.platilloId}/receta`).set(auth(ctx.admin))
      .send({ insumos: [{ insumoId: ajeno.body.data.id, cantidad: 1 }] });
    expect(res.status).toBe(404);
  });

  test('comanda sin items → 400', async () => {
    const res = await api.post('/api/comandas').set(auth(ctx.mesero)).send({ mesaId: ctx.mesaId, items: [] });
    expect(res.status).toBe(400);
  });

  test('COCINERO no puede crear comandas → 403', async () => {
    const res = await api.post('/api/comandas').set(auth(ctx.cocinero))
      .send({ mesaId: ctx.mesaId, items: [{ platilloId: ctx.platilloId, cantidad: 1 }] });
    expect(res.status).toBe(403);
  });

  test('comanda que excede el stock → 409 y NO descuenta nada (rollback)', async () => {
    const res = await api.post('/api/comandas').set(auth(ctx.mesero))
      .send({ mesaId: ctx.mesaId, items: [{ platilloId: ctx.platilloId, cantidad: 6 }] }); // 12 tortillas > 10
    expect(res.status).toBe(409);
    const insumo = await api.get(`/api/insumos/${ctx.insumoId}`).set(auth(ctx.admin));
    expect(Number(insumo.body.data.stockActual)).toBe(10);
  });

  test('crear comanda válida → 201, total correcto, stock descontado, mesa OCUPADA', async () => {
    const res = await api.post('/api/comandas').set(auth(ctx.mesero))
      .send({ mesaId: ctx.mesaId, items: [{ platilloId: ctx.platilloId, cantidad: 2, notas: 'sin cebolla' }] });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.total)).toBe(41);
    expect(res.body.data.estado).toBe('PENDIENTE');
    ctx.comandaId = res.body.data.id;

    const insumo = await api.get(`/api/insumos/${ctx.insumoId}`).set(auth(ctx.admin));
    expect(Number(insumo.body.data.stockActual)).toBe(6);
    const mesa = await api.get(`/api/mesas/${ctx.mesaId}`).set(auth(ctx.admin));
    expect(mesa.body.data.estado).toBe('OCUPADA');
  });

  test('saltar estados PENDIENTE → PAGADO → 400', async () => {
    const res = await api.patch(`/api/comandas/${ctx.comandaId}/estado`).set(auth(ctx.cajero))
      .send({ estado: 'PAGADO', metodoPago: 'EFECTIVO' });
    expect(res.status).toBe(400);
  });

  test('CAJERO no puede poner EN_PREPARACION → 403', async () => {
    const res = await api.patch(`/api/comandas/${ctx.comandaId}/estado`).set(auth(ctx.cajero)).send({ estado: 'EN_PREPARACION' });
    expect(res.status).toBe(403);
  });

  test('flujo completo PENDIENTE → EN_PREPARACION → ENTREGADO → PAGADO libera la mesa', async () => {
    expect((await api.patch(`/api/comandas/${ctx.comandaId}/estado`).set(auth(ctx.cocinero)).send({ estado: 'EN_PREPARACION' })).status).toBe(200);
    expect((await api.patch(`/api/comandas/${ctx.comandaId}/estado`).set(auth(ctx.mesero)).send({ estado: 'ENTREGADO' })).status).toBe(200);
    // PAGADO sin método de pago → 400
    expect((await api.patch(`/api/comandas/${ctx.comandaId}/estado`).set(auth(ctx.cajero)).send({ estado: 'PAGADO' })).status).toBe(400);
    const pagada = await api.patch(`/api/comandas/${ctx.comandaId}/estado`).set(auth(ctx.cajero))
      .send({ estado: 'PAGADO', metodoPago: 'TARJETA' });
    expect(pagada.status).toBe(200);
    expect(pagada.body.data.pagadoAt).toBeTruthy();

    const mesa = await api.get(`/api/mesas/${ctx.mesaId}`).set(auth(ctx.admin));
    expect(mesa.body.data.estado).toBe('LIBRE');
  });

  test('una comanda PAGADA no puede cambiar de estado → 400', async () => {
    const res = await api.patch(`/api/comandas/${ctx.comandaId}/estado`).set(auth(ctx.admin)).send({ estado: 'CANCELADO' });
    expect(res.status).toBe(400);
  });

  test('cancelar una comanda devuelve el stock', async () => {
    const nueva = await api.post('/api/comandas').set(auth(ctx.mesero))
      .send({ mesaId: ctx.mesaId, items: [{ platilloId: ctx.platilloId, cantidad: 1 }] });
    expect(nueva.status).toBe(201);
    let insumo = await api.get(`/api/insumos/${ctx.insumoId}`).set(auth(ctx.admin));
    expect(Number(insumo.body.data.stockActual)).toBe(4);

    const cancel = await api.patch(`/api/comandas/${nueva.body.data.id}/estado`).set(auth(ctx.mesero)).send({ estado: 'CANCELADO' });
    expect(cancel.status).toBe(200);
    insumo = await api.get(`/api/insumos/${ctx.insumoId}`).set(auth(ctx.admin));
    expect(Number(insumo.body.data.stockActual)).toBe(6);
  });

  test('consultar comandas por mesa y por mesero', async () => {
    const porMesa = await api.get(`/api/comandas/mesa/${ctx.mesaId}`).set(auth(ctx.admin));
    expect(porMesa.status).toBe(200);
    expect(porMesa.body.meta.total).toBe(2);

    const porMesero = await api.get(`/api/comandas/mesero/${ctx.meseroId}?estado=PAGADO`).set(auth(ctx.admin));
    expect(porMesero.body.data.every((c) => c.estado === 'PAGADO')).toBe(true);
  });

  test('un MESERO no puede ver las comandas de otro mesero → 403', async () => {
    const otro = await api.get('/api/auth/perfil').set(auth(ctx.admin));
    const res = await api.get(`/api/comandas/mesero/${otro.body.data.id}`).set(auth(ctx.mesero));
    expect(res.status).toBe(403);
  });

  test('SALIDA de inventario mayor al stock → 409 (nunca negativo)', async () => {
    const res = await api.post(`/api/insumos/${ctx.insumoId}/movimientos`).set(auth(ctx.cocinero))
      .send({ tipo: 'SALIDA', cantidad: 1000, motivo: 'merma' });
    expect(res.status).toBe(409);
  });

  test('AJUSTE de inventario a 1 → aparece en alertas de stock bajo', async () => {
    const res = await api.post(`/api/insumos/${ctx.insumoId}/movimientos`).set(auth(ctx.admin))
      .send({ tipo: 'AJUSTE', cantidad: 1, motivo: 'Conteo físico' });
    expect(res.status).toBe(201);
    const alertas = await api.get('/api/insumos/alertas/stock-bajo').set(auth(ctx.cocinero));
    expect(alertas.body.data.some((i) => i.id === ctx.insumoId)).toBe(true);
  });

  test('20 SALIDAS concurrentes de 1 con stock 1 → sólo una pasa', async () => {
    const intentos = await Promise.all(
      Array.from({ length: 20 }, () =>
        api.post(`/api/insumos/${ctx.insumoId}/movimientos`).set(auth(ctx.admin)).send({ tipo: 'SALIDA', cantidad: 1 })),
    );
    expect(intentos.filter((r) => r.status === 201)).toHaveLength(1);
    const insumo = await api.get(`/api/insumos/${ctx.insumoId}`).set(auth(ctx.admin));
    expect(Number(insumo.body.data.stockActual)).toBe(0);
  });

  test('reporte resumen accesible para CAJERO, no para MESERO', async () => {
    const ok = await api.get('/api/reportes/resumen').set(auth(ctx.cajero));
    expect(ok.status).toBe(200);
    expect(Number(ok.body.data.ventas.total)).toBe(41);
    expect((await api.get('/api/reportes/resumen').set(auth(ctx.mesero))).status).toBe(403);
  });
});
