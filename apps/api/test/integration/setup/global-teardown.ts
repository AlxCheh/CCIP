// apps/api/test/integration/setup/global-teardown.ts
import { writeCoverageMatrix } from '../helpers/coverage-matrix';

export default function globalTeardown(): void {
  // Coverage matrix gen runs even if tests failed (Jest invokes teardown always)
  writeCoverageMatrix({
    integrationDir: __dirname + '/..',
    algorithmDoc: __dirname + '/../../../../../docs/algorithm_v1_3.md',
    outFile: __dirname + '/../../../../../docs/testing/coverage-matrix.md',
  });
}
