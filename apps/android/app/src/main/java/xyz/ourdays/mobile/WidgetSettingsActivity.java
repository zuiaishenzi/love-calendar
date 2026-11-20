package xyz.ourdays.mobile;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.ImageDecoder;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.widget.*;
import java.io.*;
import java.util.concurrent.Executors;

public class WidgetSettingsActivity extends Activity {
    private static final java.util.concurrent.ExecutorService IMAGES=Executors.newSingleThreadExecutor();
    private int selectedId;private long owner;private String session;private WidgetCropView crop;private boolean saving;
    private final int ink=0xff77485e,paper=0xfffaf6f8;
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    @Override public void onCreate(Bundle state){super.onCreate(state);selectedId=WidgetProfiles.selected(this);owner=WidgetStore.owner(this);session=WidgetStore.prefs(this).getString("session","");showPicker();if(state==null)pick();}
    private LinearLayout page(String heading,String hint){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(dp(20),dp(28),dp(20),dp(20));root.setOnApplyWindowInsetsListener((view,insets)->{int top=insets.getSystemWindowInsetTop(),bottom=insets.getSystemWindowInsetBottom();if(android.os.Build.VERSION.SDK_INT>=30){android.graphics.Insets bars=insets.getInsets(android.view.WindowInsets.Type.systemBars()|android.view.WindowInsets.Type.displayCutout());top=bars.top;bottom=bars.bottom;}root.setPadding(dp(20),dp(20)+top,dp(20),dp(16)+bottom);return insets;});root.setBackgroundColor(paper);setContentView(root);root.requestApplyInsets();TextView title=new TextView(this);title.setText(heading);title.setTextSize(24);title.setTextColor(ink);root.addView(title);TextView caption=new TextView(this);caption.setText(hint);caption.setTextSize(13);caption.setTextColor(0xffa08091);caption.setPadding(0,dp(12),0,dp(20));root.addView(caption);getWindow().setStatusBarColor(paper);getWindow().setNavigationBarColor(paper);getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);return root;}
    private Button button(LinearLayout root,String text,boolean primary){Button b=new Button(this);b.setText(text);b.setAllCaps(false);b.setTextColor(primary?Color.WHITE:ink);b.setTextSize(15);GradientDrawable shape=new GradientDrawable();shape.setColor(primary?0xff93435f:0xfffffbfd);shape.setCornerRadius(dp(16));if(!primary)shape.setStroke(dp(1),0xffe7d5df);b.setBackground(shape);LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(50));p.topMargin=dp(12);root.addView(b,p);return b;}
    private void showPicker(){LinearLayout root=page("挑一张温柔的底色","照片只保存在这部手机。\n选好后，可以拖动和双指缩放，留下喜欢的部分。");button(root,"上传自己的图片",true).setOnClickListener(v->pick());button(root,"返回卡片设置",false).setOnClickListener(v->finish());}
    private void pick(){if(owner==0){toast("请先在 App 中登录");return;}Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);try{startActivityForResult(i,31);}catch(Exception e){toast("无法打开系统图片选择器");}}
    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_LONG).show();}
    static boolean applyPreset(android.content.Context c,String code,int target){
        if(code==null||!code.matches("rose|dawn|hills|moon|transparent"))return false;
        synchronized(WidgetStore.LOCK){if(WidgetStore.owner(c)==0)return false;android.content.SharedPreferences.Editor edit=WidgetStore.prefs(c).edit();if(target<0){edit.putString("default-preset",code);WidgetProfiles.photo(c,-1).delete();}else{WidgetStore.background(c,target).delete();edit.putString("background-preset-"+target,code);}edit.apply();}OurDaysWidget.render(c);return true;
    }
    static String currentPreset(android.content.Context c){int id=WidgetProfiles.selected(c);if(WidgetProfiles.photo(c,id).exists())return "custom";return WidgetStore.prefs(c).getString(id<0?"default-preset":"background-preset-"+id,WidgetStore.prefs(c).getString("default-preset","rose"));}
    static void pin(Activity a){AppWidgetManager manager=AppWidgetManager.getInstance(a);if(manager.isRequestPinAppWidgetSupported())manager.requestPinAppWidget(new ComponentName(a,OurDaysWidget.class),null,null);else Toast.makeText(a,"请长按桌面空白处，在小组件中添加朝夕",Toast.LENGTH_LONG).show();}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request!=31)return;if(result!=RESULT_OK||data==null||data.getData()==null){finish();return;}
        IMAGES.execute(()->{try{byte[] bytes;try(InputStream in=getContentResolver().openInputStream(data.getData());ByteArrayOutputStream out=new ByteArrayOutputStream()){if(in==null)throw new IOException();byte[] chunk=new byte[8192];int n;while((n=in.read(chunk))!=-1){if(out.size()+n>20*1024*1024)throw new IOException();out.write(chunk,0,n);}bytes=out.toByteArray();}
            Bitmap image;
            if(android.os.Build.VERSION.SDK_INT>=28)image=ImageDecoder.decodeBitmap(ImageDecoder.createSource(java.nio.ByteBuffer.wrap(bytes)),(decoder,info,source)->{int w=info.getSize().getWidth(),h=info.getSize().getHeight();double scale=Math.min(1,Math.min(4096.0/Math.max(w,h),Math.sqrt(8_000_000.0/((double)w*h))));decoder.setTargetSize(Math.max(1,(int)(w*scale)),Math.max(1,(int)(h*scale)));decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);});
            else{BitmapFactory.Options o=new BitmapFactory.Options();o.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,o);o.inSampleSize=1;while((double)o.outWidth*o.outHeight/o.inSampleSize/o.inSampleSize>8_000_000||Math.max(o.outWidth,o.outHeight)/o.inSampleSize>4096)o.inSampleSize*=2;o.inJustDecodeBounds=false;image=BitmapFactory.decodeByteArray(bytes,0,bytes.length,o);}if(image==null)throw new IOException();
            runOnUiThread(()->{if(isFinishing()){image.recycle();return;}crop=new WidgetCropView(this,image);LinearLayout root=page("留住喜欢的画面","拖动调整位置 · 双指缩放\n方框内就是卡片将展示的画面。");root.addView(crop,new LinearLayout.LayoutParams(-1,0,1));button(root,"使用这张照片",true).setOnClickListener(v->save());button(root,"重新选择",false).setOnClickListener(v->{releaseCrop();showPicker();pick();});button(root,"取消",false).setOnClickListener(v->finish());});
        }catch(Exception e){runOnUiThread(()->toast("请选择20MB以内、可以打开的照片"));}});
    }
    private void save(){if(saving||crop==null)return;saving=true;final Bitmap result=crop.crop();IMAGES.execute(()->{boolean success=false;try{synchronized(WidgetStore.LOCK){if(owner==0||owner!=WidgetStore.owner(this)||!session.equals(WidgetStore.prefs(this).getString("session","")))throw new IOException();if(selectedId>=0&&!WidgetProfiles.exists(this,selectedId))throw new IOException();File destination=WidgetProfiles.photo(this,selectedId),temp=new File(destination.getPath()+".tmp");try(FileOutputStream out=new FileOutputStream(temp)){if(!result.compress(Bitmap.CompressFormat.JPEG,96,out))throw new IOException();}if(!temp.renameTo(destination)){temp.delete();throw new IOException();}}OurDaysWidget.render(this);success=true;}catch(Exception e){android.util.Log.w("OurDaysWidget","Background not saved");}finally{if(crop==null||result!=crop.image)result.recycle();}final boolean saved=success;runOnUiThread(()->{saving=false;if(!isFinishing()){toast(saved?"新的底色，已经换好了":"未保存，请确认已登录并重试");if(saved)finish();}else releaseCrop();});});}
    private void releaseCrop(){if(crop!=null){crop.image.recycle();crop=null;}}
    @Override protected void onDestroy(){if(!saving)releaseCrop();super.onDestroy();}
}
