import { type FormEvent, useState } from 'react';

import { useCreateProject } from '../hooks/useProjects.js';

interface CreateProjectFormProps {
  onCancel: () => void;
}

export function CreateProjectForm({ onCancel }: CreateProjectFormProps) {
  const create = useCreateProject();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [startDate, setStartDate] = useState('');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await create.mutateAsync({
      name,
      description: description.trim() === '' ? null : description,
      status,
      startDate: startDate === '' ? null : new Date(startDate).toISOString(),
    });
  }

  return (
    <form className="create-project-form" onSubmit={onSubmit}>
      <h2>New project</h2>
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
        Description
        <textarea
          name="description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label>
        Status
        <select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="planned">Planned</option>
          <option value="on_hold">On hold</option>
          <option value="completed">Completed</option>
        </select>
      </label>
      <label>
        Start date
        <input
          type="date"
          name="startDate"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </label>
      {create.error ? (
        <p className="form-error" role="alert">
          {create.error instanceof Error ? create.error.message : 'Could not create project'}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={create.isPending}>
          Cancel
        </button>
        <button type="submit" disabled={create.isPending || name.trim() === ''}>
          {create.isPending ? 'Creating…' : 'Create project'}
        </button>
      </div>
    </form>
  );
}
