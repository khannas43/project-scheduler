import { apiRequest } from '../../lib/apiClient.js';

import type {
  BoardColumnRow,
  CreateBoardColumnInput,
  UpdateBoardColumnInput,
} from './types.js';

export function listBoardColumns(projectId: string): Promise<BoardColumnRow[]> {
  return apiRequest<BoardColumnRow[]>(`/api/projects/${projectId}/board-columns`);
}

export function createBoardColumn(
  projectId: string,
  input: CreateBoardColumnInput,
): Promise<BoardColumnRow> {
  return apiRequest<BoardColumnRow>(`/api/projects/${projectId}/board-columns`, {
    method: 'POST',
    body: input,
  });
}

export function updateBoardColumn(
  columnId: string,
  input: UpdateBoardColumnInput,
): Promise<BoardColumnRow> {
  return apiRequest<BoardColumnRow>(`/api/board-columns/${columnId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function deleteBoardColumn(columnId: string): Promise<void> {
  return apiRequest<void>(`/api/board-columns/${columnId}`, {
    method: 'DELETE',
  });
}
