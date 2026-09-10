import { ReactNode } from 'react';

type SectionHeaderProps = {
  title: string;
  action?: ReactNode;
};

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="forager-section-header">
      <p className="forager-section-title">{title}</p>
      {action}
    </div>
  );
}
