import { spawn } from 'child_process';

export interface OcrTextBox {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Runs installed Tesseract entirely on the target PC. Image bytes never leave
 * the machine; failures simply mean visual evidence is unavailable.
 */
export function ocrPngBase64(base64Png: string): Promise<OcrTextBox[]> {
  return new Promise((resolve) => {
    if (!base64Png) return resolve([]);
    const child = spawn('tesseract.exe', ['stdin', 'stdout', '--psm', '11', 'tsv'], { windowsHide: true });
    let stdout = '';
    let settled = false;
    const finish = (boxes: OcrTextBox[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(boxes);
    };
    const timeout = setTimeout(() => {
      try { child.kill(); } catch {}
      finish([]);
    }, 8000);
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    // Tesseract can close stdin early after rejecting an image. Without this
    // handler Node treats the resulting EPIPE/EOF as an uncaught exception.
    child.stdin.on('error', () => finish([]));
    child.on('error', () => finish([]));
    child.on('close', (code) => {
      if (code !== 0) return finish([]);
      const rows = stdout.split(/\r?\n/).slice(1);
      const boxes: OcrTextBox[] = [];
      for (const row of rows) {
        const columns = row.split('\t');
        if (columns.length < 12) continue;
        const text = columns.slice(11).join(' ').trim();
        const confidence = Number(columns[10]);
        const x = Number(columns[6]);
        const y = Number(columns[7]);
        const width = Number(columns[8]);
        const height = Number(columns[9]);
        if (!text || !Number.isFinite(confidence) || confidence < 35 || width < 3 || height < 3) continue;
        boxes.push({ text, confidence, x, y, width, height });
      }
      finish(boxes);
    });
    try {
      child.stdin.end(Buffer.from(base64Png, 'base64'));
    } catch {
      try { child.kill(); } catch {}
      finish([]);
    }
  });
}
