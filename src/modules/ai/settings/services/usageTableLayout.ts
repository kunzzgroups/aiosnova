// Pack complete rows within a compact density range; never expand sparse rows.
export function usageTableLayout(available:number, preferred:number, minimum:number, lastPage=false) {
  const floor=Math.max(1,minimum),usable=Math.max(0,available-1)
  const capacity=Math.max(1,Math.floor(usable/floor))
  const natural=Math.max(floor,preferred)
  // Share a few remaining pixels on complete pages, without enlarging sparse
  // results or turning a short viewport's single row into a tall placeholder.
  const ceiling=lastPage?natural:natural+Math.min(8,floor/capacity)
  return {capacity,rowHeight:Math.max(floor,Math.min(ceiling,usable/capacity))}
}
