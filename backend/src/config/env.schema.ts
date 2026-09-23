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

export function validateEnv(env: Record<string, unknown>) {
  const encryptionKey = required(env, 'CREDENTIAL_ENCRYPTION_KEY')
  if (!/^[A-Za-z0-9_-]{43}$/.test(encryptionKey)) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a 32-byte base64url value')
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
  }
}
