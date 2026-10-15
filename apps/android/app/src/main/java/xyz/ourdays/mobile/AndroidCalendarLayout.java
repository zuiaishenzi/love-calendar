package xyz.ourdays.mobile;

import android.content.Context;
import android.net.Uri;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/** Bundled calendar adaptation; CSS is a same-origin resource under the site's CSP. */
final class AndroidCalendarLayout {
    private static final String STYLE_PATH="/__ourdays_android__/calendar-layout.css";
    private final Uri origin=Uri.parse(BuildConfig.SERVER_URL);
    private byte[] css;
    private String script;

    AndroidCalendarLayout(Context context) {
        try {
            css=read(context,"calendar-layout.css");
            script=new String(read(context,"calendar-layout.js"),StandardCharsets.UTF_8);
        } catch(IOException error) { Log.e("OurDaysCalendar","Bundled calendar layout could not be loaded",error); }
    }
    private static byte[] read(Context context,String name) throws IOException {
        try(InputStream input=context.getAssets().open(name);ByteArrayOutputStream output=new ByteArrayOutputStream()) {
            byte[] buffer=new byte[4096];int count;
            while((count=input.read(buffer))!=-1)output.write(buffer,0,count);
            return output.toByteArray();
        }
    }
    private boolean trusted(Uri uri) {
        return uri!=null&&"https".equals(uri.getScheme())&&origin.getHost().equalsIgnoreCase(uri.getHost())&&
            (origin.getPort()==-1?443:origin.getPort())==(uri.getPort()==-1?443:uri.getPort());
    }
    WebResourceResponse intercept(WebResourceRequest request) {
        if(css==null||request.isForMainFrame()||!"GET".equals(request.getMethod())||!trusted(request.getUrl())||!STYLE_PATH.equals(request.getUrl().getPath()))return null;
        return new WebResourceResponse("text/css","UTF-8",200,"OK",Collections.singletonMap("Cache-Control","no-store"),new ByteArrayInputStream(css));
    }
    void apply(WebView view) {
        if(script==null||!trusted(Uri.parse(view.getUrl()==null?"":view.getUrl())))return;
        String viewport="window.__ourdaysAndroidCalendarBuild="+BuildConfig.VERSION_CODE+";window.__ourdaysAndroidCalendarViewport={width:"+view.getWidth()+",height:"+view.getHeight()+"};";
        view.evaluateJavascript(viewport+script+";window.dispatchEvent(new Event('ourdays-android-viewport'));",null);
    }
}
