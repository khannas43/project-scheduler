import { Link } from '@tanstack/react-router';

import type { HelpTopicId } from '../topics.js';

interface HelpLinkProps {
  readonly topic: HelpTopicId;
  readonly label?: string;
  readonly className?: string;
}

/** Contextual link into the in-product Help manual. */
export function HelpLink({ topic, label = 'Help', className }: HelpLinkProps) {
  return (
    <Link
      to="/help"
      hash={topic}
      className={className ?? 'help-link'}
      title={`Open help: ${topic}`}
      data-testid={`help-link-${topic}`}
    >
      <span className="help-link-mark" aria-hidden="true">
        ?
      </span>
      <span className="help-link-label">{label}</span>
    </Link>
  );
}
