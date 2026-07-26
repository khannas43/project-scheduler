import { type FormEvent, useState } from 'react';

import { useUpdateResource } from '../hooks/useResources.js';
import type { AccrualType, Resource, ResourceType } from '../types.js';

export interface EditResourceFormProps {
  readonly projectId: string;
  readonly resource: Resource;
  readonly onCancel: () => void;
  readonly onUpdated?: (resource: Resource) => void;
}

function parseOptionalNumber(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function EditResourceForm({
  projectId,
  resource,
  onCancel,
  onUpdated,
}: EditResourceFormProps) {
  const update = useUpdateResource(projectId);
  const [name, setName] = useState(resource.name);
  const [resourceType, setResourceType] = useState<ResourceType>(
    (resource.resourceType as ResourceType) || 'work',
  );
  const [email, setEmail] = useState(resource.email ?? '');
  const [maxUnits, setMaxUnits] = useState(resource.maxUnits ?? '');
  const [standardRate, setStandardRate] = useState(resource.standardRate ?? '');
  const [costPerUse, setCostPerUse] = useState(resource.costPerUse ?? '');
  const [accrualType, setAccrualType] = useState<'' | AccrualType>(
    (resource.accrualType as AccrualType | null) ?? '',
  );
  const [calendarId, setCalendarId] = useState(resource.calendarId ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const max = parseOptionalNumber(maxUnits);
    const rate = parseOptionalNumber(standardRate);
    const cpu = parseOptionalNumber(costPerUse);
    if (max === undefined) {
      setFormError('Max units must be a valid number (or blank).');
      return;
    }
    if (rate === undefined) {
      setFormError('Standard rate must be a valid number (or blank).');
      return;
    }
    if (cpu === undefined) {
      setFormError('Cost per use must be a valid number (or blank).');
      return;
    }
    const calendar = calendarId.trim();
    if (
      calendar !== '' &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(calendar)
    ) {
      setFormError('Calendar ID must be a valid UUID, or left blank.');
      return;
    }
    setFormError(null);

    try {
      const updated = await update.mutateAsync({
        id: resource.id,
        patch: {
          name: name.trim(),
          resourceType,
          email: email.trim() === '' ? null : email.trim(),
          maxUnits: max,
          standardRate: rate,
          costPerUse: cpu,
          accrualType: accrualType === '' ? null : accrualType,
          calendarId: calendar === '' ? null : calendar,
        },
      });
      onUpdated?.(updated);
    } catch {
      // ApiError already surfaced via useUpdateResource → useErrorBanner.
    }
  }

  return (
    <form className="role-form resource-form" onSubmit={(e) => void onSubmit(e)}>
      <h2>Edit resource</h2>
      <label>
        Name
        <input
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </label>
      <label>
        Type
        <select
          name="resourceType"
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value as ResourceType)}
        >
          <option value="work">Work</option>
          <option value="material">Material</option>
          <option value="cost">Cost</option>
        </select>
      </label>
      <label>
        Email
        <input
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label>
        Max units
        <input
          name="maxUnits"
          inputMode="decimal"
          value={maxUnits}
          onChange={(e) => setMaxUnits(e.target.value)}
        />
      </label>
      <label>
        Standard rate
        <input
          name="standardRate"
          inputMode="decimal"
          value={standardRate}
          onChange={(e) => setStandardRate(e.target.value)}
        />
      </label>
      <label>
        Cost per use
        <input
          name="costPerUse"
          inputMode="decimal"
          value={costPerUse}
          onChange={(e) => setCostPerUse(e.target.value)}
        />
      </label>
      <label>
        Accrual
        <select
          name="accrualType"
          value={accrualType}
          onChange={(e) => setAccrualType(e.target.value as '' | AccrualType)}
        >
          <option value="">—</option>
          <option value="start">Start</option>
          <option value="prorated">Prorated</option>
          <option value="end">End</option>
        </select>
      </label>
      <label>
        Calendar ID
        <input
          name="calendarId"
          value={calendarId}
          onChange={(e) => setCalendarId(e.target.value)}
          placeholder="optional UUID"
        />
      </label>
      {formError ? (
        <p className="form-error" role="alert">
          {formError}
        </p>
      ) : null}
      {update.error ? (
        <p className="form-error" role="alert">
          {update.error instanceof Error ? update.error.message : 'Could not update resource'}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={update.isPending}>
          Cancel
        </button>
        <button type="submit" disabled={update.isPending || name.trim() === ''}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
