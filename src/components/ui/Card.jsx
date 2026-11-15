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
      <h1 className="display text-[clamp(26px,3vw,40px)]">{title}</h1>
      {lead && <p className="lead mt-2.5">{lead}</p>}
      {children}
    </header>
  );
}
