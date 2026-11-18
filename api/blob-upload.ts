// Emite tokens para carregamento direto de ficheiros grandes (> 4 MB) para o Vercel Blob.
import { isAuthed, json, unauthorized } from './_lib/auth.js';
import { blobEnabled } from './_lib/storage.js';

export async function POST(req: Request) {
  if (!blobEnabled()) return json({ error: 'blob indisponível' }, { status: 501 });
  const body = await req.json();
  const { handleUpload } = await import('@vercel/blob/client');
  // O pedido de token exige sessão; o callback de conclusão vem da Vercel e é validado pela biblioteca.
  if (body?.type === 'blob.generate-client-token' && !isAuthed(req)) return unauthorized();
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname: string) => {
        if (!/^files\/[A-Za-z0-9_-]{6,64}$/.test(pathname)) throw new Error('caminho inválido');
        return { addRandomSuffix: false, allowOverwrite: true, maximumSizeInBytes: 200 * 1024 * 1024 };
      },
      onUploadCompleted: async () => {},
    });
    return json(result);
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, { status: 400 });
  }
}
