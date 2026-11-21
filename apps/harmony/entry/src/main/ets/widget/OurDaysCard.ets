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
  @LocalStorageProp('readCount') readCount: number = 0;
  private bodyWidth: number = 0;
  private bodyHeight: number = 0;
  private bodyFontUnit: number = 0;
  @LocalStorageProp('bodyFont') bodyFont: number = 16;
  @LocalStorageProp('canRead') canRead: boolean = false;
  @LocalStorageProp('readItems') readItems: string = '[]';
  @LocalStorageProp('layoutKey') layoutKey: string = '';
  @State actualLayoutKey: string = '';
  private reportLayout(area: SizeOptions): void {
    const width: number = Math.floor(vp2px(Number(area.width))), height: number = Math.floor(vp2px(Math.max(0, Number(area.height) - 8))), font: number = Math.round(fp2px(1) * 100) / 100;
    this.bodyWidth = width; this.bodyHeight = height; this.bodyFontUnit = font;
    const key: string = width + ':' + height + ':' + font; if (key === this.actualLayoutKey || width <= 0 || height <= 0) return; this.actualLayoutKey = key;
    postCardAction(this, { action: 'message', params: { widgetAction: 'layout', width: String(width), height: String(height), font: String(font) } });
  }
  @State refreshAngle: number = 0;

  private refreshCard(): void {
    this.refreshAngle += 360;
    postCardAction(this, { action: 'message', params: { widgetAction: 'refresh', width: String(this.bodyWidth || 0), height: String(this.bodyHeight || 0), font: String(this.bodyFontUnit || 0) } });
  }

  private readCard(): void {
    if (!this.hasItem || this.reading || !this.canRead || this.layoutKey !== this.actualLayoutKey) return;
    console.info('Widget read button tapped');
    postCardAction(this, { action: 'message', params: { widgetAction: 'read-batch', items: this.readItems, owner: String(this.owner) } });
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
          Stack({ alignContent: Alignment.Start }) {
            Text(this.body).fontSize(this.bodyFont).fontFamily('HarmonyOS Sans').fontColor(this.textColor).width('100%')
          }.layoutWeight(1).width('100%').padding({ top: 8 }).clip(true).onSizeChange((_old: SizeOptions, area: SizeOptions) => this.reportLayout(area))
          Text(this.caption).fontSize(9).fontColor(this.captionColor).maxLines(1).width('100%')
        }.alignItems(HorizontalAlign.Start).layoutWeight(1).width('100%')
        .onClick(() => {
          postCardAction(this, { action: 'router', abilityName: 'EntryAbility', params: { widgetTarget: this.target, widgetOwner: String(this.owner) } });
        })
        Row() {
          if (this.hasItem && this.canRead && this.layoutKey === this.actualLayoutKey) {
            Button({ type: ButtonType.Normal }) {
              Text(this.reading ? '标记中…' : this.readFailed ? '↻ 重试' : this.readCount > 1 ? '✓ 已读这 ' + this.readCount + ' 条' : '✓ 已读').fontSize(11).fontColor(this.captionColor).width('100%').textAlign(TextAlign.Start)
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
