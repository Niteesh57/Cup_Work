// Browser DOM automation via the Chrome DevTools Protocol (CDP).
//
// Strategy: drive the browser's DOM directly instead of guessing pixel
// coordinates. Works with any Chromium-based browser (Chrome, Edge) launched
// with --remote-debugging-port=9222, or we launch Chrome ourselves with the
// flag if no CDP endpoint is reachable.

import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';
import http from 'http';
import path from 'path';
import fs from 'fs';

const DEFAULT_CDP_PORT = 9222;

let launchedChrome: ChildProcess | null = null;

interface CdpTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
}

function httpGetJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => {
      req.destroy(new Error('CDP http timeout'));
    });
  });
}

function findChromePath(): string | null {
  const candidates = [
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe') : '',
    process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe') : '',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe') : '',
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe') : '',
    process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe') : '',
  ];
  return candidates.find((c) => c && fs.existsSync(c)) || null;
}

async function getTargets(): Promise<CdpTarget[]> {
  const res = (await httpGetJson(`http://127.0.0.1:${DEFAULT_CDP_PORT}/json/list`)) as CdpTarget[];
  return Array.isArray(res) ? res : [];
}

/**
 * Checks for an already-running browser debugging endpoint without launching
 * Chrome.  It is deliberately side-effect free so the element resolver can
 * include browser evidence in every parallel observation pass.
 */
export async function browserProbe(): Promise<Record<string, unknown>> {
  try {
    const targets = await getTargets();
    const pages = targets
      .filter((target) => target.type === 'page' && !target.url.startsWith('devtools://'))
      .slice(0, 8)
      .map((target) => ({ title: target.title, url: target.url }));
    return { success: true, available: pages.length > 0, pages };
  } catch {
    return { success: true, available: false, pages: [] };
  }
}

async function ensureCdp(): Promise<CdpTarget[]> {
  // Try to reach an existing CDP endpoint first.
  try {
    const targets = await getTargets();
    if (targets.some((t) => t.type === 'page')) return targets;
  } catch {
    // No endpoint — launch Chrome with remote debugging.
  }

  const chromePath = findChromePath();
  if (!chromePath) {
    throw new Error('Chrome/Edge not found and no CDP endpoint reachable');
  }

  // Use a dedicated user-data-dir so we don't conflict with an existing
  // Chrome session, and open a blank page.
  const userDataDir = path.join(process.env.TEMP || '/tmp', 'hey-jave-chrome');
  const args = [
    `--remote-debugging-port=${DEFAULT_CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ];
  launchedChrome = spawn(chromePath, args, { stdio: 'ignore', detached: true });
  launchedChrome.unref();

  // Wait for the CDP endpoint to come up.
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 400));
    try {
      const targets = await getTargets();
      if (targets.some((t) => t.type === 'page')) return targets;
    } catch {
      // not up yet
    }
  }
  throw new Error('Chrome launched but CDP endpoint did not come up');
}

// ── CDP session (one WebSocket per target) ───────────────────────────────────

class CdpSession {
  private ws: WebSocket;
  private id = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor(private target: CdpTarget) {
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);
      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      });
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      // Safety timeout so a hung target doesn't block the executor forever.
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP ${method} timed out`));
        }
      }, 15000);
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

async function getPageSession(): Promise<CdpSession> {
  const targets = await ensureCdp();
  // Prefer the active page (ignore devtools/extension targets).
  const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
  if (!page) throw new Error('No page target found');
  const session = new CdpSession(page);
  await session.connect();
  return session;
}

// ── Tool implementations ─────────────────────────────────────────────────────

/**
 * Evaluates a JS expression in the active page and returns the JSON result.
 * Used internally by every browser_* tool.
 */
