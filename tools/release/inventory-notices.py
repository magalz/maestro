"""Inventory locked build/runtime dependencies; inspect source archives without extracting them."""
import argparse, base64, hashlib, io, json, os, re, tarfile, tomllib, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
arguments = argparse.ArgumentParser()
arguments.add_argument('--metadata', default='.cache/cargo-metadata.json')
arguments.add_argument('--target', default='x86_64-pc-windows-gnullvm')
arguments.add_argument('--output', default='runtime-inventory.json')
args = arguments.parse_args()
OUT = ROOT / 'tools/release/notices'
(OUT / 'texts').mkdir(exist_ok=True)
def digest(data): return hashlib.sha256(data).hexdigest()
def fetch(url):
    with urllib.request.urlopen(url, timeout=30) as response: return response.read()
def retain(data, origin, member=None):
    sha = digest(data)
    path = 'texts/' + sha + '.txt'
    (OUT / path).write_bytes(data)
    return dict(path=path, sha256=sha, bytes=len(data), origin=origin, **({'member': member} if member else {}))
def read_notices(data, origin):
    notices, metadata = [], {}
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        for member in archive.getmembers():
            if not member.isfile(): continue
            base = Path(member.name).name
            if base == '.cargo_vcs_info.json': metadata = json.load(archive.extractfile(member))
            if re.match(r'^(licen[cs]e|copying|copyright|notice|unlicense)([._-]|$)', base, re.I):
                notices.append(retain(archive.extractfile(member).read(), origin, member.name))
            elif base.lower().startswith('readme') and member.size < 2_000_000:
                text = archive.extractfile(member).read()
                if b'Permission is hereby granted' in text and b'THE SOFTWARE IS PROVIDED' in text:
                    notices.append(retain(text, origin, member.name))
    return notices, metadata

metadata = json.loads((ROOT / args.metadata).read_text(encoding='utf-8-sig'))
lock = tomllib.loads((ROOT / 'Cargo.lock').read_text())
checksums = {(v['name'], v['version']): v.get('checksum') for v in lock['package']}
packages = {v['id']: v for v in metadata['packages']}
nodes = {v['id']: v for v in metadata['resolve']['nodes']}
paths = {}
def visit(identity, chain):
    if identity in paths: return
    paths[identity] = chain + [packages[identity]['name']]
    for dep in nodes[identity]['deps']:
        if any(kind['kind'] != 'dev' for kind in dep['dep_kinds']): visit(dep['pkg'], paths[identity])
for item in metadata['packages']:
    if item['name'] in ('maestro-launcher', 'maestro-controller'): visit(item['id'], [])
rust = []
for identity in sorted(paths):
    package = packages[identity]
    if not package['source']: continue
    name, version = package['name'], package['version']
    source = Path(package['manifest_path']).parent
    registry = source.parent.name
    cache = source.parents[2] / 'cache' / registry / f'{name}-{version}.crate'
    data = cache.read_bytes()
    assert digest(data) == checksums[(name, version)], f'Cargo checksum mismatch: {name}'
    origin = f'https://static.crates.io/crates/{name}/{name}-{version}.crate'
    notices, vcs = read_notices(data, origin)
    if not notices and package.get('repository') and vcs.get('git', {}).get('sha1'):
        repo = package['repository'].removesuffix('.git').removesuffix('/')
        commit = vcs['git']['sha1']
        assert re.fullmatch('[0-9a-f]{40}', commit)
        for filename in ('LICENSE', 'LICENSE-MIT', 'LICENSE.txt', 'NOTICE'):
            url = repo.replace('https://github.com/', 'https://raw.githubusercontent.com/') + '/' + commit + '/' + filename
            try: text = fetch(url)
            except urllib.error.HTTPError as error:
                if error.code == 404: continue
                raise
            notices.append(retain(text, url))
    rust.append(dict(name=name, version=version, license=package['license'], checksum=checksums[(name,version)],
                     origin=origin, repository=package.get('repository'), vcs=vcs, requirement_path=paths[identity],
                     features=nodes[identity]['features'], notices=notices, status='included' if notices else 'unresolved'))

npm_lock = json.loads((ROOT / 'package-lock.json').read_text())
gateway = []
for path, package in sorted(npm_lock['packages'].items()):
    if not path or package.get('dev'): continue
    data = fetch(package['resolved'])
    algorithm, expected = package['integrity'].split('-', 1)
    assert base64.b64encode(hashlib.new(algorithm, data).digest()).decode() == expected, f'npm integrity mismatch: {path}'
    notices, _ = read_notices(data, package['resolved'])
    installed = json.loads((ROOT / path / 'package.json').read_text())
    gateway.append(dict(name=installed['name'], version=package['version'], license=installed.get('license'),
                        integrity=package['integrity'], origin=package['resolved'], dependencies=installed.get('dependencies', {}),
                        requirement='Gateway authoritative contract/signature verification dependency closure',
                        path=path, notices=notices, status='included' if notices else 'unresolved'))
result = dict(schema='maestro.build.notice-inventory/1', target=args.target,
              cargo_lock_sha256=digest((ROOT/'Cargo.lock').read_bytes()), npm_lock_sha256=digest((ROOT/'package-lock.json').read_bytes()),
              scope='Actual launcher/controller target dependency closure (normal/build edges), and npm production dependencies only; no redistribution clearance',
              rust=rust, gateway=gateway)
(OUT/args.output).write_text(json.dumps(result, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
print(json.dumps(dict(rust=len(rust), gateway=len(gateway), unresolved=[v['name'] for v in rust+gateway if v['status']!='included']), indent=2))
