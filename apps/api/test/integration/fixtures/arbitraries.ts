// apps/api/test/integration/fixtures/arbitraries.ts
import * as fc from 'fast-check';

// BoQ shape — N items, each with a positive contract_value
export const arbBoQShape = fc.record({
  contractValues: fc.array(
    fc.float({ min: 0.01, max: 10_000, noNaN: true, noDefaultInfinity: true }),
    { minLength: 2, maxLength: 50 },
  ),
});

// Concurrent count for advisory-lock invariant
export const arbConcurrency = fc.integer({ min: 2, max: 10 });
