import { BadGatewayException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

export interface MasterDataRecord {
  id: number | string
  entity_type: string
  external_id: string | null
  deleted: boolean
  fields: Record<string, unknown>
}

export interface Page<T> {
  items: T[]
  next_cursor: string | null
}

@Injectable()
export class EduplusDirectoryClient {
  constructor(private readonly config: ConfigService) {}

  async getPage(
    entityType: string,
    accessToken: string,
    cursor?: string,
  ): Promise<Page<MasterDataRecord>> {
    const url = new URL(
      `/api/v1/open/userdata/master-data/${encodeURIComponent(entityType)}`,
      this.config.getOrThrow<string>('EDUPLUS_BASE_URL'),
    )
    url.searchParams.set('limit', '500')
    if (cursor) url.searchParams.set('cursor', cursor)
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (response.status === 401) throw new UnauthorizedException('EduPlus access token was rejected')
    if (response.status === 403) throw new ForbiddenException('EduPlus data policy denied access')
    if (!response.ok) throw new BadGatewayException('EduPlus master-data request failed')
    const page = (await response.json()) as {
      records?: MasterDataRecord[]
      next_cursor?: string | null
      has_more?: boolean
    }
    if (!Array.isArray(page.records)) {
      throw new BadGatewayException('EduPlus returned an invalid master-data page')
    }
    if (page.has_more && !page.next_cursor) {
      throw new BadGatewayException('EduPlus returned a page without its next cursor')
    }
    return { items: page.records, next_cursor: page.has_more ? page.next_cursor! : null }
  }
}
