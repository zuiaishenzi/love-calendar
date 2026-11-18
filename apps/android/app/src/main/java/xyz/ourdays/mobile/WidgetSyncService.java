package xyz.ourdays.mobile;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public class WidgetSyncService extends JobService {
    static final int JOB_ID=21810;
    private static final ExecutorService NETWORK=Executors.newSingleThreadExecutor();
    static boolean hasWidgets(Context c){return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c,OurDaysWidget.class)).length>0;}
    static void schedule(Context c){
        JobScheduler scheduler=c.getSystemService(JobScheduler.class);if(scheduler==null)return;
        if(!hasWidgets(c)||WidgetStore.owner(c)==0){scheduler.cancel(JOB_ID);return;}
        if(scheduler.getPendingJob(JOB_ID)==null)scheduler.schedule(new JobInfo.Builder(JOB_ID,new ComponentName(c,WidgetSyncService.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15*60*1000L).setPersisted(true).build());
    }
    static void refresh(Context c){Context app=c.getApplicationContext();if(hasWidgets(app))NETWORK.execute(()->sync(app,null));}
    static void acknowledge(Context c,String type,long id,long owner){Context app=c.getApplicationContext();NETWORK.execute(()->{if(owner!=WidgetStore.owner(app))return;JSONObject body=new JSONObject();try{body.put("type",type);body.put("id",id);}catch(Exception ignored){return;}sync(app,body);});}
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
    @Override public boolean onStartJob(JobParameters params){NETWORK.execute(()->{sync(getApplicationContext(),null);jobFinished(params,false);});return true;}
    @Override public boolean onStopJob(JobParameters params){return true;}
}
