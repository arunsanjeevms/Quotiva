import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { allowedOrigins, env } from './config/env.js';
import { requestId } from './middleware/requestId.js';
import { authenticate } from './middleware/authenticate.js';
import { resolveTenant } from './middleware/resolveTenant.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

import { bootstrapRouter } from './routes/bootstrap.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { customersRouter } from './routes/customers.routes.js';
import { productsRouter } from './routes/products.routes.js';
import { categoriesRouter, paymentMethodsRouter, taxesRouter, unitsRouter } from './routes/catalogSettings.routes.js';
import { quotationsRouter } from './routes/quotations.routes.js';
import { invoicesRouter } from './routes/invoices.routes.js';
import { paymentsRouter } from './routes/payments.routes.js';
import { settingsRouter } from './routes/settings.routes.js';
import { membersRouter, rolesRouter, auditLogsRouter } from './routes/workspace.routes.js';
import { searchRouter } from './routes/search.routes.js';
import { backupsRouter, notImplementedRouter, notificationsRouter } from './routes/notImplemented.routes.js';
import { reportsRouter } from './routes/reports.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Business-Id', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(requestId);

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Every route below requires a verified Supabase session.
  app.use('/api', authenticate);

  app.use('/api/bootstrap', bootstrapRouter);

  // Every route below additionally requires X-Business-Id to resolve to an
  // active membership, and attaches req.tenant (docs/02 §request path).
  app.use('/api', resolveTenant);

  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/units', unitsRouter);
  app.use('/api/taxes', taxesRouter);
  app.use('/api/payment-methods', paymentMethodsRouter);
  app.use('/api/quotations', quotationsRouter);
  app.use('/api/invoices', invoicesRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/members', membersRouter);
  app.use('/api/roles', rolesRouter);
  app.use('/api/audit-logs', auditLogsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/reports', reportsRouter);

  // Scoped for a later phase — honest empty lists, refused writes (docs/10 Phase 12).
  app.use('/api/recurring-invoices', notImplementedRouter('Recurring invoices'));
  app.use('/api/reminder-rules', notImplementedRouter('Reminder rules'));
  app.use('/api/custom-fields', notImplementedRouter('Custom fields'));
  app.use('/api/email-templates', notImplementedRouter('Email templates'));
  app.use('/api/backups', backupsRouter);
  app.use('/api/notifications', notificationsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
