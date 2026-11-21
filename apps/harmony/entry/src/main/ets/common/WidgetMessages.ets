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
    const minimum: number = fits('• ' + items[0].text, 12) ? 12 : 10;
    if (!fits('• ' + items[0].text, minimum)) return result;
    result.font = minimum;
    let body: string = '';
    for (const item of items.slice(0, 8)) {
      const next: string = body ? body + '\n\n• ' + item.text : '• ' + item.text;
      if (!fits(next, result.font)) break; body = next; result.items.push(item);
    }
    if (result.items.length) {
      result.body = body;
      for (const size of [20, 18, 16, 14, 12, 10]) { if (size >= minimum && fits(body, size)) { result.font = size; break; } }
    }
  } catch { result.items = []; }
  return result;
}
