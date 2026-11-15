// Cartão de vidro com título opcional no estilo "eyebrow".
export default function Card({ title, titleId, as: Tag = "section", children, className = "", ...rest }) {
  return (
    <Tag className={`card ${className}`} aria-labelledby={title ? titleId : undefined} {...rest}>
      {title && <h2 id={titleId} className="eyebrow">{title}</h2>}
      {children}
    </Tag>
  );
}

export function PageHeader({ title, lead, children }) {
  return (
    <header className="mb-6">
      <h1 className="display text-[clamp(26px,3vw,42px)] after:mt-3.5 after:block after:h-1 after:w-[52px] after:rounded after:bg-gold after:shadow-[0_0_12px_rgb(242_181_58/.7)] after:content-['']">{title}</h1>
      {lead && <p className="lead mt-3.5">{lead}</p>}
      {children}
    </header>
  );
}
