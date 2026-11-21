package xyz.ourdays.mobile;

import android.content.Context;
import android.appwidget.AppWidgetManager;
import android.os.Bundle;
import android.text.*;
import android.graphics.Typeface;
import org.json.*;

final class WidgetMessages {
    String body="这条内容较长，轻触打开查看全文";
    int font=16;
    final JSONArray readItems=new JSONArray();
    static JSONArray queue(JSONObject state){JSONArray items=state.optJSONArray("items");if(items!=null)return items;JSONArray legacy=new JSONArray();JSONObject item=state.optJSONObject("item");if(item!=null)legacy.put(item);return legacy;}
    static String title(JSONObject state){JSONObject first=state.optJSONObject("item"),peer=state.optJSONObject("peer");return (peer==null?"对方":peer.optString("name","对方"))+" · "+(queue(state).length()>1?"未读消息":first!=null&&"chat".equals(first.optString("type"))?"聊天消息":"桌面留言");}
    private static int height(String text,int size,float sp,int width){TextPaint paint=new TextPaint(android.graphics.Paint.ANTI_ALIAS_FLAG);paint.setTypeface(Typeface.DEFAULT);paint.setTextSize(size*sp);StaticLayout.Builder builder=StaticLayout.Builder.obtain(text,0,text.length(),paint,Math.max(1,width)).setIncludePad(true).setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE);if(android.os.Build.VERSION.SDK_INT>=28)builder.setUseLineSpacingFromFallbacks(true);return builder.build().getHeight();}
    static boolean canRead(Context c,int id,String input){try{if(!WidgetProfiles.exists(c,id))return false;JSONObject state=WidgetStore.state(c),first=state.optJSONObject("item");if(first==null)return false;String title=title(state);JSONArray shown=fit(c,id,title,queue(state)).readItems,requested=new JSONArray(input);if(requested.length()<1||requested.length()>shown.length())return false;for(int n=0;n<requested.length();n++){JSONObject a=requested.getJSONObject(n),b=shown.getJSONObject(n);if(a.optLong("id")!=b.optLong("id")||!a.optString("type").equals(b.optString("type")))return false;}return true;}catch(Exception error){return false;}}

    static WidgetMessages fit(Context c,int id,String title,JSONArray queue){
        Bundle options=AppWidgetManager.getInstance(c).getAppWidgetOptions(id);float dp=c.getResources().getDisplayMetrics().density,sp=c.getResources().getDisplayMetrics().scaledDensity;
        boolean landscape=c.getResources().getConfiguration().orientation==android.content.res.Configuration.ORIENTATION_LANDSCAPE;
        int width=Math.max(1,Math.round((options.getInt(landscape?AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH:AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,110)-24)*dp));
        int available=Math.round((options.getInt(landscape?AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT:AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,110))-58)*dp)-height(title,11,sp,width)-Math.round(13*sp);
        return fit(queue,width,available,sp);
    }
    static WidgetMessages fit(JSONArray queue,int width,int available,float sp){
        WidgetMessages result=new WidgetMessages();JSONObject first=queue.optJSONObject(0);if(first==null)return result;
        String firstText="• "+first.optString("text");boolean fits=false;
        for(int size:new int[]{16,14,12,10}){if(height(firstText,size,sp,width)<=available){result.font=size;fits=true;break;}}
        if(!fits)return result;
        String body="";
        for(int n=0;n<Math.min(8,queue.length());n++){JSONObject item=queue.optJSONObject(n);if(item==null||!item.optString("type").matches("note|chat")||item.optLong("id")<=0)break;
            String next=body.isEmpty()?"• "+item.optString("text"):body+"\n\n• "+item.optString("text");if(height(next,result.font,sp,width)>available)break;
            try{result.readItems.put(new JSONObject().put("type",item.optString("type")).put("id",item.optLong("id")));}catch(JSONException impossible){break;}body=next;
        }
        if(result.readItems.length()>0)result.body=body;return result;
    }
}
