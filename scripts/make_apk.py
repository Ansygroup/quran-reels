#!/usr/bin/env python3
"""Non-interactive bubblewrap driver: init -> build -> copy APK.
Prompts are answered on ANY loop tick (including select timeouts) so a rule
whose cooldown has expired still fires even if no new output arrives.
"""
import os, sys, pty, subprocess, time, re, glob, shutil, select

WORK = '/home/user/quran-reels/deliverables/app/build'
BW = '/home/user/quran-reels/node_modules/.bin/bubblewrap'
OUT_DIR = '/home/user/quran-reels/deliverables/app'
PW = os.environ.get('APK_KEY_PW')
if not PW:
    print('FATAL: APK_KEY_PW not set', flush=True); sys.exit(1)
os.makedirs(WORK, exist_ok=True)
LOG = open('/tmp/apk.log', 'w', buffering=1)

def clean(s):
    return re.sub(r'\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07', '', s)

def run(args, timeout_sec=5400, answer=True):
    m, s = pty.openpty()
    p = subprocess.Popen(args, cwd=WORK, stdin=s, stdout=s, stderr=s, close_fds=True)
    os.close(s)
    hist = ''
    start = time.time()
    sent_at = {}
    while True:
        if time.time() - start > timeout_sec:
            p.kill(); LOG.write('\n!! TIMEOUT %s\n' % args); LOG.flush(); return None
        r, _, _ = select.select([m], [], [], 5)
        if r:
            try:
                data = os.read(m, 4096)
            except OSError:
                break
            if not data:
                break
            txt = clean(data.decode('utf-8', 'replace'))
            LOG.write(txt); LOG.flush()
            if answer:
                hist += txt
                if len(hist) > 6000:
                    hist = hist[-3000:]
        elif p.poll() is not None:
            break
        if not answer or not hist:
            continue
        lines = [ln for ln in hist.splitlines() if ln.strip()][-2:]
        last = lines[-1] if lines else ''
        prev = lines[0] if len(lines) > 1 else ''
        win = (prev + ' ' + last).lower()
        low = win
        rules = [
            ('pwd', ('password for the key' in win or 'password for the key store' in win), PW + '\n'),
            ('jdk', ('install the jdk' in win), 'y\n'),
            ('sdk', ('install the android sdk' in win), 'y\n'),
            ('terms', ('terms and conditions' in win), 'y\n'),
            ('country', ('country (2 letter' in win), 'EG\n'),
            ('kname', ('first and last names' in win), 'Quran Reels\n'),
            ('kunit', ('organizational unit (eg' in win), 'Development\n'),
            ('korg', ('organization (eg' in win), 'Quran Reels\n'),
            ('key', ('create one now' in win), 'y\n'),
            ('dir', (('create' in win or 'directory' in win) and ('?' in win) and ('directory' in win or 'folder' in win)), 'y\n'),
            ('ver', ('version code' in win), '1\n'),
            ('appid', ('application id' in win), 'app.quranreels.twa\n'),
            ('arrow', ('use arrow keys' in hist.lower()), '\n'),
            ('conf', (last.rstrip().endswith('(Y/n)') or last.rstrip().endswith('(y/N)')), '\n'),
            ('deflt', (last.lstrip().startswith('?') and last.rstrip().endswith(')') and ':' in last), '\n'),
            ('q', (last.lstrip().startswith('?')), '\n'),
            ('colon', (last.rstrip().endswith(':')), '\n'),
        ]
        ans = rid = None
        for rid_, matched, a in rules:
            if matched:
                rid, ans = rid_, a
                break
        if ans is not None:
            now = time.time()
            if now - sent_at.get(rid, 0) < 3.5:
                continue  # terminal re-render of same prompt: do not re-send
            sent_at[rid] = now
            os.write(m, ans.encode())
            if PW in ans:
                LOG.write('<<%s [password redacted]\n' % rid)
            else:
                LOG.write('<<%s %r\n' % (rid, ans))
            LOG.flush()
            hist = ''
    try:
        os.close(m)
    except OSError:
        pass
    p.wait()
    return p.returncode

twa = os.path.join(WORK, 'twa-manifest.json')
if os.path.exists(twa):
    print('== STEP 1: init skipped (twa-manifest exists) ==', flush=True)
else:
    print('== STEP 1: init ==', flush=True)
    rc = run([BW, 'init', '--manifest', 'https://quran-reels-tau.vercel.app/manifest.json', '--skipPwaValidation'], 900)
    print('init rc=%s' % rc, flush=True)
    if not os.path.exists(twa):
        print('== STEP 1b: init (no skip flag) ==', flush=True)
        rc = run([BW, 'init', '--manifest', 'https://quran-reels-tau.vercel.app/manifest.json'], 900)
        print('init rc=%s' % rc, flush=True)
    if not os.path.exists(twa):
        print('APK_FAIL: no twa-manifest', flush=True); sys.exit(1)
    print('twa-manifest OK', flush=True)

print('== STEP 2: build ==', flush=True)
rc = run([BW, 'build'], 5400, answer=True)
print('build rc=%s' % rc, flush=True)
if rc != 0:
    print('APK_FAIL: build rc=%s' % rc, flush=True); sys.exit(1)
apks = glob.glob(os.path.join(WORK, '**', '*.apk'), recursive=True)
signed = [a for a in apks if 'release' in os.path.basename(a).lower() or 'signed' in os.path.basename(a).lower()]
pick = (signed or apks)
if not pick:
    print('APK_FAIL: no apk produced', flush=True); sys.exit(1)
src = sorted(pick, key=os.path.getmtime)[-1]
import zipfile
zf = zipfile.ZipFile(src)
signed = any(n.upper().startswith('META-INF/') and (n.upper().endswith('.RSA') or n.upper().endswith('.DSA') or n.upper().endswith('.EC')) for n in zf.namelist())
zf.close()
if not signed:
    print('APK_FAIL: apk is not signed', flush=True); sys.exit(1)
dst = os.path.join(OUT_DIR, 'quran-reels.apk')
shutil.copy2(src, dst)
sz = os.path.getsize(dst)
print('APK_DONE %s (%.1f MB)' % (dst, sz / 1e6), flush=True)
