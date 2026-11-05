/**
 * ui/VerdictPill.tsx – Small verdict label with an icon AND text (never colour alone); demo data is dashed and grey.
 */

import React from 'react';
import { VERDICT_TEXT, type Verdict } from '../core/verdict';
import { AlertIcon, CheckIcon, InfoIcon } from './icons';

const ICON: Record<Verdict, React.ReactNode> = {
  likely_fake: <AlertIcon size={14} />,
  likely_real: <CheckIcon size={14} />,
  inconclusive: <InfoIcon size={14} />,
};

export const VerdictPill: React.FC<{ verdict: Verdict; mock?: boolean }> = ({ verdict, mock }) => (
  <span className="ml-pill" data-verdict={verdict} data-mock={mock ? 'true' : undefined}>
    {ICON[verdict]}
    <span>{VERDICT_TEXT[verdict]}</span>
    {mock && <span className="ml-pill-demo">DEMO</span>}
  </span>
);
