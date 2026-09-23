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
})
