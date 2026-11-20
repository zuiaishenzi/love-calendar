import { webview } from '@kit.ArkWeb';
import { abilityAccessCtrl, common } from '@kit.AbilityKit';
import { image } from '@kit.ImageKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { WidgetCrop, WidgetCropRegion } from '../common/WidgetCrop';
import { picker } from '@kit.CoreFileKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { SERVER_URL, VERSION_CODE, VERSION_NAME, trusted, commandPath } from '../common/ClientConfig';
import { NativeVoiceRecorder, VoiceResult } from '../common/NativeVoiceRecorder';
import { NativeDownloads } from '../common/NativeDownloads';
import { HARMONY_BOOTSTRAP, HARMONY_APPEARANCE, HARMONY_STYLE_PATH } from '../common/PageBootstrap';
import { HarmonyWidget } from '../common/HarmonyWidget';

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
  @StorageLink('ourdaysWidgetRoute') @Watch('widgetRouteChanged') private widgetRoute: string = '';
  private widgetSessionGeneration: number = 0;
  @State private cropPhoto: image.PixelMap | undefined = undefined;
  private cropUri: string = '';
  private cropEpoch: string = '';
  private cropSelected: string = '';
  private cropWidth: number = 1;
  private cropHeight: number = 1;
  @State private cropSaving: boolean = false;
  private closeCrop(): void { const photo: image.PixelMap | undefined = this.cropPhoto; this.cropPhoto = undefined; this.cropUri = ''; photo?.release(); }
  private async saveCrop(region: WidgetCropRegion): Promise<void> {
    if (this.cropSaving || !this.cropUri) return; this.cropSaving = true;
    try {
      if (HarmonyWidget.auth(this.context()).epoch !== this.cropEpoch) throw new Error('登录状态已变化');
      await HarmonyWidget.savePhoto(this.context(), this.cropUri, region, this.cropSelected);
      this.closeCrop(); this.toast('新的底色，已经换好了');
      this.script('if(typeof paintWidgetBackground==="function")paintWidgetBackground("custom");if(typeof loadWidgetAppearance==="function")loadWidgetAppearance();');
    } catch { this.toast('图片未保存，请确认已登录并重试'); }
    finally { this.cropSaving = false; }
  }

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
    else { HarmonyWidget.refresh(this.context()); this.widgetRouteChanged(); this.script('window.dispatchEvent(new Event("widget-style-changed"));'); }
  }
  private async widgetRouteChanged(): Promise<void> {
    if (!this.widgetRoute || !this.foreground || !this.isTrusted()) return;
    const route: string = this.widgetRoute;
    const result: string = await this.script('(()=>{if(typeof currentUser==="undefined"||!currentUser||typeof openWidgetLink!=="function")return false;openWidgetLink(' + route + ');return true;})()');
    if (result === 'true' && this.widgetRoute === route) AppStorage.set('ourdaysWidgetRoute', '');
  }
  private widgetPrompt(event: OnPromptEvent): boolean {
    if (!event.message.startsWith('ourdays-widget:') || !trusted(event.url) || !this.isTrusted()) return false;
    const command: string = event.message.slice('ourdays-widget:'.length);
    let result: string = '';
    if (command === 'session') {
      const generation: number = ++this.widgetSessionGeneration, owner: number = Number(event.value);
      if (!Number.isSafeInteger(owner) || owner <= 0) HarmonyWidget.session(this.context(), 0, '');
      else webview.WebCookieManager.fetchCookie(SERVER_URL).then((cookie: string) => {
        if (generation !== this.widgetSessionGeneration || !this.alive) return;
        HarmonyWidget.session(this.context(), owner, cookie); this.widgetRouteChanged();
      }).catch(() => { if (generation === this.widgetSessionGeneration) HarmonyWidget.session(this.context(), 0, ''); });
    } else if (command === 'refresh') HarmonyWidget.refresh(this.context(), undefined, true);
    else if (command === 'settings-current') result = HarmonyWidget.settings(this.context());
    else if (command === 'settings-save') result = HarmonyWidget.saveSettings(this.context(), event.value) ? 'saved' : '';
    else if (command === 'cards') result = HarmonyWidget.cards(this.context());
    else if (command === 'card-select') result = HarmonyWidget.select(this.context(), event.value) ? 'selected' : '';
    else if (command === 'appearance-current') result = HarmonyWidget.snapshot(this.context());
    else if (command === 'appearance') {
      HarmonyWidget.saveAppearance(this.context(), event.value).then((saved: boolean) => { event.result.handlePromptConfirm(saved ? HarmonyWidget.snapshot(this.context()) : ''); }).catch(() => { event.result.handlePromptConfirm(''); });
      return true;
    }
    else if (command === 'background-current') result = HarmonyWidget.currentPreset(this.context());
    else if (this.foreground) {
      if (command === 'background') result = HarmonyWidget.preset(this.context(), event.value) ? 'saved' : 'login';
      else if (command === 'settings') this.selectWidgetPhoto();
      else if (command === 'pin') {
        this.getUIContext().getPromptAction().showDialog({ title: '添加朝夕服务卡片', message: '回到手机桌面，长按朝夕图标，选择「服务卡片」，找到「朝夕 · 留言与倒计时」，再点击添加到桌面。也可以在桌面的卡片管理中搜索朝夕。', buttons: [{ text: '知道了', color: '#A16986' }] });
      }
    }
    event.result.handlePromptConfirm(result); return true;
  }
  private async selectWidgetPhoto(): Promise<void> {
    if (HarmonyWidget.auth(this.context()).owner <= 0) { this.toast('请先登录'); return; }
    const generation: number = this.pageGeneration, epoch: string = HarmonyWidget.auth(this.context()).epoch, selected: string = HarmonyWidget.selected(this.context());
    this.script('window.dispatchEvent(new CustomEvent("app-file-picker-state",{detail:{active:true}}));');
    try {
      const options: photoAccessHelper.PhotoSelectOptions = new photoAccessHelper.PhotoSelectOptions(); options.MIMEType = photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE; options.maxSelectNumber = 1;
      const files: photoAccessHelper.PhotoSelectResult = await new photoAccessHelper.PhotoViewPicker().select(options);
      if (!files.photoUris.length || !this.alive || generation !== this.pageGeneration) return;
      const file: fs.File = fs.openSync(files.photoUris[0], fs.OpenMode.READ_ONLY);
      let source: image.ImageSource | undefined = undefined;
      try {
        if (fs.statSync(file.fd).size > 20 * 1024 * 1024) throw new Error('照片过大');
        source = image.createImageSource(file.fd); const info: image.ImageInfo = await source.getImageInfo(), scale: number = Math.min(1, 1536 / Math.max(info.size.width, info.size.height));
        const photo: image.PixelMap = await source.createPixelMap({ desiredSize: { width: Math.max(1, Math.round(info.size.width * scale)), height: Math.max(1, Math.round(info.size.height * scale)) } });
        if (!this.alive || generation !== this.pageGeneration || HarmonyWidget.auth(this.context()).epoch !== epoch) { await photo.release(); return; }
        const preview: image.ImageInfo = await photo.getImageInfo(); this.cropWidth = preview.size.width; this.cropHeight = preview.size.height; this.cropEpoch = epoch; this.cropSelected = selected; this.cropUri = files.photoUris[0]; this.cropPhoto = photo;
      } finally { source?.release(); fs.closeSync(file); }
    } catch { this.toast('图片未保存，请选择20MB以内的照片并确认已登录'); }
    finally { this.pickerReturned = Date.now(); this.script('window.dispatchEvent(new CustomEvent("app-file-picker-state",{detail:{active:false}}));'); }
  }
  aboutToAppear(): void { webview.WebviewController.setWebDebuggingAccess(false); }
  aboutToDisappear(): void {
    this.closeCrop();
    this.voice?.cancel();
    this.cancelWebPermission();
    this.downloads?.dispose();
    this.finishPicker([]);
    this.alive = false;
  }
  private attached(): void {
    // Older deployed pages recognize only the Android voice/layout protocol.
    // Retain the real Harmony marker and advertise that compatibility protocol.
    this.controller.setCustomUserAgent(this.controller.getUserAgent() + ' OurDaysHarmony/' + VERSION_CODE + ' OurDaysAndroid/10811');
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
      const hint=document.querySelector('.widget-page-footnote');if(hint)hint.textContent='消息优先展示；鸿蒙系统约30分钟检查，点击卡片刷新可立即同步。';
      const pin=document.querySelector('#widget-pin');if(pin)pin.textContent='如何添加到桌面';
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
    if (this.cropPhoto) { if (!this.cropSaving) this.closeCrop(); return true; }
    if (this.fileResult) { this.finishPicker([]); return true; }
    if (Date.now() - this.pickerReturned < 700) return true;
    if (this.fullScreen) { this.fullScreen.exitFullScreen(); this.fullScreen = undefined; return true; }
    this.script('(()=>{const d=document.querySelector("dialog[open]");if(d){if(d.requestClose)d.requestClose();else{const e=new Event("cancel",{cancelable:true});if(d.dispatchEvent(e))d.close();}return true;}if(typeof closeWidgetDate==="function"&&closeWidgetDate())return true;if(typeof view!=="undefined"&&view!=="calendar"&&typeof switchView==="function"){switchView("calendar");return true;}return false;})()')
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
        .onPrompt(event => this.widgetPrompt(event))
        .onFullScreenEnter(event => { this.fullScreen = event.handler; })
        .onFullScreenExit(() => { this.fullScreen = undefined; })
      if (this.cropPhoto) {
        WidgetCrop({ photo: this.cropPhoto, imageWidth: this.cropWidth, imageHeight: this.cropHeight, onSave: (region: WidgetCropRegion) => this.saveCrop(region), onCancel: () => this.closeCrop() }).enabled(!this.cropSaving)
        if (this.cropSaving) { LoadingProgress().width(40).height(40).color('#93435F') }
      }
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
