"""Check exported IPA identity and signing material; codesign verification runs on macOS."""
import sys, zipfile, plistlib
archive, build, version = sys.argv[1:]
with zipfile.ZipFile(archive) as ipa:
    roots = [name[:-len('Info.plist')] for name in ipa.namelist() if name.startswith('Payload/') and name.endswith('.app/Info.plist') and name.count('/') == 2]
    if len(roots) != 1: raise SystemExit('IPA must contain exactly one application')
    root = roots[0]
    info = plistlib.loads(ipa.read(root + 'Info.plist'))
    if info.get('CFBundleIdentifier') != 'xyz.ourdays.ios' or str(info.get('CFBundleVersion')) != build or info.get('CFBundleShortVersionString') != version:
        raise SystemExit('IPA bundle ID or version does not match iOS source configuration')
    for name in ('embedded.mobileprovision', '_CodeSignature/CodeResources'):
        if root + name not in ipa.namelist(): raise SystemExit('IPA is missing signing material')
print('iOS IPA identity and signing material verified')
