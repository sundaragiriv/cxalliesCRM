import { describe, it, expect } from 'vitest'
import {
  MODULES,
  ACTIONS,
  ROLE_IDS,
  PERMISSIONS_BY_ROLE,
  checkPermission,
} from '@/lib/auth/permissions'

describe('permissions matrix', () => {
  it('declares 11 modules and 4 actions and 5 roles', () => {
    expect(MODULES).toHaveLength(11)
    expect(ACTIONS).toEqual(['read', 'write', 'delete', 'admin'])
    expect(ROLE_IDS).toEqual(['owner', 'admin', 'bookkeeper', 'sales', 'support_agent'])
  })

  describe('owner', () => {
    it('has full access on every module and action', () => {
      for (const mod of MODULES) {
        for (const action of ACTIONS) {
          expect(checkPermission(['owner'], mod, action)).toBe(true)
        }
      }
    })
  })

  describe('admin', () => {
    it('has read/write/admin on every module', () => {
      for (const mod of MODULES) {
        expect(checkPermission(['admin'], mod, 'read')).toBe(true)
        expect(checkPermission(['admin'], mod, 'write')).toBe(true)
        expect(checkPermission(['admin'], mod, 'admin')).toBe(true)
      }
    })

    it('has no delete on any module', () => {
      for (const mod of MODULES) {
        expect(checkPermission(['admin'], mod, 'delete')).toBe(false)
      }
    })
  })

  describe('bookkeeper', () => {
    it('has full r/w/d/a on finance and billing', () => {
      for (const action of ACTIONS) {
        expect(checkPermission(['bookkeeper'], 'finance', action)).toBe(true)
        expect(checkPermission(['bookkeeper'], 'billing', action)).toBe(true)
      }
    })

    it('has read-only on crm and support', () => {
      expect(checkPermission(['bookkeeper'], 'crm', 'read')).toBe(true)
      expect(checkPermission(['bookkeeper'], 'crm', 'write')).toBe(false)
      expect(checkPermission(['bookkeeper'], 'support', 'read')).toBe(true)
      expect(checkPermission(['bookkeeper'], 'support', 'write')).toBe(false)
    })

    it('has no marketing access', () => {
      for (const action of ACTIONS) {
        expect(checkPermission(['bookkeeper'], 'marketing', action)).toBe(false)
      }
    })
  })

  describe('sales', () => {
    it('has full access on crm and marketing', () => {
      for (const action of ACTIONS) {
        expect(checkPermission(['sales'], 'crm', action)).toBe(true)
        expect(checkPermission(['sales'], 'marketing', action)).toBe(true)
      }
    })

    it('has read-only on finance (broad; record-level filtering is Phase 2)', () => {
      expect(checkPermission(['sales'], 'finance', 'read')).toBe(true)
      expect(checkPermission(['sales'], 'finance', 'write')).toBe(false)
    })

    it('has no payroll or support access', () => {
      for (const action of ACTIONS) {
        expect(checkPermission(['sales'], 'payroll', action)).toBe(false)
        expect(checkPermission(['sales'], 'support', action)).toBe(false)
      }
    })
  })

  describe('support_agent', () => {
    it('has full access on support', () => {
      for (const action of ACTIONS) {
        expect(checkPermission(['support_agent'], 'support', action)).toBe(true)
      }
    })

    it('has read on crm but no write', () => {
      expect(checkPermission(['support_agent'], 'crm', 'read')).toBe(true)
      expect(checkPermission(['support_agent'], 'crm', 'write')).toBe(false)
    })

    it('has no finance or billing access', () => {
      for (const action of ACTIONS) {
        expect(checkPermission(['support_agent'], 'finance', action)).toBe(false)
        expect(checkPermission(['support_agent'], 'billing', action)).toBe(false)
      }
    })
  })

  describe('multi-role union', () => {
    it('grants the union of granted permissions', () => {
      // bookkeeper has finance write; sales does not. Together: yes.
      expect(checkPermission(['sales', 'bookkeeper'], 'finance', 'write')).toBe(true)
    })

    it('returns false when no role grants the permission', () => {
      expect(checkPermission(['support_agent'], 'finance', 'read')).toBe(false)
    })

    it('ignores unknown role ids without crashing', () => {
      expect(checkPermission(['ghost_role'], 'parties', 'read')).toBe(false)
      expect(checkPermission(['owner', 'ghost_role'], 'parties', 'read')).toBe(true)
    })
  })

  it('has an entry for every role in PERMISSIONS_BY_ROLE', () => {
    for (const roleId of ROLE_IDS) {
      expect(PERMISSIONS_BY_ROLE[roleId]).toBeDefined()
    }
  })
})
