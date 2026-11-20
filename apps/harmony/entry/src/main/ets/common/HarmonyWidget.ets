import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { rcp } from '@kit.RemoteCommunicationKit';
import { formBindingData, formProvider } from '@kit.FormKit';
import { image } from '@kit.ImageKit';
import { util } from '@kit.ArkTS';
import { WidgetCropRegion } from './WidgetCrop';
import { BusinessError } from '@kit.BasicServicesKit';
import { SERVER_URL } from './ClientConfig';
import { WidgetCountdown, WidgetState, WidgetView, WidgetAppearance, widgetView, widgetTextColor } from './WidgetModel';

export class WidgetAuth { owner: number = 0; cookie: string = ''; epoch: string = ''; }
class WidgetCache { epoch: string = ''; state: WidgetState | undefined = undefined; offline: boolean = false; refreshing: number = 0; reading: number = 0; readFailed: boolean = false; }
interface WidgetSettings { customDay?: string; title?: string; reminderId?: number | null; }
interface AppearanceInput { overlay: number; mode: string; color: string; titleColor?: string; captionColor?: string; }
interface WidgetCardSnapshot { id: string; preset: string; appearance: AppearanceSnapshot; }
interface AppearanceSnapshot { overlay: number; mode: string; color: string; titleColor: string; captionColor: string; preview?: string; }
export interface WidgetAction { action: string; type?: string; id?: string; owner?: string; }
interface WidgetRead { type: string; id: number; }

