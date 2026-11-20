import { image } from '@kit.ImageKit';

export interface WidgetCropRegion { x: number; y: number; side: number; }

@Component
export struct WidgetCrop {
  photo: image.PixelMap | undefined = undefined;
  imageWidth: number = 1;
  imageHeight: number = 1;
  onSave: (crop: WidgetCropRegion) => void = () => {};
  onCancel: () => void = () => {};
  @State private edge: number = 280;
  @State private zoom: number = 1;
  @State private x: number = 0;
  @State private y: number = 0;
  private startZoom: number = 1;
  private startX: number = 0;
  private startY: number = 0;
  private clamp(): void {
    const scale: number = this.edge * this.zoom / Math.min(this.imageWidth, this.imageHeight);
    const maxX: number = Math.max(0, (this.imageWidth * scale - this.edge) / 2), maxY: number = Math.max(0, (this.imageHeight * scale - this.edge) / 2);
    this.x = Math.max(-maxX, Math.min(maxX, this.x)); this.y = Math.max(-maxY, Math.min(maxY, this.y));
  }
  private save(): void {
    const scale: number = this.edge * this.zoom / Math.min(this.imageWidth, this.imageHeight), side: number = this.edge / scale;
    this.onSave({ x: (this.imageWidth / 2 - this.x / scale - side / 2) / this.imageWidth, y: (this.imageHeight / 2 - this.y / scale - side / 2) / this.imageHeight, side: side / Math.min(this.imageWidth, this.imageHeight) });
  }
  build() {
    Column({ space: 16 }) {
      Text('留住喜欢的画面').fontSize(24).fontColor('#77485E').width('100%')
      Text('拖动调整位置 · 双指缩放\n方框内就是卡片将展示的画面。').fontSize(13).fontColor('#A08091').width('100%')
      Blank().layoutWeight(1)
      Stack() {
        Image(this.photo).width(this.edge * this.imageWidth / Math.min(this.imageWidth, this.imageHeight))
          .height(this.edge * this.imageHeight / Math.min(this.imageWidth, this.imageHeight))
          .objectFit(ImageFit.Fill).scale({ x: this.zoom, y: this.zoom }).translate({ x: this.x, y: this.y })
      }.width('100%').aspectRatio(1).clip(true).borderRadius(16).border({ width: 1, color: '#BF8BA3' })
      .onAreaChange((_old: Area, area: Area) => { this.edge = Number(area.width); this.clamp(); })
      .gesture(GestureGroup(GestureMode.Parallel,
        PanGesture({ fingers: 1 }).onActionStart(() => { this.startX = this.x; this.startY = this.y; })
          .onActionUpdate((event: GestureEvent) => { this.x = this.startX + event.offsetX; this.y = this.startY + event.offsetY; this.clamp(); }),
        PinchGesture({ fingers: 2 }).onActionStart(() => { this.startZoom = this.zoom; })
          .onActionUpdate((event: GestureEvent) => { this.zoom = Math.max(1, Math.min(6, this.startZoom * event.scale)); this.clamp(); })
      ))
      Blank().layoutWeight(1)
      Button('使用这张照片').width('100%').height(50).backgroundColor('#93435F').fontColor('#FFFFFF').borderRadius(16).onClick(() => this.save())
      Button('取消').width('100%').height(50).backgroundColor('#FFFBFD').fontColor('#77485E').borderRadius(16).border({ width: 1, color: '#E7D5DF' }).onClick(() => this.onCancel())
    }.padding(24).width('100%').height('100%').backgroundColor('#FAF6F8')
  }
}
