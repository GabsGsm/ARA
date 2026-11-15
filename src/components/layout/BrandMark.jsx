// Marca ARA com órbita dourada e estrela.
export default function BrandMark({ className = "h-[50px] w-[118px]" }) {
  return (
    <svg viewBox="0 0 170 70" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="araInk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset=".55" stopColor="#f7dfa6" />
          <stop offset="1" stopColor="#e9ad3a" />
        </linearGradient>
      </defs>
      <ellipse cx="82" cy="40" rx="78" ry="22" fill="none" stroke="#f2b53a" strokeWidth="2.2" transform="rotate(-12 82 40)" />
      <text x="85" y="56" textAnchor="middle" fontFamily="Michroma, sans-serif" fontSize="38" fontWeight="700" fill="url(#araInk)">ARA</text>
      <path d="M129 8l2.2 6.3 6.3 2.2-6.3 2.2-2.2 6.3-2.2-6.3-6.3-2.2 6.3-2.2z" fill="#f7c75a" />
      <circle cx="44" cy="22" r="1.6" fill="#f7c75a" />
    </svg>
  );
}
