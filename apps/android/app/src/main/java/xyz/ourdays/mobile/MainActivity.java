package xyz.ourdays.mobile;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
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
    private FrameLayout root;
    private LinearLayout errorPanel;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest audioRequest;
    private View fullScreen;
    private WebChromeClient.CustomViewCallback fullScreenCallback;

    private boolean trusted(Uri uri) {
        Uri base = Uri.parse(BuildConfig.SERVER_URL);
        return uri != null && "https".equals(uri.getScheme()) && base.getHost().equalsIgnoreCase(uri.getHost()) && base.getPort() == uri.getPort();
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
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(250, 246, 248));
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        WebSettings settings = web.getSettings();
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
                try { startActivityForResult(params.createIntent(), PICK_FILE); }
                catch (ActivityNotFoundException error) { fileCallback.onReceiveValue(null); fileCallback = null; toast("未找到文件选择器"); }
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    String[] resources = request.getResources();
                    if (!trusted(request.getOrigin()) || resources.length != 1 || !PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resources[0])) { request.deny(); return; }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    else {
                        if (audioRequest != null) audioRequest.deny();
                        audioRequest = request;
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, RECORD_AUDIO);
                    }
                });
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) { if (audioRequest == request) audioRequest = null; }
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
        if (request == PICK_FILE && fileCallback != null) { fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data)); fileCallback = null; }
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == RECORD_AUDIO && audioRequest != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED && trusted(Uri.parse(web.getUrl()))) audioRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else audioRequest.deny();
            audioRequest = null;
        }
    }
    @Override public void onBackPressed() {
        if (fullScreen != null) { hideFullScreen(); return; }
        web.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(!d)return false;if(d.requestClose)d.requestClose();else{const e=new Event('cancel',{cancelable:true});if(d.dispatchEvent(e))d.close();}return true;})()", value -> {
            if (!"true".equals(value)) { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
        });
    }
    @Override protected void onPause() { CookieManager.getInstance().flush(); super.onPause(); }
    @Override protected void onDestroy() {
        if (audioRequest != null) { audioRequest.deny(); audioRequest = null; }
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        web.destroy(); super.onDestroy();
    }
}
