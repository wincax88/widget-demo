import { competitionRanks } from './ranking'

describe('competitionRanks', () => {
  it('uses deterministic competition ranking with skipped positions', () => {
    expect(competitionRanks([
      { id: 'd', value: 80 },
      { id: 'c', value: 90 },
      { id: 'a', value: 100 },
      { id: 'b', value: 90 },
    ])).toEqual([
      { id: 'a', value: 100, rank: 1 },
      { id: 'b', value: 90, rank: 2 },
      { id: 'c', value: 90, rank: 2 },
      { id: 'd', value: 80, rank: 4 },
    ])
  })
})
