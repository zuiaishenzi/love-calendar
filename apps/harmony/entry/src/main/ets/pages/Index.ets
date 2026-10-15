import { webview } from '@kit.ArkWeb';
import { abilityAccessCtrl, common } from '@kit.AbilityKit';
import { picker } from '@kit.CoreFileKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { SERVER_URL, VERSION_CODE, VERSION_NAME, trusted, commandPath } from '../common/ClientConfig';
import { NativeVoiceRecorder, VoiceResult } from '../common/NativeVoiceRecorder';
import { NativeDownloads } from '../common/NativeDownloads';
import { HARMONY_BOOTSTRAP, HARMONY_APPEARANCE, HARMONY_STYLE_PATH } from '../common/PageBootstrap';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private voice: NativeVoiceRecorder | undefined = undefined;
  private downloads: NativeDownloads | undefined = undefined;
  private fullScreen: FullScreenExitHandler | undefined = undefined;
  private fileResult: FileSelectorResult | undefined = undefined;
  private pickerGeneration: number = 0;
  private pickerReturned: number = 0;
  private webPermissionGeneration: number = 0;
  private webPermission: PermissionRequest | undefined = undefined;
  private alive: boolean = true;
  private pageGeneration: number = 0;
  private viewportWidth: number = 0;
  private viewportHeight: number = 0;
  @State private failed: boolean = false;
  @StorageLink('ourdaysForeground') @Watch('foregroundChanged') private foreground: boolean = true;

  private context(): common.UIAbilityContext { return this.getUIContext().getHostContext() as common.UIAbilityContext; }
  private isTrusted(): boolean {
    try { return this.alive && trusted(this.controller.getUrl()); } catch { return false; }
  }
  private toast(message: string): void {
    if (this.alive) this.getUIContext().getPromptAction().showToast({ message: message, duration: 3000 });
  }
  private async script(source: string): Promise<string> {
    if (!this.isTrusted()) return '';
    try { return await this.controller.runJavaScript(source); } catch { return ''; }
  }
  private syncViewport(): void {
    if (this.viewportWidth <= 0 || this.viewportHeight <= 0) return;
    this.script('window.__ourdaysViewport=' + JSON.stringify({ width: this.viewportWidth, height: this.viewportHeight }) +
      ';window.dispatchEvent(new Event("ourdays-viewport"));');
  }
  private async deliver(result: VoiceResult): Promise<void> {
    const generation: number = this.pageGeneration;
    if (result.data) {
      // Avoid a multi-megabyte single runJavaScript call; preserve the shared
      // Android voice-result protocol used for send/cancel/transcription.
      await this.script('window.__ourdaysVoice=""');
      for (let offset: number = 0; offset < result.data.length; offset += 32768) {
        if (!this.isTrusted() || generation !== this.pageGeneration) return;
        await this.script('window.__ourdaysVoice+=' + JSON.stringify(result.data.slice(offset, offset + 32768)));
      }
      if (generation !== this.pageGeneration) return;
      await this.script('window.dispatchEvent(new CustomEvent("native-voice-result",{detail:{data:window.__ourdaysVoice,duration:' +
        result.duration + '}}));delete window.__ourdaysVoice;');
    } else {
      await this.script('window.dispatchEvent(new CustomEvent("native-voice-result",{detail:' + JSON.stringify(result) + '}));');
    }
  }
  private foregroundChanged(): void {
    this.downloads?.setForeground(this.foreground);
    if (!this.foreground) { this.voice?.background(); webview.WebCookieManager.saveCookieAsync(); }
  }
  aboutToAppear(): void { webview.WebviewController.setWebDebuggingAccess(false); }
  aboutToDisappear(): void {
    this.voice?.cancel();
    this.cancelWebPermission();
    this.downloads?.dispose();
    this.finishPicker([]);
    this.alive = false;
  }
  private attached(): void {
    // Older deployed pages recognize only the Android voice/layout protocol.
    // Retain the real Harmony marker and advertise that compatibility protocol.
    this.controller.setCustomUserAgent(this.controller.getUserAgent() + ' OurDaysHarmony/' + VERSION_CODE + ' OurDaysAndroid/10808');
    webview.WebCookieManager.putAcceptCookieEnabled(true);
    webview.WebCookieManager.putAcceptThirdPartyCookieEnabled(false);
    this.voice = new NativeVoiceRecorder(this.context(), (result: VoiceResult) => this.deliver(result), () => this.foreground);
    this.downloads = new NativeDownloads(this.context(), this.controller, (message: string) => { this.toast(message); });
    this.downloads.attach();
  }
  private cancelWebPermission(): void {
    ++this.webPermissionGeneration;
    try { this.webPermission?.deny(); } catch {}
    this.webPermission = undefined;
  }
  private async grantWebMicrophone(request: PermissionRequest): Promise<void> {
    this.cancelWebPermission();
    if (!this.isTrusted() || !this.foreground || !trusted(request.getOrigin()) ||
      !request.getAccessibleResource().includes('TYPE_AUDIO_CAPTURE')) { request.deny(); return; }
    this.webPermission = request;
    const generation: number = this.webPermissionGeneration;
    try {
      const manager = abilityAccessCtrl.createAtManager();
      const result = await manager.requestPermissionsFromUser(this.context(), ['ohos.permission.MICROPHONE']);
      let allowed: boolean = result.authResults[0] === 0;
      if (!allowed && result.authResults[0] === -1 && result.dialogShownResults?.[0] === false &&
        generation === this.webPermissionGeneration && this.isTrusted()) {
        allowed = (await manager.requestPermissionOnSetting(this.context(), ['ohos.permission.MICROPHONE']))[0] === 0;
      }
      for (let attempt: number = 0; !this.foreground && attempt < 30; ++attempt) {
        if (generation !== this.webPermissionGeneration) return;
        await new Promise<void>(resolve => { setTimeout(resolve, 100); });
      }
      if (generation !== this.webPermissionGeneration) return;
      if (allowed && this.foreground && this.isTrusted() && trusted(request.getOrigin())) request.grant(['TYPE_AUDIO_CAPTURE']);
      else { request.deny(); this.toast('请在系统应用权限中允许朝夕使用麦克风'); }
    } catch { if (generation === this.webPermissionGeneration) request.deny(); }
    finally { if (generation === this.webPermissionGeneration) this.webPermission = undefined; }
  }
  private personalize(): void {
    this.script(`(()=>{
      const app=document.querySelector('#app'),settings=document.querySelector('#system-personalization');
      if(!app||!settings)return;
      settings.hidden=false;document.body.classList.add('android-app');
      let position='top';try{position=localStorage.getItem('ourdays.navigation-position')||'top';}catch{}
      const apply=value=>{app.classList.toggle('nav-bottom',value==='bottom');for(const radio of settings.querySelectorAll('input[name="nav-position"]'))radio.checked=radio.value===value;};
      apply(position);for(const radio of settings.querySelectorAll('input[name="nav-position"]'))radio.onchange=()=>{if(!radio.checked)return;apply(radio.value);try{localStorage.setItem('ourdays.navigation-position',radio.value);}catch{}};
      for(const id of ['client-downloads','android-update-entry']){const node=document.getElementById(id);if(node){node.hidden=true;node.style.setProperty('display','none','important');}}
      const description=document.querySelector('#system-menu-description');if(description)description.textContent='个性设置';
      const system=document.querySelector('#system-dialog');if(system){let label=document.querySelector('#harmony-client-version');if(!label){label=document.createElement('p');label.id='harmony-client-version';label.className='hint';system.append(label);}label.textContent=${JSON.stringify('鸿蒙客户端 v' + VERSION_NAME + ' · 构建 ' + VERSION_CODE)};}
    })()`);
  }
  private appearance(request: WebResourceRequest): WebResourceResponse | null {
    const path: string = commandPath(request.getRequestUrl());
    if (path !== HARMONY_STYLE_PATH || request.getRequestMethod() !== 'GET' || request.isMainFrame()) return null;
    const response: WebResourceResponse = new WebResourceResponse();
    response.setResponseData(HARMONY_APPEARANCE);
    response.setResponseMimeType('text/css');
    response.setResponseEncoding('UTF-8');
    response.setResponseCode(200);
    response.setReasonMessage('OK');
    response.setResponseHeader([{ headerKey: 'Cache-Control', headerValue: 'no-store' }]);
    return response;
  }
  private intercept(request: WebResourceRequest): boolean {
    const address: string = request.getRequestUrl();
    if (trusted(address)) {
      if (!request.isMainFrame()) return false;
      const path: string = commandPath(address);
      if (path.startsWith('/app/')) {
        if (!this.isTrusted() || !this.foreground) return true;
        if (path === '/app/record-voice') this.voice?.start();
        else if (path === '/app/finish-voice') this.voice?.finish();
        else if (path === '/app/cancel-voice') this.voice?.cancel();
        return true;
      }
      return false;
    }
    if (request.isMainFrame() && request.isRequestGesture() && /^https?:\/\//.test(address)) {
      this.context().startAbility({ action: 'ohos.want.action.viewData', uri: address }).catch(() => { this.toast('无法打开外部链接'); });
    }
    return true;
  }
  private finishPicker(files: string[]): void {
    if (!this.fileResult) return;
    const result: FileSelectorResult = this.fileResult;
    this.fileResult = undefined;
    ++this.pickerGeneration;
    this.pickerReturned = Date.now();
    result.handleFileList(files);
    this.script('window.dispatchEvent(new CustomEvent("app-file-picker-state",{detail:{active:false}}));');
  }
  private async selectFiles(selector: FileSelectorParam, result: FileSelectorResult): Promise<void> {
    if (!this.isTrusted()) { result.handleFileList([]); return; }
    this.finishPicker([]);
    this.fileResult = result;
    const generation: number = ++this.pickerGeneration;
    await this.script('window.dispatchEvent(new CustomEvent("app-file-picker-state",{detail:{active:true}}));');
    try {
      const types: string[] = selector.getAcceptType().join(',').split(',').map(value => value.trim().toLowerCase()).filter(value => !!value);
      const multiple: boolean = selector.getMode() === 1;
      let files: string[];
      if (types.length > 0 && types.every(value => value.startsWith('image/') || value.startsWith('video/'))) {
        const options = new photoAccessHelper.PhotoSelectOptions();
        options.MIMEType = types.every(value => value.startsWith('image/')) ? photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE :
          types.every(value => value.startsWith('video/')) ? photoAccessHelper.PhotoViewMIMETypes.VIDEO_TYPE : photoAccessHelper.PhotoViewMIMETypes.IMAGE_VIDEO_TYPE;
        options.maxSelectNumber = multiple ? 20 : 1;
        files = (await new photoAccessHelper.PhotoViewPicker().select(options)).photoUris;
      } else {
        const options = new picker.DocumentSelectOptions();
        options.maxSelectNumber = multiple ? 20 : 1;
        files = await new picker.DocumentViewPicker(this.context()).select(options);
      }
      if (generation === this.pickerGeneration) this.finishPicker(this.isTrusted() ? files : []);
    } catch {
      if (generation === this.pickerGeneration) this.finishPicker([]);
    }
  }
  onBackPress(): boolean {
    if (this.fileResult) { this.finishPicker([]); return true; }
    if (Date.now() - this.pickerReturned < 700) return true;
    if (this.fullScreen) { this.fullScreen.exitFullScreen(); this.fullScreen = undefined; return true; }
    this.script('(()=>{const d=document.querySelector("dialog[open]");if(d){if(d.requestClose)d.requestClose();else{const e=new Event("cancel",{cancelable:true});if(d.dispatchEvent(e))d.close();}return true;}if(typeof view!=="undefined"&&view!=="calendar"&&typeof switchView==="function"){switchView("calendar");return true;}return false;})()')
      .then(result => {
        if (result === 'true' || !this.alive) return;
        if (this.controller.accessBackward()) this.controller.backward();
        else this.context().terminateSelf();
      });
    return true;
  }

  build() {
    Stack() {
      Web({ src: SERVER_URL, controller: this.controller })
        .width('100%').height('100%')
        .verticalScrollBarAccess(false).horizontalScrollBarAccess(false)
        .overScrollMode(OverScrollMode.NEVER).backgroundColor('#FAF8F7')
        .onAreaChange((_previous: Area, area: Area) => {
          this.viewportWidth = Number(area.width);
          this.viewportHeight = Number(area.height);
          this.syncViewport();
        })
        .javaScriptAccess(true).domStorageAccess(true).databaseAccess(true)
        .javaScriptOnDocumentStart([{ script: HARMONY_BOOTSTRAP, scriptRules: ['*'] }])
        .fileAccess(false).geolocationAccess(false).mixedMode(MixedMode.None)
        .mediaPlayGestureAccess(true).multiWindowAccess(false)
        .keyboardAvoidMode(WebKeyboardAvoidMode.RESIZE_CONTENT)
        .onControllerAttached(() => { this.attached(); })
        .onLoadIntercept(event => event ? this.intercept(event.data) : true)
        // ArkWeb uses null for pass-through although the SDK callback omits it.
        .onInterceptRequest(event => this.appearance(event.request) as WebResourceResponse)
        .onPageBegin(() => { ++this.pageGeneration; this.voice?.cancel(); this.cancelWebPermission(); })
        .onPageEnd(() => {
          webview.WebCookieManager.saveCookieAsync();
          // Reapply after load if document-start injection was skipped by ArkWeb.
          // The bootstrap is idempotent, so existing listeners are reused.
          this.script(HARMONY_BOOTSTRAP).then(() => {
            this.personalize();
            this.syncViewport();
          });
        })
        .onErrorReceive(event => { if (event?.request.isMainFrame()) this.failed = true; })
        .onHttpErrorReceive(event => { if (event?.request.isMainFrame() && event.response.getResponseCode() >= 400) this.failed = true; })
        .onSslErrorEventReceive(event => { event?.handler.handleCancel(); this.failed = true; })
        .onPermissionRequest(event => { if (event) this.grantWebMicrophone(event.request); })
        .onShowFileSelector(event => { if (event) this.selectFiles(event.fileSelector, event.result); return true; })
        .onFullScreenEnter(event => { this.fullScreen = event.handler; })
        .onFullScreenExit(() => { this.fullScreen = undefined; })
      if (this.failed) {
        Column({ space: 20 }) {
          Text('暂时无法连接我们的日历\n请检查网络或服务器状态').fontSize(19).textAlign(TextAlign.Center)
          Button('重新连接').backgroundColor('#AD557A').onClick(() => {
            this.failed = false;
            this.controller.loadUrl(SERVER_URL);
          })
        }.width('100%').height('100%').justifyContent(FlexAlign.Center).backgroundColor('#FAF6F8')
      }
    }.width('100%').height('100%').backgroundColor('#FAF6F8')
  }
}
