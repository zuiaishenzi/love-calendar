package xyz.ourdays.mobile;

import java.net.HttpURLConnection;
import java.net.URL;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import org.json.JSONObject;

final class WidgetApi {
    static class RequestError extends Exception {final int status;RequestError(int status){super("HTTP "+status);this.status=status;}}
    static JSONObject request(String path,String cookie,JSONObject body)throws Exception{
        URL base=new URL(BuildConfig.SERVER_URL),url=new URL(base,path);
        if(!"https".equals(url.getProtocol())||!base.getHost().equals(url.getHost())||base.getPort()!=url.getPort())throw new SecurityException("Untrusted widget server");
        HttpURLConnection connection=(HttpURLConnection)url.openConnection();
        try{
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(12000);connection.setReadTimeout(12000);connection.setRequestProperty("Cookie",cookie);connection.setRequestProperty("Accept","application/json");connection.setRequestProperty("User-Agent","OurDaysWidget/"+BuildConfig.VERSION_CODE);
            if(body!=null){connection.setRequestMethod("POST");connection.setRequestProperty("Content-Type","application/json");String origin=base.getProtocol()+"://"+base.getAuthority();connection.setRequestProperty("Origin",origin);connection.setDoOutput(true);byte[] bytes=body.toString().getBytes("UTF-8");connection.setFixedLengthStreamingMode(bytes.length);try(java.io.OutputStream out=connection.getOutputStream()){out.write(bytes);}}
            int status=connection.getResponseCode();if(status!=200)throw new RequestError(status);
            try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>128*1024)throw new java.io.IOException("Response too large");out.write(buffer,0,n);}return new JSONObject(out.toString("UTF-8"));}
        }finally{connection.disconnect();}
    }
}
