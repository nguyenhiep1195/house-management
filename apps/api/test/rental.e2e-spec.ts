import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin';
const E2E_ROOM = 'E2E_P999';
const E2E_ID_CARD = '099999999999';

describe('Rental lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let roomId: number;
  let tenantId: number;
  let contractId: number;
  let invoiceId: number;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function cleanup() {
    await prisma.tenant.deleteMany({ where: { idCardNumber: E2E_ID_CARD } });
    await prisma.room.deleteMany({ where: { name: E2E_ROOM } }); // cascades contracts/invoices
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await cleanup();

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
      .expect(200);
    token = (login.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('rejects unauthenticated access to /rooms', async () => {
    await request(app.getHttpServer()).get('/rooms').expect(401);
  });

  it('creates a room with initial readings', async () => {
    const res = await request(app.getHttpServer())
      .post('/rooms')
      .set(auth())
      .send({
        name: E2E_ROOM,
        price: 3000000,
        occupantCount: 2,
        motorbikeCount: 3,
        initialElectricityReading: 100,
        initialWaterReading: 10,
      })
      .expect(201);
    roomId = (res.body as { id: number }).id;
    expect(
      (res.body as { electricityReading: number }).electricityReading,
    ).toBe(100);
  });

  it('creates a tenant assigned to the room', async () => {
    const res = await request(app.getHttpServer())
      .post('/tenants')
      .set(auth())
      .send({
        fullName: 'E2E Tenant',
        idCardNumber: E2E_ID_CARD,
        dateOfBirth: '1995-05-20',
        hometown: 'Nam Định',
        roomId,
      })
      .expect(201);
    tenantId = (res.body as { id: number }).id;
  });

  it('creates an ACTIVE contract and occupies the room with synced price', async () => {
    const res = await request(app.getHttpServer())
      .post('/contracts')
      .set(auth())
      .send({
        roomId,
        price: 3200000,
        deposit: 3000000,
        startDate: '2026-07-01',
        endDate: '2027-07-01',
      })
      .expect(201);
    contractId = (res.body as { id: number }).id;

    const room = await request(app.getHttpServer())
      .get(`/rooms/${roomId}`)
      .set(auth())
      .expect(200);
    expect((room.body as { status: string }).status).toBe('OCCUPIED');
    expect((room.body as { price: number }).price).toBe(3200000);
  });

  it('bulk-updates meter readings and rejects lower values', async () => {
    await request(app.getHttpServer())
      .patch('/rooms/meter-readings')
      .set(auth())
      .send({
        items: [{ roomId, electricityReading: 50, waterReading: 5 }],
      })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/rooms/meter-readings')
      .set(auth())
      .send({
        items: [{ roomId, electricityReading: 250, waterReading: 22 }],
      })
      .expect(200);
  });

  it('creates a manual invoice and rejects a duplicate for the same month', async () => {
    const res = await request(app.getHttpServer())
      .post('/invoices')
      .set(auth())
      .send({ roomId, month: 7, year: 2026 })
      .expect(201);
    const body = res.body as {
      id: number;
      electricityPrev: number;
      totalAmount: number;
    };
    invoiceId = body.id;
    expect(body.electricityPrev).toBe(100);
    expect(body.totalAmount).toBeGreaterThan(3200000);

    await request(app.getHttpServer())
      .post('/invoices')
      .set(auth())
      .send({ roomId, month: 7, year: 2026 })
      .expect(409);
  });

  it('generate skips rooms that already have an invoice', async () => {
    const res = await request(app.getHttpServer())
      .post('/invoices/generate')
      .set(auth())
      .send({ month: 7, year: 2026 })
      .expect(200);
    expect((res.body as { skipped: number }).skipped).toBeGreaterThanOrEqual(1);
  });

  it('marks the invoice paid by bank transfer', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/invoices/${invoiceId}/pay`)
      .set(auth())
      .send({ paymentMethod: 'TRANSFER' })
      .expect(200);
    const body = res.body as { status: string; paymentMethod: string };
    expect(body.status).toBe('PAID');
    expect(body.paymentMethod).toBe('TRANSFER');
  });

  it('room detail lists tenants, contracts and invoices', async () => {
    const res = await request(app.getHttpServer())
      .get(`/rooms/${roomId}`)
      .set(auth())
      .expect(200);
    const body = res.body as {
      tenants: { id: number }[];
      contracts: { id: number }[];
      invoices: { id: number }[];
    };
    expect(body.tenants.some((t) => t.id === tenantId)).toBe(true);
    expect(body.contracts.some((c) => c.id === contractId)).toBe(true);
    expect(body.invoices.some((i) => i.id === invoiceId)).toBe(true);
  });

  it('terminating the contract releases the room', async () => {
    await request(app.getHttpServer())
      .patch(`/contracts/${contractId}`)
      .set(auth())
      .send({ status: 'TERMINATED' })
      .expect(200);
    const room = await request(app.getHttpServer())
      .get(`/rooms/${roomId}`)
      .set(auth())
      .expect(200);
    expect((room.body as { status: string }).status).toBe('AVAILABLE');
  });
});
