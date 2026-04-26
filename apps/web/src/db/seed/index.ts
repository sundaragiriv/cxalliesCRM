import { seedOrganizations } from './01-organizations'
import { seedBrands } from './02-brands'
import { seedBusinessLines } from './03-business-lines'
import { seedRoles } from './04-roles'

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

  console.log('Done.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
