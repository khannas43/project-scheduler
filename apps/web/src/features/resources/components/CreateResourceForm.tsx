import { type FormEvent, useState } from 'react';

import { useCreateResource } from '../hooks/useResources.js';
import type { AccrualType, Resource, ResourceType } from '../types.js';

export interface CreateResourceFormProps {
  readonly projectId: string;
  readonly onCancel: () => void;
  readonly onCreated?: (resource: Resource) => void;
}

function parseOptionalNumber(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function CreateResourceForm({ projectId, onCancel, onCreated }: CreateResourceFormProps) {
  const create = useCreateResource(projectId);
  const [name, setName] = useState('');
  const [resourceType, setResourceType] = useState<ResourceType>('work');
  const [email, setEmail] = useState('');
  const [maxUnits, setMaxUnits] = useState('1');
  const [standardRate, setStandardRate] = useState('');
  const [costPerUse, setCostPerUse] = useState('');
  const [accrualType, setAccrualType] = useState<'' | AccrualType>('');
  const [calendarId, setCalendarId] = useState('');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const max = parseOptionalNumber(maxUnits);
    const rate = parseOptionalNumber(standardRate);
    const cpu = parseOptionalNumber(costPerUse);
    if (max === undefined || rate === undefined || cpu === undefined) return;

    try {
      const resource = await create.mutateAsync({
        name: name.trim(),
        resourceType,
        email: email.trim() === '' ? null : email.trim(),
        maxUnits: max,
        standardRate: rate,
        costPerUse: cpu,
        accrualType: accrualType === '' ? null : accrualType,
        calendarId: calendarId.trim() === '' ? null : calendarId.trim(),
      });
      onCreated?.(resource);
    } catch {
      // ApiError already surfaced via useCreateResource → useErrorBanner.
    }
  }

  return (
    <form className="role-form resource-form" onSubmit={(e) => void onSubmit(e)}>
      <h2>New resource</h2>
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
      {create.error ? (
        <p className="form-error" role="alert">
          {create.error instanceof Error ? create.error.message : 'Could not create resource'}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={create.isPending}>
          Cancel
        </button>
        <button type="submit" disabled={create.isPending || name.trim() === ''}>
          {create.isPending ? 'Creating…' : 'Create resource'}
        </button>
      </div>
    </form>
  );
}
