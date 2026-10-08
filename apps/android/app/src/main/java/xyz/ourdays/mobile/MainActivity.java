package xyz.ourdays.mobile;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.ClipData;
import android.webkit.MimeTypeMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final int PICK_FILE = 10, RECORD_AUDIO = 11;
    private WebView web;
    private AppUpdater appUpdater;
    private NativeVoiceRecorder nativeVoice;
    private boolean nativeVoicePending=false,voiceRequested=false;
    private long filePickerReturnedAt=0;
    private void startNativeVoice(){if(!voiceRequested)return;if(!activityResumed||!hasWindowFocus()){nativeVoicePending=true;return;}nativeVoicePending=false;if(!trusted(Uri.parse(web.getUrl())))return;if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){if(nativeVoicePending)return;nativeVoicePending=true;requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},13);return;}if(nativeVoice==null)nativeVoice=new NativeVoiceRecorder(this,payload->{if(!isFinishing()&&trusted(Uri.parse(web.getUrl())))web.evaluateJavascript("window.dispatchEvent(new CustomEvent('native-voice-result',{detail:"+payload.toString()+"}));",null);});nativeVoice.open();}
    private FrameLayout root;
    private LinearLayout errorPanel;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest audioRequest;
    private boolean audioPermissionReady=false, activityResumed=false;
    private View fullScreen;
    private WebChromeClient.CustomViewCallback fullScreenCallback;

    private boolean trusted(Uri uri) {
        Uri base = Uri.parse(BuildConfig.SERVER_URL);
        return uri != null && "https".equals(uri.getScheme()) && base.getHost().equalsIgnoreCase(uri.getHost()) && (base.getPort() == -1 ? 443 : base.getPort()) == (uri.getPort() == -1 ? 443 : uri.getPort());
    }

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setStatusBarColor(Color.rgb(250, 246, 248));
        getWindow().setNavigationBarColor(Color.rgb(250, 246, 248));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        root = new FrameLayout(this);
        setContentView(root);
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return insets;
            });
        }
        appUpdater=new AppUpdater(this);
        // Retire tasks/channels created by older notification-enabled builds.
        android.app.job.JobScheduler jobs=getSystemService(android.app.job.JobScheduler.class);if(jobs!=null)jobs.cancelAll();
        android.app.NotificationManager notices=getSystemService(android.app.NotificationManager.class);if(notices!=null){notices.cancelAll();for(android.app.NotificationChannel channel:notices.getNotificationChannels())notices.deleteNotificationChannel(channel.getId());}
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(250, 246, 248));
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        WebSettings settings = web.getSettings();
        settings.setUserAgentString(settings.getUserAgentString()+" OurDaysAndroid/"+BuildConfig.VERSION_CODE);
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if(trusted(request.getUrl())&&trusted(Uri.parse(view.getUrl()))&&request.isForMainFrame()){
                    String path=request.getUrl().getPath();
                    if("/app/finish-voice".equals(path)){if(nativeVoice!=null)nativeVoice.finish();return true;}
                    if("/app/cancel-voice".equals(path)){nativeVoicePending=false;voiceRequested=false;if(nativeVoice!=null)nativeVoice.cancel();return true;}
                }
                if(trusted(request.getUrl())&&"/app/record-voice".equals(request.getUrl().getPath())&&request.isForMainFrame()&&trusted(Uri.parse(view.getUrl()))){voiceRequested=true;startNativeVoice();return true;}
                if(trusted(request.getUrl())&&"/app/check-update".equals(request.getUrl().getPath())&&request.isForMainFrame()&&request.hasGesture()&&trusted(Uri.parse(view.getUrl()))){appUpdater.check(true);return true;}
                if (trusted(request.getUrl())) return false;
                if (request.isForMainFrame() && request.hasGesture()) openExternal(request.getUrl());
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showError();
            }
            @Override public void onPageFinished(WebView view, String url) { CookieManager.getInstance().flush(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!trusted(Uri.parse(view.getUrl()))) { callback.onReceiveValue(null); return true; }
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(filePicker(params), PICK_FILE); }
                catch (ActivityNotFoundException | SecurityException error) { finishFilePicker(null); toast("无法打开系统文件选择器"); }
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean audio=false;for(String resource:request.getResources())if(PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource))audio=true;
                    if (!trusted(request.getOrigin()) || !trusted(Uri.parse(web.getUrl())) || !audio) { request.deny(); return; }
                    if(audioRequest!=null){audioRequest.deny();audioRequest=null;}
                    audioRequest=request;audioPermissionReady=checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED;
                    if(audioPermissionReady)completeAudioPermission();
                    else requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, RECORD_AUDIO);
                });
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) { if (audioRequest == request) {audioRequest = null;audioPermissionReady=false;} }
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullScreen != null) { callback.onCustomViewHidden(); return; }
                fullScreen = view; fullScreenCallback = callback;
                root.addView(view, new FrameLayout.LayoutParams(-1, -1)); web.setVisibility(View.GONE);
            }
            @Override public void onHideCustomView() { hideFullScreen(); }
        });
        web.setDownloadListener((url, userAgent, disposition, mime, length) -> {
            Uri uri = Uri.parse(url);
            if (!trusted(uri)) { toast("仅支持下载本站 HTTPS 附件"); return; }
            try {
                DownloadManager.Request download = new DownloadManager.Request(uri);
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) download.addRequestHeader("Cookie", cookies);
                download.addRequestHeader("User-Agent", userAgent);
                String name = URLUtil.guessFileName(url, disposition, mime).replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
                download.setTitle(name);
                if (mime != null) download.setMimeType(mime);
                download.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                download.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, System.currentTimeMillis() + "-" + name);
                ((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(download);
                toast("已开始下载，可在下载目录中查看");
            } catch (RuntimeException error) { toast("下载失败，请检查网络和可用存储空间"); }
        });
        web.loadUrl(BuildConfig.SERVER_URL);
        root.postDelayed(()->{if(!isFinishing())appUpdater.check(false);},2000);
    }

    private Intent filePicker(WebChromeClient.FileChooserParams params) {
        LinkedHashSet<String> types = new LinkedHashSet<>();
        for (String accepted : params.getAcceptTypes()) {
            if (accepted == null) continue;
            for (String part : accepted.split(",")) {
                String type = part.trim().toLowerCase(Locale.ROOT);
                if (type.startsWith(".")) type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(type.substring(1));
                if (type != null && type.matches("[a-z0-9.+-]+/(?:[a-z0-9.+-]+|\\*)")) types.add(type);
            }
        }
        String common = "*/*";
        if (types.size() == 1) common = types.iterator().next();
        else if (!types.isEmpty()) {
            String family = types.iterator().next().split("/")[0];
            boolean same = true;
            for (String type : types) if (!type.startsWith(family + "/")) same = false;
            if (same) common = family + "/*";
        }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(common);
        if (!types.isEmpty()) intent.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return intent;
    }

    private void finishFilePicker(Uri[] files) {
        ValueCallback<Uri[]> callback = fileCallback;
        fileCallback = null;
        if (callback != null) callback.onReceiveValue(files);
    }

    private void showError() {
        if (errorPanel != null) return;
        errorPanel = new LinearLayout(this); errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(android.view.Gravity.CENTER); errorPanel.setPadding(40, 40, 40, 40);
        errorPanel.setBackgroundColor(Color.rgb(250, 246, 248));
        TextView message = new TextView(this); message.setText("暂时无法连接我们的日历\n请检查网络或服务器状态"); message.setTextSize(19);
        Button retry = new Button(this); retry.setText("重新连接");
        retry.setOnClickListener(view -> { root.removeView(errorPanel); errorPanel = null; web.loadUrl(BuildConfig.SERVER_URL); });
        errorPanel.addView(message); errorPanel.addView(retry); root.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));
    }
    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
    private void openExternal(Uri uri) {
        if (!"https".equals(uri.getScheme()) && !"http".equals(uri.getScheme())) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (ActivityNotFoundException error) { toast("未找到浏览器"); }
    }
    private void hideFullScreen() {
        if (fullScreen == null) return;
        root.removeView(fullScreen); fullScreen = null; web.setVisibility(View.VISIBLE);
        fullScreenCallback.onCustomViewHidden(); fullScreenCallback = null;
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if(request==30){appUpdater.installationPermissionResult();return;}
        if (request == PICK_FILE && fileCallback != null) {
            filePickerReturnedAt=android.os.SystemClock.elapsedRealtime();
            if (result != RESULT_OK || data == null || !trusted(Uri.parse(web.getUrl()))) { finishFilePicker(null); return; }
            LinkedHashSet<Uri> files = new LinkedHashSet<>();
            ClipData clips = data.getClipData();
            if (clips != null) for (int i = 0; i < clips.getItemCount(); i++) files.add(clips.getItemAt(i).getUri());
            else if (data.getData() != null) files.add(data.getData());
            try {
                for (Uri uri : files) {
                    if (uri == null || !"content".equals(uri.getScheme())) throw new SecurityException();
                    try (android.os.ParcelFileDescriptor descriptor = getContentResolver().openFileDescriptor(uri, "r")) {
                        if (descriptor == null) throw new java.io.IOException();
                    }
                }
                finishFilePicker(files.isEmpty() ? null : files.toArray(new Uri[0]));
            } catch (java.io.IOException | SecurityException error) { finishFilePicker(null); toast("无法读取所选文件，请从系统文件选择器重新选择"); }
        }
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if(request==13){nativeVoicePending=false;if(!voiceRequested)return;if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED){nativeVoicePending=true;root.postDelayed(this::startNativeVoice,350);}else toast("请允许朝夕使用麦克风；卓易通本身也需要麦克风权限。");return;}
        if (request == RECORD_AUDIO && audioRequest != null) {
            audioPermissionReady=checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED;
            if(audioPermissionReady)root.post(this::completeAudioPermission);
            else {PermissionRequest pending=audioRequest;audioRequest=null;pending.deny();}
        }
    }
    private void completeAudioPermission(){
        if(!activityResumed||!audioPermissionReady||audioRequest==null)return;
        PermissionRequest pending=audioRequest;audioRequest=null;audioPermissionReady=false;
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED&&trusted(pending.getOrigin())&&trusted(Uri.parse(web.getUrl())))pending.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        else pending.deny();
    }
    @Override public void onWindowFocusChanged(boolean focused){super.onWindowFocusChanged(focused);if(focused&&nativeVoicePending&&checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)root.postDelayed(this::startNativeVoice,350);}
    @Override protected void onResume(){super.onResume();activityResumed=true;if(root!=null)root.post(this::completeAudioPermission);}

    @Override public void onBackPressed() {
        if(fileCallback!=null){finishFilePicker(null);filePickerReturnedAt=android.os.SystemClock.elapsedRealtime();return;}
        if(android.os.SystemClock.elapsedRealtime()-filePickerReturnedAt<700)return;
        if (fullScreen != null) { hideFullScreen(); return; }
        web.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(!d)return false;if(d.requestClose)d.requestClose();else{const e=new Event('cancel',{cancelable:true});if(d.dispatchEvent(e))d.close();}return true;})()", value -> {
            if (!"true".equals(value)) { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
        });
    }
    @Override protected void onPause() { activityResumed=false;if(nativeVoice!=null)nativeVoice.cancel();CookieManager.getInstance().flush(); super.onPause(); }
    @Override protected void onDestroy() {
        if(nativeVoice!=null)nativeVoice.cancel();
        if (audioRequest != null) { audioRequest.deny(); audioRequest = null; }
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        web.destroy(); super.onDestroy();
    }
}
