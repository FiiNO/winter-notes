#!/bin/sh
# Builds world-adventure-icon.apk: the Home screen icon for phones that cannot add a web page to the Home screen.
# Needs (Debian/Ubuntu): apt-get install aapt apksigner zipalign dalvik-exchange libandroid-23-java, and a JDK.
# Usage: sh tools/android-icon/build.sh <keystore.jks> <keystore password> [output.apk]
# The keystore is the app's signature: keep it out of the repository. A phone only accepts an update signed with the same
# one (otherwise uninstall the old icon first). Make one with:
#   keytool -genkeypair -keystore icon.jks -alias icon -keyalg RSA -keysize 2048 -validity 10000 -storepass <password> -dname "CN=World Adventure"
set -e
here=$(cd "$(dirname "$0")" && pwd); root=$(cd "$here/../.." && pwd)
ks=$1; pass=$2; out=${3:-$root/world-adventure-icon.apk}
[ -f "$ks" ] && [ -n "$pass" ] || { echo "usage: build.sh <keystore.jks> <keystore password> [output.apk]"; exit 2; }
jar=/usr/lib/android-sdk/platforms/android-23/android.jar
work=$(mktemp -d); mkdir -p "$work/gen" "$work/obj" "$work/res/mipmap"
cp "$root/icons/icon-192.png" "$work/res/mipmap/icon.png"
aapt package -f -m -J "$work/gen" -M "$here/AndroidManifest.xml" -S "$work/res" -I "$jar"
javac -nowarn -source 8 -target 8 -bootclasspath "$jar" -d "$work/obj" "$here/Open.java" $(find "$work/gen" -name '*.java') 2>/dev/null
dalvik-exchange --dex --output="$work/classes.dex" "$work/obj"
aapt package -f -M "$here/AndroidManifest.xml" -S "$work/res" -I "$jar" -F "$work/unsigned.apk"
(cd "$work" && aapt add unsigned.apk classes.dex >/dev/null)
zipalign -f 4 "$work/unsigned.apk" "$work/aligned.apk"
apksigner sign --ks "$ks" --ks-pass "pass:$pass" --out "$out" "$work/aligned.apk"
apksigner verify "$out" && echo "built $out ($(wc -c < "$out") bytes)"
