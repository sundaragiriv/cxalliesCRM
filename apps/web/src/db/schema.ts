// Single source of truth for Drizzle's schema-aware features.
// Every table from every module is re-exported here; drizzle-kit reads this file.

export * from './enums'
export * from './shared-tables'

export * from '@/modules/auth/schema'
export * from '@/modules/parties/schema'
export * from '@/modules/files/schema'

export * from '@/modules/finance/schema'

// Phase 1 modules added by their tickets:
// export * from '@/modules/billing/schema';   // P1-09
// export * from '@/modules/crm/schema';       // P1-15
// export * from '@/modules/hr/schema';        // P1-13
// export * from '@/modules/reporting/schema'; // P1-22
// export * from '@/modules/ai/schema';        // P1-23
//
// Phase 2-4 skeletons (uncommented per phase):
// export * from '@/modules/support/schema';
// export * from '@/modules/marketing/schema';
// export * from '@/modules/payroll/schema';
