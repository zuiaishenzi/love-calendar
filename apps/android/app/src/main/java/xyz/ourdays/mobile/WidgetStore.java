package xyz.ourdays.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.CookieManager;
import java.io.File;
import java.security.MessageDigest;
import org.json.JSONObject;

final class WidgetStore {
    static final Object LOCK=new Object();
    static SharedPreferences prefs(Context c){return c.getSharedPreferences("desktop-widget",Context.MODE_PRIVATE);}
    static String cookie(){String all=CookieManager.getInstance().getCookie(BuildConfig.SERVER_URL);if(all!=null)for(String part:all.split(";")){String value=part.trim();if(value.matches("session=[a-f0-9]{64}"))return value;}return "";}
    static String hash(String text){try{byte[] digest=MessageDigest.getInstance("SHA-256").digest(text.getBytes("UTF-8"));StringBuilder s=new StringBuilder();for(byte b:digest)s.append(String.format("%02x",b&255));return s.toString();}catch(Exception e){return "";}}
    static long owner(Context c){return prefs(c).getLong("owner",0);}
    static JSONObject state(Context c){try{return new JSONObject(prefs(c).getString("state","{}"));}catch(Exception e){return new JSONObject();}}
    static File background(Context c,int id){return new File(c.getFilesDir(),"widget-background-"+id+".jpg");}
    static void clear(Context c){
        prefs(c).edit().clear().apply();
        File[] files=c.getFilesDir().listFiles();if(files!=null)for(File f:files)if(f.getName().matches("widget-background-[0-9]+\\.jpg(?:\\.tmp)?"))f.delete();
    }
    static void session(Context c,long owner){
        synchronized(LOCK){String fingerprint=hash(cookie());if(owner!=owner(c)||!fingerprint.equals(prefs(c).getString("session",""))){clear(c);if(owner>0&&!cookie().isEmpty())prefs(c).edit().putLong("owner",owner).putString("session",fingerprint).apply();}}
        OurDaysWidget.render(c);WidgetSyncService.schedule(c);if(owner>0)WidgetSyncService.refresh(c);
    }
}
