export function allocateCentsByProportionalGap(
  gapCents: bigint[],
  distributableCents: bigint,
  capAtGap = true,
) {
  const totalGap = gapCents.reduce((total, gap) => total + gap, 0n);
  if (totalGap <= 0n || distributableCents <= 0n) {
    return gapCents.map(() => 0n);
  }

  const distributable =
    capAtGap && distributableCents > totalGap ? totalGap : distributableCents;
  const allocations = gapCents.map((gap) =>
    gap <= 0n ? 0n : (distributable * gap) / totalGap,
  );
  let assigned = allocations.reduce((total, amount) => total + amount, 0n);
  const remainders = gapCents
    .map((gap, index) => ({
      index,
      remainder: gap <= 0n ? 0n : (distributable * gap) % totalGap,
    }))
    .filter(
      ({ index }) =>
        gapCents[index] > 0n &&
        (!capAtGap || allocations[index] < gapCents[index]),
    )
    .sort((left, right) =>
      left.remainder === right.remainder
        ? left.index - right.index
        : left.remainder > right.remainder
          ? -1
          : 1,
    );

  for (const { index } of remainders) {
    if (assigned >= distributable) break;
    allocations[index] += 1n;
    assigned += 1n;
  }
  return allocations;
}
