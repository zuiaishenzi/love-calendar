import { text } from '@kit.ArkGraphics2D';
import { WidgetItem } from './WidgetModel';

export interface WidgetGeometry { width: number; height: number; font: number; }
export class WidgetMessageFit {
  body: string = '这条内容较长，轻触打开查看全文';
  font: number = 16;
  items: WidgetItem[] = [];
}
export function widgetGeometryKey(value: WidgetGeometry): string { return value.width + ':' + value.height + ':' + value.font; }
export function fitWidgetMessages(items: WidgetItem[], geometry: WidgetGeometry): WidgetMessageFit {
  const result: WidgetMessageFit = new WidgetMessageFit(); if (!items.length || geometry.width <= 0 || geometry.height <= 0) return result;
  const fits = (value: string, size: number): boolean => {
    const builder: text.ParagraphBuilder = new text.ParagraphBuilder({ wordBreak: text.WordBreak.BREAK_WORD }, text.FontCollection.getGlobalInstance());
    builder.pushStyle({ fontSize: size * geometry.font, fontFamilies: ['HarmonyOS Sans'] }); builder.addText(value);
    const paragraph: text.Paragraph = builder.build(); paragraph.layout(geometry.width);
    return paragraph.getHeight() + 2 * geometry.font <= geometry.height;
  };
  try {
    let ready: boolean = false;
    for (const size of [16, 14, 12, 10]) { if (fits('• ' + items[0].text, size)) { result.font = size; ready = true; break; } }
    if (!ready) return result;
    let body: string = '';
    for (const item of items.slice(0, 8)) {
      const next: string = body ? body + '\n\n• ' + item.text : '• ' + item.text;
      if (!fits(next, result.font)) break; body = next; result.items.push(item);
    }
    if (result.items.length) result.body = body;
  } catch { result.items = []; }
  return result;
}
