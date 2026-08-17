# distribution-docs

Word (`.docx`) copies of the userscripts, for sharing with the implementor team.

The implementors are non-technical, so they receive the scripts as documents in the
shared Google Drive folder rather than as raw `.js` files:
<https://drive.google.com/drive/folders/1EOj3BDQ_x7Hrs6QtVk9IUm93_y5Pb47C>

| Document | Generated from |
|---|---|
| `Paycom Daily Reports Automation.docx` | `paycom-reports.user.js` |
| `ADP Daily Reports Automation.docx` | `adp-reports.user.js` |
| `Paycom Historical Data Bot.docx` | `paycom-historical-data.user.js` |
| `ADP Historical Data Bot.docx` | `adp-historical-data.user.js` |

## These are generated — keep them in sync

Each file is a verbatim, line-for-line copy of its script (Consolas, one paragraph
per line). **They go stale the moment a script is edited**, and a stale doc is not
obvious to the person copying it — we shipped v0.20.1 to the team while the repo was
already on v0.23.0 exactly this way.

So: after changing a userscript, regenerate its document before sharing, and check
the `@version` in the doc matches the script.

Never hand-edit a `.docx` here — Word's autocorrect turns straight quotes into curly
quotes, which silently breaks the script when it is pasted into Tampermonkey. Always
regenerate from the source file instead.

### The two ADP scripts contain curly apostrophes ON PURPOSE — do not "fix" them

`adp-historical-data.user.js` and `adp-reports.user.js` each carry three lines with a
curly `’` (U+2019), e.g.

```js
text.includes("What's Displayed on the Report") || text.includes("What’s Displayed on the Report")
```

ADP's own button label uses the curly apostrophe, so the script matches BOTH spellings.
These sit inside double-quoted string literals — they are valid JavaScript and required.
A blanket "replace smart quotes with straight quotes" pass over these documents would
break the step that opens *What's Displayed*, which is how the whole field selection
starts. The Paycom scripts contain none, so any curly quote there IS Word damage.

### Verifying a document really matches its script

Comparing `@version` catches a stale regenerate but not a corrupted one. To prove a
document is a faithful copy, extract its paragraphs and diff them against the source —
one paragraph per line, blanks written as a single space:

```python
import zipfile, re, html
with zipfile.ZipFile(doc) as z: xml = z.read('word/document.xml').decode('utf-8')
paras = re.findall(r'<w:p[ >].*?</w:p>', xml, re.S)
lines = [html.unescape(''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>', p, re.S))) for p in paras]
lines = [l if l != ' ' else '' for l in lines]
assert lines == open(src, encoding='utf-8').read().split('\n')
```
