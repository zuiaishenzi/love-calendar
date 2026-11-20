const storage: LocalStorage = new LocalStorage();
@Entry(storage)
@Component
struct OurDaysCard {
  @LocalStorageProp('title') title: string = '朝夕 · 桌面留言';
  @LocalStorageProp('body') body: string = '打开 App，接收对方的心意';
  @LocalStorageProp('caption') caption: string = '轻触打开桌面留言';
  @LocalStorageProp('target') target: string = 'notes';
  @LocalStorageProp('owner') owner: number = 0;
  @LocalStorageProp('itemType') itemType: string = '';
  @LocalStorageProp('itemId') itemId: number = 0;
  @LocalStorageProp('hasItem') hasItem: boolean = false;
  @LocalStorageProp('preset') preset: string = 'rose';
  @LocalStorageProp('photo') photo: string = '';
  @LocalStorageProp('textColor') textColor: string = '#30252C';
  @LocalStorageProp('titleColor') titleColor: string = '#63364E';
  @LocalStorageProp('captionColor') captionColor: string = '#264A40';
  @LocalStorageProp('compact') compact: boolean = false;
  @LocalStorageProp('overlayColor') overlayColor: string = '#1FFFFFFF';
  @LocalStorageProp('refreshing') refreshing: boolean = false;

  build() {
    Stack() {
      if (this.photo) {
        Image(this.photo).width('100%').height('100%').objectFit(ImageFit.Cover)
      } else if (this.preset === 'dawn') {
        Image($r('app.media.widget_dawn')).width('100%').height('100%').objectFit(ImageFit.Cover)
      } else if (this.preset === 'hills') {
        Image($r('app.media.widget_hills')).width('100%').height('100%').objectFit(ImageFit.Cover)
      } else if (this.preset === 'moon') {
        Image($r('app.media.widget_moon')).width('100%').height('100%').objectFit(ImageFit.Cover)
      }
      Column() {
        Column() {
          Text(this.title).fontSize(11).fontColor(this.titleColor).maxLines(2).width('100%')
          Text(this.body).fontSize(17).minFontSize(10).maxFontSize(17).fontColor(this.textColor).maxLines(12).textOverflow({ overflow: TextOverflow.Clip }).layoutWeight(1).width('100%').padding({ top: 2, bottom: 2 })
          if (!this.compact || this.refreshing) { Text(this.caption).fontSize(9).fontColor(this.captionColor).maxLines(1).width('100%') }
        }.alignItems(HorizontalAlign.Start).layoutWeight(1).width('100%')
        .onClick(() => {
          postCardAction(this, { action: 'router', abilityName: 'EntryAbility', params: { widgetTarget: this.target, widgetOwner: String(this.owner) } });
        })
        Row() {
          if (this.hasItem) {
            Text('✓ 已读').fontSize(11).fontColor(this.captionColor).layoutWeight(1).height(30).onClick(() => {
              postCardAction(this, { action: 'message', params: { action: 'read', type: this.itemType, id: String(this.itemId), owner: String(this.owner) } });
            })
          } else { Blank().layoutWeight(1) }
          Stack() {
            if (this.refreshing) { LoadingProgress().color(this.captionColor).width(22).height(22) }
            else { Text('↻').fontSize(22).fontColor(this.captionColor) }
          }.width(32).height(30).onClick(() => {
            postCardAction(this, { action: 'message', params: { action: 'refresh' } });
          })
        }.width('100%').alignItems(VerticalAlign.Center)
      }.padding(10).width('100%').height('100%').backgroundColor(this.overlayColor)
    }.width('100%').height('100%').backgroundColor('#F3E4EC')
  }
}
