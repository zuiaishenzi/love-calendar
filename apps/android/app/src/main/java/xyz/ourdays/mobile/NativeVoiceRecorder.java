package xyz.ourdays.mobile;
import android.app.*;
import android.media.MediaRecorder;
import android.os.*;
import android.util.Base64;
import org.json.JSONObject;
import java.io.*;
import java.util.function.Consumer;

final class NativeVoiceRecorder {
 private final Activity activity;private final Consumer<JSONObject> result;private MediaRecorder recorder;private File file;private long started;
 NativeVoiceRecorder(Activity activity,Consumer<JSONObject> result){this.activity=activity;this.result=result;}
 void open(){if(recorder!=null)return;try{
  file=File.createTempFile("voice-",".m4a",activity.getCacheDir());recorder=Build.VERSION.SDK_INT>=31?new MediaRecorder(activity):new MediaRecorder();recorder.setAudioSource(MediaRecorder.AudioSource.MIC);recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);recorder.setAudioSamplingRate(16000);recorder.setAudioEncodingBitRate(64000);recorder.setOutputFile(file.getAbsolutePath());recorder.setMaxDuration(120000);recorder.setMaxFileSize(5*1024*1024);recorder.setOnInfoListener((r,what,extra)->{if(what==MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED||what==MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED)activity.runOnUiThread(this::finish);});recorder.setOnErrorListener((r,what,extra)->activity.runOnUiThread(()->{cancel();error("录音被系统中断，请重新录制。");}));recorder.prepare();recorder.start();started=SystemClock.elapsedRealtime();
  JSONObject status=new JSONObject();status.put("recording",true);result.accept(status);
 }catch(Exception e){cancel();error("录制语音也无法启动。请检查卓易通和朝夕的麦克风权限、系统麦克风开关，并结束其他录音或通话后重试。");}}
 void finish(){if(recorder==null)return;MediaRecorder current=recorder;recorder=null;try{current.stop();current.release();if(file==null||file.length()<1||file.length()>5*1024*1024)throw new IOException();ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream stream=new FileInputStream(file)){byte[] buffer=new byte[4096];int count;while((count=stream.read(buffer))!=-1)bytes.write(buffer,0,count);}JSONObject payload=new JSONObject();payload.put("data",Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP));payload.put("duration",Math.max(1,(SystemClock.elapsedRealtime()-started)/1000.0));result.accept(payload);}catch(Exception e){try{current.release();}catch(Exception ignored){}error("录音过短或保存失败，请录制至少1秒后重试。");}finally{if(file!=null){file.delete();file=null;}}}
 void cancel(){boolean active=recorder!=null;if(recorder!=null){try{recorder.reset();recorder.release();}catch(Exception ignored){}recorder=null;}if(file!=null){file.delete();file=null;}if(active){try{JSONObject status=new JSONObject();status.put("cancelled",true);result.accept(status);}catch(Exception ignored){}}}
 private void error(String message){try{JSONObject payload=new JSONObject();payload.put("error",message);result.accept(payload);}catch(Exception ignored){}}
}
