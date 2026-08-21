import { z } from 'zod';
import { simpleCrudRouter } from '../controllers/simpleCrudController.js';

export const categoriesRouter = simpleCrudRouter({
  table: 'categories',
  entityName: 'Category',
  permissionModule: 'catalog',
  searchColumns: ['name', 'description'],
  defaultSort: 'name',
  allowedColumns: new Set(['name', 'description', 'applies_to', 'is_active']),
  createSchema: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    appliesTo: z.enum(['product', 'service']).nullable().optional(),
    isActive: z.boolean().optional(),
  }),
  updateSchema: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    appliesTo: z.enum(['product', 'service']).nullable().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const unitsRouter = simpleCrudRouter({
  table: 'units',
  entityName: 'Unit',
  permissionModule: 'catalog',
  searchColumns: ['name', 'abbreviation'],
  defaultSort: 'name',
  allowedColumns: new Set(['name', 'abbreviation', 'is_active']),
  createSchema: z.object({
    name: z.string().min(1).max(100),
    abbreviation: z.string().min(1).max(20),
    isActive: z.boolean().optional(),
  }),
  updateSchema: z.object({
    name: z.string().min(1).max(100).optional(),
    abbreviation: z.string().min(1).max(20).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const taxesRouter = simpleCrudRouter({
  table: 'taxes',
  entityName: 'Tax',
  permissionModule: 'tax',
  searchColumns: ['name', 'description'],
  defaultSort: 'rate',
  allowedColumns: new Set(['name', 'rate', 'description', 'is_active']),
  createSchema: z.object({
    name: z.string().min(1).max(100),
    rate: z.number().min(0).max(100),
    description: z.string().max(2000).nullable().optional(),
    isActive: z.boolean().optional(),
  }),
  updateSchema: z.object({
    name: z.string().min(1).max(100).optional(),
    rate: z.number().min(0).max(100).optional(),
    description: z.string().max(2000).nullable().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const paymentMethodsRouter = simpleCrudRouter({
  table: 'payment_methods',
  entityName: 'Payment method',
  permissionModule: 'settings',
  searchColumns: ['name'],
  defaultSort: 'sort_order',
  allowedColumns: new Set(['name', 'description', 'requires_reference', 'is_active', 'sort_order']),
  createSchema: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).nullable().optional(),
    requiresReference: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
  updateSchema: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    requiresReference: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
});
