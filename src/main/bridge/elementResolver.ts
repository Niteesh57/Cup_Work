import { UiaBridge } from './uiaBridge';
import { executeBrowserTool } from './browserCdp';
import { ocrPngBase64 } from './localOcr';

type Json = Record<string, unknown>;
type Action = 'click' | 'type' | 'select' | 'toggle' | 'expand' | 'scroll_into_view';

interface TargetRequest {
  description?: string;
  name?: string;
  role?: string;
  selector?: string;
  automationId?: string;
  controlType?: string;
  windowTitle?: string;
}

interface Candidate {
  id: string;
  source: 'browser-dom' | 'windows-uia';
  action: Action;
  score: number;
  evidence: string[];
  selector?: string;
  uia?: Json;
  bounds?: Json;
}

const BROWSER_LIST_SELECTOR = "input,textarea,select,button,a,[role='button'],[role='link'],[role='tab'],[role='radio'],[role='checkbox'],[role='option'],[role='menuitem'],div[tabindex],span[tabindex],div[role],span[role],mat-card,mat-radio-button";
const ROLE_TYPES: Record<string, string[]> = {
  button: ['Button', 'SplitButton', 'MenuItem', 'Custom', 'Pane', 'Group', 'Hyperlink', 'Text', 'ListItem', 'TabItem', 'RadioButton', 'CheckBox'],
  input: ['Edit', 'ComboBox', 'Document', 'Custom', 'Pane'],
  textbox: ['Edit', 'Document', 'Custom', 'Pane'],
  link: ['Hyperlink', 'Text', 'Custom', 'Button'],
  tab: ['TabItem', 'ListItem', 'Button', 'Custom'],
  checkbox: ['CheckBox', 'Custom', 'RadioButton'],
  radio: ['RadioButton', 'Custom', 'CheckBox'],
  menuitem: ['MenuItem', 'ListItem', 'Button', 'Custom'],
  listitem: ['ListItem', 'Group', 'Custom', 'Pane'],
};

