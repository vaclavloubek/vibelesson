type ParsedNumberedList = {
  prefix: string;
  items: string[];
};

function parseNumberedList(text: string): ParsedNumberedList | null {
  const matches = [...text.matchAll(/(^|\s)(\d{1,2})[.)]\s+/g)];
  if (matches.length < 2) return null;

  const markers = matches.map((match) => ({
    number: Number(match[2]),
    markerStart: (match.index ?? 0) + match[1].length,
    contentStart: (match.index ?? 0) + match[0].length,
  }));

  if (markers[0].number !== 1) return null;
  for (let index = 1; index < markers.length; index += 1) {
    if (markers[index].number !== markers[index - 1].number + 1) return null;
  }

  const items = markers.map((marker, index) => {
    const end = index + 1 < markers.length ? markers[index + 1].markerStart : text.length;
    return text.slice(marker.contentStart, end).trim();
  });

  if (items.some((item) => !item)) return null;
  return {
    prefix: text.slice(0, markers[0].markerStart).trim(),
    items,
  };
}

export default function FormattedInstructions({ text, className, lang }: { text: string; className?: string; lang?: string | null }) {
  const parsed = parseNumberedList(text);

  if (!parsed) {
    return <div className={className} lang={lang ?? undefined} dir={lang ? 'auto' : undefined} style={{ whiteSpace: 'pre-line' }}>{text}</div>;
  }

  return (
    <div className={className} lang={lang ?? undefined} dir={lang ? 'auto' : undefined}>
      {parsed.prefix ? <p style={{ marginTop: 0, marginBottom: 8 }}>{parsed.prefix}</p> : null}
      <ol style={{ margin: 0, paddingLeft: '1.5em', display: 'grid', gap: 6 }}>
        {parsed.items.map((item, index) => <li key={index}>{item}</li>)}
      </ol>
    </div>
  );
}
