import { UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
interface WidgetLaunch { widgetTarget?: string; widgetOwner?: string; }

export default class EntryAbility extends UIAbility {
  private acceptWidgetWant(want: Want): void {
    let launch: WidgetLaunch;
    try { launch = JSON.parse(String(want.parameters?.params || '{}')) as WidgetLaunch; } catch { return; }
    const target: string = launch.widgetTarget || String(want.parameters?.widgetTarget || '');
    if (target !== 'chat' && target !== 'notes') return;
    const owner: number = Number(launch.widgetOwner || want.parameters?.widgetOwner || 0);
    if (!Number.isSafeInteger(owner) || owner < 0) return;
    AppStorage.setOrCreate('ourdaysWidgetRoute', JSON.stringify({ target: target, owner: owner, time: Date.now() }));
  }
  onCreate(want: Want): void { AppStorage.setOrCreate('ourdaysForeground', true); AppStorage.setOrCreate('ourdaysWidgetRoute', ''); this.acceptWidgetWant(want); }
  onNewWant(want: Want): void { this.acceptWidgetWant(want); }

  onWindowStageCreate(stage: window.WindowStage): void {
    stage.getMainWindow().then(async (mainWindow: window.Window) => {
      await mainWindow.setWindowLayoutFullScreen(false);
      await mainWindow.setWindowSystemBarProperties({
        statusBarColor: '#FAF6F8', navigationBarColor: '#FAF6F8',
        statusBarContentColor: '#30272C', navigationBarContentColor: '#30272C'
      });
    }).catch(() => {});
    stage.loadContent('pages/Index');
  }

  onForeground(): void { AppStorage.setOrCreate('ourdaysForeground', true); }
  onBackground(): void { AppStorage.setOrCreate('ourdaysForeground', false); }
  onDestroy(): void { AppStorage.setOrCreate('ourdaysForeground', false); }
}
