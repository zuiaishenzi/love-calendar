package xyz.ourdays.mobile;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.Intent;
import android.content.ClipData;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
public class AppUpdater {
    private final Activity activity;
    private volatile boolean busy;
    private boolean installPending;
    public AppUpdater(Activity activity){this.activity=activity;}
    private void ui(Runnable task){activity.runOnUiThread(()->{if(!activity.isFinishing()&&!activity.isDestroyed())task.run();});}
    private void toast(String text){Toast.makeText(activity,text,Toast.LENGTH_LONG).show();}
    private HttpURLConnection connect(String path) throws Exception {
        if(!path.startsWith("/api/app/"))throw new IOException("无效更新地址");
        URL base=new URL(BuildConfig.SERVER_URL),url=new URL(base,path);
        if(!"https".equals(url.getProtocol())||!base.getHost().equals(url.getHost())||base.getPort()!=url.getPort())throw new IOException("无效更新地址");
        HttpURLConnection connection=(HttpURLConnection)url.openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(30000);
        if(connection.getResponseCode()!=200){connection.disconnect();throw new IOException("更新服务暂不可用");}return connection;
    }
    public void check(boolean manual){
        if(busy){if(manual)toast("正在检查或下载更新");return;}busy=true;if(manual)toast("正在检查更新…");
        new Thread(()->{try{
            HttpURLConnection connection=connect("/api/app/update");ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream input=connection.getInputStream()){byte[] buffer=new byte[4096];int n;while((n=input.read(buffer))!=-1){if(bytes.size()+n>65536)throw new IOException("更新信息过大");bytes.write(buffer,0,n);}}finally{connection.disconnect();}
            JSONObject info=new JSONObject(bytes.toString("UTF-8"));
            if(!info.optBoolean("available")||info.getLong("versionCode")<=BuildConfig.VERSION_CODE){if(manual)ui(()->toast("当前已是最新客户端"));return;}
            if(!activity.getPackageName().equals(info.getString("packageId"))||!info.getString("sha256").matches("[a-f0-9]{64}")||info.getLong("size")<=0||info.getLong("size")>100*1024*1024)throw new IOException("更新信息无效");
            ui(()->new AlertDialog.Builder(activity).setTitle("客户端更新 "+info.optString("versionName")).setMessage(info.optString("notes")+"\n构建号："+info.optLong("versionCode")+"\n覆盖升级会保留应用数据。").setNegativeButton("稍后",null).setPositiveButton("下载更新",(dialog,which)->download(info)).show());
        }catch(Exception error){if(manual)ui(()->toast("检查更新失败，请检查网络或服务器发布配置"));}finally{busy=false;}},"app-update-check").start();
    }
    private void download(JSONObject info){
        if(busy)return;busy=true;ProgressDialog progress=new ProgressDialog(activity);progress.setTitle("下载客户端更新");progress.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL);progress.setMax(100);progress.setCancelable(false);progress.show();
        new Thread(()->{File file=new File(activity.getCacheDir(),"update.apk");try{
            HttpURLConnection connection=connect(info.getString("downloadUrl"));MessageDigest digest=MessageDigest.getInstance("SHA-256");long total=0,size=info.getLong("size");
            try(InputStream input=connection.getInputStream();OutputStream output=new FileOutputStream(file)){byte[] buffer=new byte[16384];int n;while((n=input.read(buffer))!=-1){total+=n;if(total>size)throw new IOException("安装包大小不符");output.write(buffer,0,n);digest.update(buffer,0,n);final int percent=(int)(total*100/size);ui(()->progress.setProgress(percent));}}finally{connection.disconnect();}
            StringBuilder hash=new StringBuilder();for(byte b:digest.digest())hash.append(String.format(java.util.Locale.ROOT,"%02x",b&255));if(total!=size||!hash.toString().equals(info.getString("sha256")))throw new IOException("安装包校验失败");
            PackageManager manager=activity.getPackageManager();PackageInfo incoming=manager.getPackageArchiveInfo(file.getPath(),PackageManager.GET_SIGNATURES),installed=manager.getPackageInfo(activity.getPackageName(),PackageManager.GET_SIGNATURES);
            if(incoming==null||!installed.packageName.equals(incoming.packageName)||incoming.versionCode!=info.getLong("versionCode")||incoming.versionCode<=installed.versionCode||!Arrays.equals(installed.signatures,incoming.signatures))throw new IOException("安装包应用标识、构建号或签名不匹配");
            ui(()->{progress.dismiss();install();});
        }catch(Exception error){file.delete();ui(()->{progress.dismiss();toast("更新失败："+(error.getMessage()==null?"请重试":error.getMessage()));});}finally{busy=false;}},"app-update-download").start();
    }
    private void install(){
        try{
            if(!activity.getPackageManager().canRequestPackageInstalls()){
                new AlertDialog.Builder(activity).setTitle("允许安装更新").setMessage("请允许朝夕安装应用更新，然后返回继续安装。").setNegativeButton("取消",null).setPositiveButton("去设置",(dialog,which)->{installPending=true;activity.startActivityForResult(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())),30);}).show();return;
            }
            installPending=false;Uri uri=Uri.parse("content://"+activity.getPackageName()+".updates/update.apk");Intent intent=new Intent(Intent.ACTION_VIEW);intent.setDataAndType(uri,"application/vnd.android.package-archive");intent.setClipData(ClipData.newRawUri("update",uri));intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);activity.startActivity(intent);
        }catch(RuntimeException error){toast("无法打开安装界面，请检查系统安装设置");}
    }
    public void installationPermissionResult(){if(installPending){installPending=false;if(activity.getPackageManager().canRequestPackageInstalls())install();else toast("未允许安装更新，可稍后重新检查更新");}}
}
