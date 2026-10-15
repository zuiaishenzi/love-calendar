import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';

export default class EntryAbility extends UIAbility {
  onCreate(): void { AppStorage.setOrCreate('ourdaysForeground', true); }

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
