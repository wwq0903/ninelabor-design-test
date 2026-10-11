/**
 * R3-6 branch isolation policy (pure decision helper).
 * Not a replacement for Firebase Rules or server-side authorization.
 * Deny-by-default: legacy records without branchId must be migrated before access.
 */
export type BranchId = string;
export type BranchRole = 'SUPER_ADMIN' | 'ATTORNEY' | 'MANAGER';

export interface BranchPrincipal {
  uid: string;
  active: boolean;
  role: BranchRole;
  branchId: BranchId | null;
  assignedCompanyIds?: readonly string[];
  permissions?: readonly string[];
}

export interface BranchResource {
  branchId: BranchId | null;
  companyId?: string | null;
}

const VALID_BRANCH_ID = /^[a-z0-9][a-z0-9_-]{1,63}$/;
export function validBranchId(value: unknown): value is BranchId {
  return typeof value === 'string' && VALID_BRANCH_ID.test(value);
}

/** No implicit cross-branch bypass, even for SUPER_ADMIN. */
export function canAccessBranchResource(
  principal: BranchPrincipal | null | undefined,
  resource: BranchResource | null | undefined,
  requiredPermission: string,
): boolean {
  if (!principal || !resource || !principal.uid || !principal.active) return false;
  if (!validBranchId(principal.branchId) || !validBranchId(resource.branchId)) return false;
  if (principal.branchId !== resource.branchId) return false;
  if (!requiredPermission || !principal.permissions?.includes(requiredPermission)) return false;
  if (principal.role === 'MANAGER' && resource.companyId) {
    return principal.assignedCompanyIds?.includes(resource.companyId) === true;
  }
  return ['SUPER_ADMIN', 'ATTORNEY', 'MANAGER'].includes(principal.role);
}
