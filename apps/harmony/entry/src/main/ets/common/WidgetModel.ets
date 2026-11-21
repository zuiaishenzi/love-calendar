export interface WidgetItem { id: number; type: string; text: string; target: string; }
export interface WidgetCountdown { id?: number; title: string; day: string; days: number; }
export interface WidgetPeer { name: string; }
export interface WidgetState {
  owner: number; items?: WidgetItem[]; item: WidgetItem | null; countdown: WidgetCountdown | null;
  countdowns?: WidgetCountdown[]; peer: WidgetPeer | null; unreadCount: number; updatedAt: number;
}
export class WidgetView {
  title: string = '朝夕 · 桌面留言';
  readCount: number = 0; bodyFont: number = 16; canRead: boolean = false; readItems: string = '[]'; layoutKey: string = '';
  body: string = '打开 App，登录后接收对方的心意';
  caption: string = '轻触打开桌面留言';
  target: string = 'notes';
  owner: number = 0;
  itemType: string = '';
  itemId: number = 0;
  hasItem: boolean = false;
  preset: string = 'rose';
  photo: string = '';
  textColor: string = '#30252C';
  titleColor: string = '#63364E';
  captionColor: string = '#264A40';
  compact: boolean = false;
  overlayColor: string = '#1FFFFFFF';
  refreshing: boolean = false;
  reading: boolean = false;
  readFailed: boolean = false;
  formImages: Record<string, number> = {};
}
export class WidgetAppearance {
  preset: string = 'rose'; photoOwner: number = 0; photoRevision: string = ''; photoFile: string = ''; previewFile: string = '';
  overlay: number = 12; mode: string = 'auto'; color: string = '#704457'; titleColor: string = '#704457'; captionColor: string = '#704457'; samples: number[] = []; samplesCropped: boolean = false;
}
export function widgetTextColor(samples: number[], overlay: number, region: string = 'body'): string {
  const edge: number = Math.sqrt(samples.length / 4), square: boolean = Number.isInteger(edge) && edge >= 4;
  const start: number = region === 'caption' ? .75 : region === 'body' ? .25 : 0, end: number = region === 'title' ? .25 : region === 'body' ? .75 : 1;
  let luminance: number = 0, count: number = 0;
  for (let i: number = 0; i + 3 < samples.length; i += 4) {
    const row: number = Math.floor(i / 4 / edge); if (square && (row < Math.floor(edge * start) || row >= Math.ceil(edge * end))) continue;
    let value: number = 0;
    const alpha: number = overlay / 100 + (1 - overlay / 100) * (1 - samples[i + 3] / 255);
    for (let c: number = 0; c < 3; c++) {
      const s: number = (samples[i + c] * (1 - alpha) + 255 * alpha) / 255;
      value += (c === 0 ? .2126 : c === 1 ? .7152 : .0722) * (s <= .04045 ? s / 12.92 : Math.pow((s + .055) / 1.055, 2.4));
    }
    luminance += value; count++;
  }
  const light: number = count > 0 ? luminance / count : .8;
  const palette: string[] = region === 'title' ? ['#63364E', '#FFE6F0'] : region === 'caption' ? ['#264A40', '#DDF6EC'] : ['#30252C', '#FFFFFF'];
  const contrast = (color: string): number => {
    let value: number = 0;
    for (let c: number = 0; c < 3; c++) { const s: number = parseInt(color.slice(1 + c * 2, 3 + c * 2), 16) / 255; value += (c === 0 ? .2126 : c === 1 ? .7152 : .0722) * (s <= .04045 ? s / 12.92 : Math.pow((s + .055) / 1.055, 2.4)); }
    return (Math.max(light, value) + .05) / (Math.min(light, value) + .05);
  };
  const chosen: string = contrast(palette[0]) >= contrast(palette[1]) ? palette[0] : palette[1];
  return contrast(chosen) >= 4.5 ? chosen : contrast('#000000') >= contrast('#FFFFFF') ? '#000000' : '#FFFFFF';
}
export function widgetView(state: WidgetState | undefined, owner: number, preset: string, offline: boolean): WidgetView {
  const view: WidgetView = new WidgetView();
  if (owner <= 0) return view;
  view.owner = owner;
  view.preset = ['rose', 'dawn', 'hills', 'moon'].includes(preset) ? preset : 'rose';
  view.body = '把下一个期待，放在这里';
  view.caption = '轻触，给对方留一句想念';
  if (state && state.owner === owner) {
    if (state.item && ['chat', 'note'].includes(state.item.type)) {
      view.hasItem = true; view.itemId = state.item.id; view.itemType = state.item.type;
      view.target = state.item.type === 'chat' ? 'chat' : 'notes';
      view.title = (state.peer?.name || '对方') + ((state.items?.length || 0) > 1 ? ' · 未读消息' : view.target === 'chat' ? ' · 聊天消息' : ' · 桌面留言');
      view.body = state.item.text; view.compact = Array.from(view.body).length > 60;
      view.caption = state.unreadCount > 1 ? '还有 ' + state.unreadCount + ' 条未读' : '留给你的一点想念';
    } else if (state.countdown) {
      const days: number = state.countdown.days;
      view.title = state.countdown.title;
      view.body = days === 0 ? '就是今天 ♡' : days > 0 ? '还有 ' + days + ' 天' : '已经 ' + Math.abs(days) + ' 天';
      view.caption = state.countdown.day.split('-').join('.');
    }
  }
  if (offline) view.caption = '暂未同步 · 点击 ↻ 重试';
  return view;
}
export function validWidgetTarget(target: string): string { return target === 'chat' ? 'chat' : 'notes'; }
