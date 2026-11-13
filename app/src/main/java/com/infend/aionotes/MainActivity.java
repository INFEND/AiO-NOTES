package com.infend.aionotes;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.*;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.AtomicFile;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.inputmethod.InputMethodManager;
import android.view.textservice.*;
import androidx.core.content.FileProvider;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
    private WebView web;
    private AtomicFile store;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Map<String, SpellCheckerSession> sessions = new HashMap<>();
    private static final int IMAGE=11, EXPORT=12, IMPORT=13;
    private static final int LIMIT=64*1024*1024;
    private static final String MANIFEST="https://github.com/INFEND/AiO-NOTES/releases/latest/download/update.json";
    private String pendingExport;
    private File pendingApk;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff000000);
        getWindow().setNavigationBarColor(0xff000000);
        store=new AtomicFile(new File(getFilesDir(),"notes.json"));
        web=new WebView(this);
        web.setBackgroundColor(0xff000000);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new Bridge(),"Native");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r){return true;}
            @Override public boolean shouldOverrideUrlLoading(WebView v,String u){return true;}
        });
        setContentView(web);
        if(android.os.Build.VERSION.SDK_INT>=35) {
            web.setOnApplyWindowInsetsListener((v,insets)->{
                android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
                android.graphics.Insets ime=insets.getInsets(WindowInsets.Type.ime());
                v.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,ime.bottom));return insets;
            });
        }
        web.loadUrl("file:///android_asset/index.html");
    }
    private void call(String method,String value){runOnUiThread(()->web.evaluateJavascript("window."+method+"("+JSONObject.quote(value)+")",null));}
    private void message(String value){call("nativeMessage",value);}
    private static byte[] read(InputStream in,int limit)throws IOException{
        try(InputStream input=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] b=new byte[16384];int n,total=0;
            while((n=input.read(b))!=-1){total+=n;if(total>limit)throw new IOException("Файл слишком большой");out.write(b,0,n);}return out.toByteArray();
        }
    }
    private synchronized String loadNotes(){
        try{return new String(store.readFully(),StandardCharsets.UTF_8);}catch(IOException e){return "[]";}
    }
    private synchronized boolean saveNotes(String data){
        FileOutputStream out=null;
        try{new JSONArray(data);byte[] bytes=data.getBytes(StandardCharsets.UTF_8);if(bytes.length>LIMIT)throw new IOException("limit");out=store.startWrite();out.write(bytes);store.finishWrite(out);return true;}
        catch(Exception e){if(out!=null)store.failWrite(out);return false;}
    }
    private void picker(int code,String mime){
        Intent i=new Intent(code==EXPORT?Intent.ACTION_CREATE_DOCUMENT:Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);i.setType(mime);
        if(code==EXPORT)i.putExtra(Intent.EXTRA_TITLE,"AiO-NOTES-backup.json");
        startActivityForResult(i,code);
    }
    class Bridge{
        @JavascriptInterface public String load(){return loadNotes();}
        @JavascriptInterface public boolean save(String s){return saveNotes(s);}
        @JavascriptInterface public String accent(){return getPreferences(0).getString("accent","#80D8FF");}
        @JavascriptInterface public void setAccent(String s){getPreferences(0).edit().putString("accent",s).apply();}
        @JavascriptInterface public void pickImage(){runOnUiThread(()->picker(IMAGE,"image/*"));}
        @JavascriptInterface public void exportNotes(String s){runOnUiThread(()->{pendingExport=s;picker(EXPORT,"application/json");});}
        @JavascriptInterface public void importNotes(){runOnUiThread(()->picker(IMPORT,"*/*"));}
        @JavascriptInterface public void openLink(String s){runOnUiThread(()->{try{Uri u=Uri.parse(s);if("https".equals(u.getScheme())||"http".equals(u.getScheme()))startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}});}
        @JavascriptInterface public void checkUpdate(){io.execute(()->{
            try{call("updateInfo","checking");JSONObject j=new JSONObject(new String(fetch(MANIFEST,128*1024),StandardCharsets.UTF_8));
                android.content.pm.PackageInfo pi=getPackageManager().getPackageInfo(getPackageName(),0);long current=android.os.Build.VERSION.SDK_INT>=28?pi.getLongVersionCode():pi.versionCode;
                if(j.getLong("versionCode")<=current)call("updateInfo","current");else call("updateInfo",j.toString());
            }catch(Exception e){call("updateInfo","error");}
        });}
        @JavascriptInterface public void installUpdate(String data){io.execute(()->downloadUpdate(data));}
        @JavascriptInterface public void spell(String lang,String data,int generation){runOnUiThread(()->spellWords(lang,data,generation));}
    }
    private void spellWords(String lang,String data,int generation){
        try{
            JSONArray words=new JSONArray(data);
            if(words.length()==0)return;
            SpellCheckerSession old=sessions.remove(lang);if(old!=null)old.close();
            TextServicesManager manager=(TextServicesManager)getSystemService(TEXT_SERVICES_MANAGER_SERVICE);
            SpellCheckerSession session=manager.newSpellCheckerSession(null,Locale.forLanguageTag(lang),new SpellCheckerSession.SpellCheckerSessionListener(){
                @Override public void onGetSuggestions(SuggestionsInfo[] results){
                    JSONArray out=new JSONArray();
                    for(SuggestionsInfo info:results){if(info==null)continue;
                        int flags=info.getSuggestionsAttributes();
                        if((flags&SuggestionsInfo.RESULT_ATTR_LOOKS_LIKE_TYPO)==0)continue;
                        try{JSONObject item=new JSONObject();item.put("id",info.getSequence());JSONArray options=new JSONArray();
                            for(int i=0;i<info.getSuggestionsCount();i++)options.put(info.getSuggestionAt(i));
                            item.put("options",options);out.put(item);}catch(Exception ignored){}
                    }
                    try{JSONObject payload=new JSONObject();payload.put("generation",generation);payload.put("items",out);call("spellResults",payload.toString());}catch(Exception ignored){}
                }
                @Override public void onGetSentenceSuggestions(SentenceSuggestionsInfo[] results){}
            },false);
            if(session==null)return;sessions.put(lang,session);
            TextInfo[] entries=new TextInfo[words.length()];
            for(int i=0;i<words.length();i++){JSONObject w=words.getJSONObject(i);entries[i]=new TextInfo(w.getString("word"),generation,w.getInt("id"));}
            session.getSuggestions(entries,5,false);
        }catch(Exception ignored){}
    }
    private byte[] fetch(String url,int limit)throws Exception{
        java.net.HttpURLConnection c=(java.net.HttpURLConnection)new URL(url).openConnection();
        c.setConnectTimeout(15000);c.setReadTimeout(30000);c.setInstanceFollowRedirects(true);
        try{if(c.getResponseCode()!=200)throw new IOException("HTTP "+c.getResponseCode());return read(c.getInputStream(),limit);}finally{c.disconnect();}
    }
    private void downloadUpdate(String data){
        try{
            JSONObject j=new JSONObject(data);String url=j.getString("url");
            if(!url.startsWith("https://github.com/INFEND/AiO-NOTES/releases/download/"))throw new IOException("URL");
            call("updateInfo","downloading");
            byte[] bytes=fetch(url,128*1024*1024);
            StringBuilder hash=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))hash.append(String.format(Locale.ROOT,"%02x",b&255));
            if(!hash.toString().equalsIgnoreCase(j.getString("sha256")))throw new IOException("SHA-256");
            File dir=new File(getCacheDir(),"updates");dir.mkdirs();File apk=new File(dir,"AiO-NOTES.apk");
            try(FileOutputStream out=new FileOutputStream(apk)){out.write(bytes);}
            pendingApk=apk;runOnUiThread(()->launchInstall(apk));call("updateInfo","ready");
        }catch(Exception e){call("updateInfo","error");}
    }
    private void launchInstall(File apk){
        try{
            if(!getPackageManager().canRequestPackageInstalls()){
                startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getPackageName())));
                message("Разрешите установку приложений, затем нажмите «Установить» повторно.");return;
            }
            Intent i=new Intent(Intent.ACTION_VIEW);i.setDataAndType(FileProvider.getUriForFile(this,getPackageName()+".files",apk),"application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(i);
        }catch(Exception e){message("Не удалось открыть установщик");}
    }
    @Override protected void onActivityResult(int code,int result,Intent data){
        super.onActivityResult(code,result,data);if(result!=RESULT_OK||data==null||data.getData()==null)return;
        Uri uri=data.getData();
        io.execute(()->{try{
            if(code==IMAGE){
                BitmapFactory.Options opts=new BitmapFactory.Options();opts.inJustDecodeBounds=true;
                try(InputStream in=getContentResolver().openInputStream(uri)){BitmapFactory.decodeStream(in,null,opts);}
                int sample=1;while(Math.max(opts.outWidth,opts.outHeight)/sample>2400)sample*=2;
                opts.inJustDecodeBounds=false;opts.inSampleSize=sample;
                Bitmap bmp;try(InputStream in=getContentResolver().openInputStream(uri)){bmp=BitmapFactory.decodeStream(in,null,opts);}
                if(bmp==null)throw new IOException("image");
                ByteArrayOutputStream out=new ByteArrayOutputStream();
                if(android.os.Build.VERSION.SDK_INT>=30)bmp.compress(Bitmap.CompressFormat.WEBP_LOSSY,88,out);else bmp.compress(Bitmap.CompressFormat.WEBP,88,out);
                bmp.recycle();call("insertNativeImage","data:image/webp;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP));
            }else if(code==EXPORT){try(OutputStream out=getContentResolver().openOutputStream(uri,"w")){out.write(pendingExport.getBytes(StandardCharsets.UTF_8));}message("Резервная копия сохранена");}
            else if(code==IMPORT){String s=new String(read(getContentResolver().openInputStream(uri),LIMIT),StandardCharsets.UTF_8);new JSONArray(s);call("restoreNative",s);}
        }catch(Exception e){message("Не удалось обработать файл");}});
    }
    @Override public void onBackPressed(){web.evaluateJavascript("window.handleBack()",null);}
    @Override protected void onDestroy(){for(SpellCheckerSession s:sessions.values())s.close();io.shutdown();super.onDestroy();}
}
