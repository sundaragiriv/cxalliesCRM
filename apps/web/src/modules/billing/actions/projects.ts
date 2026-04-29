'use server'

import { and, eq } from 'drizzle-orm'
import { projects } from '../schema'
import { defineAction } from '@/lib/actions/define-action'
import { active } from '@/lib/db/active'
import { emitBillingEvent } from '../lib/event-emitter'
import { nextProjectNumber } from '../lib/projects/next-project-number'
import {
  createProjectSchema,
  softDeleteProjectSchema,
  updateProjectSchema,
} from './projects-schema'

const SOURCE_TABLE = 'billing_projects'

export const createProject = defineAction({
  permission: { module: 'billing', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'insert' },
  schema: createProjectSchema,
  handler: async (input, ctx) => {
    const year = new Date().getUTCFullYear()
    const projectNumber = await nextProjectNumber(
      ctx.tx,
      ctx.organizationId,
      year,
    )

    const [row] = await ctx.tx
      .insert(projects)
      .values({
        organizationId: ctx.organizationId,
        projectNumber,
        name: input.name,
        businessLineId: input.businessLineId,
        contractId: input.contractId ?? null,
        endClientPartyId: input.endClientPartyId ?? null,
        vendorPartyId: input.vendorPartyId ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        status: input.status,
        defaultBillableRateCents: input.defaultBillableRateCents,
        currencyCode: input.currencyCode,
        budgetHours: input.budgetHours ?? null,
        description: input.description ?? null,
      })
      .returning()

    if (!row) throw new Error('Failed to insert project')

    await emitBillingEvent(ctx.tx, 'billing.project.created', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      businessLineId: input.businessLineId,
      partyId: input.endClientPartyId ?? null,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Created project ${projectNumber} — ${input.name}`,
      metadata: { projectNumber, status: input.status },
    })

    return {
      result: { id: row.id, projectNumber },
      recordId: row.id,
      after: row,
    }
  },
})

export const updateProject = defineAction({
  permission: { module: 'billing', action: 'write' },
  audit: { table: SOURCE_TABLE, action: 'update' },
  schema: updateProjectSchema,
  handler: async (input, ctx) => {
    const [before] = await ctx.tx
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, input.id),
          eq(projects.organizationId, ctx.organizationId),
          active(projects),
        ),
      )
      .limit(1)
    if (!before) throw new Error('Project not found')

    const [row] = await ctx.tx
      .update(projects)
      .set({
        name: input.name,
        businessLineId: input.businessLineId,
        contractId: input.contractId ?? null,
        endClientPartyId: input.endClientPartyId ?? null,
        vendorPartyId: input.vendorPartyId ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        status: input.status,
        defaultBillableRateCents: input.defaultBillableRateCents,
        currencyCode: input.currencyCode,
        budgetHours: input.budgetHours ?? null,
        description: input.description ?? null,
      })
      .where(
        and(
          eq(projects.id, input.id),
          eq(projects.organizationId, ctx.organizationId),
        ),
      )
      .returning()

    if (!row) throw new Error('Failed to update project')

    await emitBillingEvent(ctx.tx, 'billing.project.updated', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      businessLineId: input.businessLineId,
      partyId: input.endClientPartyId ?? null,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Updated project ${row.projectNumber} — ${input.name}`,
    })

    return {
      result: { id: row.id },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})

export const softDeleteProject = defineAction({
  permission: { module: 'billing', action: 'delete' },
  audit: { table: SOURCE_TABLE, action: 'soft_delete' },
  schema: softDeleteProjectSchema,
  handler: async (input, ctx) => {
    const [before] = await ctx.tx
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, input.id),
          eq(projects.organizationId, ctx.organizationId),
          active(projects),
        ),
      )
      .limit(1)
    if (!before) throw new Error('Project not found')

    const [row] = await ctx.tx
      .update(projects)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(projects.id, input.id),
          eq(projects.organizationId, ctx.organizationId),
        ),
      )
      .returning()
    if (!row) throw new Error('Failed to soft-delete project')

    await emitBillingEvent(ctx.tx, 'billing.project.deleted', {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      businessLineId: before.businessLineId,
      partyId: before.endClientPartyId,
      entityTable: SOURCE_TABLE,
      entityId: row.id,
      summary: `Deleted project ${before.projectNumber}`,
    })

    return {
      result: { id: row.id },
      recordId: row.id,
      before: before as Record<string, unknown>,
      after: row as Record<string, unknown>,
    }
  },
})
