import { ConflictException } from '@nestjs/common';

export interface ServerFactSnapshot {
  factId: number | null;
  scVolume: number | null;
  version: number;
}

/**
 * ADR-003: несовпадение expectedVersion (offline last_known_version) с
 * period_facts.version. Несёт серверный снапшот для conflict_data.
 */
export class VersionConflictException extends ConflictException {
  constructor(readonly serverFact: ServerFactSnapshot) {
    super('VERSION_CONFLICT');
  }
}
