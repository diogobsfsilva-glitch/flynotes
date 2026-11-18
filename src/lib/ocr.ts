// Reconhecimento de texto em imagens (OCR) para tornar fotos e digitalizações pesquisáveis.
// O Tesseract.js é carregado a pedido a partir de CDN, apenas quando é necessário.
let worker: any = null;

async function loadTesseract(): Promise<any> {
  if ((window as any).Tesseract) return (window as any).Tesseract;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Não foi possível carregar o OCR'));
    document.head.appendChild(s);
  });
  return (window as any).Tesseract;
}

export async function ocrImage(blob: Blob): Promise<string> {
  const T = await loadTesseract();
  if (!worker) worker = await T.createWorker(['por', 'eng']);
  const { data } = await worker.recognize(blob);
  return data.text || '';
}
