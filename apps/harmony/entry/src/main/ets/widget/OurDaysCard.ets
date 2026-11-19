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
          Text(this.title).fontSize(11).fontColor(this.textColor).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
          Text(this.body).fontSize(17).fontColor(this.textColor).maxLines(3).textOverflow({ overflow: TextOverflow.Ellipsis }).layoutWeight(1).width('100%').padding({ top: 6, bottom: 6 })
          Text(this.caption).fontSize(9).fontColor(this.textColor).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
        }.alignItems(HorizontalAlign.Start).layoutWeight(1).width('100%')
        .onClick(() => {
          postCardAction(this, { action: 'router', abilityName: 'EntryAbility', params: { widgetTarget: this.target, widgetOwner: String(this.owner) } });
        })
        Row() {
          if (this.hasItem) {
            Text('✓ 已读').fontSize(11).fontColor(this.textColor).layoutWeight(1).height(30).onClick(() => {
              postCardAction(this, { action: 'message', params: { action: 'read', type: this.itemType, id: String(this.itemId), owner: String(this.owner) } });
            })
          } else { Blank().layoutWeight(1) }
          Stack() {
            if (this.refreshing) { LoadingProgress().color(this.textColor).width(22).height(22) }
            else { Text('↻').fontSize(22).fontColor(this.textColor) }
          }.width(32).height(30).onClick(() => {
            postCardAction(this, { action: 'message', params: { action: 'refresh' } });
          })
        }.width('100%').alignItems(VerticalAlign.Center)
      }.padding(13).width('100%').height('100%').backgroundColor(this.overlayColor)
    }.width('100%').height('100%').borderRadius(22).clip(true).backgroundColor('#F3E4EC')
  }
}
