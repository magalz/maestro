"""Collect exact development-runtime DLL and shipped notices; never run an installer."""
import argparse
import hashlib
import json
from pathlib import Path
import tarfile
import tomllib
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--sysroot', required=True)
args = parser.parse_args()
sysroot = Path(args.sysroot)
manifest_bytes = (sysroot / 'lib/rustlib/multirust-channel-manifest.toml').read_bytes()
channel = tomllib.loads(manifest_bytes.decode())
package = channel['pkg']['rustc']
assert package['version'].startswith('1.98.1 ')
target = package['target']['x86_64-pc-windows-gnullvm']
expected = 'f87230d2643171715c2fc4af81bb28849bfc2f62fc7413f899988748c82cbbd3'
url = 'https://static.rust-lang.org/dist/2026-09-03/rustc-1.98.1-x86_64-pc-windows-gnullvm.tar.xz'
assert target['xz_hash'] == expected and target['xz_url'] == url
sha = lambda data: hashlib.sha256(data).hexdigest()
archive = Path('.cache/rustc-1.98.1-gnullvm.tar.xz')
archive.parent.mkdir(exist_ok=True)
if not archive.exists():
    print('Downloading pinned rustc archive for member/notice verification', flush=True)
    with urllib.request.urlopen(url, timeout=60) as response, archive.open('wb') as output:
        while data := response.read(1024*1024):
            output.write(data)
with archive.open('rb') as source:
    assert hashlib.file_digest(source, 'sha256').hexdigest() == expected
destination = Path('tools/release/notices/native-runtime')
destination.mkdir(parents=True, exist_ok=True)
notices = []
found = False
with tarfile.open(archive, 'r:xz') as source:
    for member in source:
        if not member.isfile():
            continue
        parts = member.name.split('/')
        relative = '/'.join(parts[2:])
        if relative == 'bin/libunwind.dll':
            dll = source.extractfile(member).read()
            assert dll == (sysroot / 'bin/libunwind.dll').read_bytes()
            dll_cache = Path('.cache/native-runtime')
            dll_cache.mkdir(parents=True, exist_ok=True)
            (dll_cache / 'libunwind.dll').write_bytes(dll)
            dll_entry = {'path':'libunwind.dll','sha256':sha(dll),'size':len(dll),'member':member.name}
            found = True
        if relative.startswith('share/doc/rust/') and (relative.endswith('.html') or '/licenses/' in relative):
            data = source.extractfile(member).read()
            filename = sha(data) + ('.html' if relative.endswith('.html') else '.txt')
            (destination / filename).write_bytes(data)
            notices.append({'path':filename,'sha256':sha(data),'member':member.name,'origin':url})
assert found and notices
result = {'schema':'maestro.build.native-runtime-evidence/1','scope':'native Windows development stage only',
          'toolchain':'1.98.1-x86_64-pc-windows-gnullvm','rustc_commit':'48a229ceaefd4985c50990b14116b6d856af0985',
          'archive':{'origin':url,'sha256':expected},'channel_manifest_sha256':sha(manifest_bytes),
          'dlls':[dll_entry],'notices':notices,'notice_basis':'Complete copyright and license material shipped with the exact verified Rust compiler archive; no public redistribution clearance inferred.'}
(destination / 'inventory.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf8')
print(json.dumps({'dll':dll_entry,'notice_files':len(notices),'inventory':str(destination/'inventory.json')}), flush=True)
