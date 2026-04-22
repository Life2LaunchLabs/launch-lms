import test from 'node:test'
import assert from 'node:assert/strict'

import { hasDashboardAccessForOrg } from './orgAccess.ts'

test('grants access to superadmins without org-specific roles', () => {
  assert.equal(
    hasDashboardAccessForOrg({
      session: {
        user: { is_superadmin: true },
        roles: [],
      },
      orgId: 99,
      orgUuid: 'org_99',
    }),
    true
  )
})

test('grants access when the user has dashboard rights in the target org', () => {
  assert.equal(
    hasDashboardAccessForOrg({
      session: {
        user: { is_superadmin: false },
        roles: [
          {
            org: { id: 2, org_uuid: 'org_2' },
            role: {
              rights: {
                dashboard: {
                  action_access: true,
                },
              },
            },
          },
        ],
      },
      orgId: 2,
      orgUuid: 'org_2',
    }),
    true
  )
})

test('denies access when dashboard rights only exist in a different org', () => {
  assert.equal(
    hasDashboardAccessForOrg({
      session: {
        user: { is_superadmin: false },
        roles: [
          {
            org: { id: 7, org_uuid: 'org_7' },
            role: {
              rights: {
                dashboard: {
                  action_access: true,
                },
              },
            },
          },
        ],
      },
      orgId: 1,
      orgUuid: 'org_1',
    }),
    false
  )
})
