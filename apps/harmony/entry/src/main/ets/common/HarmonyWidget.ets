import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { rcp } from '@kit.RemoteCommunicationKit';
import { formBindingData, formProvider } from '@kit.FormKit';
import { image } from '@kit.ImageKit';
import { util } from '@kit.ArkTS';
import { SERVER_URL } from './ClientConfig';
import { WidgetState, WidgetView, WidgetAppearance, widgetView, widgetTextColor } from './WidgetModel';

export class WidgetAuth { owner: number = 0; cookie: string = ''; epoch: string = ''; }
class WidgetCache { epoch: string = ''; state: WidgetState | undefined = undefined; offline: boolean = false; refreshing: number = 0; }
interface AppearanceInput { overlay: number; mode: string; color: string; titleColor?: string; captionColor?: string; }
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
  static appearance(context: common.Context): WidgetAppearance {
    const value: WidgetAppearance = new WidgetAppearance();
    try {
      const stored: WidgetAppearance = JSON.parse(HarmonyWidget.text(context, 'appearance.json')) as WidgetAppearance;
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
    const ids: string[] = HarmonyWidget.forms(context); if (!ids.includes(id)) { ids.push(id); HarmonyWidget.write(context, 'forms.json', JSON.stringify(ids)); }
  }
  static remove(context: common.Context, id: string): void {
    HarmonyWidget.write(context, 'forms.json', JSON.stringify(HarmonyWidget.forms(context).filter(value => value !== id)));
  }
  private static deletePhoto(context: common.Context): void {
    try { fs.unlinkSync(HarmonyWidget.file(context, 'background.jpg')); } catch {}
  }
  static session(context: common.Context, owner: number, cookies: string): void {
    const cookie: string = cookies.split(';').map(value => value.trim()).find(value => /^session=[a-f0-9]{64}$/.test(value)) || '';
    const nextOwner: number = Number.isSafeInteger(owner) && owner > 0 && cookie ? owner : 0;
    const old: WidgetAuth = HarmonyWidget.auth(context);
    if (old.owner !== nextOwner || old.cookie !== (nextOwner ? cookie : '')) {
      const next: WidgetAuth = new WidgetAuth(); next.owner = nextOwner; next.cookie = nextOwner ? cookie : ''; next.epoch = Date.now() + '-' + Math.random().toString(36).slice(2);
      HarmonyWidget.write(context, 'auth.json', JSON.stringify(next));
      HarmonyWidget.write(context, 'cache.json', JSON.stringify(new WidgetCache()));
      HarmonyWidget.write(context, 'appearance.json', JSON.stringify(new WidgetAppearance())); HarmonyWidget.deletePhoto(context);
      HarmonyWidget.publish(context);
    }
    if (nextOwner > 0) { HarmonyWidget.ensurePhotoSamples(context); HarmonyWidget.refresh(context); }
  }
  static currentPreset(context: common.Context): string {
    const appearance: WidgetAppearance = HarmonyWidget.appearance(context), auth: WidgetAuth = HarmonyWidget.auth(context);
    return auth.owner > 0 && appearance.photoOwner === auth.owner ? 'custom' : appearance.preset;
  }
  static preset(context: common.Context, code: string): boolean {
    if (!['rose', 'dawn', 'hills', 'moon'].includes(code) || HarmonyWidget.auth(context).owner <= 0) return false;
    const appearance: WidgetAppearance = HarmonyWidget.appearance(context); appearance.preset = code; appearance.photoOwner = 0; appearance.samples = [];
    HarmonyWidget.write(context, 'appearance.json', JSON.stringify(appearance)); HarmonyWidget.deletePhoto(context); HarmonyWidget.publish(context); return true;
  }
  static currentView(context: common.Context): WidgetView {
    const auth: WidgetAuth = HarmonyWidget.auth(context), cache: WidgetCache = HarmonyWidget.cache(context), appearance: WidgetAppearance = HarmonyWidget.appearance(context);
    const view: WidgetView = widgetView(cache.epoch === auth.epoch ? cache.state : undefined, auth.owner, appearance.preset, cache.offline);
    view.textColor = appearance.mode === 'custom' ? appearance.color : widgetTextColor(appearance.photoOwner === auth.owner ? appearance.samples : [], appearance.overlay);
    view.titleColor = appearance.mode === 'custom' ? appearance.titleColor : widgetTextColor(appearance.photoOwner === auth.owner ? appearance.samples : [], appearance.overlay, 'title');
    view.captionColor = appearance.mode === 'custom' ? appearance.captionColor : widgetTextColor(appearance.photoOwner === auth.owner ? appearance.samples : [], appearance.overlay, 'caption');
    view.overlayColor = '#' + Math.round(255 * appearance.overlay / 100).toString(16).padStart(2, '0') + 'FFFFFF';
    view.refreshing = cache.epoch === auth.epoch && cache.refreshing > 0 && Date.now() - cache.refreshing < 45000;
    if (view.refreshing) view.caption = '正在刷新…';
    return view;
  }
  static async saveAppearance(context: common.Context, input: string): Promise<boolean> {
    try {
      const value: AppearanceInput = JSON.parse(input) as AppearanceInput;
      const titleColor: string = value.titleColor === undefined ? value.color : value.titleColor, captionColor: string = value.captionColor === undefined ? value.color : value.captionColor;
      if (HarmonyWidget.auth(context).owner <= 0 || !Number.isInteger(value.overlay) || value.overlay < 0 || value.overlay > 70 || !['auto', 'custom'].includes(value.mode) || !/^#[a-fA-F0-9]{6}$/.test(value.color) || !/^#[a-fA-F0-9]{6}$/.test(titleColor) || !/^#[a-fA-F0-9]{6}$/.test(captionColor)) return false;
      const appearance: WidgetAppearance = HarmonyWidget.appearance(context); appearance.overlay = value.overlay; appearance.mode = value.mode; appearance.color = value.color;
      appearance.titleColor = titleColor; appearance.captionColor = captionColor;
      const epoch: string = HarmonyWidget.auth(context).epoch;
      HarmonyWidget.write(context, 'appearance.json', JSON.stringify(appearance));
      await HarmonyWidget.ensurePhotoSamples(context);
      return await HarmonyWidget.publish(context) && HarmonyWidget.auth(context).epoch === epoch;
    } catch { return false; }
  }
  static snapshot(context: common.Context): string {
    const appearance: WidgetAppearance = HarmonyWidget.appearance(context);
    const value: AppearanceSnapshot = { overlay: appearance.overlay, mode: appearance.mode, color: appearance.color, titleColor: appearance.titleColor, captionColor: appearance.captionColor };
    if (appearance.photoOwner === HarmonyWidget.auth(context).owner && appearance.photoOwner > 0) {
      let file: fs.File | undefined = undefined;
      try { file = fs.openSync(HarmonyWidget.file(context, 'background.jpg'), fs.OpenMode.READ_ONLY); const size: number = fs.statSync(file.fd).size; if (size < 250000) { const bytes: ArrayBuffer = new ArrayBuffer(size); if (fs.readSync(file.fd, bytes) === size) value.preview = new util.Base64Helper().encodeToStringSync(new Uint8Array(bytes)); } } catch {} finally { if (file) fs.closeSync(file); }
    }
    return JSON.stringify(value);
  }
  private static async ensurePhotoSamples(context: common.Context): Promise<void> {
    const auth: WidgetAuth = HarmonyWidget.auth(context), appearance: WidgetAppearance = HarmonyWidget.appearance(context);
    if (auth.owner <= 0 || appearance.photoOwner !== auth.owner || appearance.samples.length > 0 && appearance.samplesCropped) return;
    let file: fs.File | undefined = undefined, source: image.ImageSource | undefined = undefined, pixels: image.PixelMap | undefined = undefined;
    try {
      file = fs.openSync(HarmonyWidget.file(context, 'background.jpg'), fs.OpenMode.READ_ONLY); source = image.createImageSource(file.fd);
      pixels = await source.createPixelMap({ editable: true, desiredPixelFormat: image.PixelMapFormat.RGBA_8888 });
      const info: image.ImageInfo = await pixels.getImageInfo(), side: number = Math.min(info.size.width, info.size.height);
      await pixels.crop({ x: Math.floor((info.size.width - side) / 2), y: Math.floor((info.size.height - side) / 2), size: { width: side, height: side } });
      await pixels.scale(16 / side, 16 / side);
      const buffer: ArrayBuffer = new ArrayBuffer(16 * 16 * 4); await pixels.readPixelsToBuffer(buffer);
      if (HarmonyWidget.auth(context).epoch !== auth.epoch) return;
      const current: WidgetAppearance = HarmonyWidget.appearance(context); if (current.photoOwner !== auth.owner || current.photoRevision !== appearance.photoRevision) return;
      current.samples = Array.from(new Uint8Array(buffer)); current.samplesCropped = true; HarmonyWidget.write(context, 'appearance.json', JSON.stringify(current)); await HarmonyWidget.publish(context);
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
      const view: WidgetView = HarmonyWidget.currentView(context); let photo: fs.File | undefined = undefined;
      try {
        if (auth.owner > 0 && HarmonyWidget.appearance(context).photoOwner === auth.owner) {
          photo = fs.openSync(HarmonyWidget.file(context, 'background.jpg'), fs.OpenMode.READ_ONLY);
          view.photo = 'memory://background'; view.formImages = { 'background': photo.fd };
        }
        if (HarmonyWidget.auth(context).epoch !== auth.epoch) break;
        await formProvider.updateForm(id, formBindingData.createFormBindingData(view));
      } catch { success = false; console.error('Widget appearance update failed'); } finally { if (photo) fs.closeSync(photo); }
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
    const epoch: string = HarmonyWidget.auth(context).epoch;
    let feedback: Promise<boolean> = Promise.resolve(true);
    if (visible) { const cache: WidgetCache = HarmonyWidget.cache(context); cache.epoch = epoch; cache.refreshing = Date.now(); HarmonyWidget.write(context, 'cache.json', JSON.stringify(cache)); feedback = HarmonyWidget.publish(context); }
    const existing: Promise<void> | undefined = action ? undefined : HarmonyWidget.refreshes.get(epoch);
    if (existing) return existing;
    const task: Promise<void> = HarmonyWidget.queue.catch(() => {}).then(async () => {
      await feedback;
      if (HarmonyWidget.auth(context).epoch !== epoch) return;
      try { await HarmonyWidget.sync(context, action); }
      finally {
        if (HarmonyWidget.auth(context).epoch === epoch) {
          if (!action) { const cache: WidgetCache = HarmonyWidget.cache(context); cache.refreshing = 0; HarmonyWidget.write(context, 'cache.json', JSON.stringify(cache)); if (HarmonyWidget.refreshes.get(epoch) === task) HarmonyWidget.refreshes.delete(epoch); }
          await HarmonyWidget.publish(context);
        }
      }
    }).catch(() => { console.error('Widget refresh failed'); });
    HarmonyWidget.queue = task;
    if (!action) { HarmonyWidget.refreshes.set(epoch, task); task.then(() => { if (HarmonyWidget.refreshes.get(epoch) === task) HarmonyWidget.refreshes.delete(epoch); }); }
    return task;
  }
  private static async sync(context: common.Context, action?: WidgetAction): Promise<void> {
      const auth: WidgetAuth = HarmonyWidget.auth(context); if (auth.owner <= 0) { await HarmonyWidget.publish(context); return; }
      let read: WidgetRead | undefined = undefined;
      if (action) {
        if (Number(action.owner) !== auth.owner || !['chat', 'note'].includes(action.type || '') || !Number.isSafeInteger(Number(action.id)) || Number(action.id) <= 0) return;
        read = { type: action.type || '', id: Number(action.id) };
      }
      try {
        const state: WidgetState = await HarmonyWidget.request(auth, read);
        if (HarmonyWidget.auth(context).epoch !== auth.epoch) return;
        const cache: WidgetCache = HarmonyWidget.cache(context);
        if (cache.epoch === auth.epoch && cache.state && cache.state.updatedAt > state.updatedAt) return;
        cache.epoch = auth.epoch; cache.state = state; cache.offline = false;
        HarmonyWidget.write(context, 'cache.json', JSON.stringify(cache));
      } catch (error) {
        if (HarmonyWidget.auth(context).epoch !== auth.epoch) return;
        if ((error as Error).message === 'widget-session-expired') { HarmonyWidget.session(context, 0, ''); return; }
        const cache: WidgetCache = HarmonyWidget.cache(context); cache.offline = true; HarmonyWidget.write(context, 'cache.json', JSON.stringify(cache));
      }
  }
  static async savePhoto(context: common.Context, uri: string): Promise<void> {
    const auth: WidgetAuth = HarmonyWidget.auth(context); if (auth.owner <= 0) throw new Error('请先登录');
    const file: fs.File = fs.openSync(uri, fs.OpenMode.READ_ONLY);
    let source: image.ImageSource | undefined = undefined, pixels: image.PixelMap | undefined = undefined, packer: image.ImagePacker | undefined = undefined;
    try {
      if (fs.statSync(file.fd).size > 20 * 1024 * 1024) throw new Error('请选择20MB以内的照片');
      source = image.createImageSource(file.fd); const info: image.ImageInfo = await source.getImageInfo(); const size: number = Math.max(info.size.width, info.size.height);
      pixels = await source.createPixelMap({ desiredSize: { width: Math.max(1, Math.round(info.size.width * Math.min(1, 400 / size))), height: Math.max(1, Math.round(info.size.height * Math.min(1, 400 / size))) } });
      packer = image.createImagePacker(); const bytes: ArrayBuffer = await packer.packing(pixels, { format: 'image/jpeg', quality: 85 });
      if (HarmonyWidget.auth(context).epoch !== auth.epoch) throw new Error('登录状态已变化');
      const target: fs.File = fs.openSync(HarmonyWidget.file(context, 'background.jpg'), fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
      try { fs.writeSync(target.fd, bytes); } finally { fs.closeSync(target); }
      const appearance: WidgetAppearance = HarmonyWidget.appearance(context); appearance.photoOwner = auth.owner; appearance.photoRevision = Date.now() + '-' + Math.random().toString(36).slice(2); appearance.samples = []; HarmonyWidget.write(context, 'appearance.json', JSON.stringify(appearance));
      await HarmonyWidget.ensurePhotoSamples(context); await HarmonyWidget.publish(context);
    } finally { fs.closeSync(file); await pixels?.release(); source?.release(); await packer?.release(); }
  }
}
