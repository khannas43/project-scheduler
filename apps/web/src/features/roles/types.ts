/** Client shapes matching apps/api RoleView / PermissionView. */

export interface Role {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly isSystem: boolean;
  readonly permissionKeys: readonly string[];
}

export interface Permission {
  readonly id: string;
  readonly key: string;
  readonly category: string;
  readonly description: string;
}

export interface CreateRoleInput {
  readonly projectId: string;
  readonly name: string;
  readonly description?: string | null;
  readonly permissionKeys: readonly string[];
}

export interface UpdateRoleInput {
  readonly projectId: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly permissionKeys?: readonly string[];
}
