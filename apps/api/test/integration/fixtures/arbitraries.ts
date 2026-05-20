// apps/api/test/integration/fixtures/arbitraries.ts
import * as fc from 'fast-check';

// BoQ shape — N items, each with a positive contract_value.
// fc.double (64-bit) — fc.float requires 32-bit representable bounds,
// and money/Decimal semantics need double precision anyway.
export const arbBoQShape = fc.record({
  contractValues: fc.array(
    fc.double({ min: 0.01, max: 10_000, noNaN: true, noDefaultInfinity: true }),
    { minLength: 2, maxLength: 50 },
  ),
});

// Concurrent count for advisory-lock invariant
export const arbConcurrency = fc.integer({ min: 2, max: 10 });
