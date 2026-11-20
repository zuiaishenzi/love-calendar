package xyz.ourdays.mobile;

import android.content.Context;
import android.graphics.*;
import android.view.*;

/** Photo stays beneath the square window; gestures never expose empty pixels. */
final class WidgetCropView extends View {
    final Bitmap image;
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
    private final RectF frame=new RectF();
    private float zoom=1,x=0,y=0,lastX,lastY;
    private final ScaleGestureDetector pinch;
    WidgetCropView(Context context,Bitmap image){
        super(context);this.image=image;setContentDescription("拖动照片调整位置，双指缩放");
        pinch=new ScaleGestureDetector(context,new ScaleGestureDetector.SimpleOnScaleGestureListener(){
            @Override public boolean onScale(ScaleGestureDetector detector){zoom=Math.max(1,Math.min(6,zoom*detector.getScaleFactor()));clamp();invalidate();return true;}
        });
    }
    private float base(){return frame.width()/Math.min(image.getWidth(),image.getHeight());}
    private void clamp(){float s=base()*zoom;x=Math.max(-(image.getWidth()*s-frame.width())/2,Math.min((image.getWidth()*s-frame.width())/2,x));y=Math.max(-(image.getHeight()*s-frame.height())/2,Math.min((image.getHeight()*s-frame.height())/2,y));}
    void reset(){zoom=1;x=y=0;invalidate();}
    @Override protected void onSizeChanged(int w,int h,int oldW,int oldH){float edge=Math.max(1,Math.min(w,h)-32*getResources().getDisplayMetrics().density);frame.set((w-edge)/2,(h-edge)/2,(w+edge)/2,(h+edge)/2);clamp();}
    @Override protected void onDraw(Canvas canvas){
        canvas.drawColor(0xfffaf6f8);float s=base()*zoom;
        canvas.save();canvas.clipRect(frame);canvas.drawBitmap(image,null,new RectF(frame.centerX()+x-image.getWidth()*s/2,frame.centerY()+y-image.getHeight()*s/2,frame.centerX()+x+image.getWidth()*s/2,frame.centerY()+y+image.getHeight()*s/2),paint);canvas.restore();
        paint.setColor(0xffbf8ba3);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(getResources().getDisplayMetrics().density);canvas.drawRoundRect(frame,12,12,paint);paint.setColor(0x55ffffff);
        for(int i=1;i<3;i++){float p=frame.width()*i/3;canvas.drawLine(frame.left+p,frame.top,frame.left+p,frame.bottom,paint);canvas.drawLine(frame.left,frame.top+p,frame.right,frame.top+p,paint);}paint.setStyle(Paint.Style.FILL);
    }
    @Override public boolean onTouchEvent(MotionEvent event){
        pinch.onTouchEvent(event);if(event.getActionMasked()==MotionEvent.ACTION_DOWN){lastX=event.getX();lastY=event.getY();getParent().requestDisallowInterceptTouchEvent(true);}
        else if(event.getActionMasked()==MotionEvent.ACTION_MOVE){if(event.getPointerCount()==1&&!pinch.isInProgress()){x+=event.getX()-lastX;y+=event.getY()-lastY;clamp();invalidate();}lastX=event.getX();lastY=event.getY();}
        else if(event.getActionMasked()==MotionEvent.ACTION_POINTER_UP){int other=event.getActionIndex()==0?1:0;lastX=event.getX(other);lastY=event.getY(other);}
        else if(event.getActionMasked()==MotionEvent.ACTION_UP){performClick();getParent().requestDisallowInterceptTouchEvent(false);}return true;
    }
    @Override public boolean performClick(){super.performClick();return true;}
    Bitmap crop(){
        float s=base()*zoom;int side=Math.max(1,Math.min(Math.min(image.getWidth(),image.getHeight()),Math.round(frame.width()/s)));
        int left=Math.max(0,Math.min(image.getWidth()-side,Math.round(image.getWidth()/2f-x/s-side/2f))),top=Math.max(0,Math.min(image.getHeight()-side,Math.round(image.getHeight()/2f-y/s-side/2f)));
        Bitmap cropped=Bitmap.createBitmap(image,left,top,side,side);int edge=Math.min(768,side);Bitmap result=Bitmap.createScaledBitmap(cropped,edge,edge,true);if(cropped!=image&&cropped!=result)cropped.recycle();return result;
    }
}
