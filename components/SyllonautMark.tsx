export default function SyllonautMark({ className = '' }: { className?: string }) {
  return (
    <span className={`syllonaut-mark ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 36 36" role="img" focusable="false">
        <path
          className="syllonaut-mark-orbit"
          d="M27.8 8.3c-3.1-3-8.5-3.8-13.1-1.8-4.6 2-7.1 6.1-5.5 9.1 1.6 3 6.7 3.7 11.5 1.7 4.8-2 7.5-6 6-9"
        />
        <path
          className="syllonaut-mark-path"
          d="M10.2 27.4c2.7 2.1 7.2 2.6 11 .9 4.7-2.1 7.1-6.3 5.4-9.3-1.5-2.7-5.8-3.7-10.2-2.2-4.7 1.6-7.7 5.4-6.7 8.4"
        />
        <circle className="syllonaut-mark-node" cx="27.8" cy="8.3" r="2.2" />
      </svg>
    </span>
  );
}
