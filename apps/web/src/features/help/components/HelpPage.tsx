import { Link, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';

import { HELP_TOPICS, helpTopicById } from '../topics.js';

export function HelpPage() {
  const hash = useRouterState({ select: (s) => s.location.hash.replace(/^#/, '') });
  const active = helpTopicById(hash) ?? HELP_TOPICS[0]!;

  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash);
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [hash]);

  return (
    <div className="page help-page" data-testid="help-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/projects">← Projects</Link>
          </p>
          <h1>Help</h1>
          <p className="lede muted">
            User manual for Project Scheduler — schedule, resources, roles, activity/audit, tracking,
            import, and reports. Use page ? links to jump here from the workspace.
          </p>
        </div>
      </header>

      <div className="help-layout">
        <nav className="help-toc" aria-label="Help topics">
          <h2 className="help-toc-title">Topics</h2>
          <ul>
            {HELP_TOPICS.map((topic) => (
              <li key={topic.id}>
                <Link
                  to="/help"
                  hash={topic.id}
                  className={
                    topic.id === active.id ? 'help-toc-link is-active' : 'help-toc-link'
                  }
                >
                  {topic.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="help-content">
          {HELP_TOPICS.map((topic) => (
            <article
              key={topic.id}
              id={topic.id}
              className={
                topic.id === active.id ? 'help-topic is-active' : 'help-topic'
              }
            >
              <h2>{topic.title}</h2>
              <p className="help-topic-summary">{topic.summary}</p>
              {topic.paragraphs.map((p) => (
                <p key={p.slice(0, 48)}>{p}</p>
              ))}
              {topic.tips && topic.tips.length > 0 ? (
                <div className="help-tips">
                  <h3>Tips</h3>
                  <ul>
                    {topic.tips.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
