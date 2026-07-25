import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

interface LoginBody {
  accessToken: string;
  user: { role: string; password?: string };
}
interface MeBody {
  username: string;
}
interface CreateUserBody {
  id: number;
  role: string;
}
interface ErrorBody {
  message: string;
}

const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin';
const E2E_MANAGER_USERNAME = 'e2e_manager';
const E2E_MANAGER_EMAIL = 'e2e-manager@test.local';

describe('Auth & Users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let managerId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { username: E2E_MANAGER_USERNAME } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: E2E_MANAGER_USERNAME } });
    await app.close();
  });

  it('rejects a login with wrong credentials (generic message)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: ADMIN_USERNAME, password: 'definitely-wrong' })
      .expect(401);
    expect((res.body as ErrorBody).message).toBe(
      'Tên đăng nhập hoặc mật khẩu không đúng',
    );
  });

  it('logs in the seeded admin', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
      .expect(200);
    const body = res.body as LoginBody;
    expect(body.accessToken).toBeDefined();
    expect(body.user.role).toBe('ADMIN');
    expect(body.user.password).toBeUndefined();
    adminToken = body.accessToken;
  });

  it('rejects /auth/me without a token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('returns the current user on /auth/me', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((res.body as MeBody).username).toBe(ADMIN_USERNAME);
  });

  it('rejects /users without a token', async () => {
    await request(app.getHttpServer()).get('/users').expect(401);
  });

  it('lets the admin create a manager', async () => {
    const res = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: E2E_MANAGER_USERNAME,
        email: E2E_MANAGER_EMAIL,
        password: 'Manager@123',
        name: 'E2E Manager',
      })
      .expect(201);
    const body = res.body as CreateUserBody;
    expect(body.role).toBe('MANAGER');
    managerId = body.id;
  });

  it('rejects invalid create payloads (validation pipe)', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'no',
        email: 'not-an-email',
        password: 'short',
        name: '',
      })
      .expect(400);
  });

  it('forbids a manager from listing users', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: E2E_MANAGER_USERNAME, password: 'Manager@123' })
      .expect(200);
    managerToken = (login.body as LoginBody).accessToken;
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(403);
  });

  it('invalidates existing tokens when the admin resets the manager password', async () => {
    await request(app.getHttpServer())
      .patch(`/users/${managerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'Rotated@123' })
      .expect(200);
    // old manager token now fails the tokenVersion check
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(401);
  });

  it('lets the admin delete the manager', async () => {
    await request(app.getHttpServer())
      .delete(`/users/${managerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });
});
