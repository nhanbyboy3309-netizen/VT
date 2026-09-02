import { Document } from '../types';

// Mirrors backend/authz.ts's retention logic — no shared module between
// front/back in this project, so the two copies are kept in lockstep by hand.
// ISO 15489 retention/disposition: the clock starts at dateIssued and runs
// for the year-count parsed out of retentionPeriod ("5 năm", "10 năm", "20
// năm"); "Vĩnh viễn" (permanent) carries no digits and never expires.

export function parseRetentionYears(retentionPeriod?: string | null): number | null {
  if (!retentionPeriod) return null;
  const match = String(retentionPeriod).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export function getRetentionExpiryDate(doc: Pick<Document, 'dateIssued' | 'retentionPeriod'>): Date | null {
  const years = parseRetentionYears(doc.retentionPeriod);
  if (years == null || !doc.dateIssued) return null;
  const d = new Date(doc.dateIssued);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

export type RetentionStatus = 'destroyed' | 'expired' | 'expiring_soon' | 'ok' | 'permanent';

const RETENTION_WARNING_DAYS = 90;

export function getRetentionStatus(doc: Pick<Document, 'dateIssued' | 'retentionPeriod' | 'physicalDestroyed'>): RetentionStatus {
  if (doc.physicalDestroyed) return 'destroyed';
  const expiry = getRetentionExpiryDate(doc);
  if (!expiry) return 'permanent';
  const diffDays = (expiry.getTime() - Date.now()) / 86400000;
  if (diffDays < 0) return 'expired';
  if (diffDays <= RETENTION_WARNING_DAYS) return 'expiring_soon';
  return 'ok';
}

export function formatRetentionDays(doc: Pick<Document, 'dateIssued' | 'retentionPeriod'>): string {
  const expiry = getRetentionExpiryDate(doc);
  if (!expiry) return '';
  const diffDays = Math.round((expiry.getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return `Quá hạn ${Math.abs(diffDays)} ngày`;
  return `Còn ${diffDays} ngày`;
}