function record(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function tokenScore(haystack: string, needle: string): number {
  const target = needle.toLowerCase().trim();
  const value = haystack.toLowerCase().trim();
  if (!target || !value) return 0;
  if (value === target) return 0.65;
  if (value.includes(target)) return 0.50;
  if (target.includes(value) && value.length >= 4) return 0.40;
  const tokens = target.split(/[^a-z0-9]+/).filter((part) => part.length >= 2);
  if (!tokens.length) return 0;
  const matched = tokens.filter((part) => value.includes(part)).length;
  return (matched / tokens.length) * 0.35;
}

function cssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Local, side-effect-free target resolver. It joins UIA, browser-DOM, active
 * window, and display evidence before exposing an actionable element. The
 * cloud receives candidates and confidence, never needs to guess coordinates.
 */
export class ElementResolver {
  constructor(private readonly uia: UiaBridge) {}

  async resolve(rawTarget: Json = {}, requestedAction: Action = 'click'): Promise<Json> {
    const target = rawTarget as TargetRequest;
    const query = target.name || target.description || target.automationId || '';

    // These independent, read-only probes deliberately run at the same time.
    const [activeResult, displayResult, interactiveResult, searchResult, browserProbeResult, screenshotResult] = await Promise.allSettled([
      this.uia.getActiveWindow(),
      this.uia.getScreenResolution(),
      this.uia.uiaGetInteractiveElements({ windowTitle: target.windowTitle, maxElements: 120 }),
      query ? this.uia.uiaSearchElements(query, { windowTitle: target.windowTitle, maxResults: 40 }) : Promise.resolve({ success: true, elements: [] }),
      executeBrowserTool('browser_probe'),
      this.uia.takeScreenshot(),
    ]);

    const active = activeResult.status === 'fulfilled' ? record(activeResult.value) : {};
    const display = displayResult.status === 'fulfilled' ? record(displayResult.value) : {};
    const activeTitle = string(active.title);
    const activeIsBrowser = /\b(chrome|edge|chromium)\b/i.test(activeTitle);
    const browserProbe = browserProbeResult.status === 'fulfilled' ? record(browserProbeResult.value) : {};
    const browserAvailable = activeIsBrowser && browserProbe.available === true;

    // Browser element lookup happens only after a confirmed, already-running
    // CDP target is found. It never launches or focuses a browser as a probe.
    const browserQueries: Promise<Json>[] = [];
    if (browserAvailable) {
      if (target.selector) browserQueries.push(executeBrowserTool('browser_find_element', { selector: target.selector }));
      browserQueries.push(executeBrowserTool('browser_list_elements', { selector: BROWSER_LIST_SELECTOR }));
    }
    const browserResults = await Promise.allSettled(browserQueries);

    // OCR is an independent visual signal for custom-drawn controls which do
    // not expose accessibility metadata.
    const shot = screenshotResult.status === 'fulfilled' ? record(screenshotResult.value) : {};
    const ocrWords = await ocrPngBase64(string(shot.base64));

    const candidates: Candidate[] = [];
    const interactive = interactiveResult.status === 'fulfilled' ? record(interactiveResult.value) : {};
    const searched = searchResult.status === 'fulfilled' ? record(searchResult.value) : {};
    const uiaElements = [
      ...(Array.isArray(interactive.elements) ? interactive.elements : []),
      ...(Array.isArray(searched.elements) ? searched.elements : []),
    ];
    const seenUia = new Set<string>();

    for (const value of uiaElements) {
      const element = record(value);
      const name = string(element.name);
      const automationId = string(element.automationId);
      const controlType = string(element.controlType);
      const bounds = record(element.bounds);
      const key = `${automationId}|${name}|${controlType}|${string(bounds.x)}|${string(bounds.y)}`;
      if (seenUia.has(key) || element.enabled === false || element.offscreen === true) continue;
      seenUia.add(key);

      let score = 0.15;
      const evidence = ['visible Windows UI Automation element'];
      if (target.automationId && automationId.toLowerCase() === target.automationId.toLowerCase()) { score += 0.60; evidence.push('exact AutomationId'); }
      if (target.controlType && controlType.toLowerCase() === target.controlType.toLowerCase()) { score += 0.20; evidence.push('exact control type'); }
      if (target.role && (ROLE_TYPES[target.role.toLowerCase()] || []).includes(controlType)) { score += 0.20; evidence.push(`role=${target.role}`); }
      const nameMatch = Math.max(
        tokenScore(name, target.name || ''),
        tokenScore(`${name} ${automationId} ${controlType}`, target.description || target.name || '')
      );
      if (nameMatch > 0) { score += nameMatch; evidence.push('name/description match'); }
      if (target.windowTitle && activeTitle.toLowerCase().includes(target.windowTitle.toLowerCase())) { score += 0.10; evidence.push('correct active window'); }
      if (nameMatch === 0 && !target.automationId && !target.controlType) continue;

      candidates.push({
        id: `uia:${key}`,
        source: 'windows-uia',
        action: requestedAction,
        score: Math.min(0.99, score),
        evidence,
        bounds,
        uia: { name, automationId, controlType, windowTitle: activeTitle, bounds },
      });
    }

    const visualQuery = `${target.name || ''} ${target.description || ''}`.trim();
    const matchingWords = ocrWords
      .filter((word) => tokenScore(word.text, visualQuery) >= 0.18)
      .slice(0, 6);
    const visualInspections = await Promise.allSettled(matchingWords.map((word) => this.uia.uiaInspectElementAt(
      word.x + Math.floor(word.width / 2), word.y + Math.floor(word.height / 2), false,
    )));
    for (let index = 0; index < visualInspections.length; index++) {
      if (visualInspections[index].status !== 'fulfilled') continue;
      const inspected = record((visualInspections[index] as PromiseFulfilledResult<Json>).value);
      const element = record(inspected.element);
      const name = string(element.name);
      const automationId = string(element.automationId);
      const controlType = string(element.controlType);
      const bounds = record(element.bounds);
      candidates.push({
        id: `ocr-uia:${automationId}|${name}|${string(bounds.x)}|${string(bounds.y)}`,
        source: 'windows-uia',
        action: requestedAction,
        score: Math.min(0.88, 0.55 + tokenScore(`${matchingWords[index].text} ${name}`, visualQuery)),
        evidence: ['local OCR text match', 'UIA FromPoint validation', `OCR confidence ${Math.round(matchingWords[index].confidence)}`],
        bounds,
        uia: { name, automationId, controlType, windowTitle: activeTitle, bounds },
      });
    }

    for (const result of browserResults) {
      if (result.status !== 'fulfilled') continue;
      const value = record(result.value);
      const direct = record(value.element);
      const entries = direct.found === true ? [direct] : (Array.isArray(value.elements) ? value.elements : []);
      for (const item of entries) {
        const element = record(item);
        if (element.visible === false) continue;
        const label = [string(element.text), string(element.ariaLabel), string(element.placeholder), string(element.name), string(element.id)].join(' ');
        const selector = target.selector || (string(element.id) ? `#${cssString(string(element.id))}` : string(element.name) ? `[name="${cssString(string(element.name))}"]` : '');
        if (!selector) continue;
        const textMatch = Math.max(tokenScore(label, target.name || ''), tokenScore(label, target.description || target.name || ''));
        const roleMatch = target.role && label.toLowerCase().includes(target.role.toLowerCase()) ? 0.15 : 0;
        if (!target.selector && textMatch < 0.12 && !roleMatch) continue;
        candidates.push({
          id: `dom:${selector}`,
          source: 'browser-dom',
          action: requestedAction,
          score: Math.min(0.99, 0.65 + (target.selector ? 0.25 : 0) + textMatch + roleMatch),
          evidence: [target.selector ? 'exact DOM selector' : 'visible DOM element', 'active Chromium window', ...(textMatch ? ['text/aria match'] : [])],
          selector,
          bounds: { x: element.x, y: element.y, width: element.width, height: element.height, coordinateSpace: 'browser-viewport' },
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const second = candidates[1];
    const ambiguity = Boolean(best && second && (best.score - second.score < 0.05) && (best.id !== second.id));
    const confidence = best ? (ambiguity ? Math.min(best.score, 0.70) : best.score) : 0;
    const fingerprint = this.fingerprint(active, display);

    return {
      success: Boolean(best),
      snapshotId: fingerprint,
      confidence: Number(confidence.toFixed(2)),
      ambiguity,
      actionAllowed: Boolean(best && !ambiguity && confidence >= 0.35),
      activeWindow: active,
      display,
      candidate: best || null,
      candidates: candidates.slice(0, 6),
      message: best
        ? (ambiguity ? 'Multiple similarly likely targets found; action blocked.' : 'Element resolved locally.')
        : 'No actionable element matched the request.',
    };
  }

  async resolveAndAct(args: Json = {}): Promise<Json> {
    const action = string(args.action) as Action;
    if (!['click', 'type', 'select', 'toggle', 'expand', 'scroll_into_view'].includes(action)) {
      return { success: false, message: 'Unsupported action. Use click, type, select, toggle, expand, or scroll_into_view.' };
    }
    const resolved = await this.resolve(record(args.target), action);
    if (resolved.actionAllowed !== true) {
      return { ...resolved, success: false, message: 'Action blocked because target confidence is too low or ambiguous.' };
    }

    const candidate = record(resolved.candidate);
    let result: Json;
    if (candidate.source === 'browser-dom') {
      const selector = string(candidate.selector);
      if (action === 'type') result = await executeBrowserTool('browser_set_value', { selector, text: string(args.text) });
      else if (action === 'click') result = await executeBrowserTool('browser_click', { selector });
      else if (action === 'scroll_into_view') result = await executeBrowserTool('browser_find_element', { selector });
      else return { ...resolved, success: false, message: `DOM action '${action}' is not supported.` };
    } else {
      const uia = record(candidate.uia);
      const bounds = record(uia.bounds || candidate.bounds);
      const selector = {
        name: string(uia.name),
        automationId: string(uia.automationId),
        controlType: string(uia.controlType),
        windowTitle: string(uia.windowTitle)
      };

      if (action === 'click') {
        const invokeRes = await this.uia.executeTool('uia_invoke', selector);
        if (invokeRes.success !== false) {
          result = invokeRes;
        } else {
          // If InvokePattern is not implemented on the element (e.g. Custom or Pane),
          // click directly on its center coordinates
          const cx = Number(bounds.centerX || (Number(bounds.x) + Math.floor(Number(bounds.width || 0) / 2)));
          const cy = Number(bounds.centerY || (Number(bounds.y) + Math.floor(Number(bounds.height || 0) / 2)));
          if (cx > 0 && cy > 0) {
            result = (await this.uia.mouseClick(cx, cy, 'left')) as unknown as Json;
          } else {
            result = invokeRes;
          }

        }
      } else {
        const tool = action === 'type' ? 'uia_set_value'
          : action === 'select' ? 'uia_select'
          : action === 'toggle' ? 'uia_toggle'
          : action === 'expand' ? 'uia_expand'
          : 'uia_scroll_into_view';
        result = await this.uia.executeTool(tool, action === 'type' ? { ...selector, text: string(args.text) } : selector);
      }
    }
    return { ...resolved, success: result.success !== false, actionResult: result };
  }

  private fingerprint(active: Json, display: Json): string {
    const bounds = record(active.bounds);
    return [string(active.handle), string(active.title), string(bounds.x), string(bounds.y), string(bounds.width), string(bounds.height), string(display.width), string(display.height)].join('|');
  }
}
