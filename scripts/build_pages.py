"""Build only public UI assets and the current catalog for any static host."""
import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server import validate


def build(output):
    output = Path(output).resolve()
    if output.exists():
        raise ValueError(f'Output already exists; choose a fresh directory: {output}')
    raw = (ROOT / 'data/gpus.json').read_bytes()
    validate(json.loads(raw))
    shutil.copytree(ROOT / 'web', output)
    index = output / 'index.html'
    html = index.read_text(encoding='utf-8')
    assert '<html lang="ja">' in html
    index.write_text(html.replace('<html lang="ja">', '<html lang="ja" data-hosting="static">', 1), encoding='utf-8')
    (output / 'data').mkdir()
    (output / 'data/gpus.json').write_bytes(raw)
    (output / '.nojekyll').write_text('', encoding='utf-8')
    print(f'Static site ready: {output}')
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '_site')
    build(parser.parse_args().output)
