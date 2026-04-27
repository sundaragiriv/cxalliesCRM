import { seedOrganizations } from './01-organizations'
import { seedBrands } from './02-brands'
import { seedBusinessLines } from './03-business-lines'
import { seedRoles } from './04-roles'
import { seedParties } from './05-parties'
import { seedOwnerUser } from './06-users'
import { seedChartOfAccountsTemplates } from './07-coa-templates'
import { seedChartOfAccounts } from './08-chart-of-accounts'
import { seedCurrencies } from './09-currencies'
import { seedTimezones } from './10-timezones'
import { seedTaxRates } from './11-tax-rates'

async function main() {
  console.log('Seeding...')
  const organizationId = await seedOrganizations()
  console.log(`  ✓ organizations  (org id ${organizationId})`)

  await seedBrands(organizationId)
  console.log('  ✓ brands         (4 rows)')

  await seedBusinessLines(organizationId)
  console.log('  ✓ business_lines (4 rows)')

  await seedRoles()
  console.log('  ✓ roles          (5 rows)')

  const { venkataPartyId } = await seedParties(organizationId)
  console.log('  ✓ parties        (2 rows: Venkata, Poornima)')

  const ownerUserId = await seedOwnerUser(venkataPartyId)
  console.log(`  ✓ owner user     (user id ${ownerUserId})`)

  await seedChartOfAccountsTemplates()
  console.log('  ✓ coa templates  (multi-line-operator, 26 lines)')

  await seedChartOfAccounts(organizationId)
  // log line printed inside seedChartOfAccounts

  await seedCurrencies()
  console.log('  ✓ currencies     (44 ISO 4217 majors)')

  await seedTimezones()
  console.log('  ✓ timezones      (full IANA via Intl.supportedValuesOf)')

  await seedTaxRates()
  console.log('  ✓ tax_rates      (21 rows, 2026)')

  console.log('Done.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
