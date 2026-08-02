interface PageHeaderProps {
  title: string;
  description?: string;
  /** Optional action area rendered on the right (buttons, filters…). */
  children?: React.ReactNode;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight break-words">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground break-words">
            {description}
          </p>
        ) : null}
      </div>
      {children ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}
