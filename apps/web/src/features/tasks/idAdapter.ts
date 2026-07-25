/**
 * Stable UUID ↔ numeric id bridge for @pkg/gantt (GanttTask.id is a number).
 * Numeric ids are sequential by array index at tree-load time — not derived from
 * UUID bits — so reverse lookup must go through the maps, never `tasks[numericId]`.
 */
export class TaskIdAdapter {
  private readonly uuidToNumeric = new Map<string, number>();
  private readonly numericToUuid = new Map<number, string>();

  constructor(taskIds: readonly string[]) {
    for (let i = 0; i < taskIds.length; i += 1) {
      const uuid = taskIds[i];
      if (uuid === undefined) continue;
      this.uuidToNumeric.set(uuid, i);
      this.numericToUuid.set(i, uuid);
    }
  }

  toNumeric(uuid: string): number | undefined {
    return this.uuidToNumeric.get(uuid);
  }

  toUuid(numericId: number): string | undefined {
    return this.numericToUuid.get(numericId);
  }

  get size(): number {
    return this.uuidToNumeric.size;
  }
}