export class HarmonyWidget {
  private static queue: Promise<void> = Promise.resolve();
  private static publications: Promise<boolean> = Promise.resolve(true);
  private static refreshes: Map<string, Promise<void>> = new Map();
  static file(context: common.Context, name: string): string { return context.filesDir + '/widget-' + name; }
  private static text(context: common.Context, name: string): string {
    try { return fs.readTextSync(HarmonyWidget.file(context, name)); } catch { return ''; }
  }
  private static write(context: common.Context, name: string, value: string): void {
    const path: string = HarmonyWidget.file(context, name);
    const temp: string = path + '.' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.tmp';
    const file: fs.File = fs.openSync(temp, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
    try { fs.writeSync(file.fd, value); } finally { fs.closeSync(file); }
    fs.renameSync(temp, path);
  }
  static auth(context: common.Context): WidgetAuth {
    try { return JSON.parse(HarmonyWidget.text(context, 'auth.json')) as WidgetAuth; } catch { return new WidgetAuth(); }
  }
  private static cache(context: common.Context): WidgetCache {
    try { return JSON.parse(HarmonyWidget.text(context, 'cache.json')) as WidgetCache; } catch { return new WidgetCache(); }
  }
  static selected(context: common.Context): string { const id: string = HarmonyWidget.text(context, 'selected.txt'); return HarmonyWidget.forms(context).includes(id) ? id : id === 'new' ? 'new' : HarmonyWidget.forms(context)[0] || 'new'; }
  static select(context: common.Context, id: string): boolean { if (id !== 'new' && !HarmonyWidget.forms(context).includes(id)) return false; HarmonyWidget.write(context, 'selected.txt', id); return true; }
  static cards(context: common.Context): string { return JSON.stringify({ cards: HarmonyWidget.forms(context).map((id: string): WidgetCardSnapshot => ({ id: id, preset: HarmonyWidget.currentPreset(context, id), appearance: JSON.parse(HarmonyWidget.snapshot(context, id)) as AppearanceSnapshot })), next: JSON.parse(HarmonyWidget.snapshot(context, 'new')) as AppearanceSnapshot, nextPreset: HarmonyWidget.currentPreset(context, 'new'), selected: HarmonyWidget.selected(context), transparent: false }); }
  static settings(context: common.Context, id: string = HarmonyWidget.selected(context)): string { return HarmonyWidget.text(context, 'countdown-' + id + '.json'); }
  static saveSettings(context: common.Context, input: string): boolean {
    try {
      const value: WidgetSettings = JSON.parse(input) as WidgetSettings;
      if (HarmonyWidget.auth(context).owner <= 0) return false;
      if (value.customDay !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(value.customDay) || !value.title?.trim() || value.title.length > 60 || !Number.isFinite(Date.parse(value.customDay)))) return false;
      if (value.customDay === undefined && value.reminderId !== null && (!Number.isSafeInteger(value.reminderId) || Number(value.reminderId) <= 0)) return false;
      HarmonyWidget.write(context, 'countdown-' + HarmonyWidget.selected(context) + '.json', JSON.stringify(value)); HarmonyWidget.publish(context); return true;
    } catch { return false; }
  }
  private static countdown(context: common.Context, state: WidgetState | undefined, id: string): WidgetCountdown | null {
    const raw: string = HarmonyWidget.settings(context, id); if (!raw) return state?.countdown || null;
    try {
      const settings: WidgetSettings = JSON.parse(raw) as WidgetSettings;
      if (settings.customDay) { const today: string = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); return { title: settings.title || '', day: settings.customDay, days: Math.round((Date.parse(settings.customDay) - Date.parse(today)) / 86400000) }; }
      return state?.countdowns?.find((row: WidgetCountdown) => row.id === settings.reminderId) || null;
    } catch { return null; }
  }
  private static appearanceName(id: string): string { return 'appearance-' + id + '.json'; }
  static appearance(context: common.Context, id: string = HarmonyWidget.selected(context)): WidgetAppearance {
    const value: WidgetAppearance = new WidgetAppearance();
    try {
      const stored: WidgetAppearance = JSON.parse(HarmonyWidget.text(context, HarmonyWidget.appearanceName(id)) || HarmonyWidget.text(context, 'appearance.json')) as WidgetAppearance;
      value.photoFile = stored.photoFile || 'background.jpg'; value.previewFile = stored.previewFile || '';
      value.preset = ['rose', 'dawn', 'hills', 'moon'].includes(stored.preset) ? stored.preset : 'rose'; value.photoOwner = stored.photoOwner || 0; value.photoRevision = stored.photoRevision || '';
      value.overlay = Number.isInteger(stored.overlay) && stored.overlay >= 0 && stored.overlay <= 70 ? stored.overlay : 12;
      value.mode = stored.mode === 'custom' ? 'custom' : 'auto'; value.color = /^#[a-fA-F0-9]{6}$/.test(stored.color || '') ? stored.color : '#704457'; value.samples = stored.samples || []; value.samplesCropped = stored.samplesCropped === true;
      value.titleColor = /^#[a-fA-F0-9]{6}$/.test(stored.titleColor || '') ? stored.titleColor : value.color;
      value.captionColor = /^#[a-fA-F0-9]{6}$/.test(stored.captionColor || '') ? stored.captionColor : value.color;
    } catch {}
    return value;
  }
  static forms(context: common.Context): string[] {
    try { return JSON.parse(HarmonyWidget.text(context, 'forms.json')) as string[]; } catch { return []; }
  }
  static add(context: common.Context, id: string): void {
    if (!/^[0-9]+$/.test(id)) return;
    const ids: string[] = HarmonyWidget.forms(context); if (!ids.includes(id)) { ids.push(id); const settings: string = HarmonyWidget.settings(context, 'new'); if (settings) HarmonyWidget.write(context, 'countdown-' + id + '.json', settings); HarmonyWidget.write(context, HarmonyWidget.appearanceName(id), JSON.stringify(HarmonyWidget.appearance(context, 'new'))); HarmonyWidget.write(context, 'forms.json', JSON.stringify(ids)); }
  }
  static remove(context: common.Context, id: string): void {
    HarmonyWidget.write(context, 'forms.json', JSON.stringify(HarmonyWidget.forms(context).filter(value => value !== id)));
  }
  static session(context: common.Context, owner: number, cookies: string): void {
    const cookie: string = cookies.split(';').map(value => value.trim()).find(value => /^session=[a-f0-9]{64}$/.test(value)) || '';
    const nextOwner: number = Number.isSafeInteger(owner) && owner > 0 && cookie ? owner : 0;
    const old: WidgetAuth = HarmonyWidget.auth(context);
    if (old.owner !== nextOwner || old.cookie !== (nextOwner ? cookie : '')) {
      const next: WidgetAuth = new WidgetAuth(); next.owner = nextOwner; next.cookie = nextOwner ? cookie : ''; next.epoch = Date.now() + '-' + Math.random().toString(36).slice(2);
      HarmonyWidget.write(context, 'auth.json', JSON.stringify(next));
      HarmonyWidget.write(context, 'cache.json', JSON.stringify(new WidgetCache()));
      HarmonyWidget.write(context, 'appearance.json', JSON.stringify(new WidgetAppearance())); for (const id of ['new', ...HarmonyWidget.forms(context)]) HarmonyWidget.write(context, HarmonyWidget.appearanceName(id), JSON.stringify(new WidgetAppearance())); for (const name of fs.listFileSync(context.filesDir)) { if (/^widget-(?:background|photo-|preview-|countdown-)/.test(name)) { try { fs.unlinkSync(context.filesDir + '/' + name); } catch {} } }
      HarmonyWidget.publish(context);
    }
    if (nextOwner > 0) { HarmonyWidget.ensurePhotoSamples(context); HarmonyWidget.refresh(context); }
  }
  static currentPreset(context: common.Context, id: string = HarmonyWidget.selected(context)): string {
    const appearance: WidgetAppearance = HarmonyWidget.appearance(context, id), auth: WidgetAuth = HarmonyWidget.auth(context);
    return auth.owner > 0 && appearance.photoOwner === auth.owner ? 'custom' : appearance.preset;
  }
  static preset(context: common.Context, code: string): boolean {
    if (!['rose', 'dawn', 'hills', 'moon'].includes(code) || HarmonyWidget.auth(context).owner <= 0) return false;
    const appearance: WidgetAppearance = HarmonyWidget.appearance(context); appearance.preset = code; appearance.photoOwner = 0; appearance.samples = [];
    HarmonyWidget.write(context, HarmonyWidget.appearanceName(HarmonyWidget.selected(context)), JSON.stringify(appearance)); HarmonyWidget.publish(context); return true;
  }
  static currentView(context: common.Context, id: string = HarmonyWidget.selected(context)): WidgetView {
    const auth: WidgetAuth = HarmonyWidget.auth(context), cache: WidgetCache = HarmonyWidget.cache(context), appearance: WidgetAppearance = HarmonyWidget.appearance(context, id);
    const state: WidgetState | undefined = cache.epoch === auth.epoch && cache.state ? JSON.parse(JSON.stringify(cache.state)) as WidgetState : undefined; if (state) state.countdown = HarmonyWidget.countdown(context, state, id);
    const view: WidgetView = widgetView(state, auth.owner, appearance.preset, cache.offline);
    view.textColor = appearance.mode === 'custom' ? appearance.color : widgetTextColor(appearance.photoOwner === auth.owner ? appearance.samples : [], appearance.overlay);
    view.titleColor = appearance.mode === 'custom' ? appearance.titleColor : widgetTextColor(appearance.photoOwner === auth.owner ? appearance.samples : [], appearance.overlay, 'title');
    view.captionColor = appearance.mode === 'custom' ? appearance.captionColor : widgetTextColor(appearance.photoOwner === auth.owner ? appearance.samples : [], appearance.overlay, 'caption');
    view.overlayColor = '#' + Math.round(255 * appearance.overlay / 100).toString(16).padStart(2, '0') + 'FFFFFF';
    view.refreshing = cache.epoch === auth.epoch && cache.refreshing > 0 && Date.now() - cache.refreshing < 45000;
    view.reading = cache.epoch === auth.epoch && cache.reading > 0 && Date.now() - cache.reading < 45000;
    view.readFailed = cache.epoch === auth.epoch && cache.readFailed === true;
    if (view.refreshing) view.caption = '正在刷新…';
    if (view.readFailed && view.hasItem) view.caption = '标记未成功，轻触重试';
    if (view.reading) view.caption = '正在标记已读…';
    return view;
  }
  static async saveAppearance(context: common.Context, input: string): Promise<boolean> {
    try {
      const value: AppearanceInput = JSON.parse(input) as AppearanceInput;
      const titleColor: string = value.titleColor === undefined ? value.color : value.titleColor, captionColor: string = value.captionColor === undefined ? value.color : value.captionColor;
      if (HarmonyWidget.auth(context).owner <= 0 || !Number.isInteger(value.overlay) || value.overlay < 0 || value.overlay > 70 || !['auto', 'custom'].includes(value.mode) || !/^#[a-fA-F0-9]{6}$/.test(value.color) || !/^#[a-fA-F0-9]{6}$/.test(titleColor) || !/^#[a-fA-F0-9]{6}$/.test(captionColor)) return false;
      const id: string = HarmonyWidget.selected(context), appearance: WidgetAppearance = HarmonyWidget.appearance(context, id); appearance.overlay = value.overlay; appearance.mode = value.mode; appearance.color = value.color;
      appearance.titleColor = titleColor; appearance.captionColor = captionColor;
      const epoch: string = HarmonyWidget.auth(context).epoch;
      HarmonyWidget.write(context, HarmonyWidget.appearanceName(id), JSON.stringify(appearance));
      await HarmonyWidget.ensurePhotoSamples(context, id);
      return await HarmonyWidget.publish(context) && HarmonyWidget.auth(context).epoch === epoch;
    } catch { return false; }
  }
  static snapshot(context: common.Context, id: string = HarmonyWidget.selected(context)): string {
    const appearance: WidgetAppearance = HarmonyWidget.appearance(context, id);
    const value: AppearanceSnapshot = { overlay: appearance.overlay, mode: appearance.mode, color: appearance.color, titleColor: appearance.titleColor, captionColor: appearance.captionColor };
    if (appearance.photoOwner === HarmonyWidget.auth(context).owner && appearance.photoOwner > 0) {
      let file: fs.File | undefined = undefined;
      try { file = fs.openSync(HarmonyWidget.file(context, appearance.previewFile || appearance.photoFile || 'background.jpg'), fs.OpenMode.READ_ONLY); const size: number = fs.statSync(file.fd).size; if (size < 250000) { const bytes: ArrayBuffer = new ArrayBuffer(size); if (fs.readSync(file.fd, bytes) === size) value.preview = new util.Base64Helper().encodeToStringSync(new Uint8Array(bytes)); } } catch {} finally { if (file) fs.closeSync(file); }
    }
    return JSON.stringify(value);
  }
  private static async ensurePhotoSamples(context: common.Context, id: string = HarmonyWidget.selected(context)): Promise<void> {
    const auth: WidgetAuth = HarmonyWidget.auth(context), appearance: WidgetAppearance = HarmonyWidget.appearance(context, id);
    if (auth.owner <= 0 || appearance.photoOwner !== auth.owner || appearance.samples.length > 0 && appearance.samplesCropped) return;
    let file: fs.File | undefined = undefined, source: image.ImageSource | undefined = undefined, pixels: image.PixelMap | undefined = undefined;
    try {
      file = fs.openSync(HarmonyWidget.file(context, appearance.photoFile || 'background.jpg'), fs.OpenMode.READ_ONLY); source = image.createImageSource(file.fd);
      pixels = await source.createPixelMap({ editable: true, desiredPixelFormat: image.PixelMapFormat.RGBA_8888 });
      const info: image.ImageInfo = await pixels.getImageInfo(), side: number = Math.min(info.size.width, info.size.height);
      await pixels.crop({ x: Math.floor((info.size.width - side) / 2), y: Math.floor((info.size.height - side) / 2), size: { width: side, height: side } });
      await pixels.scale(16 / side, 16 / side);
      const buffer: ArrayBuffer = new ArrayBuffer(16 * 16 * 4); await pixels.readPixelsToBuffer(buffer);
      if (HarmonyWidget.auth(context).epoch !== auth.epoch) return;
      const current: WidgetAppearance = HarmonyWidget.appearance(context, id); if (current.photoOwner !== auth.owner || current.photoRevision !== appearance.photoRevision) return;
      current.samples = Array.from(new Uint8Array(buffer)); current.samplesCropped = true; HarmonyWidget.write(context, HarmonyWidget.appearanceName(id), JSON.stringify(current)); await HarmonyWidget.publish(context);
    } catch {} finally { await pixels?.release(); source?.release(); if (file) fs.closeSync(file); }
  }
  static publish(context: common.Context): Promise<boolean> {
    const task: Promise<boolean> = HarmonyWidget.publications.catch(() => false).then(() => HarmonyWidget.publishCurrent(context));
    HarmonyWidget.publications = task; return task;
  }
  private static async publishCurrent(context: common.Context): Promise<boolean> {
    const auth: WidgetAuth = HarmonyWidget.auth(context);
    let success: boolean = true;
    for (const id of HarmonyWidget.forms(context)) {
      const appearance: WidgetAppearance = HarmonyWidget.appearance(context, id), view: WidgetView = HarmonyWidget.currentView(context, id); let photo: fs.File | undefined = undefined;
      try {
        if (auth.owner > 0 && appearance.photoOwner === auth.owner) {
          photo = fs.openSync(HarmonyWidget.file(context, appearance.photoFile || 'background.jpg'), fs.OpenMode.READ_ONLY);
          const key: string = 'background-' + (appearance.photoRevision || 'legacy'); view.photo = 'memory://' + key; view.formImages = {}; view.formImages[key] = photo.fd;
        }
        if (HarmonyWidget.auth(context).epoch !== auth.epoch) break;
        await formProvider.updateForm(id, formBindingData.createFormBindingData(view));
      } catch (error) { success = false; console.error('Widget form update failed code: ' + String((error as BusinessError).code || 0)); } finally { if (photo) fs.closeSync(photo); }
      if (HarmonyWidget.auth(context).epoch !== auth.epoch) {
        success = false;
        try { await formProvider.updateForm(id, formBindingData.createFormBindingData(HarmonyWidget.currentView(context))); } catch {}
      }
    }
    return success;
  }
  private static async request(auth: WidgetAuth, read?: WidgetRead): Promise<WidgetState> {
    const session: rcp.Session = rcp.createSession();
    try {
      const request: rcp.Request = new rcp.Request(SERVER_URL + (read ? 'api/widget/read' : 'api/widget/state'));
      request.method = read ? 'POST' : 'GET';
      request.headers = { 'Cookie': auth.cookie, 'Content-Type': 'application/json', 'Origin': SERVER_URL.slice(0, -1) };
      request.content = read ? JSON.stringify(read) : undefined;
      request.configuration = { transfer: { autoRedirect: false, timeout: { connectMs: 3000, transferMs: 4000 } } };
      const result: rcp.Response = await session.fetch(request);
      if (result.statusCode !== 200) console.warn((read ? 'Widget read HTTP status: ' : 'Widget refresh HTTP status: ') + String(result.statusCode));
      if (result.statusCode === 401) throw new Error('widget-session-expired');
      if (result.statusCode === 409 && read) return await HarmonyWidget.request(auth);
      const body: string = result.toString() || '';
      if (result.statusCode !== 200 || body.length > 128 * 1024) throw new Error('widget-network');
      const state: WidgetState = JSON.parse(body) as WidgetState;
      if (state.owner !== auth.owner) throw new Error('widget-session-expired');
      return state;
    } finally { session.close(); }
  }
  static refresh(context: common.Context, action?: WidgetAction, visible: boolean = false): Promise<void> {
    if (!HarmonyWidget.forms(context).length) return Promise.resolve();
    const auth: WidgetAuth = HarmonyWidget.auth(context), epoch: string = auth.epoch;
    let read: WidgetRead | undefined = undefined;
    if (action) {
      if (auth.owner <= 0 || Number(action.owner) !== auth.owner || !['chat', 'note'].includes(action.type || '') || !Number.isSafeInteger(Number(action.id)) || Number(action.id) <= 0) { console.warn('Widget read ignored: stale or invalid action'); return HarmonyWidget.publish(context).then(() => {}); }
      read = { type: action.type || '', id: Number(action.id) };
    }
    let feedback: Promise<boolean> = Promise.resolve(true);
    if (visible || read) { const cache: WidgetCache = HarmonyWidget.cache(context); cache.epoch = epoch; if (read) { cache.reading = Date.now(); cache.readFailed = false; } else cache.refreshing = Date.now(); HarmonyWidget.write(context, 'cache.json', JSON.stringify(cache)); feedback = HarmonyWidget.publish(context); }
    const existing: Promise<void> | undefined = action ? undefined : HarmonyWidget.refreshes.get(epoch);
    if (existing) return existing;
    const task: Promise<void> = HarmonyWidget.queue.catch(() => {}).then(async () => {
      await feedback;
      if (HarmonyWidget.auth(context).epoch !== epoch) return;
      try { await HarmonyWidget.sync(context, read); }
      finally {
        if (HarmonyWidget.auth(context).epoch === epoch) {
          const cache: WidgetCache = HarmonyWidget.cache(context); if (read) cache.reading = 0; else { cache.refreshing = 0; if (HarmonyWidget.refreshes.get(epoch) === task) HarmonyWidget.refreshes.delete(epoch); } HarmonyWidget.write(context, 'cache.json', JSON.stringify(cache));
          await HarmonyWidget.publish(context);
        }
      }
    }).catch(() => { console.error('Widget refresh failed'); });
    HarmonyWidget.queue = task;
    if (!action) { HarmonyWidget.refreshes.set(epoch, task); task.then(() => { if (HarmonyWidget.refreshes.get(epoch) === task) HarmonyWidget.refreshes.delete(epoch); }); }
    return task;
  }
  private static async sync(context: common.Context, read?: WidgetRead): Promise<void> {
      const auth: WidgetAuth = HarmonyWidget.auth(context); if (auth.owner <= 0) { await HarmonyWidget.publish(context); return; }
      try {
        const state: WidgetState = await HarmonyWidget.request(auth, read);
        if (HarmonyWidget.auth(context).epoch !== auth.epoch) return;
        const cache: WidgetCache = HarmonyWidget.cache(context);
        if (cache.epoch === auth.epoch && cache.state && cache.state.updatedAt > state.updatedAt) return;
        cache.epoch = auth.epoch; cache.state = state; cache.offline = false; cache.readFailed = false;
        HarmonyWidget.write(context, 'cache.json', JSON.stringify(cache));
        console.info(read ? 'Widget read completed' : 'Widget refresh completed');
      } catch (error) {
        if (HarmonyWidget.auth(context).epoch !== auth.epoch) return;
        if ((error as Error).message === 'widget-session-expired') { HarmonyWidget.session(context, 0, ''); return; }
        const cache: WidgetCache = HarmonyWidget.cache(context); cache.offline = true; if (read) cache.readFailed = true; HarmonyWidget.write(context, 'cache.json', JSON.stringify(cache));
        console.warn(read ? 'Widget read failed; message retained' : 'Widget refresh failed; cache retained');
      }
  }
  static async savePhoto(context: common.Context, uri: string, crop?: WidgetCropRegion, selected: string = HarmonyWidget.selected(context)): Promise<void> {
    const auth: WidgetAuth = HarmonyWidget.auth(context); if (auth.owner <= 0) throw new Error('请先登录');
    const file: fs.File = fs.openSync(uri, fs.OpenMode.READ_ONLY);
    let source: image.ImageSource | undefined = undefined, pixels: image.PixelMap | undefined = undefined, packer: image.ImagePacker | undefined = undefined;
    try {
      if (fs.statSync(file.fd).size > 20 * 1024 * 1024) throw new Error('请选择20MB以内的照片');
      source = image.createImageSource(file.fd); const info: image.ImageInfo = await source.getImageInfo(); const size: number = Math.max(info.size.width, info.size.height);
      pixels = await source.createPixelMap({ editable: true, desiredSize: { width: Math.max(1, Math.round(info.size.width * Math.min(1, 4096 / size, Math.sqrt(8000000 / (info.size.width * info.size.height))))), height: Math.max(1, Math.round(info.size.height * Math.min(1, 4096 / size, Math.sqrt(8000000 / (info.size.width * info.size.height))))) } });
      const decoded: image.ImageInfo = await pixels.getImageInfo(), side: number = Math.max(1, Math.min(decoded.size.width, decoded.size.height, Math.round(Math.min(decoded.size.width, decoded.size.height) * (crop?.side || 1))));
      const x: number = Math.max(0, Math.min(decoded.size.width - side, Math.round(crop ? crop.x * decoded.size.width : (decoded.size.width - side) / 2))), y: number = Math.max(0, Math.min(decoded.size.height - side, Math.round(crop ? crop.y * decoded.size.height : (decoded.size.height - side) / 2)));
      await pixels.crop({ x: x, y: y, size: { width: side, height: side } });
      const edge: number = Math.min(768, side); await pixels.scale(edge / side, edge / side);
      packer = image.createImagePacker(); const bytes: ArrayBuffer = await packer.packing(pixels, { format: 'image/jpeg', quality: 96 });
      if (HarmonyWidget.auth(context).epoch !== auth.epoch || selected !== 'new' && !HarmonyWidget.forms(context).includes(selected)) throw new Error('登录或卡片状态已变化');
      const revision: string = Date.now() + '-' + Math.random().toString(36).slice(2), photoName: string = 'photo-' + revision + '.jpg', previewName: string = 'preview-' + revision + '.jpg';
      const target: fs.File = fs.openSync(HarmonyWidget.file(context, photoName), fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
      try { fs.writeSync(target.fd, bytes); } finally { fs.closeSync(target); }
      await pixels.scale(Math.min(1, 256 / edge), Math.min(1, 256 / edge));
      const preview: ArrayBuffer = await packer.packing(pixels, { format: 'image/jpeg', quality: 85 }), previewFile: fs.File = fs.openSync(HarmonyWidget.file(context, previewName), fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
      try { fs.writeSync(previewFile.fd, preview); } finally { fs.closeSync(previewFile); }
      if (HarmonyWidget.auth(context).epoch !== auth.epoch) { fs.unlinkSync(HarmonyWidget.file(context, photoName)); fs.unlinkSync(HarmonyWidget.file(context, previewName)); throw new Error('登录状态已变化'); }
      const appearance: WidgetAppearance = HarmonyWidget.appearance(context, selected); appearance.photoOwner = auth.owner; appearance.photoRevision = revision; appearance.photoFile = photoName; appearance.previewFile = previewName; appearance.samples = [];
      HarmonyWidget.write(context, HarmonyWidget.appearanceName(selected), JSON.stringify(appearance));
      await HarmonyWidget.ensurePhotoSamples(context, selected); await HarmonyWidget.publish(context);
      const referenced: string[] = []; for (const id of ['new', ...HarmonyWidget.forms(context)]) { const saved: WidgetAppearance = HarmonyWidget.appearance(context, id); referenced.push(saved.photoFile, saved.previewFile); }
      for (const name of fs.listFileSync(context.filesDir)) { if (/^widget-(?:photo-|preview-)/.test(name) && !referenced.includes(name.slice('widget-'.length))) { try { fs.unlinkSync(context.filesDir + '/' + name); } catch {} } }
    } finally { fs.closeSync(file); await pixels?.release(); source?.release(); await packer?.release(); }
  }
}
