package xyz.ourdays.mobile;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.util.Base64;
import java.io.File;
import java.nio.file.Files;
import org.json.JSONObject;

final class WidgetAppearance {
    final int overlay;
    final String mode,color;
    private WidgetAppearance(int overlay,String mode,String color){this.overlay=overlay;this.mode=mode;this.color=color;}
    static WidgetAppearance load(Context c){return new WidgetAppearance(Math.max(0,Math.min(70,WidgetStore.prefs(c).getInt("appearance-overlay",12))),WidgetStore.prefs(c).getString("appearance-mode","auto"),WidgetStore.prefs(c).getString("appearance-color","#704457"));}
    static boolean save(Context c,JSONObject input){
        int overlay=input.optInt("overlay",-1);String mode=input.optString("mode"),color=input.optString("color");
        if(overlay<0||overlay>70||!mode.matches("auto|custom")||!color.matches("#[a-fA-F0-9]{6}"))return false;
        synchronized(WidgetStore.LOCK){if(WidgetStore.owner(c)<=0)return false;WidgetStore.prefs(c).edit().putInt("appearance-overlay",overlay).putString("appearance-mode",mode).putString("appearance-color",color).apply();}
        OurDaysWidget.render(c);return true;
    }
    int overlayColor(){return (Math.round(255*overlay/100f)<<24)|0x00ffffff;}
    int textColor(Bitmap image){
        if("custom".equals(mode))return Color.parseColor(color);
        if(image==null)return 0xff30252c;
        Bitmap sample=Bitmap.createScaledBitmap(image,16,16,true);int[] pixels=new int[256];sample.getPixels(pixels,0,16,0,0,16,16);if(sample!=image)sample.recycle();
        double luminance=0,a=overlay/100.0;
        for(int pixel:pixels){double r=linear((Color.red(pixel)*(1-a)+255*a)/255),g=linear((Color.green(pixel)*(1-a)+255*a)/255),b=linear((Color.blue(pixel)*(1-a)+255*a)/255);luminance+=.2126*r+.7152*g+.0722*b;}
        luminance/=pixels.length;return (luminance+.05)/.0713>1.05/(luminance+.05)?0xff30252c:Color.WHITE;
    }
    private static double linear(double s){return s<=.04045?s/12.92:Math.pow((s+.055)/1.055,2.4);}
    static String snapshot(Context c){
        try{
            WidgetAppearance style=load(c);JSONObject json=new JSONObject().put("overlay",style.overlay).put("mode",style.mode).put("color",style.color);
            int[] ids=android.appwidget.AppWidgetManager.getInstance(c).getAppWidgetIds(new android.content.ComponentName(c,OurDaysWidget.class));
            if(WidgetStore.owner(c)>0&&ids.length>0){File image=WidgetStore.background(c,ids[0]);if(image.isFile()&&image.length()<250000)json.put("preview",Base64.encodeToString(Files.readAllBytes(image.toPath()),Base64.NO_WRAP));}
            return json.toString();
        }catch(Exception error){android.util.Log.e("OurDaysWidget","Widget appearance could not be read",error);return "";}
    }
}
