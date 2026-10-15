import { abilityAccessCtrl, common } from '@kit.AbilityKit';
import { media } from '@kit.MediaKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';

export interface VoiceResult {
  recording?: boolean;
  cancelled?: boolean;
  error?: string;
  data?: string;
  duration?: number;
}

// Serialize AVRecorder operations. A release/cancel while permission or prepare
// is pending must never leave the microphone running after the finger is lifted.
export class NativeVoiceRecorder {
  private context: common.UIAbilityContext;
  private deliver: (result: VoiceResult) => Promise<void>;
  private foreground: () => boolean;
  private authorizing: boolean = false;
  private recorder: media.AVRecorder | undefined = undefined;
  private file: fs.File | undefined = undefined;
  private path: string = '';
  private started: number = 0;
  private timer: number = -1;
  private generation: number = 0;
  private requested: boolean = false;
  private queue: Promise<void> = Promise.resolve();

  constructor(context: common.UIAbilityContext, deliver: (result: VoiceResult) => Promise<void>, foreground: () => boolean) {
    this.context = context;
    this.deliver = deliver;
    this.foreground = foreground;
  }

  background(): void { if (!this.authorizing) this.cancel(); }

  start(): void {
    if (this.requested) return;
    this.requested = true;
    const generation = ++this.generation;
    this.queue = this.queue.then(() => this.open(generation));
  }

  finish(): void {
    const generation = this.generation;
    this.queue = this.queue.then(() => this.save(generation));
  }

  cancel(): void {
    this.requested = false;
    ++this.generation;
    this.queue = this.queue.then(async () => {
      await this.cleanup();
      await this.deliver({ cancelled: true });
    });
  }

  private async open(generation: number): Promise<void> {
    let stage: string = '申请麦克风权限';
    try {
      this.authorizing = true;
      const manager = abilityAccessCtrl.createAtManager();
      const permissions = await manager.requestPermissionsFromUser(this.context, ['ohos.permission.MICROPHONE']);
      let allowed: boolean = permissions.authResults[0] === 0;
      // A previous rejection suppresses the first-use prompt. Ask through the
      // system settings dialog only when no prompt was shown this time. A fresh
      // explicit rejection must not immediately trigger another dialog.
      if (!allowed && permissions.authResults[0] === -1 && permissions.dialogShownResults?.[0] === false &&
        generation === this.generation && this.requested) {
        allowed = (await manager.requestPermissionOnSetting(this.context, ['ohos.permission.MICROPHONE']))[0] === 0;
      }
      this.authorizing = false;
      if (generation !== this.generation || !this.requested) return;
      if (!allowed) {
        this.requested = false;
        await this.deliver({ error: '麦克风权限被拒绝，请在系统应用权限中允许朝夕使用麦克风' });
        return;
      }
      // Permission UI can temporarily background the Ability. Wait for its
      // foreground callback instead of treating authorization as cancellation.
      for (let attempt: number = 0; !this.foreground() && attempt < 30; ++attempt) {
        if (generation !== this.generation || !this.requested) return;
        await new Promise<void>(resolve => { setTimeout(resolve, 100); });
      }
      if (!this.foreground() || generation !== this.generation || !this.requested) return;
      stage = '准备录音';
      this.path = this.context.cacheDir + '/voice-' + Date.now() + '-' + generation + '.m4a';
      this.file = fs.openSync(this.path, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
      this.recorder = await media.createAVRecorder();
      this.recorder.on('error', () => {
        if (generation !== this.generation) return;
        this.cancel();
        this.deliver({ error: '录音被系统中断，请重新录制' });
      });
      const config: media.AVRecorderConfig = {
        audioSourceType: media.AudioSourceType.AUDIO_SOURCE_TYPE_MIC,
        profile: { audioBitrate: 64000, audioChannels: 1, audioCodec: media.CodecMimeType.AUDIO_AAC,
          audioSampleRate: 16000, fileFormat: media.ContainerFormatType.CFT_MPEG_4A },
        url: 'fd://' + this.file.fd
      };
      await this.recorder.prepare(config);
      if (generation !== this.generation || !this.requested) { await this.cleanup(); return; }
      stage = '启动录音';
      await this.recorder.start();
      if (generation !== this.generation || !this.requested) { await this.cleanup(); return; }
      this.started = Date.now();
      await this.deliver({ recording: true });
      this.timer = setInterval(() => {
        if (Date.now() - this.started >= 120000 || fs.statSync(this.path).size >= 5 * 1024 * 1024) this.finish();
      }, 500);
    } catch {
      this.authorizing = false;
      await this.cleanup();
      if (generation === this.generation) {
        this.requested = false;
        await this.deliver({ error: stage + '失败，请检查麦克风权限、音频占用情况后重试' });
      }
    }
  }

  private async save(generation: number): Promise<void> {
    if (generation !== this.generation || !this.recorder || !this.file || !this.requested) return;
    this.requested = false;
    clearInterval(this.timer);
    try {
      const duration: number = (Date.now() - this.started) / 1000;
      await this.recorder.stop();
      await this.recorder.release();
      this.recorder = undefined;
      fs.closeSync(this.file);
      this.file = undefined;
      if (generation !== this.generation) return;
      const size: number = fs.statSync(this.path).size;
      if (duration < 1 || size < 1 || size > 5 * 1024 * 1024) throw new Error('invalid recording');
      const bytes: ArrayBuffer = new ArrayBuffer(size);
      const input: fs.File = fs.openSync(this.path, fs.OpenMode.READ_ONLY);
      try {
        let offset: number = 0;
        while (offset < size) {
          const chunk: ArrayBuffer = new ArrayBuffer(Math.min(65536, size - offset));
          const read: number = fs.readSync(input.fd, chunk);
          if (read <= 0) throw new Error('short read');
          new Uint8Array(bytes).set(new Uint8Array(chunk, 0, read), offset);
          offset += read;
        }
      } finally { fs.closeSync(input); }
      await this.deliver({ data: new util.Base64Helper().encodeToStringSync(new Uint8Array(bytes)), duration: duration });
    } catch {
      if (generation === this.generation) await this.deliver({ error: '录音过短或保存失败，请录制至少1秒后重试' });
    } finally { await this.cleanup(); }
  }

  private async cleanup(): Promise<void> {
    clearInterval(this.timer);
    this.timer = -1;
    if (this.recorder) {
      try { await this.recorder.release(); } catch {}
      this.recorder = undefined;
    }
    if (this.file) {
      try { fs.closeSync(this.file); } catch {}
      this.file = undefined;
    }
    if (this.path) {
      try { fs.unlinkSync(this.path); } catch {}
      this.path = '';
    }
  }
}
