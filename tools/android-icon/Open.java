package io.github.fiino.winternotes;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/* World Adventure's Home screen icon, for phones that cannot add a web page to the Home screen (the grandparents' Nokia:
   its Android Go launcher takes no web shortcuts, so Chrome offers no "Add to Home screen"). This is the whole app: it
   opens the web app in Chrome and steps aside. Nothing is stored here and it asks for no permissions; the trip itself
   lives in Chrome, exactly as when the address is typed there. */
public class Open extends Activity {
  static final String URL = "https://fiino.github.io/winter-notes/";

  @Override protected void onCreate(Bundle state) {
    super.onCreate(state);
    Intent go = new Intent(Intent.ACTION_VIEW, Uri.parse(URL));
    go.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    go.putExtra("com.android.browser.application_id", getPackageName());   // Chrome keeps one tab for this icon and comes back to it, instead of opening a new tab at every tap
    go.setPackage("com.android.chrome");
    try { startActivity(go); }
    catch (ActivityNotFoundException noChrome) {
      go.setPackage(null);                                                 // no Chrome: whatever browser the phone has
      try { startActivity(go); } catch (ActivityNotFoundException noBrowser) { /* nothing to open it with */ }
    }
    finish();
  }
}
