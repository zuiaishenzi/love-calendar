package xyz.ourdays.mobile;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.util.Log;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.CompletableFuture;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

public class WidgetSyncService extends JobService {
    static final int JOB_ID=21810;
    private static final ExecutorService NETWORK=Executors.newSingleThreadExecutor();
    private static final Map<String,CompletableFuture<Void>> IN_FLIGHT=new HashMap<>();
    private static String requestKey(Context c){return WidgetStore.owner(c)+":"+WidgetStore.prefs(c).getString("session","");}
    static boolean hasWidgets(Context c){return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c,OurDaysWidget.class)).length>0;}
    static void schedule(Context c){
        try{scheduleJob(c);}catch(RuntimeException error){Log.e("OurDaysWidget","Widget background scheduling failed",error);}
    }
    private static void scheduleJob(Context c){
        JobScheduler scheduler=c.getSystemService(JobScheduler.class);if(scheduler==null)return;
        if(!hasWidgets(c)||WidgetStore.owner(c)==0){scheduler.cancel(JOB_ID);return;}
        if(scheduler.getPendingJob(JOB_ID)==null)scheduler.schedule(new JobInfo.Builder(JOB_ID,new ComponentName(c,WidgetSyncService.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15*60*1000L).setPersisted(true).build());
    }
    static void refresh(Context c){refreshTask(c);}
    static void manualRefresh(Context c){
        synchronized(IN_FLIGHT){
            try{synchronized(WidgetStore.LOCK){WidgetStore.prefs(c).edit().putString("refresh-key",requestKey(c)).putLong("refresh-started",System.currentTimeMillis()).apply();}OurDaysWidget.render(c);}catch(RuntimeException error){Log.e("OurDaysWidget","Widget refresh feedback failed",error);}
            refreshTask(c);
        }
    }
    private static CompletableFuture<Void> refreshTask(Context c){
        Context app=c.getApplicationContext();String key=requestKey(app);
        synchronized(IN_FLIGHT){
            CompletableFuture<Void> existing=IN_FLIGHT.get(key);if(existing!=null)return existing;
            CompletableFuture<Void> task=new CompletableFuture<>();IN_FLIGHT.put(key,task);
            NETWORK.execute(()->{
                try{if(key.equals(requestKey(app))&&hasWidgets(app))runSync(app,null);}catch(RuntimeException error){Log.e("OurDaysWidget","Widget availability check failed",error);}
                finally{
                    synchronized(IN_FLIGHT){
                        try{synchronized(WidgetStore.LOCK){if(key.equals(WidgetStore.prefs(app).getString("refresh-key","")))WidgetStore.prefs(app).edit().remove("refresh-key").remove("refresh-started").apply();}OurDaysWidget.render(app);}catch(RuntimeException error){Log.e("OurDaysWidget","Widget refresh completion failed",error);}
                        finally{IN_FLIGHT.remove(key);}
                    }
                    task.complete(null);
                }
            });return task;
        }
    }
    static void acknowledge(Context c,String type,long id,long owner){Context app=c.getApplicationContext();NETWORK.execute(()->{try{if(owner!=WidgetStore.owner(app))return;JSONObject body=new JSONObject();body.put("type",type);body.put("id",id);runSync(app,body);}catch(Exception error){Log.e("OurDaysWidget","Widget acknowledgement failed",error);}});}
    private static void runSync(Context c,JSONObject ack){
        try{sync(c,ack);}catch(RuntimeException error){Log.e("OurDaysWidget","Widget synchronization failed",error);}
    }
    private static void sync(Context c,JSONObject ack){
        final String cookie=WidgetStore.cookie(),fingerprint=WidgetStore.hash(cookie);final long owner;
        synchronized(WidgetStore.LOCK){owner=WidgetStore.owner(c);if(owner==0)return;if(cookie.isEmpty()||!fingerprint.equals(WidgetStore.prefs(c).getString("session",""))){WidgetStore.clear(c);OurDaysWidget.render(c);schedule(c);return;}}
        try{
            JSONObject state;
            try{state=WidgetApi.request(ack==null?"/api/widget/state":"/api/widget/read",cookie,ack);}catch(WidgetApi.RequestError e){if(e.status==409)state=WidgetApi.request("/api/widget/state",cookie,null);else throw e;}
            synchronized(WidgetStore.LOCK){if(owner!=WidgetStore.owner(c)||!fingerprint.equals(WidgetStore.hash(WidgetStore.cookie())))return;if(state.optLong("owner")!=owner){WidgetStore.clear(c);}else WidgetStore.prefs(c).edit().putString("state",state.toString()).putBoolean("offline",false).apply();}
        }catch(Exception e){synchronized(WidgetStore.LOCK){if(owner!=WidgetStore.owner(c)||!fingerprint.equals(WidgetStore.hash(WidgetStore.cookie())))return;if(e instanceof WidgetApi.RequestError&&((WidgetApi.RequestError)e).status==401)WidgetStore.clear(c);else WidgetStore.prefs(c).edit().putBoolean("offline",true).apply();}}
        OurDaysWidget.render(c);schedule(c);
    }
    @Override public boolean onStartJob(JobParameters params){refreshTask(getApplicationContext()).whenComplete((value,error)->jobFinished(params,false));return true;}
    @Override public boolean onStopJob(JobParameters params){return true;}
}
