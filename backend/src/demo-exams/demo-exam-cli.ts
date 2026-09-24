import { PrismaClient } from '@prisma/client'
import { runDemoSeed } from './demo-exam-seed'

export function parseDemoSeedArgs(argv: string[]): { tenantCode: string; apply: boolean } {
  const allowed = new Set(['--tenant=main09', '--apply', '--confirm=main09'])
  const unknown = argv.find((arg) => !allowed.has(arg))
  if (unknown && !unknown.startsWith('--tenant=')) throw new Error(`Unknown argument: ${unknown}`)
  if (!argv.includes('--tenant=main09') || argv.some((arg) => arg.startsWith('--tenant=') && arg !== '--tenant=main09')) {
    throw new Error('Only main09 is supported')
  }
  const apply = argv.includes('--apply')
  if (apply && !argv.includes('--confirm=main09')) throw new Error('main09 confirmation is required')
  return { tenantCode: 'main09', apply }
}

if (require.main === module) {
  const prisma = new PrismaClient()
  Promise.resolve()
    .then(() => parseDemoSeedArgs(process.argv.slice(2)))
    .then(({ tenantCode, apply }) => runDemoSeed(prisma, tenantCode, apply))
    .then((report) => process.stdout.write(`${JSON.stringify(report)}\n`))
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : 'Demo seed failed'}\n`)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
