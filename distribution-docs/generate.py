"""Regenerate the .docx copies of the userscripts, and prove they are faithful.

The documents are how the implementor team receives the scripts: they are not
technical, so they get a Word file from the shared Drive folder rather than a
raw .js. Each one is a verbatim, line-for-line copy — Consolas 8pt, one
paragraph per source line.

WHY THIS EXISTS
    The README has said "regenerate after every change" since the beginning,
    but there was nothing to regenerate WITH, so it was done by hand each time.
    That is how v0.20.1 went out to the team while the repo was already on
    v0.23.0 — a stale document looks exactly like a current one to the person
    copying it.

WHAT IT REFUSES TO DO
    It never rewrites the text. Word's autocorrect turning ' into ’ is the
    classic way these documents break, so the only safe generator is one that
    copies bytes and then proves it did: every run ends by reading the document
    back, extracting its paragraphs and diffing them against the source. A
    mismatch raises rather than writing a quietly broken file.

    That check is also why the curly apostrophes in the two ADP scripts survive.
    They are deliberate — ADP's own button label uses ’, so the script matches
    both spellings — and a generator that "cleaned" them would break the step
    that opens What's Displayed, which is where field selection starts.

Run:  python distribution-docs/generate.py            # all four
      python distribution-docs/generate.py adp-historical-data.user.js
"""
import html
import os
import re
import sys
import zipfile

import docx
from docx.shared import Emu, Pt

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

# Document <- script. Mirrors the table in README.md; keep the two in step.
DOCS = {
    'paycom-reports.user.js': 'Paycom Daily Reports Automation.docx',
    'adp-reports.user.js': 'ADP Daily Reports Automation.docx',
    'paycom-historical-data.user.js': 'Paycom Historical Data Bot.docx',
    'adp-historical-data.user.js': 'ADP Historical Data Bot.docx',
}

# Taken off the existing documents so a regenerate is not also a restyle:
# US Letter, half-inch margins, Consolas 8pt, no paragraph spacing.
PAGE_W, PAGE_H = Emu(7772400), Emu(10058400)
MARGIN = Emu(457200)
FONT, SIZE = 'Consolas', Pt(8)
LINE_SPACING = 11 / 12


def build(src_path, doc_path):
    with open(src_path, encoding='utf-8') as fh:
        lines = fh.read().split('\n')

    d = docx.Document()
    s = d.sections[0]
    s.page_width, s.page_height = PAGE_W, PAGE_H
    s.left_margin = s.right_margin = s.top_margin = s.bottom_margin = MARGIN

    for line in lines:
        p = d.add_paragraph()
        pf = p.paragraph_format
        pf.space_before = pf.space_after = Pt(0)
        pf.line_spacing = LINE_SPACING
        # A truly empty paragraph loses its run and with it the font, so a blank
        # source line is carried as a single space. verify() maps it back.
        run = p.add_run(line if line else ' ')
        run.font.name = FONT
        run.font.size = SIZE

    d.save(doc_path)
    return len(lines)


def verify(src_path, doc_path):
    """The README's own check: paragraphs out, diffed against the source."""
    with zipfile.ZipFile(doc_path) as z:
        xml = z.read('word/document.xml').decode('utf-8')
    paras = re.findall(r'<w:p[ >].*?</w:p>', xml, re.S)
    got = [html.unescape(''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>', p, re.S)))
           for p in paras]
    got = [l if l != ' ' else '' for l in got]
    with open(src_path, encoding='utf-8') as fh:
        want = fh.read().split('\n')
    if got != want:
        for i, (a, b) in enumerate(zip(got, want)):
            if a != b:
                raise SystemExit('%s: line %d differs\n  doc: %r\n  src: %r'
                                 % (os.path.basename(doc_path), i + 1, a, b))
        raise SystemExit('%s: %d paragraphs vs %d source lines'
                         % (os.path.basename(doc_path), len(got), len(want)))


def version_of(src_path):
    # Leading whitespace is allowed: paycom-reports.user.js indents its whole
    # metadata block by two spaces, and an anchored '^//' silently reported
    # that script's version as unknown.
    with open(src_path, encoding='utf-8') as fh:
        m = re.search(r'^[ \t]*//\s*@version\s+(\S+)', fh.read(), re.M)
    return m.group(1) if m else '?'


def main():
    wanted = sys.argv[1:] or list(DOCS)
    for src in wanted:
        if src not in DOCS:
            raise SystemExit('unknown script: %s (expected one of %s)'
                             % (src, ', '.join(DOCS)))
        src_path = os.path.join(REPO, src)
        doc_path = os.path.join(HERE, DOCS[src])
        n = build(src_path, doc_path)
        verify(src_path, doc_path)
        print('%-34s v%-8s %5d lines  ->  %s'
              % (src, version_of(src_path), n, DOCS[src]))
    print('\nAll regenerated documents verified line-for-line against their source.')


if __name__ == '__main__':
    main()
