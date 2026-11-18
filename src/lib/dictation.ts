// Ditado por voz (Web Speech API): converte fala em texto em tempo real.
export const dictationSupported = () => typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

const COMMANDS: [RegExp, string][] = [
  [/\s*\bponto final\b/gi, '.'],
  [/\s*\bponto de interroga[çc][aã]o\b/gi, '?'],
  [/\s*\bponto de exclama[çc][aã]o\b/gi, '!'],
  [/\s*\bv[íi]rgula\b/gi, ','],
  [/\s*\bdois pontos\b/gi, ':'],
  [/\s*\bponto e v[íi]rgula\b/gi, ';'],
  [/\s*\bnova linha\b\s*/gi, '\n'],
  [/\s*\bnovo par[áa]grafo\b\s*/gi, '\n'],
];

export function applyCommands(text: string): string {
  let t = text;
  for (const [re, rep] of COMMANDS) t = t.replace(re, rep);
  // Maiúscula depois de ponto final e no início
  return t.replace(/(^|[.!?]\s+|\n)([a-zà-ú])/g, (_m, a, b) => a + b.toUpperCase());
}

export interface Dictation { stop(): void }

export function startDictation(opts: {
  lang?: string;
  onFinal: (text: string) => void;
  onInterim?: (text: string) => void;
  onEnd?: () => void;
  onError?: (msg: string) => void;
}): Dictation | null {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = opts.lang || 'pt-PT';
  rec.continuous = true;
  rec.interimResults = true;
  let stopped = false;
  rec.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) opts.onFinal(applyCommands(r[0].transcript.trim()));
      else interim += r[0].transcript;
    }
    opts.onInterim?.(interim);
  };
  rec.onerror = (e: any) => {
    if (e.error === 'not-allowed') opts.onError?.('Sem acesso ao microfone. Verifique as permissões.');
    else if (e.error !== 'no-speech' && e.error !== 'aborted') opts.onError?.('Erro no ditado: ' + e.error);
  };
  // Alguns browsers param após silêncio; reinicia enquanto o utilizador não parar
  rec.onend = () => {
    if (!stopped) { try { rec.start(); return; } catch {} }
    opts.onInterim?.('');
    opts.onEnd?.();
  };
  rec.start();
  return { stop() { stopped = true; try { rec.stop(); } catch {} } };
}
