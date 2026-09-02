// Central authorization rules for the department-based permission model:
//   Admin     — full control everywhere.
//   Nhân viên — near-admin within their own department: full control over
//               that department's documents, document types (numbering) and
//               physical storage locations. Outside their department they
//               can only create/edit documents drawn from the admin-managed
//               shared ("chung công ty") numbering pool, and only within the
//               edit window.

export const ROLES = ['Admin', 'Nhân viên'] as const;

export function isAdmin(user: any) {
  return user?.role === 'Admin';
}

// True when `user` owns `departmentId` by virtue of being a member of it —
// every non-Admin role gets full rights over their own department, so this
// is just a department-membership check, not a separate privilege tier.
function ownsDepartment(user: any, departmentId: string | null | undefined) {
  return !!departmentId && user?.departmentId === departmentId;
}

// A document belongs to a department (departmentId set) or is part of the
// admin-managed shared/company-wide pool (departmentId null).
export function canViewDocument(user: any, doc: any) {
  if (isAdmin(user)) return true;
  if (doc.departmentId) {
    return doc.departmentId === user.departmentId;
  }
  // Company-wide doc: only the employee who registered/took the number sees it.
  return doc.createdBy === user.id;
}

export function canCreateWithType(user: any, docType: any) {
  if (isAdmin(user)) return true;
  if (!docType?.departmentId) return true; // shared pool — anyone can take a number
  return ownsDepartment(user, docType.departmentId);
}

export function isEditWindowOpen(doc: any, editWindowHours: number) {
  const now = Date.now();
  if (doc.unlockedUntil && new Date(doc.unlockedUntil).getTime() > now) return true;
  if (doc.fileUrl) return false; // a scan/file was attached — locks immediately
  if (!doc.editableUntil) return true; // no window ever set (e.g. a department doc)
  return new Date(doc.editableUntil).getTime() > now;
}

export function canEditDocument(user: any, doc: any, editWindowHours: number) {
  if (isAdmin(user)) return true;
  if (doc.departmentId) {
    return ownsDepartment(user, doc.departmentId);
  }
  return doc.createdBy === user.id && isEditWindowOpen(doc, editWindowHours);
}

export function canDeleteDocument(user: any, doc: any) {
  if (isAdmin(user)) return true;
  if (doc.departmentId) {
    return ownsDepartment(user, doc.departmentId);
  }
  return false; // only admin removes documents from the shared company pool
}

// Document-type (numbering) management: a department owns only its own
// types; the shared/company pool is admin-only.
// Creating a brand-new type (no existing row to inherit a department from
// yet) — the caller must state which department it belongs to up front.
export function canCreateDocType(user: any, requestedDepartmentId: string | null) {
  if (isAdmin(user)) return true;
  if (!requestedDepartmentId) return false; // the shared pool is admin-only to extend
  return ownsDepartment(user, requestedDepartmentId);
}

export function canManageDocType(user: any, docType: any) {
  if (isAdmin(user)) return true;
  if (!docType?.departmentId) return false;
  return ownsDepartment(user, docType.departmentId);
}

export function canViewDocType(user: any, docType: any) {
  if (isAdmin(user)) return true;
  if (!docType?.departmentId) return true; // shared types are visible to everyone
  return docType.departmentId === user.departmentId;
}

// Storage-location tree: only root (top-level) nodes carry an explicit
// departmentId — descendants inherit it by walking up to the root.
export function getNodeDepartmentId(node: any, allNodes: any[]): string | null {
  let cursor = node;
  const seen = new Set<string>();
  while (cursor?.parentId) {
    if (seen.has(cursor.id)) break; // guard against a corrupted cycle
    seen.add(cursor.id);
    const parent = allNodes.find((n: any) => n.id === cursor.parentId);
    if (!parent) break;
    cursor = parent;
  }
  return cursor?.departmentId || null;
}

export function canViewLocationNode(user: any, node: any, allNodes: any[]) {
  if (isAdmin(user)) return true;
  const deptId = getNodeDepartmentId(node, allNodes);
  if (!deptId) return true; // company-wide/shared location
  return deptId === user.departmentId;
}

export function canManageLocationNode(user: any, node: any, allNodes: any[]) {
  if (isAdmin(user)) return true;
  const deptId = getNodeDepartmentId(node, allNodes);
  if (!deptId) return false; // shared/company-wide locations are admin-only
  return ownsDepartment(user, deptId);
}

// Creating a node: a child inherits its department from the parent (so
// creating one just requires managing that parent). A new root node (Kho) is
// always Admin-only — Admin creates the warehouse and assigns it to a
// department; a department only ever adds sub-levels (Tủ, Ngăn/Hộc) inside
// a Kho that's already theirs.
export function canCreateLocationNode(user: any, node: any, allNodes: any[]) {
  if (isAdmin(user)) return true;
  if (node.parentId) {
    const parent = allNodes.find((n: any) => n.id === node.parentId);
    if (!parent) return false;
    return canManageLocationNode(user, parent, allNodes);
  }
  return false; // creating a root Kho is Admin-only
}

// Storage-folder mapping (digital folder name -> a free-text physical
// location): a flat list, each entry optionally owned by a department. A
// shared/company-wide entry (departmentId null) is admin-only, same rule
// as everywhere else.
export function canCreateStorageFolder(user: any, departmentId: string | null) {
  if (isAdmin(user)) return true;
  if (!departmentId) return false;
  return ownsDepartment(user, departmentId);
}

export function canManageStorageFolder(user: any, folder: any) {
  if (isAdmin(user)) return true;
  if (!folder?.departmentId) return false;
  return ownsDepartment(user, folder.departmentId);
}

export function canViewStorageFolder(user: any, folder: any) {
  if (isAdmin(user)) return true;
  if (!folder?.departmentId) return true; // shared/company-wide folder is visible to everyone
  return folder.departmentId === user?.departmentId;
}

// ISO 15489 retention/disposition: the retention clock starts at dateIssued
// and runs for the year-count parsed out of retentionPeriod ("5 năm", "10
// năm", "20 năm"); "Vĩnh viễn" (permanent) carries no digits and never expires.
export function parseRetentionYears(retentionPeriod?: string | null): number | null {
  if (!retentionPeriod) return null;
  const match = String(retentionPeriod).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export function getRetentionExpiryDate(doc: any): Date | null {
  const years = parseRetentionYears(doc.retentionPeriod);
  if (years == null || !doc.dateIssued) return null;
  const d = new Date(doc.dateIssued);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

export type RetentionStatus = 'destroyed' | 'expired' | 'expiring_soon' | 'ok' | 'permanent';

const RETENTION_WARNING_DAYS = 90;

export function getRetentionStatus(doc: any): RetentionStatus {
  if (doc.physicalDestroyed) return 'destroyed';
  const expiry = getRetentionExpiryDate(doc);
  if (!expiry) return 'permanent';
  const diffDays = (expiry.getTime() - Date.now()) / 86400000;
  if (diffDays < 0) return 'expired';
  if (diffDays <= RETENTION_WARNING_DAYS) return 'expiring_soon';
  return 'ok';
}