async function evaluate(expression: string): Promise<unknown> {
  const session = await getPageSession();
  try {
    const res = (await session.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as { result?: { value?: unknown; type?: string; description?: string }; exceptionDetails?: unknown };
    if (res.exceptionDetails) {
      throw new Error('Page evaluation threw: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  } finally {
    session.close();
  }
}

export async function browserNavigate(url: string): Promise<Record<string, unknown>> {
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const session = await getPageSession();
  try {
    await session.send('Page.navigate', { url });
    // Wait a moment for the page to start loading.
    await new Promise((r) => setTimeout(r, 1200));
    return { success: true, url };
  } finally {
    session.close();
  }
}

export async function browserGetUrl(): Promise<Record<string, unknown>> {
  const url = await evaluate('location.href');
  return { success: true, url: String(url || '') };
}

export async function browserGetTitle(): Promise<Record<string, unknown>> {
  const title = await evaluate('document.title');
  return { success: true, title: String(title || '') };
}

export async function browserFindElement(selector: string, name?: string, placeholder?: string): Promise<Record<string, unknown>> {
  const expr = `(() => {
    const pick = () => {
      if (${JSON.stringify(selector)}) {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) return el;
      }
      if (${JSON.stringify(name || '')}) {
        const el = document.querySelector('[name=' + JSON.stringify(${JSON.stringify(name)}) + ']');
        if (el) return el;
      }
      if (${JSON.stringify(placeholder || '')}) {
        const els = Array.from(document.querySelectorAll('input,textarea'));
        const el = els.find((e) => e.getAttribute('placeholder') === ${JSON.stringify(placeholder)});
        if (el) return el;
      }
      return null;
    };
    const el = pick();
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      found: true,
      tag: el.tagName,
      id: el.id,
      name: el.getAttribute('name'),
      type: el.getAttribute('type'),
      placeholder: el.getAttribute('placeholder'),
      ariaLabel: el.getAttribute('aria-label'),
      text: (el.textContent || '').trim().slice(0, 200),
      value: el.value !== undefined ? el.value : undefined,
      visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none',
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
      centerX: Math.round(r.x + r.width / 2),
      centerY: Math.round(r.y + r.height / 2),
    };
  })()`;
  return { success: true, element: await evaluate(expr) };
}

export async function browserSetValue(selector: string, text: string, name?: string, placeholder?: string): Promise<Record<string, unknown>> {
  const expr = `(() => {
    const pick = () => {
      if (${JSON.stringify(selector)}) {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) return el;
      }
      if (${JSON.stringify(name || '')}) {
        const el = document.querySelector('[name=' + JSON.stringify(${JSON.stringify(name)}) + ']');
        if (el) return el;
      }
      if (${JSON.stringify(placeholder || '')}) {
        const els = Array.from(document.querySelectorAll('input,textarea'));
        const el = els.find((e) => e.getAttribute('placeholder') === ${JSON.stringify(placeholder)});
        if (el) return el;
      }
      return null;
    };
    const el = pick();
    if (!el) return { found: false };
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT' ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, ${JSON.stringify(text)});
    else el.value = ${JSON.stringify(text)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { found: true };
  })()`;
  return { success: true, result: await evaluate(expr) };
}

export async function browserClick(selector: string, name?: string, placeholder?: string): Promise<Record<string, unknown>> {
  const expr = `(() => {
    const pick = () => {
      if (${JSON.stringify(selector)}) {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) return el;
      }
      if (${JSON.stringify(name || '')}) {
        const el = document.querySelector('[name=' + JSON.stringify(${JSON.stringify(name)}) + ']');
        if (el) return el;
      }
      if (${JSON.stringify(placeholder || '')}) {
        const els = Array.from(document.querySelectorAll('input,textarea'));
        const el = els.find((e) => e.getAttribute('placeholder') === ${JSON.stringify(placeholder)});
        if (el) return el;
      }
      return null;
    };
    const el = pick();
    if (!el) return { found: false };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.click();
    return { found: true, tag: el.tagName, text: (el.textContent || '').trim().slice(0, 100) };
  })()`;
  return { success: true, result: await evaluate(expr) };
}

export async function browserPressKey(selector: string, key: string): Promise<Record<string, unknown>> {
  // Focus the target first (DOM-level), then dispatch a REAL key event via
  // CDP Input domain so the page's native handler fires (e.g. Enter to search).
  const focusExpr = `(() => {
    let el = null;
    if (${JSON.stringify(selector)}) {
      el = document.querySelector(${JSON.stringify(selector)});
    }
    if (!el) el = document.activeElement;
    if (!el) return false;
    el.focus();
    return true;
  })()`;
  const focused = await evaluate(focusExpr);
  if (!focused) return { success: false, message: 'No focusable element for key press' };

  const session = await getPageSession();
  try {
    const keyMap: Record<string, { key: string; code: string; windowsVirtualKeyCode: number }> = {
      Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
      Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
      Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
      Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
      ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
      ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
      ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
      ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
    };
    const k = keyMap[key] || { key, code: key, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0 };
    await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k.key, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode });
    await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode });
    return { success: true, key };
  } finally {
    session.close();
  }
}

export async function browserGetText(selector: string): Promise<Record<string, unknown>> {
  const expr = `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { found: false };
    return { found: true, text: (el.textContent || '').trim().slice(0, 500) };
  })()`;
  return { success: true, result: await evaluate(expr) };
}

