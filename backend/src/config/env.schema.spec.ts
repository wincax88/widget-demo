import { validateEnv } from './env.schema'

const base = {
  DATABASE_URL: 'postgresql://test@localhost/test',
  CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64url'),
  EDUPLUS_WEBHOOK_SECRET: 'test-secret',
  EDUPLUS_BASE_URL: 'https://eduplus.example.com',
  EDUPLUS_APP_CODE: 'widget-demo',
  APP_ORIGIN: 'https://exam.example.com',
  EDUPLUS_WORKBENCH_ORIGIN: 'https://eduplus.example.com',
}

describe('optional AI Center environment', () => {
  it('keeps AI optional with safe defaults', () => {
    expect(validateEnv(base)).toMatchObject({
      AI_CENTER_BASE_URL: '', AI_CENTER_API_KEY: '', AI_CENTER_MODEL: '', AI_CENTER_TIMEOUT_MS: 60000,
    })
  })

  it('normalizes an origin and trims server settings', () => {
    expect(validateEnv({ ...base, AI_CENTER_BASE_URL: ' https://ai.example.com/ ',
      AI_CENTER_API_KEY: ' example-test-key ', AI_CENTER_MODEL: ' model-a ', AI_CENTER_TIMEOUT_MS: '10000' })).toMatchObject({
      AI_CENTER_BASE_URL: 'https://ai.example.com', AI_CENTER_API_KEY: 'example-test-key',
      AI_CENTER_MODEL: 'model-a', AI_CENTER_TIMEOUT_MS: 10000,
    })
  })

  it.each(['file:///tmp/test', 'https://user:password@ai.example.com', 'https://ai.example.com/ai-center',
    'https://ai.example.com?key=secret', 'https://ai.example.com#fragment', 'not-a-url'])('rejects unsafe base URL %s', (url) => {
    expect(() => validateEnv({ ...base, AI_CENTER_BASE_URL: url })).toThrow('AI_CENTER_BASE_URL')
  })

  it.each(['0', '-1', '1000.5', 'NaN', '120001'])('rejects invalid timeout %s', (timeout) => {
    expect(() => validateEnv({ ...base, AI_CENTER_TIMEOUT_MS: timeout })).toThrow('AI_CENTER_TIMEOUT_MS')
  })

  it('treats blank optional settings as unset', () => {
    expect(validateEnv({ ...base, AI_CENTER_BASE_URL: ' ', AI_CENTER_API_KEY: ' ', AI_CENTER_MODEL: ' ', AI_CENTER_TIMEOUT_MS: '' }))
      .toMatchObject({ AI_CENTER_BASE_URL: '', AI_CENTER_API_KEY: '', AI_CENTER_MODEL: '', AI_CENTER_TIMEOUT_MS: 60000 })
  })

  it('rejects API Key line breaks without including the key in the error', () => {
    expect(() => validateEnv({ ...base, AI_CENTER_API_KEY: 'key-canary\r\nvalue' })).toThrow('AI_CENTER_API_KEY must not contain whitespace')
  })
})
