package xyz.ourdays.mobile;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.concurrent.Executors;

public class WidgetSettingsActivity extends Activity {
    private static final java.util.concurrent.ExecutorService IMAGES=Executors.newSingleThreadExecutor();
    private int[] ids=new int[0];private Spinner chooser;private int selectedId;private Button choose;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(28,40,28,24);root.setBackgroundColor(Color.rgb(250,244,247));android.widget.ScrollView scroll=new android.widget.ScrollView(this);scroll.setFillViewport(true);scroll.addView(root);setContentView(scroll);
        TextView title=new TextView(this);title.setText("桌面卡片背景");title.setTextSize(24);title.setTextColor(Color.rgb(119,72,94));root.addView(title);
        TextView hint=new TextView(this);hint.setText("选择一张属于你的图片，让等待也有温柔的底色。\n背景仅保存在这部手机，不会发给对方。\n添加卡片后可在这里分别设置。");hint.setTextSize(14);hint.setPadding(0,20,0,24);root.addView(hint);
        chooser=new Spinner(this);root.addView(chooser);choose=button(root,"选择背景图片");choose.setOnClickListener(v->{if(WidgetStore.owner(this)==0){toast("请先在 App 中登录");return;}selectedId=selected();Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);try{startActivityForResult(i,31);}catch(Exception e){toast("无法打开系统图片选择器");}});
        for(String[] preset:new String[][]{{"rose","柔雾"},{"dawn","晨光"},{"hills","山野"},{"moon","晚风"}})button(root,"内置背景 · "+preset[1]).setOnClickListener(v->{if(applyPreset(this,preset[0],ids.length>0?selected():-1))toast("已换上「"+preset[1]+"」");else toast("请先在 App 中登录");});
        button(root,"添加到桌面").setOnClickListener(v->pin(this));button(root,"返回朝夕").setOnClickListener(v->finish());refreshIds();
    }
    private Button button(LinearLayout root,String text){Button b=new Button(this);b.setText(text);root.addView(b,new LinearLayout.LayoutParams(-1,-2));return b;}
    private int selected(){return ids[Math.max(0,Math.min(ids.length-1,chooser.getSelectedItemPosition()))];}
    static boolean applyPreset(android.content.Context c,String code,int target){
        if(code==null||!code.matches("rose|dawn|hills|moon"))return false;
        synchronized(WidgetStore.LOCK){if(WidgetStore.owner(c)==0)return false;android.content.SharedPreferences.Editor edit=WidgetStore.prefs(c).edit();if(target<0)edit.putString("default-preset",code);for(int id:AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c,OurDaysWidget.class))){if(target>=0&&id!=target)continue;WidgetStore.background(c,id).delete();edit.putString("background-preset-"+id,code);}edit.apply();}OurDaysWidget.render(c);return true;
    }
    static String currentPreset(android.content.Context c){int[] widgets=AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c,OurDaysWidget.class));if(widgets.length>0){if(WidgetStore.background(c,widgets[0]).exists())return "custom";return WidgetStore.prefs(c).getString("background-preset-"+widgets[0],WidgetStore.prefs(c).getString("default-preset","rose"));}return WidgetStore.prefs(c).getString("default-preset","rose");}
    private void refreshIds(){ids=AppWidgetManager.getInstance(this).getAppWidgetIds(new ComponentName(this,OurDaysWidget.class));String[] labels=new String[ids.length];for(int n=0;n<ids.length;n++)labels[n]="桌面卡片 "+(n+1);chooser.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,labels));choose.setEnabled(ids.length>0);}
    @Override protected void onResume(){super.onResume();if(chooser!=null)refreshIds();}
    static void pin(Activity a){AppWidgetManager manager=AppWidgetManager.getInstance(a);if(manager.isRequestPinAppWidgetSupported())manager.requestPinAppWidget(new ComponentName(a,OurDaysWidget.class),null,null);else Toast.makeText(a,"请长按桌面空白处，在小组件中添加朝夕",Toast.LENGTH_LONG).show();}
    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_LONG).show();}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request!=31||result!=RESULT_OK||data==null||data.getData()==null)return;final Uri uri=data.getData();final long owner=WidgetStore.owner(this);final String session=WidgetStore.prefs(this).getString("session","");final int id=selectedId;choose.setEnabled(false);
        IMAGES.execute(()->{String message="背景图片已更新";try{
            byte[] bytes;try(InputStream in=getContentResolver().openInputStream(uri);java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()){if(in==null)throw new Exception();byte[] chunk=new byte[8192];int n;while((n=in.read(chunk))!=-1){if(out.size()+n>20*1024*1024)throw new Exception();out.write(chunk,0,n);}bytes=out.toByteArray();}
            BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);if(options.outWidth<=0||options.outHeight<=0)throw new Exception();int sample=1;while(Math.max(options.outWidth,options.outHeight)/sample>800)sample*=2;options.inJustDecodeBounds=false;options.inSampleSize=sample;Bitmap image=BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);if(image==null)throw new Exception();Bitmap scaled=Bitmap.createScaledBitmap(image,Math.max(1,image.getWidth()*400/Math.max(image.getWidth(),image.getHeight())),Math.max(1,image.getHeight()*400/Math.max(image.getWidth(),image.getHeight())),true);
            synchronized(WidgetStore.LOCK){if(owner==0||owner!=WidgetStore.owner(this)||!session.equals(WidgetStore.prefs(this).getString("session","")))throw new Exception();boolean exists=false;for(int current:AppWidgetManager.getInstance(this).getAppWidgetIds(new ComponentName(this,OurDaysWidget.class)))if(current==id)exists=true;if(!exists)throw new Exception();File destination=WidgetStore.background(this,id),temp=new File(destination.getPath()+".tmp");try(FileOutputStream out=new FileOutputStream(temp)){if(!scaled.compress(Bitmap.CompressFormat.JPEG,88,out))throw new Exception();}if(!temp.renameTo(destination)){temp.delete();throw new Exception();}}
            if(scaled!=image)scaled.recycle();image.recycle();OurDaysWidget.render(this);
        }catch(Exception e){message="图片未保存，请选择20MB以内的图片并确认已登录";}final String text=message;runOnUiThread(()->{if(!isFinishing()){choose.setEnabled(ids.length>0);toast(text);}});});
    }
}
