// SPEC §9.2 — pure; shared by the relay and the contract test.
import type { RelayReportStatus } from '../src/shared/vocab';

export function classifyResult(echoOk: boolean, satelliteOk: boolean): RelayReportStatus {
  if (echoOk && satelliteOk) return 'sent';
  if (echoOk || satelliteOk) return 'partial';
  return 'failed';
}
