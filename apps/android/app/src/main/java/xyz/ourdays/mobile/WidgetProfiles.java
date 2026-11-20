package xyz.ourdays.mobile;

import android.content.Context;
import android.content.ComponentName;
import android.appwidget.AppWidgetManager;
import java.io.File;
import org.json.*;

final class WidgetProfiles {
    static boolean exists(Context c,int id){for(int current:ids(c))if(current==id)return true;return false;}
    static int[] ids(Context c){return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c,OurDaysWidget.class));}
    static int selected(Context c){int id=WidgetStore.prefs(c).getInt("selected-card",-2);return exists(c,id)?id:id==-1?-1:ids(c).length>0?ids(c)[0]:-1;}
    static String suffix(int id){return id<0?"-next":"-card-"+id;}
    static String settings(Context c){return WidgetStore.prefs(c).getString("countdown"+suffix(selected(c)),"");}
    static String saveSettings(Context c,String input){try{JSONObject value=new JSONObject(input);String day=value.optString("customDay","");if(WidgetStore.owner(c)<=0||!day.isEmpty()&&(!day.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")||value.optString("title").trim().isEmpty()||value.optString("title").length()>60))return "";if(!day.isEmpty())java.time.LocalDate.parse(day);WidgetStore.prefs(c).edit().putString("countdown"+suffix(selected(c)),value.toString()).apply();OurDaysWidget.render(c);return "saved";}catch(Exception e){return "";}}
    static JSONObject countdown(Context c,int id,JSONObject state){String local=WidgetStore.prefs(c).getString("countdown"+suffix(id),"");if(local.isEmpty())return state.optJSONObject("countdown");try{JSONObject settings=new JSONObject(local);String day=settings.optString("customDay","");if(!day.isEmpty()){long days=java.time.temporal.ChronoUnit.DAYS.between(java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")),java.time.LocalDate.parse(day));return new JSONObject().put("day",day).put("title",settings.optString("title")).put("days",days);}JSONArray choices=state.optJSONArray("countdowns");long reminder=settings.optLong("reminderId",0);if(choices!=null)for(int n=0;n<choices.length();n++){JSONObject choice=choices.getJSONObject(n);if(reminder>0&&choice.optLong("id")==reminder)return choice;}return null;}catch(Exception e){return null;}}
    static File photo(Context c,int id){return id<0?new File(c.getFilesDir(),"widget-next.jpg"):WidgetStore.background(c,id);}
    static String select(Context c,String value){try{int id=Integer.parseInt(value);if(id!=-1&&!exists(c,id))return "";WidgetStore.prefs(c).edit().putInt("selected-card",id).apply();return "selected";}catch(Exception e){return "";}}
    static String cards(Context c){initialize(c,ids(c));try{JSONArray cards=new JSONArray();for(int id:ids(c))cards.put(new JSONObject().put("id",String.valueOf(id)).put("preset",photo(c,id).exists()?"custom":WidgetStore.prefs(c).getString("background-preset-"+id,WidgetStore.prefs(c).getString("default-preset","rose"))).put("appearance",new JSONObject(WidgetAppearance.snapshot(c,id))));return new JSONObject().put("next",new JSONObject(WidgetAppearance.snapshot(c,-1))).put("nextPreset",photo(c,-1).exists()?"custom":WidgetStore.prefs(c).getString("default-preset","rose")).put("cards",cards).put("selected",String.valueOf(selected(c))).put("transparent",true).toString();}catch(Exception e){return "";}}
    static void initialize(Context c,int[] ids){synchronized(WidgetStore.LOCK){for(int id:ids){String key="initialized-card-"+id;if(WidgetStore.prefs(c).getBoolean(key,false))continue;
        // Existing installations retain their old appearance; new cards inherit the next-card style.
        String next=suffix(-1),own=suffix(id);android.content.SharedPreferences.Editor edit=WidgetStore.prefs(c).edit();
        if(WidgetStore.prefs(c).contains("appearance-mode"+next)){for(String field:new String[]{"mode","color","title-color","caption-color"})edit.putString("appearance-"+field+own,WidgetStore.prefs(c).getString("appearance-"+field+next,field.equals("mode")?"auto":"#704457"));edit.putInt("appearance-overlay"+own,WidgetStore.prefs(c).getInt("appearance-overlay"+next,12));}
        if(!WidgetStore.background(c,id).exists()&&photo(c,-1).exists())try{java.nio.file.Files.copy(photo(c,-1).toPath(),WidgetStore.background(c,id).toPath());}catch(Exception ignored){}
        if(WidgetStore.prefs(c).contains("countdown"+next))edit.putString("countdown"+own,WidgetStore.prefs(c).getString("countdown"+next,""));
        edit.putString("background-preset-"+id,WidgetStore.prefs(c).getString("background-preset-"+id,WidgetStore.prefs(c).getString("default-preset","rose"))).putBoolean(key,true).apply();
    }}}
}
