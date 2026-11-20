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
    final String mode,color,titleColor,captionColor;
    private WidgetAppearance(int overlay,String mode,String color,String titleColor,String captionColor){this.overlay=overlay;this.mode=mode;this.color=color;this.titleColor=titleColor;this.captionColor=captionColor;}
    static WidgetAppearance load(Context c){return load(c,WidgetProfiles.selected(c));}
    static WidgetAppearance load(Context c,int id){String suffix=WidgetProfiles.suffix(id);String color=WidgetStore.prefs(c).getString("appearance-color"+suffix,WidgetStore.prefs(c).getString("appearance-color","#704457"));return new WidgetAppearance(Math.max(0,Math.min(70,WidgetStore.prefs(c).getInt("appearance-overlay"+suffix,WidgetStore.prefs(c).getInt("appearance-overlay",12)))),WidgetStore.prefs(c).getString("appearance-mode"+suffix,WidgetStore.prefs(c).getString("appearance-mode","auto")),color,WidgetStore.prefs(c).getString("appearance-title-color"+suffix,WidgetStore.prefs(c).getString("appearance-title-color",color)),WidgetStore.prefs(c).getString("appearance-caption-color"+suffix,WidgetStore.prefs(c).getString("appearance-caption-color",color)));}
    static boolean save(Context c,JSONObject input){
        int overlay=input.optInt("overlay",-1);String mode=input.optString("mode"),color=input.optString("color"),titleColor=input.optString("titleColor",color),captionColor=input.optString("captionColor",color);
        if(overlay<0||overlay>70||!mode.matches("auto|custom")||!color.matches("#[a-fA-F0-9]{6}")||!titleColor.matches("#[a-fA-F0-9]{6}")||!captionColor.matches("#[a-fA-F0-9]{6}"))return false;
        String suffix=WidgetProfiles.suffix(WidgetProfiles.selected(c));synchronized(WidgetStore.LOCK){if(WidgetStore.owner(c)<=0)return false;WidgetStore.prefs(c).edit().putInt("appearance-overlay"+suffix,overlay).putString("appearance-mode"+suffix,mode).putString("appearance-color"+suffix,color).putString("appearance-title-color"+suffix,titleColor).putString("appearance-caption-color"+suffix,captionColor).apply();}
        OurDaysWidget.render(c);return true;
    }
    int overlayColor(){return (Math.round(255*overlay/100f)<<24)|0x00ffffff;}
    int[] textColors(Bitmap image){
        if("custom".equals(mode))return new int[]{Color.parseColor(titleColor),Color.parseColor(color),Color.parseColor(captionColor)};
        int[] pixels=new int[256];java.util.Arrays.fill(pixels,0xfff0e1eb);
        if(image!=null){int side=Math.min(image.getWidth(),image.getHeight());Bitmap crop=Bitmap.createBitmap(image,(image.getWidth()-side)/2,(image.getHeight()-side)/2,side,side);Bitmap sample=Bitmap.createScaledBitmap(crop,16,16,true);sample.getPixels(pixels,0,16,0,0,16,16);if(sample!=image&&sample!=crop)sample.recycle();if(crop!=image)crop.recycle();}
        int[] result=new int[3];String[][] palettes={{"#63364E","#FFE6F0"},{"#30252C","#FFFFFF"},{"#264A40","#DDF6EC"}};
        for(int region=0;region<3;region++){int first=region==0?0:region==1?4:12,last=region==0?4:region==1?12:16;double luminance=0,a=overlay/100.0;for(int i=first*16;i<last*16;i++){int pixel=pixels[i];luminance+=.2126*linear((Color.red(pixel)*(1-a)+255*a)/255)+.7152*linear((Color.green(pixel)*(1-a)+255*a)/255)+.0722*linear((Color.blue(pixel)*(1-a)+255*a)/255);}luminance/=(last-first)*16;
            int dark=Color.parseColor(palettes[region][0]),light=Color.parseColor(palettes[region][1]);int chosen=contrast(dark,luminance)>=contrast(light,luminance)?dark:light;result[region]=contrast(chosen,luminance)>=4.5?chosen:contrast(Color.BLACK,luminance)>=contrast(Color.WHITE,luminance)?Color.BLACK:Color.WHITE;
        }return result;
    }
    private static double contrast(int color,double background){double light=.2126*linear(Color.red(color)/255.0)+.7152*linear(Color.green(color)/255.0)+.0722*linear(Color.blue(color)/255.0);return (Math.max(light,background)+.05)/(Math.min(light,background)+.05);}
    private static double linear(double s){return s<=.04045?s/12.92:Math.pow((s+.055)/1.055,2.4);}
    static String snapshot(Context c){return snapshot(c,WidgetProfiles.selected(c));}
    static String snapshot(Context c,int id){
        try{
            WidgetAppearance style=load(c,id);JSONObject json=new JSONObject().put("overlay",style.overlay).put("mode",style.mode).put("color",style.color).put("titleColor",style.titleColor).put("captionColor",style.captionColor);
            if(WidgetStore.owner(c)>0){File image=WidgetProfiles.photo(c,id);if(image.isFile()){Bitmap bitmap=android.graphics.BitmapFactory.decodeFile(image.getPath());if(bitmap!=null){Bitmap thumb=Bitmap.createScaledBitmap(bitmap,256,256,true);java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();thumb.compress(Bitmap.CompressFormat.JPEG,85,out);json.put("preview",Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP));if(thumb!=bitmap)thumb.recycle();bitmap.recycle();}}}
            return json.toString();
        }catch(Exception error){android.util.Log.e("OurDaysWidget","Widget appearance could not be read",error);return "";}
    }
}
