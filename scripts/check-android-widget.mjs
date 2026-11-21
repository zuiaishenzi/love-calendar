// Run the real Java scheduler against fallible Android service doubles.
// This verifies exception boundaries, not a device's launcher or WebView.
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const javaHome=process.env.JAVA_HOME;
if(!javaHome)throw Error('Set JAVA_HOME to a JDK 17 installation');
const root=mkdtempSync(path.join(os.tmpdir(),'ourdays-widget-java-'));
const files={
 'android/content/Context.java':`package android.content;
 public class Context { public Context getApplicationContext(){return this;} public <T> T getSystemService(Class<T> type){return type.cast(android.app.job.JobScheduler.INSTANCE);} }`,
 'android/content/ComponentName.java':`package android.content; public class ComponentName {public ComponentName(Context c,Class<?> type){}}`,
 'android/appwidget/AppWidgetManager.java':`package android.appwidget; import android.content.*;
 public class AppWidgetManager {public static boolean fail=false;public static int[] ids={1};public static AppWidgetManager getInstance(Context c){return new AppWidgetManager();}public int[] getAppWidgetIds(ComponentName n){if(fail)throw new IllegalStateException("widget host unavailable");return ids;}}`,
 'android/app/job/JobInfo.java':`package android.app.job;
 public class JobInfo {public static final int NETWORK_TYPE_ANY=1;public static class Builder {public Builder(int id,android.content.ComponentName c){} public Builder setRequiredNetworkType(int n){return this;}public Builder setPeriodic(long n){return this;}public Builder setPersisted(boolean n){return this;}public JobInfo build(){return new JobInfo();}}}`,
 'android/app/job/JobParameters.java':`package android.app.job;public class JobParameters {}`,
 'android/app/job/JobScheduler.java':`package android.app.job;
 public class JobScheduler {public static final JobScheduler INSTANCE=new JobScheduler();public static boolean fail=false;public static int cancels=0;public JobInfo getPendingJob(int id){return null;}public int schedule(JobInfo info){if(fail)throw new SecurityException("scheduler rejected");return 1;}public void cancel(int id){cancels++;}}`,
 'android/app/job/JobService.java':`package android.app.job;
 public abstract class JobService extends android.content.Context {public static int finished=0;public void jobFinished(JobParameters p,boolean retry){finished++;}public abstract boolean onStartJob(JobParameters p);public abstract boolean onStopJob(JobParameters p);}`,
 'android/util/Log.java':`package android.util;
 public class Log {public static int errors=0;public static int e(String tag,String message,Throwable error){errors++;return 0;}}`,
 'org/json/JSONArray.java':`package org.json;public class JSONArray {final String value;public JSONArray(String value){this.value=value;}public int length(){return value.equals("[]")?0:value.split("id").length-1;}public String toString(){return value;}}`,
 'org/json/JSONObject.java':`package org.json;import java.util.*;
 public class JSONObject {private final Map<String,Object> data=new HashMap<>();public JSONObject put(String key,Object value)throws Exception{data.put(key,value);return this;}public boolean has(String key){return data.containsKey(key);}public long optLong(String key){Object value=data.get(key);return value instanceof Number?((Number)value).longValue():0;}public String toString(){return "state";}}`,
 'xyz/ourdays/mobile/WidgetStore.java':`package xyz.ourdays.mobile;import android.content.Context;
 class WidgetStore {static final Object LOCK=new Object();static final java.util.Map<String,String> strings=new java.util.HashMap<>();static final java.util.Map<String,Long> numbers=new java.util.HashMap<>();static {strings.put("session","fingerprint");}static long owner=1;static boolean failCookie=false,offline=false;static int saved=0,cleared=0;static String cookie(){if(failCookie)throw new IllegalStateException("cookie service unavailable");return "cookie";}static String hash(String c){return "fingerprint";}static long owner(Context c){return owner;}static void clear(Context c){owner=0;cleared++;strings.clear();numbers.clear();}static Prefs prefs(Context c){return new Prefs();}static class Prefs {String getString(String k,String d){return strings.getOrDefault(k,d);}long getLong(String k,long d){return numbers.getOrDefault(k,d);}Prefs edit(){return this;}Prefs putString(String k,String v){if(k.equals("state"))saved++;strings.put(k,v);return this;}Prefs putLong(String k,long v){numbers.put(k,v);return this;}Prefs remove(String k){strings.remove(k);numbers.remove(k);return this;}Prefs putBoolean(String k,boolean v){offline=v;return this;}void apply(){}}}`,
 'xyz/ourdays/mobile/OurDaysWidget.java':`package xyz.ourdays.mobile;import android.content.Context;
 class OurDaysWidget {static boolean fail=false;static int renders=0;static void render(Context c){renders++;if(fail)throw new IllegalArgumentException("remote widget rejected");}}`,
 'xyz/ourdays/mobile/WidgetApi.java':`package xyz.ourdays.mobile;import org.json.JSONObject;
 class WidgetApi {static int requests=0,status=200;static String lastPath="";static java.util.concurrent.CountDownLatch entered,release;static class RequestError extends Exception {final int status;RequestError(int s){status=s;}}static JSONObject request(String path,String cookie,JSONObject body)throws Exception{requests++;lastPath=path;if(entered!=null){entered.countDown();release.await(5,java.util.concurrent.TimeUnit.SECONDS);}if(status!=200)throw new RequestError(status);return new JSONObject().put("owner",1L);}}`,
 'xyz/ourdays/mobile/WidgetHarness.java':`package xyz.ourdays.mobile;
 import android.content.Context;import android.app.job.*;import android.appwidget.AppWidgetManager;import android.util.Log;import java.util.concurrent.*;
 public class WidgetHarness {
  static ExecutorService queue;static int uncaught;
  static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
  static void idle()throws Exception{queue.submit(()->{}).get(5,TimeUnit.SECONDS);check(uncaught==0,"worker exception escaped into process handler");}
  public static void main(String[] args)throws Exception{
   Thread.setDefaultUncaughtExceptionHandler((t,e)->{uncaught++;e.printStackTrace();});
   java.lang.reflect.Field field=WidgetSyncService.class.getDeclaredField("NETWORK");field.setAccessible(true);queue=(ExecutorService)field.get(null);
   try{
    Context c=new Context();int before=Log.errors;
    JobScheduler.fail=true;WidgetSyncService.schedule(c);check(Log.errors>before,"scheduler error must be logged");JobScheduler.fail=false;
    AppWidgetManager.fail=true;WidgetSyncService.refresh(c);idle();AppWidgetManager.fail=false;
    WidgetStore.failCookie=true;WidgetSyncService.refresh(c);idle();check(WidgetApi.requests==0,"cookie failure must not upload or clear session");check(WidgetStore.cleared==0,"transient cookie failure must retain account");
    WidgetSyncService service=new WidgetSyncService();service.onStartJob(new JobParameters());idle();check(JobService.finished==1,"failed job must finish");WidgetStore.failCookie=false;
    OurDaysWidget.fail=true;WidgetSyncService.refresh(c);idle();check(WidgetStore.saved>0,"valid network state must be retained even if host update fails");OurDaysWidget.fail=false;
    int requests=WidgetApi.requests;WidgetSyncService.refresh(c);idle();check(WidgetApi.requests>requests,"next refresh must still run after failure");
    requests=WidgetApi.requests;WidgetSyncService.acknowledge(c,"note",1,2);idle();check(WidgetApi.requests==requests,"other account acknowledgement must be rejected");
    WidgetApi.entered=new CountDownLatch(1);WidgetApi.release=new CountDownLatch(1);requests=WidgetApi.requests;int renders=OurDaysWidget.renders;WidgetSyncService.manualRefresh(c);check(OurDaysWidget.renders>renders,"manual refresh must publish feedback immediately");check(WidgetApi.entered.await(5,TimeUnit.SECONDS),"network must begin without a timer");check(WidgetStore.prefs(c).getLong("refresh-started",0)>0,"refresh feedback must remain while network is pending");WidgetSyncService.manualRefresh(c);service.onStartJob(new JobParameters());check(WidgetApi.requests==requests+1,"repeat clicks and jobs must share pending refresh");WidgetApi.release.countDown();idle();check(WidgetStore.prefs(c).getLong("refresh-started",0)==0,"completion must clear progress");check(JobService.finished==2,"coalesced background job must finish");WidgetApi.entered=null;
    WidgetSyncService.acknowledgeBatch(c,"[{'type':'note','id':1}]".replace((char)39,(char)34),1);idle();check(WidgetApi.lastPath.equals("/api/widget/read-batch"),"visible batch must use batch endpoint");
    WidgetApi.status=503;WidgetSyncService.refresh(c);idle();check(WidgetStore.offline&&WidgetStore.owner==1,"network failure must preserve account and mark offline");
    WidgetApi.status=401;service.onStartJob(new JobParameters());idle();check(WidgetStore.owner==0&&JobService.finished==3,"expired session must clear and finish job");
    AppWidgetManager.ids=new int[0];requests=WidgetApi.requests;WidgetSyncService.refresh(c);idle();check(WidgetApi.requests==requests,"no widgets means no network request");
    check(Log.errors>=4,"platform failures must have diagnostic logs");
    System.out.println("PASS: scheduler, host, cookie and render failures isolated; jobs finish; retries, account isolation, offline and expiry preserved");
   }finally{queue.shutdownNow();}
  }
 }`
};
files['xyz/ourdays/mobile/WidgetSyncService.java']=readFileSync(process.env.OURDAYS_WIDGET_SOURCE||'apps/android/app/src/main/java/xyz/ourdays/mobile/WidgetSyncService.java','utf8');
try{
 for(const [name,source] of Object.entries(files)){const target=path.join(root,name);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,source);}
 const compile=spawnSync(path.join(javaHome,'bin','javac.exe'),['-encoding','UTF-8','-d',path.join(root,'classes'),...Object.keys(files).map(name=>path.join(root,name))],{encoding:'utf8'});
 if(compile.status!==0)throw Error(compile.stdout+compile.stderr);
 const run=spawnSync(path.join(javaHome,'bin','java.exe'),['-cp',path.join(root,'classes'),'xyz.ourdays.mobile.WidgetHarness'],{encoding:'utf8',timeout:15000});
 if(run.status!==0)throw Error(run.stdout+run.stderr);
 process.stdout.write(run.stdout);
}finally{rmSync(root,{recursive:true,force:true});}
