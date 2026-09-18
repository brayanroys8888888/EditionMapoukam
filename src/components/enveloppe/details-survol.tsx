'use client';

import type { ReactNode } from 'react';

export function DetailsSurvol({
  children,
  className,
  ouvert = false,
}: {
  children: ReactNode;
  className?: string;
  ouvert?: boolean;
}): ReactNode {
  return (
    <details
      className={className}
      open={ouvert}
      onMouseEnter={(event) => {
        event.currentTarget.open = true;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.open = false;
      }}
      onFocus={(event) => {
        event.currentTarget.open = true;
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          event.currentTarget.open = false;
        }
      }}
    >
      {children}
    </details>
  );
}
