import { createServer, Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { OidcVerifier } from './oidc-verifier'

describe('OidcVerifier', () => {
  let server: Server
  let jwksUri: string
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey']

  beforeAll(async () => {
    const keys = await generateKeyPair('RS256')
    privateKey = keys.privateKey
    const publicJwk = await exportJWK(keys.publicKey)
    server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ keys: [{ ...publicJwk, kid: 'test-key', alg: 'RS256' }] }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    jwksUri = `http://127.0.0.1:${address.port}/jwks`
  })

  afterAll(() => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))))

  it('validates issuer, client and EduPlus compact identity claims', async () => {
    const issuer = 'https://issuer.example.com/realms/eduplus'
    const token = await new SignJWT({
      azp: 'client-1',
      tid: 42,
      eui: 'user-42',
      eit: 'tch',
      name: 'Teacher',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience('eduplus-app')
      .setSubject('keycloak-user')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)

    await expect(
      new OidcVerifier().verify(token, { issuer, clientId: 'client-1', jwksUri }),
    ).resolves.toMatchObject({
      sub: 'keycloak-user',
      tenantId: '42',
      identityId: 'user-42',
      identityType: 'TEACHER',
      clientId: 'client-1',
    })
    await expect(
      new OidcVerifier().verify(token, { issuer, clientId: 'other-client', jwksUri }),
    ).rejects.toThrow('OIDC token validation failed')
  })

  it('validates the complete widget-data audience and authorization context', async () => {
    const issuer = 'https://issuer.example.com/realms/eduplus'
    const token = await new SignJWT({
      azp: 'client-1',
      tid: 42,
      eui: 'identity-42',
      eit: 'stu',
      handoff_type: 'widget_data',
      app_code: 'exam-results',
      config_snapshot_id: 'snapshot-1',
      scope: 'widget.data.read',
      widget_keys: ['exam-latest-summary', 'exam-score-table'],
      data_endpoint_keys: ['exam-latest-summary', 'exam-score-table'],
      widget_endpoint_pairs: [
        { widget_key: 'exam-latest-summary', data_endpoint_key: 'exam-latest-summary' },
        { widget_key: 'exam-score-table', data_endpoint_key: 'exam-score-table' },
      ],
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience('app:exam-results:widget-data')
      .setSubject('keycloak-user')
      .setJti('widget-jti')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)

    const verifier = new OidcVerifier()
    await expect(verifier.verifyWidget(token, {
      issuer,
      clientId: 'client-1',
      jwksUri,
      appCode: 'exam-results',
    })).resolves.toMatchObject({
      sub: 'keycloak-user',
      tenantId: '42',
      identityId: 'identity-42',
      identityType: 'STUDENT',
      clientId: 'client-1',
      appCode: 'exam-results',
      configSnapshotId: 'snapshot-1',
      scope: 'widget.data.read',
      widgetKeys: ['exam-latest-summary', 'exam-score-table'],
      dataEndpointKeys: ['exam-latest-summary', 'exam-score-table'],
    })

    await expect(verifier.verifyWidget(token, {
      issuer,
      clientId: 'client-1',
      jwksUri,
      appCode: 'another-app',
    })).rejects.toThrow('OIDC widget token validation failed')
  })

  it.each([
    ['wrong handoff type', { handoff_type: 'app_launch' }],
    ['wrong scope', { scope: 'openid' }],
    ['missing endpoint authorization', { data_endpoint_keys: [] }],
  ])('rejects widget tokens with %s', async (_label, override) => {
    const issuer = 'https://issuer.example.com/realms/eduplus'
    const claims = {
      azp: 'client-1', tid: 42, eui: 'identity-42', eit: 'stu',
      handoff_type: 'widget_data', app_code: 'exam-results', config_snapshot_id: 'snapshot-1',
      scope: 'widget.data.read', widget_keys: ['exam-score-table'],
      data_endpoint_keys: ['exam-score-table'],
      widget_endpoint_pairs: [{ widget_key: 'exam-score-table', data_endpoint_key: 'exam-score-table' }],
      ...override,
    }
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience('app:exam-results:widget-data')
      .setSubject('keycloak-user')
      .setJti('widget-jti')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)

    await expect(new OidcVerifier().verifyWidget(token, {
      issuer, clientId: 'client-1', jwksUri, appCode: 'exam-results',
    })).rejects.toThrow('OIDC widget token validation failed')
  })

  it('requires exp and accepts an expired current token only inside the explicit grace window', async () => {
    const issuer = 'https://issuer.example.com/realms/eduplus'
    const claims = {
      azp: 'client-1', tid: 42, eui: 'identity-42', eit: 'stu',
      handoff_type: 'widget_data', app_code: 'exam-results', config_snapshot_id: 'snapshot-1',
      scope: 'widget.data.read', widget_keys: ['exam-score-table'],
      data_endpoint_keys: ['exam-score-table'],
      widget_endpoint_pairs: [{ widget_key: 'exam-score-table', data_endpoint_key: 'exam-score-table' }],
    }
    const sign = (expiration?: number) => {
      let builder = new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer(issuer).setAudience('app:exam-results:widget-data')
        .setSubject('keycloak-user').setJti('widget-jti').setIssuedAt()
      if (expiration !== undefined) builder = builder.setExpirationTime(expiration)
      return builder.sign(privateKey)
    }
    const context = { issuer, clientId: 'client-1', jwksUri, appCode: 'exam-results' }

    await expect(new OidcVerifier().verifyWidget(await sign(), context))
      .rejects.toThrow('OIDC widget token validation failed')
    const recentlyExpired = await sign(Math.floor(Date.now() / 1000) - 30)
    await expect(new OidcVerifier().verifyWidget(recentlyExpired, context))
      .rejects.toThrow('OIDC widget token validation failed')
    await expect(new OidcVerifier().verifyWidget(recentlyExpired, {
      ...context, clockToleranceSeconds: 90,
    })).resolves.toMatchObject({ sub: 'keycloak-user' })
    await expect(new OidcVerifier().verifyWidget(
      await sign(Math.floor(Date.now() / 1000) - 120),
      { ...context, clockToleranceSeconds: 90 },
    )).rejects.toThrow('OIDC widget token validation failed')
  })

  it.each([
    ['additional audience', ['app:exam-results:widget-data', 'other-api'], 'widget.data.read'],
    ['additional scope', 'app:exam-results:widget-data', 'widget.data.read admin'],
  ])('rejects an %s', async (_label, audience, scope) => {
    const issuer = 'https://issuer.example.com/realms/eduplus'
    const token = await new SignJWT({
      azp: 'client-1', tid: 42, eui: 'identity-42', eit: 'stu',
      handoff_type: 'widget_data', app_code: 'exam-results', config_snapshot_id: 'snapshot-1',
      scope, widget_keys: ['exam-score-table'], data_endpoint_keys: ['exam-score-table'],
      widget_endpoint_pairs: [{ widget_key: 'exam-score-table', data_endpoint_key: 'exam-score-table' }],
    }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuer).setAudience(audience).setSubject('keycloak-user')
      .setJti('widget-jti').setIssuedAt().setExpirationTime('5m').sign(privateKey)

    await expect(new OidcVerifier().verifyWidget(token, {
      issuer, clientId: 'client-1', jwksUri, appCode: 'exam-results',
    })).rejects.toThrow('OIDC widget token validation failed')
  })
})
