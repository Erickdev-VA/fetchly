/**
 * `list` with the items `moved` picks taken out and put back, in their
 * order, right before (or after) `target`. Unchanged if `target` is one of
 * the moved ones or isn't there. Returns a new array.
 */
export function moveBeside<T>(list: T[], moved: (item: T) => boolean, target: (item: T) => boolean, after: boolean): T[] {
  const taken = list.filter(moved);
  const rest = list.filter((item) => !moved(item));
  const at = rest.findIndex(target);
  if (taken.length === 0 || at < 0) return list;
  rest.splice(after ? at + 1 : at, 0, ...taken);
  return rest;
}

/** moveBeside for a list of ids. */
export function moveIds(ids: string[], moved: Iterable<string>, target: string, after: boolean): string[] {
  const set = new Set(moved);
  return moveBeside(ids, (id) => set.has(id), (id) => id === target, after);
}
