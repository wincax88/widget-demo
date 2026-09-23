import { spawn } from 'node:child_process'

const port = Number(process.env.SMOKE_PORT ?? 18080)
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 30_000)
const origin = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['dist/main.js'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(port) },
})

try {
  await waitFor(`${origin}/api/health/ready`)
  const health = await fetch(`${origin}/api/health/ready`)
  if (!health.ok || (await health.json()).status !== 'ok') throw new Error('readiness failed')
  const frontend = await fetch(origin, { headers: { accept: 'text/html' } })
  if (!frontend.ok || !(await frontend.text()).includes('<div id="root">')) {
    throw new Error('frontend shell failed')
  }
  const deepLink = await fetch(`${origin}/exams/example`, { headers: { accept: 'text/html' } })
  if (!deepLink.ok || !(await deepLink.text()).includes('<div id="root">')) {
    throw new Error('SPA deep-link fallback failed')
  }
  await expectApi404(`${origin}/api/not-a-route`)
  await expectApi404(`${origin}/v1/open/not-a-route`)
} finally {
  child.kill('SIGTERM')
}

async function waitFor(url) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`timed out waiting for ${url}`)
}

async function expectApi404(url) {
  const response = await fetch(url, { headers: { accept: 'text/html' } })
  const contentType = response.headers.get('content-type') ?? ''
  if (response.status !== 404 || !contentType.includes('application/json')) {
    throw new Error(`API route was intercepted by SPA fallback: ${url}`)
  }
}
