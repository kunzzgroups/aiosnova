// Count Auto rows before distributing spare space, so fitted row heights never
// reduce the next capacity measurement. Only complete non-final pages fill.
export function modelTableLayout(available: number, natural: number, pageSize: number, rowCount: number, lastPage: boolean) {
  const naturalHeight = Math.max(1, natural)
  const usable = Math.max(0, available - 1)
  const autoPageSize = Math.max(1, Math.floor(usable / naturalHeight))
  const rowHeight = rowCount === (pageSize || autoPageSize) && !lastPage && naturalHeight * rowCount < usable
    ? usable / rowCount : null
  return {autoPageSize, rowHeight}
}
