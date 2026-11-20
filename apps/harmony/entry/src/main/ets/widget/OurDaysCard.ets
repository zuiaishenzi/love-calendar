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
  @LocalStorageProp('reading') reading: boolean = false;
  @LocalStorageProp('readFailed') readFailed: boolean = false;
  @State refreshAngle: number = 0;

  private refreshCard(): void {
    this.refreshAngle += 360;
    postCardAction(this, { action: 'message', params: { widgetAction: 'refresh' } });
  }

  private readCard(): void {
    if (!this.hasItem || this.reading) return;
    console.info('Widget read button tapped');
    postCardAction(this, { action: 'message', params: { widgetAction: 'read', type: this.itemType, id: String(this.itemId), owner: String(this.owner) } });
  }

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
          if (!this.compact || this.refreshing || this.reading || this.readFailed) { Text(this.caption).fontSize(9).fontColor(this.captionColor).maxLines(1).width('100%') }
        }.alignItems(HorizontalAlign.Start).layoutWeight(1).width('100%')
        .onClick(() => {
          postCardAction(this, { action: 'router', abilityName: 'EntryAbility', params: { widgetTarget: this.target, widgetOwner: String(this.owner) } });
        })
        Row() {
          if (this.hasItem) {
            Button({ type: ButtonType.Normal }) {
              Text(this.reading ? '标记中…' : this.readFailed ? '↻ 重试' : '✓ 已读').fontSize(11).fontColor(this.captionColor).width('100%').textAlign(TextAlign.Start)
            }.padding(0).backgroundColor(Color.Transparent).borderRadius(0).layoutWeight(1).height(32).enabled(!this.reading).onClick(() => {
              this.readCard();
            })
          } else { Blank().layoutWeight(1) }
          Stack() {
            Text('↻').fontSize(22).fontColor(this.captionColor).rotate({ angle: this.refreshAngle }).animation({ duration: 800, curve: Curve.Linear })
          }.width(36).height(32).onClick(() => {
            this.refreshCard();
          })
        }.width('100%').alignItems(VerticalAlign.Center)
      }.padding(10).width('100%').height('100%').backgroundColor(this.overlayColor)
    }.width('100%').height('100%').backgroundColor('#F3E4EC')
  }
}
