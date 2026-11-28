"""Build the card's self-hosted fonts: public/fonts/*.woff2

Each face is cut down to the characters it actually has to draw, so every language's
type fits in about 180 KB and the page can load all of it up front:

  * Bodoni Moda / Playfair Display: Latin, plus any accented letters used on the card
    (the Vietnamese text). Weight axis kept from 400 to 500 only.
  * Playfair Display SC: Latin, Latin Extended-A and Vietnamese, because guests' names
    are printed in it and can contain any of those letters.
  * Pinyon Script: only "Ivan Sam & Ana Nguyen", plus the ễ of Nguyễn (the Vietnamese card).
  * Tangerine: only "&", for the save the date's ampersand.
  * Noto Serif TC: only the Chinese characters that appear in index.html.
  * Noto Serif SC: only 囍.

Re-run after changing any Chinese or Vietnamese text on the card (make fonts),
otherwise new characters fall back to the system's font.

It then stamps each font's URL in index.html with a hash of the font (/fonts/playfair.woff2?v=1a2b3c4d),
so browsers and Cloudflare, which keep fonts for a year, fetch a rebuilt one straight away.

Needs: pip install fonttools brotli
"""
import hashlib
import io
import pathlib
import re
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
PUBLIC = HERE.parent / 'public'
OUT = PUBLIC / 'fonts'
CACHE = HERE / '.font-cache'
GF = 'https://raw.githubusercontent.com/google/fonts/main/ofl/'

page = (PUBLIC / 'index.html').read_text(encoding='utf-8')

BASIC = list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [
    0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026]
PAGE_LATIN = sorted({ord(c) for c in page if 0x100 <= ord(c) < 0x2000})
NAMES = BASIC + list(range(0x100, 0x180)) + [
    0x131, 0x152, 0x153, 0x1A0, 0x1A1, 0x1AF, 0x1B0, 0x2BB, 0x2BC,
    0x300, 0x301, 0x303, 0x304, 0x308, 0x309, 0x323, 0x329, 0x20AB] + list(range(0x1EA0, 0x1EFA))
CJK = sorted({ord(c) for c in page if 0x2E80 <= ord(c) <= 0x9FFF or 0xF900 <= ord(c) <= 0xFAFF})
CJK_PUNCT = list(range(0x3000, 0x3012)) + [0xFF01, 0xFF08, 0xFF09, 0xFF0C, 0xFF1A, 0xFF1B, 0xFF1F]

FONTS = {
    # output name:          (source in google/fonts,                         characters,                     axes)
    'bodoni-moda':           ('bodonimoda/BodoniModa[opsz,wght].ttf',          BASIC,                          {'wght': (400, 500)}),
    'bodoni-moda-italic':    ('bodonimoda/BodoniModa-Italic[opsz,wght].ttf',   BASIC,                          {'wght': (400, 500)}),
    'playfair':              ('playfairdisplay/PlayfairDisplay[wght].ttf',     BASIC + PAGE_LATIN,             {'wght': (400, 500)}),
    'playfair-italic':       ('playfairdisplay/PlayfairDisplay-Italic[wght].ttf', BASIC + PAGE_LATIN,          {'wght': (400, 500)}),
    'playfair-sc':           ('playfairdisplaysc/PlayfairDisplaySC-Regular.ttf', NAMES,                        None),
    'pinyon-script':         ('pinyonscript/PinyonScript-Regular.ttf',         [ord(c) for c in 'Ivan Sam&Ana Nguyen Nguyễn'], None),
    'tangerine':             ('tangerine/Tangerine-Regular.ttf',               [ord('&')],                     None),
    'noto-serif-tc':         ('notoseriftc/NotoSerifTC[wght].ttf',             CJK + CJK_PUNCT + [0x20],       {'wght': 400}),
    'noto-serif-sc-xi':      ('notoserifsc/NotoSerifSC[wght].ttf',             [ord('囍')],                    {'wght': 600}),
}


def source(path):
    CACHE.mkdir(exist_ok=True)
    local = CACHE / pathlib.Path(path).name
    if not local.exists():
        url = GF + urllib.request.quote(path)
        print('downloading', url)
        urllib.request.urlretrieve(url, local)
    return local


def build(name, path, chars, axes):
    from fontTools import subset            # here, so stamp() runs without fontTools
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer

    font = TTFont(source(path))
    if axes:
        font = instancer.instantiateVariableFont(font, axes, updateFontNames=False)
        buf = io.BytesIO()
        font.save(buf)
        buf.seek(0)
        font = TTFont(buf)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['kern', 'liga', 'clig', 'calt', 'ccmp', 'locl', 'mark', 'mkmk', 'rlig',
                            'lnum', 'pnum', 'tnum', 'onum', 'dlig']
    opts.hinting = False
    opts.desubroutinize = True
    opts.name_IDs = [0, 1, 2, 13, 14]       # family names, plus the copyright and OFL licence
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=chars)
    sub.subset(font)
    out = OUT / f'{name}.woff2'
    subset.save_font(font, out, opts)
    return out.stat().st_size


def stamp():
    """Points every /fonts/<name>.woff2 in index.html (the preloads and the @font-face rules) at
    ?v=<hash of that file>, so each one changes only when its own font does."""
    html = PUBLIC / 'index.html'
    text = html.read_bytes().decode('utf-8')               # bytes: line endings stay as they are

    def versioned(m):
        font = OUT / f'{m[1]}.woff2'
        if not font.exists():
            raise SystemExit(f'index.html uses /fonts/{m[1]}.woff2, which was not built')
        return f'/fonts/{m[1]}.woff2?v={hashlib.sha256(font.read_bytes()).hexdigest()[:8]}'

    stamped = re.sub(r'/fonts/([a-z0-9-]+)\.woff2(?:\?v=[0-9a-f]*)?', versioned, text)
    if stamped != text:
        html.write_bytes(stamped.encode('utf-8'))
        print('index.html now asks for the new fonts')


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    total = 0
    for name, spec in FONTS.items():
        size = build(name, *spec)
        total += size
        print(f'{name:22} {size / 1024:6.1f} KB')
    print(f'{"total":22} {total / 1024:6.1f} KB')
    stamp()
