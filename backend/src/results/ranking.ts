export function competitionRanks(values: Array<{ id: string; value: number }>) {
  const sorted = [...values].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
  let previousValue: number | undefined
  let previousRank = 0
  return sorted.map((row, index) => {
    const rank = previousValue === row.value ? previousRank : index + 1
    previousValue = row.value
    previousRank = rank
    return { ...row, rank }
  })
}
