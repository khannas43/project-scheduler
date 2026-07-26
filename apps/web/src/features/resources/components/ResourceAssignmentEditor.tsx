import { Link } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';

import { dateInputToIso, toDateInputValue } from '../../projects/dateFormat.js';
import {
  useDeleteAssignment,
  useUpdateAssignment,
} from '../../tasks/hooks/useAssignments.js';
import { useTaskEdit } from '../../tasks/hooks/useTaskEdit.js';
import {
  formatUnits,
  minutesFromWorkingDays,
  roundUnits,
  workingDaysFromMinutes,
  type ResourceAssignmentItem,
} from '../resourceCalendar.js';

export interface ResourceAssignmentEditorProps {
  readonly projectId: string;
  readonly item: ResourceAssignmentItem;
  readonly onClose: () => void;
}

export function ResourceAssignmentEditor({
  projectId,
  item,
  onClose,
}: ResourceAssignmentEditorProps) {
  const updateAssignment = useUpdateAssignment(projectId);
  const deleteAssignment = useDeleteAssignment(projectId);
  const editTask = useTaskEdit(projectId);

  const [units, setUnits] = useState(formatUnits(item.assignment.units));
  const [startDate, setStartDate] = useState(
    item.task.earlyStart ? toDateInputValue(item.task.earlyStart) : '',
  );
  const [durationDays, setDurationDays] = useState(
    String(workingDaysFromMinutes(item.task.durationMinutes)),
  );

  useEffect(() => {
    setUnits(formatUnits(item.assignment.units));
    setStartDate(item.task.earlyStart ? toDateInputValue(item.task.earlyStart) : '');
    setDurationDays(String(workingDaysFromMinutes(item.task.durationMinutes)));
  }, [item]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    const unitsNum = roundUnits(Number(units));
    if (!Number.isFinite(unitsNum) || unitsNum <= 0) return;
    const days = Number(durationDays);
    if (!Number.isFinite(days) || days <= 0) return;

    try {
      const currentUnits = roundUnits(Number(item.assignment.units ?? '1'));
      if (unitsNum !== currentUnits) {
        await updateAssignment.mutateAsync({
          assignmentId: item.assignment.id,
          units: unitsNum,
        });
      }

      const patch: {
        taskId: string;
        version: number;
        durationMinutes?: number;
        constraintType?: string;
        constraintDate?: string;
      } = {
        taskId: item.task.id,
        version: item.task.version,
      };

      const nextDuration = minutesFromWorkingDays(days);
      if (nextDuration !== (item.task.durationMinutes ?? 0)) {
        patch.durationMinutes = nextDuration;
      }

      if (startDate) {
        const constraintDate = dateInputToIso(startDate);
        const currentStart = item.task.earlyStart
          ? toDateInputValue(item.task.earlyStart)
          : '';
        if (constraintDate && startDate !== currentStart) {
          patch.constraintType = 'mso';
          patch.constraintDate = constraintDate;
        }
      }

      if (patch.durationMinutes !== undefined || patch.constraintType !== undefined) {
        await editTask.mutateAsync(patch);
      }
      onClose();
    } catch {
      // Banners via hooks.
    }
  }

  async function onRemove() {
    try {
      await deleteAssignment.mutateAsync(item.assignment.id);
      onClose();
    } catch {
      // Banner via hook.
    }
  }

  const busy =
    updateAssignment.isPending || deleteAssignment.isPending || editTask.isPending;

  return (
    <aside className="resource-cal-editor" data-testid="resource-assignment-editor">
      <header className="resource-cal-editor-header">
        <div>
          <p className="eyebrow">Assignment</p>
          <h2>{item.task.name}</h2>
          <p className="muted">
            {item.task.wbsCode ? (
              <span className="mono">{item.task.wbsCode}</span>
            ) : (
              'No WBS'
            )}
            {item.task.isCritical ? ' · Critical' : null}
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
      </header>

      <form className="resource-cal-editor-form" onSubmit={(e) => void onSave(e)}>
        <label>
          Units (whole assignment)
          <input
            type="number"
            min="0.05"
            step="0.05"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            onBlur={() => setUnits(formatUnits(units))}
            data-testid="resource-cal-units"
          />
        </label>
        <p className="muted resource-cal-editor-hint">
          For a single day only, close this panel and click that day on the calendar.
        </p>
        <label>
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            data-testid="resource-cal-start"
          />
        </label>
        <label>
          Duration (working days)
          <input
            type="number"
            min="1"
            step="1"
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            data-testid="resource-cal-duration"
          />
        </label>

        <p className="muted resource-cal-editor-hint">
          Start edits apply a Must Start On constraint; duration updates the task and
          reschedules the plan.
        </p>

        <div className="resource-cal-editor-actions">
          <button type="submit" disabled={busy} data-testid="resource-cal-save">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void onRemove()}
            data-testid="resource-cal-remove"
          >
            Remove assignment
          </button>
          <Link to="/projects/$projectId" params={{ projectId }} className="btn-link">
            Open in project
          </Link>
        </div>
      </form>
    </aside>
  );
}