export async function browserListElements(selector: string): Promise<Record<string, unknown>> {
  const expr = `(() => {
    const els = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).slice(0, 30);
    return els.map((el, i) => {
      const r = el.getBoundingClientRect();
      return {
        index: i,
        tag: el.tagName,
        id: el.id,
        name: el.getAttribute('name'),
        type: el.getAttribute('type'),
        placeholder: el.getAttribute('placeholder'),
        ariaLabel: el.getAttribute('aria-label'),
        text: (el.textContent || '').trim().slice(0, 100),
        value: el.value !== undefined ? el.value : undefined,
        href: el.getAttribute('href'),
        visible: r.width > 0 && r.height > 0,
        centerX: Math.round(r.x + r.width / 2),
        centerY: Math.round(r.y + r.height / 2),
      };
    });
  })()`;
  return { success: true, elements: await evaluate(expr) };
}

export async function browserWaitForSelector(selector: string, timeoutMs = 8000): Promise<Record<string, unknown>> {
  const expr = `new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (el) return resolve({ found: true });
      if (Date.now() - start > ${timeoutMs}) return resolve({ found: false, timeout: true });
      setTimeout(check, 200);
    };
    check();
  })`;
  return { success: true, result: await evaluate(expr) };
}

// ── High-level search: works on any site (Google, YouTube, Bing, generic) ────

const SEARCH_SELECTORS: Record<string, { box: string; button?: string; name?: string; placeholder?: string }> = {
  google: { box: 'textarea[name=q], input[name=q]', name: 'q' },
  youtube: { box: 'input[name=search_query]', name: 'search_query', button: "button[aria-label='Search']" },
  bing: { box: 'input[name=q]', name: 'q' },
  duckduckgo: { box: 'input[name=q]', name: 'q' },
  wikipedia: { box: 'input[name=search]', name: 'search' },
};

export async function browserSearch(query: string, site?: string): Promise<Record<string, unknown>> {
  const target = (site || '').toLowerCase();
  let url: string;
  let cfg: { box: string; button?: string; name?: string; placeholder?: string };

  if (target.includes('youtube')) {
    url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
    cfg = SEARCH_SELECTORS.youtube;
  } else if (target.includes('bing')) {
    url = 'https://www.bing.com/search?q=' + encodeURIComponent(query);
    cfg = SEARCH_SELECTORS.bing;
  } else if (target.includes('duckduckgo')) {
    url = 'https://duckduckgo.com/?q=' + encodeURIComponent(query);
    cfg = SEARCH_SELECTORS.duckduckgo;
  } else if (target.includes('wikipedia')) {
    url = 'https://en.wikipedia.org/w/index.php?search=' + encodeURIComponent(query);
    cfg = SEARCH_SELECTORS.wikipedia;
  } else {
    // Default to Google (works for both google.com and generic web search).
    url = 'https://www.google.com/search?q=' + encodeURIComponent(query);
    cfg = SEARCH_SELECTORS.google;
  }

  // Navigate directly to the search-results URL — no typing, no key press,
  // no site-specific timing. This is the most reliable path.
  await browserNavigate(url);
  // Wait for the results container to appear.
  try {
    await browserWaitForSelector(cfg.box, 8000);
  } catch {
    // Some engines render results without the input present; ignore.
  }
  return { success: true, engine: target || 'google', url };
}

export async function executeBrowserTool(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  switch (name) {
    case 'browser_probe':
      return browserProbe();
    case 'browser_navigate':
      return browserNavigate(String(args.url || ''));
    case 'browser_get_url':
      return browserGetUrl();
    case 'browser_get_title':
      return browserGetTitle();
    case 'browser_search':
      return browserSearch(String(args.query || ''), args.site !== undefined ? String(args.site) : undefined);
    case 'browser_find_element':
      return browserFindElement(String(args.selector || ''), args.name !== undefined ? String(args.name) : undefined, args.placeholder !== undefined ? String(args.placeholder) : undefined);
    case 'browser_set_value':
      return browserSetValue(String(args.selector || ''), String(args.text || ''), args.name !== undefined ? String(args.name) : undefined, args.placeholder !== undefined ? String(args.placeholder) : undefined);
    case 'browser_click':
      return browserClick(String(args.selector || ''), args.name !== undefined ? String(args.name) : undefined, args.placeholder !== undefined ? String(args.placeholder) : undefined);
    case 'browser_press_key':
      return browserPressKey(String(args.selector || ''), String(args.key || 'Enter'));
    case 'browser_get_text':
      return browserGetText(String(args.selector || ''));
    case 'browser_list_elements':
      return browserListElements(String(args.selector || ''));
    case 'browser_wait_for_selector':
      return browserWaitForSelector(String(args.selector || ''), Number(args.timeoutMs) || 8000);
    default:
      throw new Error(`Unrecognized browser tool: ${name}`);
  }
}

export function closeLaunchedChrome() {
  if (launchedChrome) {
    try {
      launchedChrome.kill();
    } catch {}
    launchedChrome = null;
  }
}
