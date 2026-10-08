package xyz.ourdays.mobile;

import android.Manifest;
import android.app.*;
import android.app.job.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.*;
import android.webkit.CookieManager;
import org.json.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

public final class AppNotifications {
 private static final AtomicBoolean busy=new AtomicBoolean();
 private static final int JOB=10802;
 static android.content.SharedPreferences preferences(Context context){return context.getSharedPreferences("notifications",Context.MODE_PRIVATE);}
 static void channels(Context context){NotificationManager manager=context.getSystemService(NotificationManager.class);NotificationChannel social=new NotificationChannel("social","社交通讯",NotificationManager.IMPORTANCE_HIGH);social.setDescription("对方发来的文字、图片和语音消息");social.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);NotificationChannel service=new NotificationChannel("service","服务通知",NotificationManager.IMPORTANCE_DEFAULT);service.setDescription("新增回忆与特殊日期提醒");service.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);manager.createNotificationChannel(social);manager.createNotificationChannel(service);}
 static boolean allowed(Context context){return preferences(context).getBoolean("enabled",false)&&context.getSystemService(NotificationManager.class).areNotificationsEnabled()&&(Build.VERSION.SDK_INT<33||context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED);}
 static void schedule(Context context){if(!allowed(context))return;JobInfo job=new JobInfo.Builder(JOB,new ComponentName(context,NotificationJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15*60*1000L).build();context.getSystemService(JobScheduler.class).schedule(job);}
 static void disable(Context context){preferences(context).edit().putBoolean("enabled",false).apply();context.getSystemService(JobScheduler.class).cancel(JOB);context.getSystemService(NotificationManager.class).cancelAll();}
 static void poll(Context context,Runnable done){
  if(!allowed(context)||!busy.compareAndSet(false,true)){done.run();return;}
  final String cookies=CookieManager.getInstance().getCookie(BuildConfig.SERVER_URL);
  new Thread(()->{try{if(cookies==null||cookies.isEmpty())return;android.content.SharedPreferences prefs=preferences(context);String owner=prefs.getString("owner",""),cursor=prefs.getString("cursor","");String query=owner.isEmpty()?"":"?owner="+URLEncoder.encode(owner,"UTF-8")+"&after="+URLEncoder.encode(cursor,"UTF-8");
   HttpURLConnection connection=(HttpURLConnection)new URL(BuildConfig.SERVER_URL+"api/notifications"+query).openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setRequestProperty("Cookie",cookies);
   try{int status=connection.getResponseCode();if(status==401){prefs.edit().remove("owner").remove("cursor").remove("days").apply();context.getSystemService(NotificationManager.class).cancelAll();return;}if(status!=200)return;
    java.io.ByteArrayOutputStream output=new java.io.ByteArrayOutputStream();try(java.io.InputStream stream=connection.getInputStream()){byte[] buffer=new byte[4096];int count;while((count=stream.read(buffer))!=-1){if(output.size()+count>256000)return;output.write(buffer,0,count);}}byte[] bytes=output.toByteArray();JSONObject data=new JSONObject(new String(bytes,StandardCharsets.UTF_8));String nextOwner=String.valueOf(data.getLong("owner"));JSONArray days=new JSONArray(prefs.getString("days","[]"));if(!owner.equals(nextOwner)){days=new JSONArray();context.getSystemService(NotificationManager.class).cancelAll();}
    JSONArray events=data.getJSONArray("events");for(int i=0;i<events.length();i++)show(context,events.getJSONObject(i),"event:"+events.getJSONObject(i).getLong("id"));JSONArray reminders=data.getJSONArray("reminders");for(int i=0;i<reminders.length();i++){JSONObject event=reminders.getJSONObject(i);String key=event.getString("key");boolean seen=false;for(int j=0;j<days.length();j++)if(key.equals(days.getString(j)))seen=true;if(!seen){show(context,event,"reminder:"+key);days.put(key);}}
    JSONArray recent=new JSONArray();for(int i=Math.max(0,days.length()-200);i<days.length();i++)recent.put(days.get(i));prefs.edit().putString("owner",nextOwner).putString("cursor",String.valueOf(data.getLong("cursor"))).putString("days",recent.toString()).apply();
   }finally{connection.disconnect();}
  }catch(Exception ignored){}finally{busy.set(false);new Handler(Looper.getMainLooper()).post(done);}},"OurDaysNotifications").start();
 }
 private static void show(Context context,JSONObject event,String key)throws JSONException{
  if(!allowed(context))return;boolean social="social".equals(event.getString("channel"));Intent intent=new Intent(context,MainActivity.class).putExtra("notificationTarget",event.getString("target")).setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);PendingIntent click=PendingIntent.getActivity(context,key.hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  Notification notification=new Notification.Builder(context,social?"social":"service").setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(event.getString("title")).setContentText(event.getString("body")).setStyle(new Notification.BigTextStyle().bigText(event.getString("body"))).setCategory(social?Notification.CATEGORY_MESSAGE:Notification.CATEGORY_REMINDER).setVisibility(Notification.VISIBILITY_PRIVATE).setAutoCancel(true).setContentIntent(click).build();context.getSystemService(NotificationManager.class).notify(key,0,notification);
 }
}
