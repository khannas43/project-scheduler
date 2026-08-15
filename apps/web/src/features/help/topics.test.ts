import { describe, expect, it } from 'vitest';

import { HELP_TOPICS, helpTopicById } from './topics.js';

describe('help topics', () => {
  it('has unique ids and required fields', () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const topic of HELP_TOPICS) {
      expect(topic.title.length).toBeGreaterThan(0);
      expect(topic.summary.length).toBeGreaterThan(0);
      expect(topic.paragraphs.length).toBeGreaterThan(0);
    }
  });

  it('resolves known topic ids', () => {
    expect(helpTopicById('schedule')?.title).toMatch(/Schedule/i);
    expect(helpTopicById('missing')).toBeUndefined();
  });

  it('documents role creation activity on Roles and Activity topics', () => {
    const roles = helpTopicById('roles');
    const activity = helpTopicById('activity');
    expect(roles?.paragraphs.join(' ')).toMatch(/role\.create/);
    expect(activity?.paragraphs.join(' ')).toMatch(/role\.create/);
    expect(activity?.tips?.join(' ') ?? '').toMatch(/role\./);
  });
});
