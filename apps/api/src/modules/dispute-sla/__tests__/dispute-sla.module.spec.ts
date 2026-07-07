// workerProviders is evaluated at module-import time, so each test must
// reset the module registry and re-import with the desired env value.
// We read @Module providers metadata directly instead of compiling the
// full DI module — this avoids the BullModule/Redis dependency and
// keeps the test focused on the conditional registration logic.

describe('DisputeSlaModule — ROLE gate', () => {
  const originalRole = process.env.ROLE;

  afterEach(() => {
    if (originalRole === undefined) delete process.env.ROLE;
    else process.env.ROLE = originalRole;
    jest.resetModules();
  });

  it('does NOT include DisputeSlaWorker in providers when ROLE is unset', async () => {
    delete process.env.ROLE;
    jest.resetModules();

    const { DisputeSlaModule } = await import('../dispute-sla.module');
    const { DisputeSlaWorker } = await import('../dispute-sla.worker');
    const providers = Reflect.getMetadata('providers', DisputeSlaModule) as unknown[];

    expect(providers).not.toContain(DisputeSlaWorker);
  });

  it('includes DisputeSlaWorker in providers when ROLE=worker', async () => {
    process.env.ROLE = 'worker';
    jest.resetModules();

    const { DisputeSlaModule } = await import('../dispute-sla.module');
    const { DisputeSlaWorker } = await import('../dispute-sla.worker');
    const providers = Reflect.getMetadata('providers', DisputeSlaModule) as unknown[];

    expect(providers).toContain(DisputeSlaWorker);
  });
});
