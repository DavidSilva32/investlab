export type AllocationPosition = {
  assetKey: string;
  valueCents: bigint;
  objectiveId: string | null;
};

export type AllocationTarget = {
  objectiveId: string;
  amountCents: bigint;
};

export type AllocationResult = {
  optimal: boolean;
  exploredStates: number;
  allocation: Record<string, string | null>;
  totals: Record<string, bigint>;
  differenceCents: bigint;
  transferCount: number;
  changedAssignmentCount: number;
};

const defaultStateLimit = 12_000_000;
const meetInMiddlePositionLimit = 25;
const maxInt64 = 9_223_372_036_854_775_807n;
export const portfolioObjectiveAllocationStateLimit = defaultStateLimit;

function absolute(value: bigint) {
  return value < 0n ? -value : value;
}

function allocationScore(
  allocation: Record<string, string | null>,
  positions: AllocationPosition[],
  targets: AllocationTarget[],
) {
  const totals = Object.fromEntries(
    targets.map((target) => [target.objectiveId, 0n]),
  );
  let transferCount = 0;
  let changedAssignmentCount = 0;
  for (const position of positions) {
    const destination = allocation[position.assetKey] ?? null;
    if (destination !== position.objectiveId) changedAssignmentCount += 1;
    if (
      position.objectiveId &&
      destination &&
      position.objectiveId !== destination
    ) {
      transferCount += 1;
    }
    if (destination && destination in totals)
      totals[destination] += position.valueCents;
  }
  const differenceCents = targets.reduce(
    (total, target) =>
      total + absolute(target.amountCents - totals[target.objectiveId]),
    0n,
  );
  return { totals, differenceCents, transferCount, changedAssignmentCount };
}

function compareAllocationKeys(
  left: Record<string, string | null>,
  right: Record<string, string | null>,
  positions: AllocationPosition[],
) {
  for (const position of positions) {
    const a = left[position.assetKey] ?? "";
    const b = right[position.assetKey] ?? "";
    if (a !== b) return a < b ? -1 : 1;
  }
  return 0;
}

type HalfCollection = {
  x: BigInt64Array;
  y: BigInt64Array;
  codes: Uint32Array;
  lexCodes: Uint32Array;
  transfers: Uint8Array;
  changes: Uint8Array;
  count: number;
  truncated: boolean;
};

function collectHalf(
  positions: AllocationPosition[],
  targets: AllocationTarget[],
  start: number,
  end: number,
  stateLimit: number,
): HalfCollection {
  const capacity = Math.min(
    3 ** (end - start),
    Math.max(0, Math.floor(stateLimit)),
  );
  const collection: HalfCollection = {
    x: new BigInt64Array(capacity),
    y: new BigInt64Array(capacity),
    codes: new Uint32Array(capacity),
    lexCodes: new Uint32Array(capacity),
    transfers: new Uint8Array(capacity),
    changes: new Uint8Array(capacity),
    count: 0,
    truncated: false,
  };
  const targetIndex = new Map(
    targets.map((target, index) => [target.objectiveId, index]),
  );
  const powers = Array.from({ length: end - start }, (_, index) => 3 ** index);
  const visit = (
    index: number,
    x: bigint,
    y: bigint,
    code: number,
    lexCode: number,
    transfers: number,
    changes: number,
  ) => {
    if (collection.count >= stateLimit) {
      collection.truncated = true;
      return;
    }
    if (index === end) {
      const slot = collection.count++;
      collection.x[slot] = x;
      collection.y[slot] = y;
      collection.codes[slot] = code;
      collection.lexCodes[slot] = lexCode;
      collection.transfers[slot] = transfers;
      collection.changes[slot] = changes;
      return;
    }
    const position = positions[index];
    const original = position.objectiveId;
    const choices: Array<{ id: string | null; digit: number }> = [
      { id: targets[0].objectiveId, digit: 1 },
      { id: targets[1].objectiveId, digit: 2 },
      { id: null, digit: 0 },
    ];
    const originalIndex =
      original === null ? undefined : targetIndex.get(original);
    if (originalIndex !== undefined) {
      choices.sort(
        (left, right) =>
          Number(right.id === original) - Number(left.id === original),
      );
    }
    for (const choice of choices) {
      const nextX =
        x + (choice.id === targets[0].objectiveId ? position.valueCents : 0n);
      const nextY =
        y + (choice.id === targets[1].objectiveId ? position.valueCents : 0n);
      const changed = choice.id !== original;
      const transfer = Boolean(original && choice.id && original !== choice.id);
      visit(
        index + 1,
        nextX,
        nextY,
        code + choice.digit * powers[index - start],
        lexCode * 3 + choice.digit,
        transfers + Number(transfer),
        changes + Number(changed),
      );
    }
  };
  visit(start, 0n, 0n, 0, 0, 0, 0);
  return collection;
}

