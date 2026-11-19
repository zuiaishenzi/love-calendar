import { Want } from '@kit.AbilityKit';
import { FormExtensionAbility, formBindingData, formInfo } from '@kit.FormKit';
import { HarmonyWidget, WidgetAction } from '../common/HarmonyWidget';

export default class OurDaysFormAbility extends FormExtensionAbility {
  onAddForm(want: Want): formBindingData.FormBindingData {
    const id: string = String(want.parameters?.[formInfo.FormParam.IDENTITY_KEY] || '');
    HarmonyWidget.add(this.context, id);
    HarmonyWidget.refresh(this.context);
    return formBindingData.createFormBindingData(HarmonyWidget.currentView(this.context));
  }
  onUpdateForm(_id: string): void { HarmonyWidget.refresh(this.context); }
  onFormEvent(id: string, message: string): void {
    if (!HarmonyWidget.forms(this.context).includes(id)) return;
    try {
      const action: WidgetAction = JSON.parse(message) as WidgetAction;
      if (action.action === 'refresh') HarmonyWidget.refresh(this.context, undefined, true);
      else if (action.action === 'read') HarmonyWidget.refresh(this.context, action);
    } catch {}
  }
  onRemoveForm(id: string): void { HarmonyWidget.remove(this.context, id); }
  onAcquireFormState(_want: Want): formInfo.FormState { return formInfo.FormState.READY; }
}
