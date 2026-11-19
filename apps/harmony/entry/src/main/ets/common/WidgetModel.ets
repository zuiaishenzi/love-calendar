export interface WidgetItem { id: number; type: string; text: string; target: string; }
export interface WidgetCountdown { title: string; day: string; days: number; }
export interface WidgetPeer { name: string; }
export interface WidgetState {
  owner: number; item: WidgetItem | null; countdown: WidgetCountdown | null;
  peer: WidgetPeer | null; unreadCount: number; updatedAt: number;
}
export class WidgetView {
  title: string = '朝夕 · 桌面留言';
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
  overlayColor: string = '#1FFFFFFF';
  refreshing: boolean = false;
  formImages: Record<string, number> = {};
}
export class WidgetAppearance {
  preset: string = 'rose'; photoOwner: number = 0; photoRevision: string = '';
  overlay: number = 12; mode: string = 'auto'; color: string = '#704457'; samples: number[] = [];
}
export function widgetTextColor(samples: number[], overlay: number): string {
  let luminance: number = 0, count: number = 0;
  for (let i: number = 0; i + 3 < samples.length; i += 4) {
    let value: number = 0;
    const alpha: number = overlay / 100 + (1 - overlay / 100) * (1 - samples[i + 3] / 255);
    for (let c: number = 0; c < 3; c++) {
      const s: number = (samples[i + c] * (1 - alpha) + 255 * alpha) / 255;
      value += (c === 0 ? .2126 : c === 1 ? .7152 : .0722) * (s <= .04045 ? s / 12.92 : Math.pow((s + .055) / 1.055, 2.4));
    }
    luminance += value; count++;
  }
  const light: number = count > 0 ? luminance / count : .8;
  return (light + .05) / .0713 > 1.05 / (light + .05) ? '#30252C' : '#FFFFFF';
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
      view.title = (state.peer?.name || '对方') + (view.target === 'chat' ? ' · 聊天消息' : ' · 桌面留言');
      view.body = state.item.text.slice(0, 500);
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