function codeDestination(code: number, index: number) {
  let remaining = code;
  for (let digit = 0; digit < index; digit += 1)
    remaining = Math.floor(remaining / 3);
  return remaining % 3;
}

function buildAllocationFromCodes(
  positions: AllocationPosition[],
  splitIndex: number,
  leftCode: number,
  rightCode: number,
  targets: AllocationTarget[],
) {
  return Object.fromEntries(
    positions.map((position, index) => {
      const destination = codeDestination(
        index < splitIndex ? leftCode : rightCode,
        index < splitIndex ? index : index - splitIndex,
      );
      return [
        position.assetKey,
        destination === 0 ? null : targets[destination - 1].objectiveId,
      ];
    }),
  );
}

function solveTwoTargetMeetInMiddle(
  positions: AllocationPosition[],
  targets: AllocationTarget[],
  stateLimit: number,
): AllocationResult {
  const splitIndex = Math.floor(positions.length / 2);
  const right = collectHalf(
    positions,
    targets,
    splitIndex,
    positions.length,
    stateLimit,
  );
  let exploredStates = right.count;
  let hitLimit = right.truncated;
  if (hitLimit) {
    const allocation = Object.fromEntries(
      positions.map((position) => [position.assetKey, position.objectiveId]),
    );
    return {
      optimal: false,
      exploredStates: stateLimit,
      allocation,
      ...allocationScore(allocation, positions, targets),
    };
  }
  let bestAllocation: Record<string, string | null> = Object.fromEntries(
    positions.map((position) => [position.assetKey, position.objectiveId]),
  );
  let bestScore = allocationScore(bestAllocation, positions, targets);
  const order = new Uint32Array(right.count);
  for (let index = 0; index < right.count; index += 1) order[index] = index;
  const compareCoordinates = (left: number, rightIndex: number) => {
    if (right.x[left] !== right.x[rightIndex])
      return right.x[left] < right.x[rightIndex] ? -1 : 1;
    if (right.y[left] !== right.y[rightIndex])
      return right.y[left] < right.y[rightIndex] ? -1 : 1;
    return 0;
  };
  order.sort(compareCoordinates);
  let uniqueCount = 0;
  for (let index = 0; index < right.count;) {
    let end = index + 1;
    let bestPoint = order[index];
    while (
      end < right.count &&
      compareCoordinates(bestPoint, order[end]) === 0
    ) {
      const candidate = order[end];
      if (
        right.transfers[candidate] < right.transfers[bestPoint] ||
        (right.transfers[candidate] === right.transfers[bestPoint] &&
          (right.changes[candidate] < right.changes[bestPoint] ||
            (right.changes[candidate] === right.changes[bestPoint] &&
              right.lexCodes[candidate] < right.lexCodes[bestPoint])))
      ) {
        bestPoint = candidate;
      }
      end += 1;
    }
    order[uniqueCount++] = bestPoint;
    index = end;
  }
  const xGroupCapacity = Math.min(
    2 ** (positions.length - splitIndex),
    uniqueCount,
  );
  const xGroupValues = new BigInt64Array(xGroupCapacity);
  const xGroupStarts = new Int32Array(xGroupCapacity);
  const xGroupEnds = new Int32Array(xGroupCapacity);
  let xGroupCount = 0;
  for (let index = 0; index < uniqueCount; index += 1) {
    const point = order[index];
    if (xGroupCount === 0 || right.x[point] !== xGroupValues[xGroupCount - 1]) {
      if (xGroupCount > 0) xGroupEnds[xGroupCount - 1] = index;
      xGroupValues[xGroupCount] = right.x[point];
      xGroupStarts[xGroupCount] = index;
      xGroupCount += 1;
    }
  }
  xGroupEnds[xGroupCount - 1] = uniqueCount;
  const lookupExact = (x: bigint, y: bigint) => {
    let low = 0;
    let high = uniqueCount;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const point = order[middle];
      if (right.x[point] < x || (right.x[point] === x && right.y[point] < y))
        low = middle + 1;
      else high = middle;
    }
    if (low >= uniqueCount) return -1;
    const point = order[low];
    return right.x[point] === x && right.y[point] === y ? point : -1;
  };
  let exactSearchStates = 0;
  let exactFound = false;
  const visitLeftForExact = (
    index: number,
    x: bigint,
    y: bigint,
    code: number,
  ) => {
    if (exploredStates + exactSearchStates >= stateLimit) {
      hitLimit = true;
      return;
    }
    if (index === splitIndex) {
      exactSearchStates += 1;
      const point = lookupExact(
        targets[0].amountCents - x,
        targets[1].amountCents - y,
      );
      if (point < 0) return;
      exactFound = true;
      const allocation = buildAllocationFromCodes(
        positions,
        splitIndex,
        code,
        right.codes[point],
        targets,
      );
      const score = allocationScore(allocation, positions, targets);
      if (
        score.differenceCents < bestScore.differenceCents ||
        (score.differenceCents === bestScore.differenceCents &&
          (score.transferCount < bestScore.transferCount ||
            (score.transferCount === bestScore.transferCount &&
              (score.changedAssignmentCount <
                bestScore.changedAssignmentCount ||
                (score.changedAssignmentCount ===
                  bestScore.changedAssignmentCount &&
                  compareAllocationKeys(allocation, bestAllocation, positions) <
                    0)))))
      ) {
        bestAllocation = allocation;
        bestScore = score;
      }
      return;
    }
    const position = positions[index];
    const choices = [
      { id: targets[0].objectiveId, digit: 1 },
      { id: targets[1].objectiveId, digit: 2 },
      { id: null, digit: 0 },
    ];
    choices.sort(
      (left, rightChoice) =>
        Number(rightChoice.id === position.objectiveId) -
        Number(left.id === position.objectiveId),
    );
    for (const choice of choices) {
      const nextX =
        x + (choice.id === targets[0].objectiveId ? position.valueCents : 0n);
      const nextY =
        y + (choice.id === targets[1].objectiveId ? position.valueCents : 0n);
      visitLeftForExact(
        index + 1,
        nextX,
        nextY,
        code + choice.digit * 3 ** index,
      );
      if (hitLimit) return;
    }
  };
  visitLeftForExact(0, 0n, 0n, 0);
  exploredStates += exactSearchStates;
  if (exactFound && !hitLimit) {
    return {
      optimal: true,
      exploredStates,
      allocation: bestAllocation,
      ...bestScore,
    };
  }
  // For tiny known gaps, enumerate the complete Manhattan shell in cents.
  // This is only a search optimization; no amount is accepted as "close enough".
  const smallDifferenceRadius = 2n;
  if (!hitLimit && bestScore.differenceCents <= smallDifferenceRadius) {
    let radiusSearchStates = 0;
    const findXGroup = (x: bigint) => {
      let low = 0;
      let high = xGroupCount;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (xGroupValues[middle] < x) low = middle + 1;
        else high = middle;
      }
      return low < xGroupCount && xGroupValues[low] === x ? low : -1;
    };
    const visitLeftForRadius = (
      index: number,
      x: bigint,
      y: bigint,
      code: number,
      transfers: number,
      changes: number,
    ) => {
      if (exploredStates + radiusSearchStates >= stateLimit) {
        hitLimit = true;
        return;
      }
      if (index === splitIndex) {
        radiusSearchStates += 1;
        const wantedX = targets[0].amountCents - x;
        const wantedY = targets[1].amountCents - y;
        const radius = Number(bestScore.differenceCents);
        for (let dx = -radius; dx <= radius; dx += 1) {
          const remaining = radius - Math.abs(dx);
          const groupIndex = findXGroup(wantedX + BigInt(dx));
          if (groupIndex < 0) continue;
          const start = xGroupStarts[groupIndex];
          const end = xGroupEnds[groupIndex];
          let low = start;
          let high = end;
          const minimumY = wantedY - BigInt(remaining);
          while (low < high) {
            const middle = Math.floor((low + high) / 2);
            if (right.y[order[middle]] < minimumY) low = middle + 1;
            else high = middle;
          }
          for (let pointIndex = low; pointIndex < end; pointIndex += 1) {
            const point = order[pointIndex];
            const deltaY = right.y[point] - wantedY;
            if (deltaY > BigInt(remaining)) break;
            if (exploredStates + radiusSearchStates >= stateLimit) {
              hitLimit = true;
              return;
            }
            radiusSearchStates += 1;
            const allocation = buildAllocationFromCodes(
              positions,
              splitIndex,
              code,
              right.codes[point],
              targets,
            );
            const score = allocationScore(allocation, positions, targets);
            if (
              score.differenceCents < bestScore.differenceCents ||
              (score.differenceCents === bestScore.differenceCents &&
                (score.transferCount < bestScore.transferCount ||
                  (score.transferCount === bestScore.transferCount &&
                    (score.changedAssignmentCount <
                      bestScore.changedAssignmentCount ||
                      (score.changedAssignmentCount ===
                        bestScore.changedAssignmentCount &&
                        compareAllocationKeys(
                          allocation,
                          bestAllocation,
                          positions,
                        ) < 0)))))
            ) {
              bestAllocation = allocation;
              bestScore = score;
            }
          }
        }
        return;
      }
      const position = positions[index];
      const choices = [
        { id: targets[0].objectiveId, digit: 1 },
        { id: targets[1].objectiveId, digit: 2 },
        { id: null, digit: 0 },
      ];
      choices.sort(
        (left, rightChoice) =>
          Number(rightChoice.id === position.objectiveId) -
          Number(left.id === position.objectiveId),
      );
      for (const choice of choices) {
        const nextX =
          x + (choice.id === targets[0].objectiveId ? position.valueCents : 0n);
        const nextY =
          y + (choice.id === targets[1].objectiveId ? position.valueCents : 0n);
        const changed = choice.id !== position.objectiveId;
        const transfer = Boolean(
          position.objectiveId &&
          choice.id &&
          position.objectiveId !== choice.id,
        );
        visitLeftForRadius(
          index + 1,
          nextX,
          nextY,
          code + choice.digit * 3 ** index,
          transfers + Number(transfer),
          changes + Number(changed),
        );
        if (hitLimit) return;
      }
    };
    visitLeftForRadius(0, 0n, 0n, 0, 0, 0);
    exploredStates += radiusSearchStates;
    if (!hitLimit) {
      return {
        optimal: true,
        exploredStates,
        allocation: bestAllocation,
        ...bestScore,
      };
    }
  }
  if (hitLimit) {
    return {
      optimal: false,
      exploredStates: Math.min(exploredStates, stateLimit),
      allocation: bestAllocation,
      ...bestScore,
    };
  }
  for (let index = 0; index < right.count; index += 1) order[index] = index;
  const leftChild = new Int32Array(right.count).fill(-1);
  const rightChild = new Int32Array(right.count).fill(-1);
  const xMin = new BigInt64Array(right.count);
  const xMax = new BigInt64Array(right.count);
  const yMin = new BigInt64Array(right.count);
  const yMax = new BigInt64Array(right.count);
  const minTransfers = new Uint8Array(right.count);
  const minChanges = new Uint8Array(right.count);
  const comparePoint = (a: number, b: number, axis: number) => {
    const primaryA = axis === 0 ? right.x[a] : right.y[a];
    const primaryB = axis === 0 ? right.x[b] : right.y[b];
    if (primaryA !== primaryB) return primaryA < primaryB ? -1 : 1;
    const secondaryA = axis === 0 ? right.y[a] : right.x[a];
    const secondaryB = axis === 0 ? right.y[b] : right.x[b];
    if (secondaryA !== secondaryB) return secondaryA < secondaryB ? -1 : 1;
    return a - b;
  };
  const selectMedian = (
    low: number,
    high: number,
    median: number,
    axis: number,
  ) => {
    let left = low;
    let rightIndex = high - 1;
    while (left < rightIndex) {
      const pivot = order[Math.floor((left + rightIndex) / 2)];
      let i = left;
      let j = rightIndex;
      while (i <= j) {
        while (comparePoint(order[i], pivot, axis) < 0) i += 1;
        while (comparePoint(order[j], pivot, axis) > 0) j -= 1;
        if (i <= j) {
          const temporary = order[i];
          order[i] = order[j];
          order[j] = temporary;
          i += 1;
          j -= 1;
        }
      }
      if (median <= j) rightIndex = j;
      else if (median >= i) left = i;
      else return;
    }
  };
  const build = (low: number, high: number, depth: number): number => {
    if (low >= high) return -1;
    if (exploredStates >= stateLimit) {
      hitLimit = true;
      return -1;
    }
    exploredStates += 1;
    const median = Math.floor((low + high) / 2);
    selectMedian(low, high, median, depth % 2);
    const point = order[median];
    leftChild[point] = build(low, median, depth + 1);
    rightChild[point] = build(median + 1, high, depth + 1);
    xMin[point] = right.x[point];
    xMax[point] = right.x[point];
    yMin[point] = right.y[point];
    yMax[point] = right.y[point];
    minTransfers[point] = right.transfers[point];
    minChanges[point] = right.changes[point];
    for (const child of [leftChild[point], rightChild[point]]) {
      if (child < 0) continue;
      if (xMin[child] < xMin[point]) xMin[point] = xMin[child];
      if (xMax[child] > xMax[point]) xMax[point] = xMax[child];
      if (yMin[child] < yMin[point]) yMin[point] = yMin[child];
      if (yMax[child] > yMax[point]) yMax[point] = yMax[child];
      if (minTransfers[child] < minTransfers[point]) {
        minTransfers[point] = minTransfers[child];
        minChanges[point] = minChanges[child];
      } else if (minTransfers[child] === minTransfers[point]) {
        if (minChanges[child] < minChanges[point]) {
          minChanges[point] = minChanges[child];
        }
      }
    }
    return point;
  };
  const root = build(0, right.count, 0);
  if (hitLimit) {
    return {
      optimal: false,
      exploredStates: stateLimit,
      allocation: bestAllocation,
      ...bestScore,
    };
  }
  const absoluteBig = (value: bigint) => (value < 0n ? -value : value);
  const distanceToBounds = (
    x: bigint,
    y: bigint,
    xMin: bigint,
    xMax: bigint,
    yMin: bigint,
    yMax: bigint,
  ) => {
    const dx = x < xMin ? xMin - x : x > xMax ? x - xMax : 0n;
    const dy = y < yMin ? yMin - y : y > yMax ? y - yMax : 0n;
    return dx + dy;
  };
  const visitLeft = (
    index: number,
    x: bigint,
    y: bigint,
    code: number,
    transfers: number,
    changes: number,
  ) => {
    if (index === splitIndex) {
      if (exploredStates >= stateLimit) {
        hitLimit = true;
        return;
      }
      exploredStates += 1;
      const wantedX = targets[0].amountCents - x;
      const wantedY = targets[1].amountCents - y;
      const search = (node: number) => {
        if (node < 0 || hitLimit) return;
        if (exploredStates >= stateLimit) {
          hitLimit = true;
          return;
        }
        exploredStates += 1;
        const lowerDifference = distanceToBounds(
          wantedX,
          wantedY,
          xMin[node],
          xMax[node],
          yMin[node],
          yMax[node],
        );
        const lowerTransfers = transfers + minTransfers[node];
        const lowerChanges = changes + minChanges[node];
        if (
          lowerDifference > bestScore.differenceCents ||
          (lowerDifference === bestScore.differenceCents &&
            (lowerTransfers > bestScore.transferCount ||
              (lowerTransfers === bestScore.transferCount &&
                lowerChanges > bestScore.changedAssignmentCount)))
        )
          return;
        const difference =
          absoluteBig(wantedX - right.x[node]) +
          absoluteBig(wantedY - right.y[node]);
        const candidateTransfers = transfers + right.transfers[node];
        const candidateChanges = changes + right.changes[node];
        if (
          difference < bestScore.differenceCents ||
          (difference === bestScore.differenceCents &&
            (candidateTransfers < bestScore.transferCount ||
              (candidateTransfers === bestScore.transferCount &&
                candidateChanges <= bestScore.changedAssignmentCount)))
        ) {
          const allocation = buildAllocationFromCodes(
            positions,
            splitIndex,
            code,
            right.codes[node],
            targets,
          );
          const score = allocationScore(allocation, positions, targets);
          if (
            score.differenceCents < bestScore.differenceCents ||
            (score.differenceCents === bestScore.differenceCents &&
              (score.transferCount < bestScore.transferCount ||
                (score.transferCount === bestScore.transferCount &&
                  (score.changedAssignmentCount <
                    bestScore.changedAssignmentCount ||
                    (score.changedAssignmentCount ===
                      bestScore.changedAssignmentCount &&
                      compareAllocationKeys(
                        allocation,
                        bestAllocation,
                        positions,
                      ) < 0)))))
          ) {
            bestAllocation = allocation;
            bestScore = score;
          }
        }
        const leftNode = leftChild[node];
        const rightNode = rightChild[node];
        const leftDistance =
          leftNode < 0
            ? null
            : distanceToBounds(
                wantedX,
                wantedY,
                xMin[leftNode],
                xMax[leftNode],
                yMin[leftNode],
                yMax[leftNode],
              );
        const rightDistance =
          rightNode < 0
            ? null
            : distanceToBounds(
                wantedX,
                wantedY,
                xMin[rightNode],
                xMax[rightNode],
                yMin[rightNode],
                yMax[rightNode],
              );
        if (
          leftDistance !== null &&
          rightDistance !== null &&
          leftDistance <= rightDistance
        ) {
          search(leftNode);
          search(rightNode);
        } else {
          search(rightNode);
          search(leftNode);
        }
      };
      search(root);
      return;
    }
    const position = positions[index];
    const choices = [
      { id: targets[0].objectiveId, digit: 1 },
      { id: targets[1].objectiveId, digit: 2 },
      { id: null, digit: 0 },
    ];
    choices.sort(
      (left, rightChoice) =>
        Number(rightChoice.id === position.objectiveId) -
        Number(left.id === position.objectiveId),
    );
    for (const choice of choices) {
      const nextX =
        x + (choice.id === targets[0].objectiveId ? position.valueCents : 0n);
      const nextY =
        y + (choice.id === targets[1].objectiveId ? position.valueCents : 0n);
      const changed = choice.id !== position.objectiveId;
      const transfer = Boolean(
        position.objectiveId && choice.id && position.objectiveId !== choice.id,
      );
      visitLeft(
        index + 1,
        nextX,
        nextY,
        code + choice.digit * 3 ** index,
        transfers + Number(transfer),
        changes + Number(changed),
      );
      if (hitLimit) return;
    }
  };
  visitLeft(0, 0n, 0n, 0, 0, 0);
  return {
    optimal: !hitLimit,
    exploredStates: Math.min(exploredStates, stateLimit),
    allocation: bestAllocation,
    ...bestScore,
  };
}

