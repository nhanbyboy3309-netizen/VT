export interface StorageFolder {
  id: string;
  name: string;
  physicalLocation: string;
  // The department this digital-folder/physical-location mapping belongs to;
  // null/undefined means it's the shared/company-wide entry, admin-only.
  departmentId?: string | null;
}

// Hierarchical physical storage location: Kho (top level) > Tủ > Ngăn/Hộc.
// parentId is undefined/null for top-level nodes. Only a top-level (root)
// node carries departmentId — descendants inherit it from their root.
// departmentId null on a root means it's the shared/company-wide tree.
export interface StorageLocationNode {
  id: string;
  name: string;
  parentId?: string | null;
  departmentId?: string | null;
}

export interface Department {
  id: string;
  name: string;
}

export type UserRole = 'Admin' | 'Nhân viên';

export interface DocumentTypeConfig {
  id: string;
  label: string;
  prefix: string;
  defaultFolder?: string;
  storagePath?: string; // Custom storage folder in Firebase Storage
  idSyntax?: string; // Per-type syntax
  lastSequence: number; // Independent sequence for each type
  // The department this numbering pool belongs to; null/undefined means it's
  // the shared/company-wide pool that only Admin manages.
  departmentId?: string | null;
}

export interface HistoryEntry {
  userId: string;
  userName: string;
  timestamp: string;
  action: string;
  reason?: string;
}

export interface FileVersion {
  url: string;
  timestamp: string;
  userName: string;
  userId: string;
  action: 'upload' | 'scan' | 'revert';
}

export interface Document {
  id?: string;
  type: string; // Changed from DocumentType enum to string for dynamic support
  title: string;
  number: string;
  dateIssued: string;
  expiryDate?: string;
  physicalLocation?: string;
  digitalLocation?: string;
  fileUrl?: string;
  ocrText?: string;
  status?: string;
  versions?: FileVersion[];
  partnerAbbreviation?: string;
  sender?: string;
  receivedDate?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  history?: HistoryEntry[];
  confidentiality?: string;
  retentionPeriod?: string;
  version?: string;
  isoStatus?: string;
  // Department scope: set = belongs to that department; null/undefined =
  // part of the admin-managed shared/company-wide numbering pool.
  departmentId?: string | null;
  // Only meaningful for a departmentId-less (shared/company) document: the
  // free-edit deadline for whoever registered it, and an admin-granted
  // extension (set when an edit request is approved).
  editableUntil?: string | null;
  unlockedUntil?: string | null;
  // ISO 15489 disposition: set once the hard copy has been physically
  // destroyed after its retention period lapsed. Never implies the system
  // record itself was deleted — this is an audit trail entry.
  physicalDestroyed?: boolean;
  physicalDestroyedAt?: string | null;
  physicalDestroyedBy?: string | null;
}

export interface EditRequest {
  id: number;
  documentId: number;
  requestedBy: number;
  requestedByName?: string;
  docTitle?: string;
  docNumber?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  resolvedAt?: string | null;
  resolvedBy?: number | null;
}

export interface SystemSettings {
  appName?: string;
  orgName?: string;
  idSyntax: string;
  lastSequence: number;
  logoUrl?: string;
  storageRoot?: string;
  storageStructure?: 'flat' | 'by_type' | 'by_year' | 'by_year_type';
  physicalLocations?: string[];
  scanFolder?: string;
  storageFolders?: StorageFolder[];
  storageLocations?: StorageLocationNode[];
  // How many hours a Nhân viên may freely edit a shared/company document
  // they just registered, before it locks (or immediately once a scan is
  // attached, whichever comes first). Admin-configurable, default 4.
  editWindowHours?: number;
}
