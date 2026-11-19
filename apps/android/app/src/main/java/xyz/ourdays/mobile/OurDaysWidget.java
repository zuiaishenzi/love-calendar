package xyz.ourdays.mobile;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.view.View;
import android.util.Log;
import android.widget.RemoteViews;
import org.json.JSONObject;

public class OurDaysWidget extends AppWidgetProvider {
    private static final String REFRESH="xyz.ourdays.mobile.WIDGET_REFRESH",READ="xyz.ourdays.mobile.WIDGET_READ";
    static PendingIntent open(Context c,int id,long owner,String target){Intent i=new Intent(c,MainActivity.class).setData(android.net.Uri.parse("ourdays://widget/"+id+"/"+target)).putExtra("widget_target",target).putExtra("widget_owner",owner).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);return PendingIntent.getActivity(c,id,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    private static PendingIntent action(Context c,int id,String action,long owner,JSONObject item){Intent i=new Intent(c,OurDaysWidget.class).setAction(action).setData(android.net.Uri.parse("ourdays://widget/"+id+"/"+action+"/"+owner+"/"+(item==null?0:item.optLong("id")))).putExtra("owner",owner);if(item!=null)i.putExtra("type",item.optString("type")).putExtra("id",item.optLong("id"));return PendingIntent.getBroadcast(c,id,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static void render(Context c){synchronized(WidgetStore.LOCK){try{renderLocked(c);}catch(RuntimeException error){Log.e("OurDaysWidget","Widget rendering failed",error);}}}
    private static void renderLocked(Context c){
        AppWidgetManager manager=AppWidgetManager.getInstance(c);JSONObject state=WidgetStore.state(c),item=state.optJSONObject("item"),countdown=state.optJSONObject("countdown");long owner=WidgetStore.owner(c);JSONObject peer=state.optJSONObject("peer");WidgetAppearance style=WidgetAppearance.load(c);long started=WidgetStore.prefs(c).getLong("refresh-started",0);boolean refreshing=started>0&&System.currentTimeMillis()-started<45000;
        for(int id:manager.getAppWidgetIds(new ComponentName(c,OurDaysWidget.class))){RemoteViews view=new RemoteViews(c.getPackageName(),R.layout.ourdays_widget);boolean logged=owner>0,hasItem=logged&&item!=null;String title,body,caption;
            if(!logged){title="朝夕 · 桌面留言";body="打开 App，登录后接收对方的心意";caption="轻触打开桌面留言";}
            else if(hasItem){title=(peer==null?"对方":peer.optString("name","对方"))+" · "+("chat".equals(item.optString("type"))?"聊天消息":"桌面留言");body=item.optString("text");caption=state.optInt("unreadCount")>1?"还有 "+state.optInt("unreadCount")+" 条未读":"留给你的一点想念";}
            else if(countdown!=null){title=countdown.optString("title");int days=countdown.optInt("days");body=days==0?"就是今天 ♡":days>0?"还有 "+days+" 天":"已经 "+Math.abs(days)+" 天";caption=countdown.optString("day").replace('-','.');}
            else {title="朝夕 · 桌面留言";body="把下一个期待，放在这里";caption="轻触，给对方留一句想念";}
            if(logged&&WidgetStore.prefs(c).getBoolean("offline",false))caption="暂未同步 · 点击 ↻ 重试";
            if(refreshing)caption="正在刷新…";
            view.setTextViewText(R.id.widget_title,title);view.setTextViewText(R.id.widget_body,body);view.setTextViewText(R.id.widget_caption,caption);view.setViewVisibility(R.id.widget_read,hasItem?View.VISIBLE:View.INVISIBLE);
            view.setViewVisibility(R.id.widget_refresh,refreshing?View.INVISIBLE:View.VISIBLE);view.setViewVisibility(R.id.widget_refresh_progress,refreshing?View.VISIBLE:View.GONE);
            view.setOnClickPendingIntent(R.id.widget_content,open(c,id,owner,hasItem?item.optString("target","notes"):"notes"));view.setOnClickPendingIntent(R.id.widget_refresh_button,action(c,id,REFRESH,owner,null));if(hasItem)view.setOnClickPendingIntent(R.id.widget_read,action(c,id,READ,owner,item));
            Bitmap background=logged?BitmapFactory.decodeFile(WidgetStore.background(c,id).getAbsolutePath()):null;
            if(background!=null)view.setImageViewBitmap(R.id.widget_background,background);else view.setImageViewResource(R.id.widget_background,backgroundResource(WidgetStore.prefs(c).getString("background-preset-"+id,WidgetStore.prefs(c).getString("default-preset","rose"))));
            int textColor=style.textColor(background);for(int text:new int[]{R.id.widget_title,R.id.widget_body,R.id.widget_caption,R.id.widget_read,R.id.widget_refresh})view.setTextColor(text,textColor);
            view.setInt(R.id.widget_overlay,"setBackgroundColor",style.overlayColor());manager.updateAppWidget(id,view);
        }
    }
    static int backgroundResource(String code){if("dawn".equals(code))return R.drawable.widget_dawn;if("hills".equals(code))return R.drawable.widget_hills;if("moon".equals(code))return R.drawable.widget_moon;return R.drawable.widget_background;}
    @Override public void onUpdate(Context c,AppWidgetManager manager,int[] ids){render(c);WidgetSyncService.schedule(c);WidgetSyncService.refresh(c);}
    @Override public void onDeleted(Context c,int[] ids){for(int id:ids)WidgetStore.background(c,id).delete();WidgetSyncService.schedule(c);}
    @Override public void onDisabled(Context c){WidgetSyncService.schedule(c);}
    @Override public void onReceive(Context c,Intent i){super.onReceive(c,i);if(REFRESH.equals(i.getAction())){WidgetSyncService.manualRefresh(c);}else if(READ.equals(i.getAction())&&i.getLongExtra("owner",0)==WidgetStore.owner(c)){String type=i.getStringExtra("type");if("note".equals(type)||"chat".equals(type))WidgetSyncService.acknowledge(c,type,i.getLongExtra("id",0),i.getLongExtra("owner",0));}}
}
