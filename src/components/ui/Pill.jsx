// Botão/link em pílula do design. variant="gold" tem a borda dourada com brilho.
import { Link } from "react-router-dom";

const SIZES = {
  lg: "gap-3.5 px-8 py-3.5 text-base sm:text-lg",
  sm: "gap-2 px-5 py-2.5 text-xs",
};

export default function Pill({ to, onClick, variant = "light", size = "lg", icon, arrow = "→", children, className = "", ...rest }) {
  const cls = [
    "inline-flex items-center justify-center rounded-full border-[1.5px] bg-petrol-950/35 font-display uppercase tracking-[0.15em] text-ink no-underline",
    "transition hover:-translate-y-0.5 hover:bg-gold/10",
    variant === "gold" ? "pill-gold border-gold" : "border-white/70",
    SIZES[size], className,
  ].join(" ");
  const content = (
    <>
      {icon && <span className={variant === "gold" ? "text-gold-2" : "text-ink"}>{icon}</span>}
      {children}
      {arrow && <span aria-hidden="true" className="font-body text-xl leading-none">{arrow}</span>}
    </>
  );
  return to
    ? <Link to={to} className={cls} {...rest}>{content}</Link>
    : <button type="button" onClick={onClick} className={cls} {...rest}>{content}</button>;
}
