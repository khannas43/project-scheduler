export * as rolesApi from './api.js';
export { PermissionMatrix } from './components/PermissionMatrix.js';
export { RoleList } from './components/RoleList.js';
export { CreateRoleForm } from './components/CreateRoleForm.js';
export { EditRoleForm } from './components/EditRoleForm.js';
export { RolesPage } from './components/RolesPage.js';
export {
  useRoles,
  usePermissions,
  useCreateRole,
  useUpdateRole,
  rolesQueryKey,
  permissionsQueryKey,
} from './hooks/useRoles.js';
export type { Role, Permission, CreateRoleInput, UpdateRoleInput } from './types.js';
