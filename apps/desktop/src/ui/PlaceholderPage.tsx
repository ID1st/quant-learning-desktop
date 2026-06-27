import type { PropsWithChildren } from "react";

interface PlaceholderPageProps extends PropsWithChildren {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description, children }: PlaceholderPageProps) {
  return (
    <article className="placeholder-page">
      <header>
        <p>Phase 3 scaffold</p>
        <h1>{title}</h1>
        <span>{description}</span>
      </header>
      {children}
    </article>
  );
}
