// Campo para mudar o nome no próprio sítio (duplo clique). Enter guarda, Esc cancela.
import { useEffect, useRef, useState } from 'react';

export function InlineRename({ value, onSave, onDone, className = '' }: { value: string; onSave: (v: string) => void; onDone: () => void; className?: string }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const commit = () => {
    if (finished.current) return;
    finished.current = true;
    const t = v.trim();
    if (t && t !== value) onSave(t);
    onDone();
  };
  return (
    <input ref={ref} className={'inline-rename ' + className} value={v}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { finished.current = true; onDone(); }
      }}
      onBlur={commit} />
  );
}
