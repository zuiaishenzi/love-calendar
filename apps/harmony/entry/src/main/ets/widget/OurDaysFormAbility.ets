import { Want } from '@kit.AbilityKit';
import { FormExtensionAbility, formBindingData, formInfo } from '@kit.FormKit';
import { HarmonyWidget, WidgetAction } from '../common/HarmonyWidget';

interface WidgetEvent {
  items?: string; width?: string; height?: string; font?: string; widgetAction?: string; action?: string; type?: string; id?: string; owner?: string; params?: WidgetEvent;
}

export default class OurDaysFormAbility extends FormExtensionAbility {
  onAddForm(want: Want): formBindingData.FormBindingData {
    const id: string = String(want.parameters?.[formInfo.FormParam.IDENTITY_KEY] || '');
    HarmonyWidget.add(this.context, id);
    HarmonyWidget.refresh(this.context);
    return formBindingData.createFormBindingData(HarmonyWidget.currentView(this.context, id));
  }
  onUpdateForm(id: string): void { HarmonyWidget.add(this.context, id); HarmonyWidget.refresh(this.context); }
  onFormEvent(id: string, message: string): void {
    HarmonyWidget.add(this.context, id);
    if (!HarmonyWidget.forms(this.context).includes(id)) return;
    try {
      const event: WidgetEvent = JSON.parse(message) as WidgetEvent;
      // The system reserves outer action='message' and keeps the original params nested.
      const payload: WidgetEvent = !event.widgetAction && event.action === 'message' && event.params ? event.params : event;
      if (payload.widgetAction === 'layout') { HarmonyWidget.layout(this.context, id, Number(payload.width), Number(payload.height), Number(payload.font)); return; }
      const action: WidgetAction = { items: payload.items, action: payload.widgetAction || payload.action || '', type: payload.type, id: payload.id, owner: payload.owner };
      if (action.action === 'refresh') { if (Number(payload.width) > 0 && Number(payload.height) > 0 && Number(payload.font) > 0) HarmonyWidget.layout(this.context, id, Number(payload.width), Number(payload.height), Number(payload.font)); console.info('Widget refresh event received'); HarmonyWidget.refresh(this.context, undefined, true); }
      else if (action.action === 'read' || action.action === 'read-batch') { console.info('Widget read event received'); HarmonyWidget.refresh(this.context, action); }
      else console.warn('Widget event ignored: unsupported operation');
    } catch { console.error('Widget event could not be handled'); }
  }
  onRemoveForm(id: string): void { HarmonyWidget.remove(this.context, id); }
  onAcquireFormState(_want: Want): formInfo.FormState { return formInfo.FormState.READY; }
}