/** Exact branch-and-bound for a small number of simultaneously measured destinations. */
export function solvePortfolioObjectiveAllocation(
  inputPositions: AllocationPosition[],
  inputTargets: AllocationTarget[],
  stateLimit = defaultStateLimit,
): AllocationResult {
  const targets = [...inputTargets].sort((a, b) =>
    a.objectiveId < b.objectiveId ? -1 : a.objectiveId > b.objectiveId ? 1 : 0,
  );
  const positions = [...inputPositions].sort(
    (a, b) =>
      (a.objectiveId === null ? 1 : 0) - (b.objectiveId === null ? 1 : 0) ||
      (a.valueCents === b.valueCents
        ? 0
        : a.valueCents > b.valueCents
          ? -1
          : 1) ||
      a.assetKey.localeCompare(b.assetKey),
  );
  const currentAllocation = Object.fromEntries(
    positions.map((position) => [position.assetKey, position.objectiveId]),
  );
  const currentScore = allocationScore(currentAllocation, positions, targets);
  if (
    targets.length > 0 &&
    currentScore.differenceCents === 0n &&
    currentScore.transferCount === 0 &&
    currentScore.changedAssignmentCount === 0
  ) {
    return {
      optimal: true,
      exploredStates: 1,
      allocation: currentAllocation,
      ...currentScore,
    };
  }
  const maximumPotentialTotal = positions.reduce(
    (total, position) => total + position.valueCents,
    0n,
  );
  if (
    targets.length === 2 &&
    positions.length <= meetInMiddlePositionLimit &&
    maximumPotentialTotal <= maxInt64
  ) {
    return solveTwoTargetMeetInMiddle(positions, targets, stateLimit);
  }
  if (!targets.length || !positions.length) {
    const allocation = Object.fromEntries(
      positions.map((position) => [position.assetKey, position.objectiveId]),
    );
    const score = allocationScore(allocation, positions, targets);
    return { optimal: true, exploredStates: 1, allocation, ...score };
  }

  let bestAllocation: Record<string, string | null> = Object.fromEntries(
    positions.map((position) => [position.assetKey, position.objectiveId]),
  );
  let bestScore = allocationScore(bestAllocation, positions, targets);
  const current: Record<string, string | null> = {};
  const sums = new Map(targets.map((target) => [target.objectiveId, 0n]));
  const suffixValues = new Array<bigint>(positions.length + 1).fill(0n);
  for (let index = positions.length - 1; index >= 0; index -= 1) {
    suffixValues[index] = suffixValues[index + 1] + positions[index].valueCents;
  }
  let exploredStates = 0;
  let hitLimit = false;
  let partialTransferCount = 0;
  let partialChangedAssignmentCount = 0;

  const consider = () => {
    const score = allocationScore(current, positions, targets);
    const sameDifference = score.differenceCents === bestScore.differenceCents;
    const sameTransfers = score.transferCount === bestScore.transferCount;
    const sameChanges =
      score.changedAssignmentCount === bestScore.changedAssignmentCount;
    const tieIsBetter =
      sameDifference &&
      (score.transferCount < bestScore.transferCount ||
        (sameTransfers &&
          (score.changedAssignmentCount < bestScore.changedAssignmentCount ||
            (sameChanges &&
              compareAllocationKeys(current, bestAllocation, positions) < 0))));
    if (score.differenceCents < bestScore.differenceCents || tieIsBetter) {
      bestAllocation = { ...current };
      bestScore = score;
    }
  };

  const visit = (index: number) => {
    exploredStates += 1;
    if (exploredStates > stateLimit) {
      hitLimit = true;
      return;
    }
    let overage = 0n;
    let deficit = 0n;
    for (const target of targets) {
      const gap = target.amountCents - sums.get(target.objectiveId)!;
      if (gap > 0n) deficit += gap;
      else overage += -gap;
    }
    const lowerBound =
      overage +
      (deficit > suffixValues[index] ? deficit - suffixValues[index] : 0n);
    if (lowerBound > bestScore.differenceCents) return;
    if (
      lowerBound === bestScore.differenceCents &&
      (partialTransferCount > bestScore.transferCount ||
        (partialTransferCount === bestScore.transferCount &&
          partialChangedAssignmentCount > bestScore.changedAssignmentCount))
    ) {
      return;
    }
    if (index === positions.length) {
      consider();
      return;
    }
    const position = positions[index];
    const existing = position.objectiveId;
    const choices = [
      ...(existing && targets.some((target) => target.objectiveId === existing)
        ? [existing]
        : []),
      ...targets
        .map((target) => target.objectiveId)
        .filter((objectiveId) => objectiveId !== existing),
      null,
    ];
    const uniqueChoices = [...new Set(choices)];
    for (const objectiveId of uniqueChoices) {
      current[position.assetKey] = objectiveId;
      const changed = objectiveId !== position.objectiveId;
      const transfer = Boolean(
        position.objectiveId &&
        objectiveId &&
        position.objectiveId !== objectiveId,
      );
      if (changed) partialChangedAssignmentCount += 1;
      if (transfer) partialTransferCount += 1;
      if (objectiveId)
        sums.set(objectiveId, sums.get(objectiveId)! + position.valueCents);
      visit(index + 1);
      if (objectiveId)
        sums.set(objectiveId, sums.get(objectiveId)! - position.valueCents);
      if (transfer) partialTransferCount -= 1;
      if (changed) partialChangedAssignmentCount -= 1;
      if (hitLimit) return;
    }
    delete current[position.assetKey];
  };
  visit(0);
  return {
    optimal: !hitLimit,
    exploredStates: Math.min(exploredStates, stateLimit),
    allocation: bestAllocation,
    ...bestScore,
  };
}
