import { webview } from '@kit.ArkWeb';
import { common } from '@kit.AbilityKit';
import { fileIo as fs, picker } from '@kit.CoreFileKit';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { SERVER_URL, trusted } from './ClientConfig';

export interface UpdateInfo {
  available: boolean;
  packageId: string;
  versionCode: number;
  versionName: string;
  filename: string;
  sha256: string;
  size: number;
  notes: string;
  downloadUrl: string;
}

class DownloadJob {
  path: string;
  name: string;
  update: UpdateInfo | undefined;
  constructor(path: string, name: string, update: UpdateInfo | undefined) {
    this.path = path; this.name = name; this.update = update;
  }
}

export class NativeDownloads {
  private context: common.UIAbilityContext;
  private controller: webview.WebviewController;
  private notify: (message: string) => void;
  private delegate: webview.WebDownloadDelegate = new webview.WebDownloadDelegate();
  private jobs: Map<string, DownloadJob> = new Map();
  private updates: Map<string, UpdateInfo> = new Map();
  private active: Map<string, webview.WebDownloadItem> = new Map();
  private ready: DownloadJob[] = [];
  private foreground: boolean = true;
  private alive: boolean = true;
  private saving: boolean = false;

  constructor(context: common.UIAbilityContext, controller: webview.WebviewController,
    notify: (message: string) => void) {
    this.context = context; this.controller = controller; this.notify = notify;
  }

  attach(): void {
    this.delegate.onBeforeDownload((item: webview.WebDownloadItem) => {
      const address: string = item.getUrl();
      // ArkWeb keeps session cookies for authenticated attachments and handles
      // same-origin blob exports without exposing cookies to native HTTP code.
      if (!this.alive || !trusted(this.controller.getUrl()) || !(trusted(address) || address.startsWith('blob:' + this.origin() + '/'))) {
        item.cancel();
        this.notify('仅支持保存本站附件');
        return;
      }
      const name: string = item.getSuggestedFileName().replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 180) || 'attachment';
      const path: string = this.context.cacheDir + '/download-' + item.getGuid() + '-' + name;
      this.jobs.set(item.getGuid(), new DownloadJob(path, name, this.updates.get(address)));
      this.active.set(item.getGuid(), item);
      this.updates.delete(address);
      item.start(path);
      this.notify('正在下载，完成后请选择保存位置');
    });
    this.delegate.onDownloadFailed((item: webview.WebDownloadItem) => {
      const job = this.jobs.get(item.getGuid());
      if (job) this.remove(job.path);
      this.jobs.delete(item.getGuid());
      this.active.delete(item.getGuid());
      this.notify('下载失败，请检查网络后重试');
    });
    this.delegate.onDownloadFinish((item: webview.WebDownloadItem) => {
      const job = this.jobs.get(item.getGuid());
      this.jobs.delete(item.getGuid());
      this.active.delete(item.getGuid());
      if (job) { this.ready.push(job); this.drain(); }
    });
    this.controller.setDownloadDelegate(this.delegate);
  }

  update(info: UpdateInfo): void {
    if (!this.alive) return;
    const address: string = this.origin() + info.downloadUrl;
    this.updates.set(address, info);
    try { this.controller.startDownload(address); }
    catch { this.updates.delete(address); this.notify('无法开始下载安装包，请稍后重试'); }
  }

  setForeground(value: boolean): void { this.foreground = value; if (value) this.drain(); }

  dispose(): void {
    this.alive = false;
    this.active.forEach((item: webview.WebDownloadItem) => { item.cancel(); });
    this.jobs.forEach((job: DownloadJob) => { this.remove(job.path); });
    this.ready.forEach((job: DownloadJob) => { this.remove(job.path); });
    this.jobs.clear(); this.active.clear(); this.updates.clear(); this.ready = [];
  }

  private drain(): void {
    if (!this.alive || !this.foreground || this.saving || !this.ready.length) return;
    const job = this.ready.shift();
    if (!job) return;
    this.saving = true;
    this.save(job).finally(() => { this.saving = false; this.drain(); });
  }

  private origin(): string { return SERVER_URL.slice(0, -1); }
  private remove(path: string): void { try { fs.unlinkSync(path); } catch {} }

  private async validate(job: DownloadJob): Promise<void> {
    const info = job.update;
    if (!info) return;
    if (fs.statSync(job.path).size !== info.size) throw new Error('size mismatch');
    const digest = cryptoFramework.createMd('SHA256');
    const source = fs.openSync(job.path, fs.OpenMode.READ_ONLY);
    try {
      let remaining: number = info.size;
      while (remaining > 0) {
        const buffer: ArrayBuffer = new ArrayBuffer(Math.min(65536, remaining));
        const count: number = fs.readSync(source.fd, buffer);
        if (count <= 0) throw new Error('short read');
        await digest.update({ data: new Uint8Array(buffer, 0, count) });
        remaining -= count;
      }
    } finally { fs.closeSync(source); }
    const result = await digest.digest();
    let hash: string = '';
    for (let i: number = 0; i < result.data.length; ++i) hash += result.data[i].toString(16).padStart(2, '0');
    if (hash !== info.sha256) throw new Error('hash mismatch');
  }

  private async save(job: DownloadJob): Promise<void> {
    try {
      await this.validate(job);
      if (!this.alive) return;
      const options = new picker.DocumentSaveOptions();
      options.newFileNames = [Date.now() + '-' + job.name];
      const targets = await new picker.DocumentViewPicker(this.context).save(options);
      if (!this.alive || !targets.length) return;
      const source = fs.openSync(job.path, fs.OpenMode.READ_ONLY);
      try {
        const target = fs.openSync(targets[0], fs.OpenMode.WRITE_ONLY);
        try {
          const buffer: ArrayBuffer = new ArrayBuffer(65536);
          let count: number = 0;
          while ((count = fs.readSync(source.fd, buffer)) > 0) {
            let offset: number = 0;
            while (offset < count) {
              const written: number = fs.writeSync(target.fd, buffer.slice(offset, count));
              if (written <= 0) throw new Error('short write');
              offset += written;
            }
          }
        } finally { fs.closeSync(target); }
      } finally { fs.closeSync(source); }
      this.notify(job.update ? '安装包已校验并保存；调试签名包请通过 DevEco/HDC 覆盖安装' : '已保存到所选位置');
    } catch { this.notify('文件保存或安装包校验失败，请重试'); }
    finally { this.remove(job.path); }
  }
}
