import type { LayoutMode } from './types';

// Starting points for explaining something right now, in the same plain text
// a person could paste: an indented outline or Mermaid.
export type Template = { id: string; label: string; layout: Exclude<LayoutMode, 'free'>; text: string };

export const TEMPLATES: Template[] = [
    {
        id: 'process', label: 'Process', layout: 'right',
        text: `flowchart LR
    a([Request comes in]) --> b[Triage]
    b --> c{Clear enough?}
    c -->|yes| d[Do the work]
    c -->|no| e[Ask for details]
    e --> b
    d --> f[Review]
    f --> g([Done])`,
    },
    {
        id: 'timeline', label: 'Timeline', layout: 'timeline',
        text: `Project timeline
  January
    Kickoff
  March
    First prototype
    User interviews
  June
    Beta
  September
    Launch`,
    },
    {
        id: 'org', label: 'Org chart', layout: 'down',
        text: `CEO
  Engineering
    Platform
    Product
  Design
  Sales
    Americas
    EMEA`,
    },
    {
        id: 'decision', label: 'Decision tree', layout: 'right',
        text: `flowchart LR
    a{Is it urgent?} -->|yes| b{Is it important?}
    a -->|no| c{Is it important?}
    b -->|yes| d[Do it now]
    b -->|no| e[Delegate]
    c -->|yes| f[Schedule]
    c -->|no| g[Drop]`,
    },
    {
        id: 'mindmap', label: 'Mind map', layout: 'mindmap',
        text: `Main idea
  Why
  What
  Who
  When
  How`,
    },
];
