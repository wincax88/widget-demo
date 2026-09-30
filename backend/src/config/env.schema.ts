const required = (env: Record<string, unknown>, key: string) => {
  const value = env[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${key} is required`)
  }
  return value.trim()
}

const validUrl = (env: Record<string, unknown>, key: string) => {
  const value = required(env, key)
  try {
    return new URL(value).toString().replace(/\/$/, '')
  } catch {
    throw new Error(`${key} must be a valid URL`)
  }
}

const optionalString = (env: Record<string, unknown>, key: string) => {
  const value = env[key]
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new Error(`${key} must be a string`)
  return value.trim()
}

const aiCenterOrigin = (env: Record<string, unknown>) => {
  const value = optionalString(env, 'AI_CENTER_BASE_URL')
  if (!value) return ''
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid origin')
    return url.origin
  } catch {
    throw new Error('AI_CENTER_BASE_URL must be an HTTP(S) origin without credentials, path, query or fragment')
  }
}

export function validateEnv(env: Record<string, unknown>) {
  const encryptionKey = required(env, 'CREDENTIAL_ENCRYPTION_KEY')
  if (!/^[A-Za-z0-9_-]{43}$/.test(encryptionKey)) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a 32-byte base64url value')
  }
  const aiKey = optionalString(env, 'AI_CENTER_API_KEY')
  if (/\s/.test(aiKey)) throw new Error('AI_CENTER_API_KEY must not contain whitespace')
  const aiModel = optionalString(env, 'AI_CENTER_MODEL')
  if (aiModel.length > 128) throw new Error('AI_CENTER_MODEL must not exceed 128 characters')
  const aiTimeout = env.AI_CENTER_TIMEOUT_MS === undefined || String(env.AI_CENTER_TIMEOUT_MS).trim() === ''
    ? 60000 : Number(env.AI_CENTER_TIMEOUT_MS)
  if (!Number.isInteger(aiTimeout) || aiTimeout < 1000 || aiTimeout > 120000) {
    throw new Error('AI_CENTER_TIMEOUT_MS must be an integer between 1000 and 120000')
  }

  return {
    ...env,
    DATABASE_URL: required(env, 'DATABASE_URL'),
    CREDENTIAL_ENCRYPTION_KEY: encryptionKey,
    EDUPLUS_WEBHOOK_SECRET: required(env, 'EDUPLUS_WEBHOOK_SECRET'),
    EDUPLUS_BASE_URL: validUrl(env, 'EDUPLUS_BASE_URL'),
    EDUPLUS_APP_CODE: required(env, 'EDUPLUS_APP_CODE'),
    APP_ORIGIN: validUrl(env, 'APP_ORIGIN'),
    EDUPLUS_WORKBENCH_ORIGIN: validUrl(env, 'EDUPLUS_WORKBENCH_ORIGIN'),
    PORT: Number(env.PORT ?? 8888),
    AI_CENTER_BASE_URL: aiCenterOrigin(env),
    AI_CENTER_API_KEY: aiKey,
    AI_CENTER_MODEL: aiModel,
    AI_CENTER_TIMEOUT_MS: aiTimeout,
  }
}
